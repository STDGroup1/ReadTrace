"use strict";
/* ============================================================================
   阅迹 ReadTrace · 反馈信投递（#193）
   ----------------------------------------------------------------------------
   一封「用户反馈」从 App 走到开发者邮箱，靠的就是这个文件：零依赖 SMTP。
   为什么自己写而不是引 nodemailer：
     · 云函数改代码走 `UpdateFunctionCode`，**只换代码、不碰依赖**（§11.6 定过），
       加一个 npm 依赖就得另找一条在线上装包的链路；Node 20 自带 tls / net 够用；
     · 我们只发「纯文本 + 几张 jpg 附件」这一种信，不解析、不收信、不管编码嗅探。
   ----------------------------------------------------------------------------
   配置（全部从环境变量读，**密钥只在服务端**）：
     RT_SMTP_USER  发信邮箱（**必须自己配**，没有默认值）
     RT_SMTP_PASS  **QQ 邮箱的 SMTP 授权码**（不是登录密码）—— 没配就整条路不发信，
                   函数照样把反馈存进数据库（见 index.js 的 feedbackAction）
     RT_MAIL_TO    收件邮箱，默认 = RT_SMTP_USER
     RT_SMTP_HOST  默认 smtp.qq.com
     RT_SMTP_PORT  指定就只用这一个端口；不指定按 465（SSL）→ 587（STARTTLS）依次试
   ----------------------------------------------------------------------------
   两处刻意的写法：
     ① **正文与附件一律 base64**：base64 字符集里没有 `.`，于是不必做 SMTP 的点填充
        （dot-stuffing）；换行也统一由我们控制。
     ② 证书**永远照验**（v1.94 起不再有降级重试的兜底）—— 云函数跑在可信出口上，
        正常情况不会遇到坏证书链；真遇到就让这封发信失败（反馈已落库，不丢）。
   ========================================================================== */

const tls = require("tls");
const net = require("net");
const crypto = require("crypto");

const CFG = {
  host: process.env.RT_SMTP_HOST || "smtp.qq.com",
  port: process.env.RT_SMTP_PORT ? Number(process.env.RT_SMTP_PORT) : 0,
  user: String(process.env.RT_SMTP_USER || ""),
  pass: process.env.RT_SMTP_PASS || "",
  to: process.env.RT_MAIL_TO || "",
  timeout: Number(process.env.RT_SMTP_TIMEOUT || 20000)
};

/* 授权码没配 = 这条路关着。调用方据此在回包与日志里说清楚（不抛异常、不影响落库）。 */
function ready() {
  return !!(CFG.pass && CFG.user);
}
function mailTo() {
  return CFG.to || CFG.user;
}

/* ---------------------------------------------------------------- SMTP 读写 */

/* 逐行收包：一行一存，遇到 `250-` 这种续行继续等，直到 `250 ` 才交出去。 */
function Reader(sock) {
  this.sock = sock;
  this.buf = "";
  this.lines = [];
  this.pending = null;
  this.err = null;
  sock.setEncoding("utf8");
  sock.on("data", (d) => { this.buf += d; this.pump(); });
  sock.on("error", (e) => this.settle(e));
  sock.on("close", () => this.settle(new Error("连接被对端关闭")));
}

Reader.prototype.pump = function () {
  let i;
  while ((i = this.buf.indexOf("\n")) >= 0) {
    this.lines.push(this.buf.slice(0, i).replace(/\r$/, ""));
    this.buf = this.buf.slice(i + 1);
  }
  this.settle(null);
};

Reader.prototype.settle = function (err) {
  if (err && !this.err) this.err = err;
  const w = this.pending;
  if (!w) return;
  if (this.err) { this.pending = null; w.reject(this.err); return; }
  const ls = this.lines;
  if (!ls.length) return;
  /* 回复完成 = 最后一行是 `NNN ` （空格结尾）；`NNN-` 是续行 */
  if (!/^\d{3} /.test(ls[ls.length - 1])) return;
  this.lines = [];
  this.pending = null;
  w.resolve(ls);
};

Reader.prototype.reply = function () {
  return new Promise((resolve, reject) => {
    this.pending = { resolve: resolve, reject: reject };
    this.settle(null);
  });
};

/* 发一条命令 → 等到完整回复。reply 必须是 2xx/3xx（EHLO 的 250、AUTH 的 334 都算）。
   失败时把服务器的原话带进错误里 —— 排查授权码 / 发信限额全靠它。 */
async function cmd(rd, line, okCodes) {
  rd.sock.write(line + "\r\n");
  const ls = await rd.reply();
  const code = ls.length ? ls[ls.length - 1].slice(0, 3) : "000";
  const good = okCodes ? okCodes.indexOf(code) >= 0 : (code[0] === "2" || code[0] === "3");
  if (!good) {
    const e = new Error("SMTP " + code + " " + ls.join(" / ").slice(0, 220));
    e.smtp = code;
    throw e;
  }
  return ls;
}

/* 发一条命令，并且**一直读到指定状态码那一行为止**（多余的回复丢掉）。
   STARTTLS 之后用得上：RFC 3207 没要求升级后再问候一次，但有的实现会多送一句
   `220`；只发一次 EHLO、把多出来的问候丢掉，后面的命令才不会整体错开一位
   （错开的症状是 DATA 的 354 被当成上一条命令的回复，整封信念不出来）。 */
async function cmdCode(rd, line, want, tries) {
  rd.sock.write(line + "\r\n");
  const max = tries || 1;
  let ls = null, code = "000";
  for (let k = 0; k < max; k++) {
    ls = await rd.reply();
    code = ls.length ? ls[ls.length - 1].slice(0, 3) : "000";
    if (code === want) return ls;
  }
  const e = new Error("SMTP " + code + "（期望 " + want + "）" + (ls ? " " + ls.join(" / ").slice(0, 200) : ""));
  e.smtp = code;
  throw e;
}

/* 数据段：写完整封信 + 结束行，再等 250 */
async function cmdData(rd, payload) {
  rd.sock.write(payload + "\r\n.\r\n");
  const ls = await rd.reply();
  const code = ls.length ? ls[ls.length - 1].slice(0, 3) : "000";
  if (code[0] !== "2") {
    const e = new Error("SMTP DATA " + code + " " + ls.join(" / ").slice(0, 220));
    e.smtp = code;
    throw e;
  }
  return ls;
}

/* ⚠️ servername 是 SNI，而 Node 20+ 对**IP 地址**设 SNI 会直接抛
   ERR_INVALID_ARG_VALUE（本地假服务器就是这么暴露出来的）→ 只对域名设。 */
function sni(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.indexOf(":") >= 0 ? undefined : host;
}

function dial(host, port, implicit, verify) {
  return new Promise((resolve, reject) => {
    let sock;
    const opts = { host: host, port: port };
    if (implicit) {
      opts.servername = sni(host);
      opts.rejectUnauthorized = verify !== false;
      sock = tls.connect(opts);
    } else {
      sock = net.connect(opts);
    }
    const done = () => { sock.setTimeout(CFG.timeout); resolve(sock); };
    sock.once(implicit ? "secureConnect" : "connect", done);
    sock.once("error", reject);
    sock.setTimeout(CFG.timeout, () => {
      sock.destroy();
      reject(new Error("连接 " + host + ":" + port + " 超时"));
    });
  });
}

/* 一个端口走一遍：连 → EHLO →（587 补 STARTTLS）→ AUTH LOGIN → MAIL/RCPT/DATA → QUIT */
async function onPort(port, message, verify) {
  const implicit = port === 465;
  let sock = await dial(CFG.host, port, implicit, verify);
  let rd = new Reader(sock);
  try {
    const hello = await rd.reply();                       /* 220 问候 */
    if (hello[0].slice(0, 3) !== "220") throw new Error("SMTP 问候异常: " + hello[0]);
    await cmd(rd, "EHLO readtrace.local");
    if (!implicit) {
      await cmd(rd, "STARTTLS");
      sock = tls.connect({ socket: sock, servername: sni(CFG.host),
        rejectUnauthorized: verify !== false });
      await new Promise((res, rej) => {
        sock.once("secureConnect", res);
        sock.once("error", rej);
        sock.setTimeout(CFG.timeout, () => { sock.destroy(); rej(new Error("TLS 握手超时")); });
      });
      rd = new Reader(sock);
      await cmdCode(rd, "EHLO readtrace.local", "250", 3);
    }
    await cmd(rd, "AUTH LOGIN");
    await cmd(rd, Buffer.from(CFG.user, "utf8").toString("base64"));
    await cmd(rd, Buffer.from(CFG.pass, "utf8").toString("base64"));
    await cmd(rd, "MAIL FROM:<" + CFG.user + ">");
    await cmd(rd, "RCPT TO:<" + mailTo() + ">");
    await cmd(rd, "DATA");
    await cmdData(rd, message);
    await cmd(rd, "QUIT").catch(() => null);              /* 服务器常有先关连接的 */
    return true;
  } finally {
    try { sock.destroy(); } catch (e) { /* 已经关掉 */ }
  }
}

/* -------------------------------------------------------------- 信件本身 */

function b64wrap(s) {
  return (s.match(/.{1,76}/g) || []).join("\r\n");
}
function enc(s) {                       /* 中文主题 / 显示名：RFC2047 */
  return "=?UTF-8?B?" + Buffer.from(String(s), "utf8").toString("base64") + "?=";
}
function rfcDate(d) {
  return d.toUTCString().replace(/GMT$/, "+0000");
}
function addr(email, name) {
  return (name ? enc(name) + " " : "") + "<" + email + ">";
}

/* multipart/mixed：[正文, 若干附件]。附件一律按 base64 内联（不引 Content-ID，QQ 收得下）。 */
function buildMessage(o) {
  const b = "rt-" + crypto.randomBytes(12).toString("hex");
  const head = [
    "From: " + addr(CFG.user, o.fromName || "阅迹 ReadTrace"),
    "To: " + addr(mailTo(), ""),
    "Subject: " + enc(o.subject || "阅迹反馈"),
    "Date: " + rfcDate(new Date()),
    "Message-ID: <" + crypto.randomBytes(12).toString("hex") + "@" + CFG.host + ">",
    "MIME-Version: 1.0",
    "Content-Type: multipart/mixed; boundary=\"" + b + "\""
  ];
  /* 留了反馈人自己的邮箱 → 直接「回复」就能回到他手上（QQ 允许带 Reply-To） */
  if (o.replyTo) head.splice(2, 0, "Reply-To: " + addr(o.replyTo, ""));

  const parts = [
    "--" + b,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64wrap(Buffer.from(String(o.text || ""), "utf8").toString("base64"))
  ];
  (o.attachments || []).forEach((a, i) => {
    parts.push("--" + b);
    parts.push("Content-Type: " + a.mime + "; name=\"" + a.name + "\"");
    parts.push("Content-Transfer-Encoding: base64");
    parts.push("Content-Disposition: attachment; filename=\"" + a.name + "\"");
    parts.push("");
    parts.push(b64wrap(a.data));
  });
  parts.push("--" + b + "--");
  return head.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
}

/* 发一封。成功返回 {via}；失败抛错（调用方记 mailErr，不影响反馈落库）。
   ⚠️ 证书一律照验，**不再降级重试**（v1.94 移除）：降级 = 明文把 AUTH LOGIN 里的
      授权码递给任何中间人。证书报错就让这封失败 —— 反馈已先落库，发不出去只是
      mailed=false，开发者能在控制台看到；授权码没有第二丢法。 */
async function send(o) {
  if (!ready()) {
    const e = new Error("smtp_not_configured");
    e.code = "smtp_not_configured";
    throw e;
  }
  const message = buildMessage(o);
  const ports = CFG.port ? [CFG.port] : [465, 587];
  let last = null;
  for (let i = 0; i < ports.length; i++) {
    try {
      await onPort(ports[i], message, true);
      return { via: CFG.host + ":" + ports[i] };
    } catch (e) {
      last = e;
      console.warn("[mail] " + CFG.host + ":" + ports[i] + " 发信失败：", String((e && e.message) || ""));
    }
  }
  throw last || new Error("smtp_failed");
}

/* 总超时护栏：云函数默认 60s，一次投递最多占 20s，剩下的留给落库与回包。 */
function sendGuarded(o) {
  return Promise.race([
    send(o),
    new Promise((_, rej) => setTimeout(() => rej(new Error("smtp_timeout")), CFG.timeout + 5000))
  ]);
}

module.exports = { ready: ready, send: sendGuarded, to: mailTo, user: CFG.user };
