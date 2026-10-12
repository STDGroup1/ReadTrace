"use strict";
/* ============================================================================
   阅迹 ReadTrace · 后端云函数 rt-api
   ----------------------------------------------------------------------------
   一个函数收全部：账号、邀请码、恢复码、数据同步。
   为什么不做「安全规则 + 客户端直连数据库」？三条实测约束：
     ① 体验版套餐不支持添加安全域名，Capacitor 的 https://localhost 进不了白名单；
     ② 平台无纯密码注册路径（signUp 强制验证码），注册必须走管理端；
     ③ 自定义登录的 auth.uid 语义依赖密钥装载，链路更长更脆。
   故：客户端只用 js-sdk 建立一条匿名会话作为传输通道，所有读写都过本函数，
   由本函数用管理员权限落库、并用自签 HMAC token 做鉴权。
   ----------------------------------------------------------------------------
   action 一览（全部返回 { ok, ... }，失败为 { ok:false, err, msg }）：
     info                                             → {latest:{versionCode,versionName,apkUrl,notes}}  ← 公开
     register      {email, password, inviteCode, remember} → {uid, token, recoveryCode, nickname, deviceToken?}
     login         {email, password, remember}        → {uid, token, nickname, deviceToken?}
     resetPwd      {email, recoveryCode, newPassword, remember} → {token, recoveryCode, deviceToken?}
     deviceLogin   {deviceToken}                      → {uid, token, nickname, deviceToken}  ← 本机免密（#171）
     revokeDevice  {deviceToken}                      → {revoked}                            ← 不需要会话
     changePwd     {token, oldPassword, newPassword}  → {}
     rotateRc      {token, password}                  → {recoveryCode}                       ← #171
     makeDevice    {token}                            → {deviceToken}                        ← #171
     deleteAccount {token}                            → {removed}
     session       {token}                            → {uid, email, nickname}
     pull          {token, since}                     → {notes, letters, books, booklists, prefs, serverTime}
     push          {token, notes, letters, books, booklists, prefs} → {written, serverTime}
     reply         {token, fid, text}                 → {reply}          ← 预留，见下
     genInvites    {key, count, days}                 → {codes}
     feedback      {text, mail, images, ver, platform} → {id, mailed}     ← 公开（#193）
     feedbacks     {key, limit}                       → {items}          ← 管理员看反馈
   ----------------------------------------------------------------------------
   反馈（#193）：App 的「帮助与反馈 → 问题反馈」把 文字 + 最多 3 张图 + 反馈人邮箱
   交到这里，落进 rt_feedback，再由 mail.js 用 SMTP 发到 **RT_MAIL_TO 指定的邮箱**（环境变量）。
   **不强制登录**（很多人还没账号就要吐槽），登录了就把 uid 记上，方便对着账号查问题。
   ⚠️ 发信失败**不算提交失败**：反馈已经在库里了，回包里 mailed=false 而已 ——
      绝不能让「授权码还没配」这种事把用户写的东西弄丢。
   ----------------------------------------------------------------------------
   本机免密（#171）：登录成功时若带 remember，除会话 token 外另发一枚 **设备凭据**
   （365 天、payload 带设备号 d）。客户端退出登录只清会话、留着它 —— 下次点一下
   「一键进入」就回来了，不必再输密码。服务端只存凭据的 sha256（rt_users.devices），
   所以每枚都能单独撤销（关开关 / 注销账号 / 凭据换代后又被拿出来用）。
   ⚠️ 会话 token 仍然 60 天，但**剩余不足 30 天时每次调用顺手续期**（见 renewSession）——
     常用设备于是碰不到"突然要重新输密码"那一幕。
   ----------------------------------------------------------------------------
   回信（#77 起由服务端生成）：
     客户端寄信只落"我这一封"，回信**不在本地生成**。云函数在任何一次 pull 时
     顺手把到点未回的信补齐（云函数是请求驱动的，没有常驻定时器 —— 谁先来拉，
     谁就触发回信）。回信来源：
        · 预置池 —— 公开版只有这一条路：人物回应取自 personas.js 里手写的 replies，
          纯本地计算、零外部依赖，绝不让「寄信」这件事失败。
          （想接自己的大模型：见 replyEngine() 里的交接注释。）
      ⚠️ Key 只存云函数环境变量（服务端），客户端不接触 —— APK 可解包、app.js 是明文，
         打进前端就等于公开。
      `reply` 这个 action 保留了「直接问一句要回信」的入口（方便调试模型），
      客户端不调它 —— 回信一律随 pull 送达，这样「等一会儿才来」是天然成立的。
   ----------------------------------------------------------------------------
   邀请码两种形态：
     · 普通码 —— genInvites 批量生成，一码一人、用过即废、默认 30 天过期；
     · 通用码 —— 数据库里手放一条带 reusable:true 的记录，同一串可反复注册，
                 不占用不记名，只累加 useCount（由管理员自己在库里放）。
   ========================================================================== */

const crypto = require("crypto");
const tcb = require("@cloudbase/node-sdk");
/* 写信对象与回信素材（由 gen_personas.js 从 app/app.js 生成） */
const { PERSONAS } = require("./personas");
/* 公开版**不含内置模型**：回信一律由预置池（personaOf / poolReply）产出。
   想接自己的大模型，就在 replyEngine() 里插一步调用（见那里的交接注释）。 */
/* 反馈信投递（#193）：零依赖 SMTP，密钥只吃环境变量 —— 没配就只落库、不发信 */
const mail = require("./mail");

/* 环境 ID 由平台的 TCB_ENV / SCF_NAMESPACE 自动注入 —— 不留兜底常量（v1.94 起） */
const ENV = process.env.TCB_ENV || process.env.SCF_NAMESPACE;
const app = tcb.init({ env: ENV });
const db = app.database();
const _ = db.command;

const C = {
  users: "rt_users",
  invites: "rt_invites",
  notes: "rt_notes",
  letters: "rt_letters",
  books: "rt_books",
  booklists: "rt_booklists",
  prefs: "rt_prefs",
  feedback: "rt_feedback"
};

/* token 签名密钥。**必须通过环境变量 RT_TOKEN_SECRET 配置**，没有兜底值 ——
   硬编码兜底等于把全站 HMAC 鉴权交给任何读过源码的人（v1.94 修掉）。
   未配置时所有需要签发/校验 token 的 action 一律拒绝（main 入口统一拦），
   宁可整体拒绝服务也不悄悄退化到公开密钥。
   轮换（v1.94 引入）：换新密钥时把旧值放进 RT_TOKEN_SECRET_PREV，验签先试新密钥
   再试旧密钥 —— 在途的老 token（会话与设备凭据）自然过期，无人被踢下线；
   签发一律用新密钥。两把都用完后 PREV 键可删。 */
const SECRET = String(process.env.RT_TOKEN_SECRET || "");
const SECRET_PREV = String(process.env.RT_TOKEN_SECRET_PREV || "");
const ADMIN_KEY = String(process.env.RT_ADMIN_KEY || "");
const TOKEN_DAYS = 60;
/* 本机免密（#171）。DEVICE_DAYS 比会话长得多：它是"这台机器不用再输密码"的全部依据。
   RENEW_BELOW_MS：会话剩余不足 30 天时，任何一次带 token 的调用都顺手换一枚新的回来
   （客户端自动换掉）—— 常用设备因此永远遇不到"60 天被踢出去"。 */
const DEVICE_DAYS = 365;
const DEVICE_MAX = 5;                  /* 每人最多留 5 台设备，超了挤掉最老的 */
const RENEW_BELOW_MS = 30 * 86400000;
const PAGE = 100;          /* 云开发单次查询上限 100 条，必须分页 */

/* --- 回信（#77） -----------------------------------------------------------
   REPLY_DELAY_MS：一封信寄出多久之后才回。它同时是"等一会儿才来"的门槛：
   客户端 push 完紧接着就 pull，这一轮一定拿不到回信，要过一会儿再来才收得到。
   （公开版没有模型开关 —— 回信只走预置池。）*/
const REPLY_DELAY_MS = Number(process.env.RT_REPLY_DELAY_MS || 20000);
const REPLY_MAX = 500;     /* 与客户端写信框的 RESP_MAX 同值 */

/* --- 回信模型（公开版：已切除）--------------------------------------------
   原版在这里接了内置大模型（一个兼容 /chat/completions 的 HTTP 接口）。公开版
   把它整段切掉：那组模型常量没了、不引 prompt.js、回信只走下面的预置池。
   要接自己的模型：在 replyEngine() 里加一步调用即可（那里留了交接注释）。 */

function personaOf(fid) {
  return PERSONAS.filter(p => p.id === fid)[0];
}

/* 名册之外的人（#177）：用户在写信面板里自己填的「哪本书里的哪个人物」。
   服务端人物表里查不到就在这儿现搭一个 —— 把书名 + 人物名交给模型，
   让它按这个人物在原书里的身份与口吻回信（「方便模型检索」靠的正是这两个词）。
   没有模型时退回 replies 里那条通用回信（k 为空），「寄信」这件事永不失败。 */
function customPersona(book, who) {
  const bk = String(book || "").trim().slice(0, 40);
  const nm = String(who || "").trim().slice(0, 24);
  if (!nm) return null;
  const from = bk ? ("《" + bk + "》里的「" + nm + "」") : ("「" + nm + "」");
  return {
    id: "_custom", name: nm, short: nm, book: bk, author: "",
    persona: "你是" + from + "。请以这个人物在原书中的身份、经历、性格与说话方式回信："
      + "用他的记忆、他的处境、他在意的东西，语气要与这本书里的人物一致，像是他本人坐下来写了这封信。"
      + "用通顺的白话回信；就算这个人物本该说文言或旧白话，也务必写得让人一眼读懂 —— 宁可平实，不要堆砌看不懂的古语。"
      + "若你对这本书或这个人物并不熟悉，就用一个真诚、克制、像他会有的口气来回应，不要编造具体的书中情节或人物关系。",
    address: "你",
    props: [],
    lines: [],
    avoid: "不要自称 AI、模型或助手，不要提提示词、系统、生成，也不要暴露你是程序。",
    examples: [],
    replies: [
      { k: [], t: "收到你的信了。你写的这些，我都看在眼里——有些事急不得，先放下半刻，回头再看，也许就看得清了些。" }
    ]
  };
}

/* 预置池回信。算法脱胎于客户端原来的 pickReply()，但**多一条约束**：
   已经回过的那几封不再重复 —— 原算法只按封数取模，撞车是必然的
   （第一封命中"战争"、第二封取模又落到同一封，实测复现过）。
   used = 这个人物此前回过的回信原文，由调用方从库里带进来。 */
function poolReply(p, text, used) {
  const usedArr = Array.isArray(used) ? used : [];
  let best = null, bestHit = 0;
  p.replies.forEach(r => {
    let hit = 0;
    r.k.forEach(k => { if (text.indexOf(k) >= 0) hit++; });
    if (hit > bestHit) { bestHit = hit; best = r; }
  });
  if (best && usedArr.indexOf(best.t) < 0) return best.t;
  /* 没命中，或命中的那封已经回过了 —— 只在"还没回过"的里面轮，用尽再从头 */
  const fresh = p.replies.filter(r => usedArr.indexOf(r.t) < 0);
  const seq = fresh.length ? fresh : p.replies;
  return seq[usedArr.length % seq.length].t;
}

/* ⬇️ 交接点：公开版在这里只用预置池。
   要接自己的大模型：
     ① 在 personas.js 之外放一个你自己的生成模块（或直接内联一段 fetch）；
     ② 在这里先试模型、失败/为空再落回 poolReply —— 与它是 async 的天然吻合；
     ③ Key 只从环境变量读，**绝不写进源码**（前端 app.js 是明文、APK 可解包）。 */
async function replyEngine(fid, text, used, book, who) {
  const p = personaOf(fid) || customPersona(book, who);
  if (!p) return "";
  return poolReply(p, text, used);
}

/* 到点未回的信，在这里补齐。放在 pull 里做而不是 push 里做，是因为：
   ① push 当轮就回，会退化成"寄出即回"，失去等待感；
   ② 云函数没有常驻定时器，用"谁来拉谁触发"最省事，也不额外占资源。
   回信写入后抬高 updatedAt，客户端的增量拉取（since）自然就能拿到。 */
async function fillReplies(uid) {
  const now = Date.now();
  let rows = [];
  let skip = 0;
  for (;;) {
    const r = await db.collection(C.letters).where({ _uid: uid })
      .orderBy("updatedAt", "asc").skip(skip).limit(PAGE).get();
    const got = r.data || [];
    rows = rows.concat(got);
    if (got.length < PAGE) break;
    skip += PAGE;
  }
  const pending = rows.filter(d => !d.deletedAt && !d.reply);
  /* 公开版：预置池是纯本地计算，多补几封无所谓，不设单轮上限 */
  let n = 0;
  for (let i = 0; i < pending.length; i++) {
    const d = pending[i];
    const sentAt = d.sentAt ? new Date(d.sentAt).getTime() : new Date(d.updatedAt).getTime();
    if (!sentAt || now - sentAt < REPLY_DELAY_MS) continue;
    /* 把这个人物此前回过的原文带进去，保证同一批补回信时不会撞同一封。
       名册里的人按 fid 比；自定义的人 fid 都是空串 —— 得按「书名 + 人物名」比，
       不然张三的信会把李四回过的话也当成"已说过"压下去。 */
    const sameFigure = d.fid ? (x => x.fid === d.fid)
      : (x => x.book === d.book && x.who === d.who);
    const used = rows.filter(x => x.reply && sameFigure(x)).map(x => x.reply);
    const reply = await replyEngine(d.fid, d.text || "", used, d.book, d.who);
    if (!reply) continue;
    await db.collection(C.letters).doc(d._id).update({
      reply: reply, repliedAt: new Date(), updatedAt: new Date()
    }).catch(() => null);
    n++;
  }
  return n;
}

/* 最新版本信息。数字由构建脚本 build_apk.py 在出包时自动回写，
   apkUrl / notes 由人维护 —— 两边都写死必然漂移，所以版本号只有一个来源。
   用 try 包住：version.json 缺失或格式坏了也只是「查不到更新」，不能让整个函数起不来。 */
let VERSION = { versionCode: 0, versionName: "", apkUrl: "", releasedAt: "", notes: [] };
try {
  const v = require("./version.json");
  VERSION = {
    versionCode: Number(v.versionCode) || 0,
    versionName: String(v.versionName || ""),
    apkUrl: String(v.apkUrl || ""),
    releasedAt: String(v.releasedAt || ""),
    notes: Array.isArray(v.notes) ? v.notes.slice(0, 20) : []
  };
} catch (e) {
  console.error("[rt-api] version.json 读取失败：", e && e.message);
}

const ok = (d) => Object.assign({ ok: true }, d || {});
const fail = (err, msg) => ({ ok: false, err: err, msg: msg || "" });

/* 常数时间比较（v1.94）：管理 key 不再 !== 明文比。长度不齐直接不等（长度本身不算秘密）。 */
function safeEqual(a, b) {
  const sa = Buffer.from(String(a == null ? "" : a));
  const sb = Buffer.from(String(b == null ? "" : b));
  if (sa.length !== sb.length || sa.length === 0) return false;
  return crypto.timingSafeEqual(sa, sb);
}

/* ---------------------------------------------------------------- 基础工具 */

function normEmail(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}
function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function scrypt(pwd, salt) {
  return crypto.scryptSync(String(pwd), salt, 64).toString("hex");
}
function makePwd(pwd) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt: salt, hash: scrypt(pwd, salt) };
}
function checkPwd(pwd, salt, hash) {
  const h = scrypt(pwd, salt);
  if (h.length !== String(hash).length) return false;
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(hash, "hex"));
}

/* 避开 0/O、1/I 这类易混字符 —— 邀请码与恢复码都要靠人眼抄写 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function randCode(len) {
  const bytes = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}
const newInviteCode = () => "RT-" + randCode(4) + "-" + randCode(4);
const newRecoveryCode = () => "RT-RC-" + randCode(4) + "-" + randCode(4) + "-" + randCode(4);

function b64u(input) {
  return Buffer.from(input).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDecode(s) {
  return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function hmac(payload, secret) {
  return b64u(crypto.createHmac("sha256", secret).update(payload).digest());
}
function signToken(uid, days, extra) {
  const body = { u: uid, exp: Date.now() + (days || TOKEN_DAYS) * 86400000 };
  if (extra) {
    const ks = Object.keys(extra);
    for (let i = 0; i < ks.length; i++) body[ks[i]] = extra[ks[i]];
  }
  const payload = b64u(JSON.stringify(body));
  return payload + "." + hmac(payload, SECRET);
}
function verifyToken(token) {
  if (typeof token !== "string") return null;
  const i = token.indexOf(".");
  if (i < 1) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  /* 先试当前密钥，再试轮换前的旧密钥 —— 轮换期里两代 token 并存（v1.94） */
  const expect = hmac(payload, SECRET);
  if (sig.length !== expect.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) {
    if (!SECRET_PREV) return null;
    const expectOld = hmac(payload, SECRET_PREV);
    if (sig.length !== expectOld.length ||
        !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectOld))) return null;
  }
  let obj = null;
  try { obj = JSON.parse(b64uDecode(payload)); } catch (e) { return null; }
  if (!obj || !obj.u || !obj.exp || obj.exp < Date.now()) return null;
  return obj;
}

/* 取调用者 uid：只认自签 token，不依赖平台会话身份 */
async function caller(event) {
  const t = verifyToken(event && event.token);
  if (!t) return null;
  const r = await db.collection(C.users).doc(t.u).get().catch(() => null);
  const u = r && r.data && r.data[0];
  return u ? u : null;
}

/* ------------------------------------------------------------ 登录限流（v1.94）
   公开的 login / resetPwd 原先不限次 —— 可无限爆破密码与恢复码。
   云函数实例可能被回收/多开，内存计数只是「尽力而为」的第一道闸：实例重启清零、
   多实例各记各的，但抬高了爆破成本（每次失败都在同一实例内撞墙）。
   反馈的落库限流是第二道独立的闸，两条路不混用。 */
const RATE = new Map();   /* key -> { n, until } */
const RATE_WIN = 600000;  /* 10 分钟窗口 */
const RATE_MAX = 8;       /* 窗口内最多 8 次失败尝试（成功不清窗口，只清计数） */

function rateHit(key) {
  const now = Date.now();
  const r = RATE.get(key);
  if (!r || now > r.until) return 0;
  return r.n;
}
function rateFail(key) {
  const now = Date.now();
  const r = RATE.get(key);
  if (!r || now > r.until) { RATE.set(key, { n: 1, until: now + RATE_WIN }); return; }
  r.n++;
}
function rateClear(key) { RATE.delete(key); }
/* Map 只增不减会被长期运行的实例慢慢吃掉内存：写入时顺手清一批过期的 */
setInterval(() => {
  const now = Date.now();
  for (const k of RATE.keys()) {
    const r = RATE.get(k);
    if (r && now > r.until) RATE.delete(k);
  }
}, 300000).unref();

function publicUser(u) {
  return {
    uid: u._id, email: u.email, nickname: u.nickname || String(u.email).split("@")[0],
    profile: profileOf(u)
  };
}

const uid32 = () => crypto.randomUUID().replace(/-/g, "");

/* ------------------------------------------------------- 本机免密（#171）

   「退出登录之后别再让我输密码」的落地件。**不存密码**：登录成功时另发一枚长期
   设备凭据（365 天，payload 里带设备号 `d`），客户端存在本机。退出登录只清会话，
   留着它 —— 下次进 App 点一下「一键进入」就回来了。
   服务端只留凭据的 sha256（rt_users.devices），于是每枚都能单独撤销：注销账号随
   文档一起消失、设置里关开关时删掉、凭据换代后又被拿出来用也删掉。
   用一次换一枚（rotation）：换过代的那枚立刻作废，再拿旧的来换即视为泄露，
   只作废**这一条**设备记录，不影响同一账号的其他设备。 */
const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

/* 发一枚新设备凭据并入账。u 只要带 _id 与 devices（注册时刚建的文档还没这个字段） */
async function issueDevice(u) {
  const id = crypto.randomBytes(8).toString("hex");
  const token = signToken(u._id, DEVICE_DAYS, { d: id });
  const list = (u.devices || []).filter(d => d && d.id !== id);
  list.unshift({ id: id, th: hashToken(token), at: new Date() });
  await db.collection(C.users).doc(u._id).update({ devices: list.slice(0, DEVICE_MAX) });
  return token;
}

/* 会话临近到期就顺手续一枚新的。返回 null = 还早，不必换。
   注意它只签一枚同 uid 的会话 token，不碰设备凭据。 */
function renewSession(event) {
  const t = verifyToken(event && event.token);
  if (!t) return null;
  return (t.exp - Date.now() < RENEW_BELOW_MS) ? signToken(t.u) : null;
}

/* -------------------------------------------------------------- 个人资料（#122）

   资料只有两个字段，直接挂在 rt_users 的用户文档上（不开新集合）：
     · signature ≤ 40 字（客户端输入框 maxlength 同值，这里再截一次防绕过）
     · avatar     dataURL（客户端压成的 JPEG，边长随客户端，≤ 400000 字符）或 emoji（≤ 16 字符）
   profileAt 是 LWW 印章（客户端写上来的 epoch ms）：多端同时改资料，新者胜；
   印章存在用户文档里，caller() 每次都把文档带回来，读它零额外开销。
   avatar 上限**拒绝**而不截断 —— dataURL 截一半就是坏图，不如让客户端
   明确收到错误。emoji 截到 16 字符即可（截了也还是个能显示的文本）。
   #141：20000 → 400000 —— 用户拍板「头像不压缩，体积大没事」。400K 字符 ≈ 300KB JPEG
   ≈ 1280px 边长（主流 3x 屏满宽 1:1），连头像整文档 ~405KB，仍低于云数据库的单文档限制；
   客户端自留线 380000（AVA_MAX_CHARS）先降质兜底，这里只挡绕过客户端的直呼。 */
function profileOf(u) {
  return {
    signature: String(u.signature || ""),
    avatar: String(u.avatar || ""),
    nickname: String(u.nickname || ""),
    profileAt: (u.profileAt && new Date(u.profileAt).getTime()) || 0
  };
}

function cleanAvatar(a) {
  let s = String(a || "");
  if (!s) return "";
  /* dataURL 原样收（上限内）；其余按 emoji / 短文本处理 */
  if (s.lastIndexOf("data:image/", 0) !== 0) return s.slice(0, 16);
  if (s.length > 400000) return null;     /* null = 超限，由调用方拒绝（#141 起 400000） */
  return s;
}

/* event.profile 缺省 = 只读（顺便给调试用）；带了才走 LWW 写入。
   昵称（#130）随同一条 LWW 印章走：首启引导取的称呼落 rt_users.nickname。
   空串不落库 —— 昵称没有「清空」语义（渲染端空值落到邮箱前缀），
   老客户端不传该字段（undefined）也绝不能动它，向后兼容。 */
async function setProfile(event, u) {
  const p = event.profile;
  if (!p || typeof p !== "object") return ok({ profile: profileOf(u) });
  const at = Number(event.updatedAt) || Date.now();
  const cur = profileOf(u);
  if (cur.profileAt > at) return ok({ profile: cur });
  const avatar = cleanAvatar(p.avatar);
  if (avatar === null) return fail("avatar_too_large", "头像图片太大，请换一张小的");
  const signature = String(p.signature || "").slice(0, 40);
  const nickname = p.nickname === undefined ? "" : String(p.nickname || "").trim().slice(0, 12);
  const patch = { signature: signature, avatar: avatar, profileAt: new Date(at) };
  if (nickname) patch.nickname = nickname;
  await db.collection(C.users).doc(u._id).update(patch);
  return ok({ profile: { signature: signature, avatar: avatar, nickname: nickname || cur.nickname, profileAt: at } });
}

/* ------------------------------------------------------------------ 版本 */

/* 公开动作：查最新版本不需要登录 —— 还没注册的人也得能升级 */
async function info() {
  return ok({ latest: VERSION, serverTime: Date.now() });
}

/* ------------------------------------------------------------------ 账号 */

async function register(event) {
  const email = normEmail(event.email);
  const password = String(event.password || "");
  const code = String(event.inviteCode || "").trim().toUpperCase();

  if (!isEmail(email)) return fail("bad_email", "邮箱格式不正确");
  if (password.length < 6) return fail("weak_pwd", "密码至少 6 位");
  if (!code) return fail("need_invite", "需要邀请码");

  const inv = await db.collection(C.invites).where({ code: code }).limit(1).get();
  const iv = inv.data && inv.data[0];
  if (!iv) return fail("bad_invite", "邀请码无效");
  /* reusable = 通用码：同一串可反复用、不被占用（管理员自己在库里放一条 reusable:true）。
     不带这个标记的是普通码，仍然「一码一人」，用过即废。 */
  if (iv.usedBy && !iv.reusable) return fail("invite_used", "邀请码已被使用");
  if (iv.expireAt && new Date(iv.expireAt).getTime() < Date.now()) {
    return fail("invite_expired", "邀请码已过期");
  }

  const dup = await db.collection(C.users).where({ email: email }).limit(1).get();
  if (dup.data && dup.data.length) return fail("email_taken", "该邮箱已注册");

  const uid = uid32();
  const now = new Date();
  const p = makePwd(password);
  const recoveryCode = newRecoveryCode();
  const rp = makePwd(recoveryCode);

  /* 注意：doc(id).set() 里**不能**再带 _id —— SDK 会报「不能更新_id的值」 */
  await db.collection(C.users).doc(uid).set({
    email: email,
    pwdSalt: p.salt,
    pwdHash: p.hash,
    rcSalt: rp.salt,
    rcHash: rp.hash,
    nickname: email.split("@")[0].slice(0, 20),
    createdAt: now,
    updatedAt: now
  });
  /* 普通码标记占用；通用码只累加计数，不能写 usedBy，否则第二次就被自己挡住。
     普通码用**条件更新**（where usedBy 为空才写）：原先的先读后写有竞态 ——
     两路并发注册同一码都能读到 usedBy 为空，一码进两人（v1.94 收紧）。 */
  if (iv.reusable) {
    await db.collection(C.invites).doc(iv._id).update({
      useCount: (Number(iv.useCount) || 0) + 1, lastUsedBy: uid, lastUsedAt: now
    });
  } else {
    const took = await db.collection(C.invites)
      .where({ code: code, usedBy: null }).update({ usedBy: uid, usedAt: now })
      .catch(() => null);
    const n = took && (took.updated || took.updatedCount);
    if (n === 0) {
      /* 条件更新没写到 = 就在这一瞬被别人占了；刚建的用户文档撤掉（尽力而为） */
      await db.collection(C.users).doc(uid).remove().catch(() => {});
      return fail("invite_used", "邀请码已被使用");
    }
  }

  const out = {
    uid: uid,
    email: email,
    nickname: email.split("@")[0].slice(0, 20),
    token: signToken(uid),
    recoveryCode: recoveryCode
  };
  /* remember：客户端「本机免密登录」开着才会有这一枚（见 issueDevice） */
  if (event.remember) {
    out.deviceToken = await issueDevice({ _id: uid, devices: [] });
  }
  return ok(out);
}

async function login(event) {
  const email = normEmail(event.email);
  /* 登录限流（v1.94）：失败按邮箱计数，超了先拒 —— 别给爆破密码的人无限机会 */
  const rk = "L:" + email;
  if (rateHit(rk) >= RATE_MAX) return fail("too_many", "尝试太频繁了，请 10 分钟后再试");
  const r = await db.collection(C.users).where({ email: email }).limit(1).get();
  const u = r.data && r.data[0];
  /* 不区分「邮箱未注册」与「密码错误」，避免枚举账号 */
  if (!u) { rateFail(rk); return fail("bad_credential", "邮箱或密码不正确"); }
  if (!checkPwd(event.password, u.pwdSalt, u.pwdHash)) {
    rateFail(rk);
    return fail("bad_credential", "邮箱或密码不正确");
  }
  rateClear(rk);
  const out = Object.assign({ token: signToken(u._id) }, publicUser(u));
  if (event.remember) out.deviceToken = await issueDevice(u);
  return ok(out);
}

/* 本机免密：拿设备凭据换一枚新会话。不需要密码、不需要恢复码 —— 这正是它的用处：
   退出登录 / 会话过期之后，同一台设备点一下就回来。凭据无效（撤销 / 换代 / 过期）
   一律拒，客户端据此退回密码登录。 */
async function deviceLogin(event) {
  const raw = String(event.deviceToken || "");
  const t = verifyToken(raw);
  if (!t || !t.d) return fail("bad_device", "本机免密已失效，请用密码登录");
  const r = await db.collection(C.users).doc(t.u).get().catch(() => null);
  const u = r && r.data && r.data[0];
  const list = (u && u.devices) || [];
  const hit = list.filter(d => d && d.id === t.d)[0];
  if (!u || !hit) return fail("bad_device", "本机免密已失效，请用密码登录");
  /* 换代之前的那一枚（客户端没把新凭据存住时会再拿出来用）就是失效而已 —— **不删记录**。
     单设备单凭据的模型里，"旧凭据又出现"和"凭据被盗"根本区分不开，而误判的代价是把
     用户自己锁在门外（只能回去输密码）。真被盗用时的出口是设置里那个开关（撤销）。
     ⚠️ 这条是 #171 线上自检逮到的：原先把旧凭据当泄露、顺手删了这台设备的记录，
        结果手上那枚**新的**也跟着失效（deviceLogin 随后的合法调用被拒）。 */
  if (hit.th !== hashToken(raw)) {
    return fail("bad_device", "本机免密已失效，请用密码登录");
  }
  const token = signToken(u._id, DEVICE_DAYS, { d: t.d });   /* 用一次换一枚 */
  await db.collection(C.users).doc(u._id).update({
    devices: [{ id: t.d, th: hashToken(token), at: hit.at }]
      .concat(list.filter(d => d && d.id !== t.d)).slice(0, DEVICE_MAX)
  });
  return ok(Object.assign({ token: signToken(u._id), deviceToken: token }, publicUser(u)));
}

/* 设置里「本机免密登录」开关：
   · 开 → 现在这台机器补发一枚凭据（会话还在，正大光明）；
   · 关 → 撤掉手上这一枚。撤销**只认凭据本身、不要会话** —— 会话可能正好过期了，
          那一刻也应当允许把免密关掉。 */
async function revokeDevice(event) {
  const raw = String(event.deviceToken || "");
  const t = verifyToken(raw);
  if (!t || !t.d) return ok({ revoked: 0 });
  const r = await db.collection(C.users).doc(t.u).get().catch(() => null);
  const u = r && r.data && r.data[0];
  if (!u) return ok({ revoked: 0 });
  const list = (u.devices || []).filter(d => d && d.id !== t.d);
  await db.collection(C.users).doc(u._id).update({ devices: list });
  return ok({ revoked: 1 });
}

async function resetPwd(event) {
  const email = normEmail(event.email);
  const rc = String(event.recoveryCode || "").trim().toUpperCase();
  const np = String(event.newPassword || "");
  if (np.length < 6) return fail("weak_pwd", "新密码至少 6 位");
  /* 恢复码同样值得护着：它就是「绕过密码的钥匙」（v1.94 补限流） */
  const rk = "R:" + email;
  if (rateHit(rk) >= RATE_MAX) return fail("too_many", "尝试太频繁了，请 10 分钟后再试");

  const r = await db.collection(C.users).where({ email: email }).limit(1).get();
  const u = r.data && r.data[0];
  if (!u || !u.rcSalt || !u.rcHash) { rateFail(rk); return fail("bad_recovery", "邮箱或恢复码不正确"); }
  if (!checkPwd(rc, u.rcSalt, u.rcHash)) { rateFail(rk); return fail("bad_recovery", "邮箱或恢复码不正确"); }
  rateClear(rk);

  /* 恢复码一次性：用后即换，旧的立刻作废 */
  const p = makePwd(np);
  const nextRc = newRecoveryCode();
  const rp = makePwd(nextRc);
  await db.collection(C.users).doc(u._id).update({
    pwdSalt: p.salt, pwdHash: p.hash,
    rcSalt: rp.salt, rcHash: rp.hash,
    updatedAt: new Date()
  });
  const out = Object.assign({ token: signToken(u._id), recoveryCode: nextRc }, publicUser(u));
  if (event.remember) out.deviceToken = await issueDevice(u);
  return ok(out);
}

/* 重签恢复码（#171）：恢复码原先只在注册那一刻露一次，之后设置页看不到 —— 丢了就锁死
   （合规页「关于密码」自己写着"无法找回"）。这里拿当前密码换一枚新的，旧的立刻作废。 */
async function rotateRc(event, u) {
  if (!checkPwd(event.password, u.pwdSalt, u.pwdHash)) return fail("bad_pwd", "密码不正确");
  const rc = newRecoveryCode();
  const rp = makePwd(rc);
  await db.collection(C.users).doc(u._id).update({
    rcSalt: rp.salt, rcHash: rp.hash, updatedAt: new Date()
  });
  return ok({ recoveryCode: rc });
}

/* 设置里把「本机免密登录」重新打开：会话在手，补发一枚凭据即可 */
async function makeDevice(u) {
  return ok({ deviceToken: await issueDevice(u) });
}

async function changePwd(event, u) {
  const np = String(event.newPassword || "");
  if (np.length < 6) return fail("weak_pwd", "新密码至少 6 位");
  if (!checkPwd(event.oldPassword, u.pwdSalt, u.pwdHash)) {
    return fail("bad_pwd", "原密码不正确");
  }
  const p = makePwd(np);
  await db.collection(C.users).doc(u._id).update({
    pwdSalt: p.salt, pwdHash: p.hash, updatedAt: new Date()
  });
  return ok({});
}

async function deleteAccount(u) {
  let removed = 0;
  const cols = [C.notes, C.letters, C.books, C.booklists];
  for (let i = 0; i < cols.length; i++) {
    for (;;) {
      /* 分批删，避免一次删太多超时 */
      const r = await db.collection(cols[i]).where({ _uid: u._id }).limit(100).get();
      const rows = r.data || [];
      if (!rows.length) break;
      for (let k = 0; k < rows.length; k++) {
        await db.collection(cols[i]).doc(rows[k]._id).remove();
        removed++;
      }
      if (rows.length < 100) break;
    }
  }
  await db.collection(C.prefs).doc(u._id).remove().catch(() => {});
  await db.collection(C.users).doc(u._id).remove().catch(() => {});
  return ok({ removed: removed });
}

/* ------------------------------------------------------------------ 同步 */

/* 落库前统一补齐/清洗字段，防止客户端塞入控制字段。
   注意日期字段叫 **ts** 而不是 date：客户端一直把"算哪一天"存在 ts 里
   （绝对写法字符串如 "2026.09.14"），时间线的 noteDate() 只认它。
   曾经按 date 落库，结果日期全空、拉回来全被兜底成"今天"。 */
function cleanDoc(raw, uid, kind) {
  const id = String((raw && raw.id) || "").trim();
  if (!id) return null;
  const d = {
    _id: id,
    _uid: uid,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : new Date(),
    deletedAt: raw.deletedAt ? new Date(raw.deletedAt) : null,
    kind: kind
  };
  if (kind === "note") {
    d.ts = String(raw.ts || "");
    d.text = String(raw.text || "");
    if (raw.bookId) d.bookId = String(raw.bookId);
    if (raw.seed) d.seed = true;
  } else if (kind === "letter") {
    d.fid = String(raw.fid || "");
    d.text = String(raw.text || "");
    d.ts = String(raw.ts || "");
    /* reply 空串也要落库：它是"还没回信"的标记，fillReplies 靠它找待回的信。
       老信本来就带 reply（那时回信在客户端生成），行为不变。 */
    d.reply = String(raw.reply || "");
    /* sentAt = 寄出时刻，回信延迟按它算。**不**用 updatedAt：同一封信被重复推一次
       updatedAt 就往后挪一次，等待时间会被无限重置。老信没有 at，按"现在"起算。 */
    d.sentAt = new Date(Number(raw.at) || Date.now());
    /* 名册之外的收信人（#177）：fid 为空时带上书名 + 人物名，
       fillReplies 靠它现搭这个人物的口吻。名册里的信不带这两个字段。 */
    if (!d.fid && (raw.book || raw.who)) {
      d.book = String(raw.book || "").slice(0, 40);
      d.who = String(raw.who || "").slice(0, 24);
    }
  } else if (kind === "book") {
    /* 书目（#57 起由用户自己上传）。cover 是压缩后的 dataURL，**原样透传**
       （不截断 —— 截了图就废了）；其余字段都截一个上限，防止客户端塞脏。
       set() 是整文档替换：这次没带 cover 就等于把封面删掉，正是「移除封面」的语义。
       阅迹是读书记录、不再有阅读线：页面 pages / 进度 progress / 类别 cat /
       正文 body 四个字段已从客户端整体摘掉，云函数也不再收。 */
    d.title = String(raw.title || "").slice(0, 120);
    d.author = String(raw.author || "").slice(0, 80);
    d.status = String(raw.status || "reading").slice(0, 16);
    d.rate = Math.max(0, Math.min(5, Math.round(Number(raw.rate) || 0)));
    /* 摆在第几层（#167）：1..5 = 用户钉住的层；缺省/0 = 自动（按书架空隙排）。
       **没钉就不写字段** —— 与客户端「老书一律自动」的口径一致，也省文档体积。 */
    if (raw.shelf) d.shelf = Math.max(1, Math.min(5, Math.round(Number(raw.shelf) || 0)));
    d.c1 = String(raw.c1 || "").slice(0, 16);
    d.c2 = String(raw.c2 || "").slice(0, 16);
    if (raw.cover) d.cover = String(raw.cover);
  } else if (kind === "list") {
    /* 书单（#57 起由用户自建）。装的是**书的 rid 数组**（rids），不是书的副本 ——
       书有它自己的文档，书单只做引用，改一次名字或挪一本书不必顺带上行封面。
       rids 逐条截到 64 字符（uuid 形态）并去重，上限 500 条，防止客户端塞爆文档。 */
    d.name = String(raw.name || "").slice(0, 24);
    d.desc = String(raw.desc || "").slice(0, 60);
    d.ts = String(raw.ts || "").slice(0, 32);
    const seen = {};
    d.rids = [];
    const src = Array.isArray(raw.rids) ? raw.rids : [];
    for (let i = 0; i < src.length && d.rids.length < 500; i++) {
      const r = String(src[i] || "").slice(0, 64);
      if (r && !seen[r]) { seen[r] = 1; d.rids.push(r); }
    }
  }
  return d;
}

async function pullAll(u, since) {
  const uid = u._id;
  /* 先补齐到点的回信，再查数据 —— 顺序反了这一轮就白拉一次 */
  await fillReplies(uid).catch(e => { console.error("[rt-api] fillReplies:", e && e.message); });
  const out = { notes: [], letters: [], books: [], booklists: [], prefs: null, serverTime: Date.now() };
  /* 资料随每一轮 pull 顺带回去（#122）：caller() 已经读过用户文档，这里零额外开销；
     另一台设备改了签名/头像，本机最多等一轮同步就能看到。 */
  out.profile = profileOf(u);
  const sinceDate = since ? new Date(Number(since)) : null;
  const cols = [["notes", C.notes], ["letters", C.letters], ["books", C.books],
                ["booklists", C.booklists]];

  for (let c = 0; c < cols.length; c++) {
    const key = cols[c][0];
    const col = cols[c][1];
    let skip = 0;
    for (;;) {
      const where = sinceDate
        ? { _uid: uid, updatedAt: _.gt(sinceDate) }
        : { _uid: uid };
      const r = await db.collection(col).where(where)
        .orderBy("updatedAt", "asc").skip(skip).limit(PAGE).get();
      const rows = r.data || [];
      out[key] = out[key].concat(rows);
      if (rows.length < PAGE) break;
      skip += PAGE;
    }
  }

  const pr = await db.collection(C.prefs).doc(uid).get().catch(() => null);
  const p = pr && pr.data && pr.data[0];
  if (p) out.prefs = p;
  return ok(out);
}

async function pushAll(uid, event) {
  const now = Date.now();
  let written = 0;

  const jobs = [
    ["notes", C.notes, "note"],
    ["letters", C.letters, "letter"],
    ["books", C.books, "book"],
    ["booklists", C.booklists, "list"]
  ];
  for (let j = 0; j < jobs.length; j++) {
    const list = Array.isArray(event[jobs[j][0]]) ? event[jobs[j][0]] : [];
    for (let i = 0; i < list.length; i++) {
      const d = cleanDoc(list[i], uid, jobs[j][2]);
      if (!d) continue;
      /* LWW：远端更新则跳过本地这次写入 */
      const cur = await db.collection(jobs[j][1]).doc(d._id).get().catch(() => null);
      const c = cur && cur.data && cur.data[0];
      /* 归属校验（v1.94）：文档已存在但不是这个用户的，绝不覆盖 ——
         id 虽是 uuid 派生、撞车概率趋近于零，但客户端给什么 id 就写什么文档，
         这道闸该在服务端（也挡住手搓请求乱写别人的 _id）。 */
      if (c && c._uid && c._uid !== uid) {
        console.warn("[rt-api] push 越权写入被拒:", jobs[j][0], d._id);
        continue;
      }
      if (c && c.updatedAt && new Date(c.updatedAt).getTime() > d.updatedAt.getTime()) continue;
      const body = Object.assign({}, d);
      delete body._id;
      await db.collection(jobs[j][1]).doc(d._id).set(body);
      written++;
    }
  }

  if (event.prefs && typeof event.prefs === "object") {
    const cur = await db.collection(C.prefs).doc(uid).get().catch(() => null);
    const c = cur && cur.data && cur.data[0];
    if (!c || !c.updatedAt ||
        new Date(c.updatedAt).getTime() <= new Date(event.prefs.updatedAt || now).getTime()) {
      /* prefs 白名单清洗（v1.94）：原先 Object.assign 整包落库 —— 客户端塞什么
         字段就存什么字段，文档可以被撑大。白名单之外一律不收。 */
      const pd = {};
      const src = event.prefs;
      if (typeof src.theme === "string") pd.theme = src.theme.slice(0, 16);
      if (typeof src.sound === "boolean") pd.sound = src.sound;
      if (typeof src.haptic === "boolean") pd.haptic = src.haptic;
      if (src.miss && typeof src.miss === "object" &&
          JSON.stringify(src.miss).length <= 20000) pd.miss = src.miss;
      if (typeof src.hero === "string" && src.hero.length <= 2000000) pd.hero = src.hero;
      if (Number.isFinite(Number(src.listSeq))) pd.listSeq = Math.max(0, Math.round(Number(src.listSeq)));
      pd._uid = uid;
      pd.updatedAt = new Date(event.prefs.updatedAt || now);
      await db.collection(C.prefs).doc(uid).set(pd);
      written++;
    }
  }

  return ok({ written: written, serverTime: Date.now() });
}

/* -------------------------------------------------------------- 邀请码 */

async function genInvites(event) {
  if (!ADMIN_KEY || !safeEqual(event.key, ADMIN_KEY)) return fail("forbidden", "无权限");
  const count = Math.max(1, Math.min(50, Number(event.count) || 5));
  const days = Math.max(1, Math.min(365, Number(event.days) || 30));
  const expireAt = new Date(Date.now() + days * 86400000);
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = newInviteCode();
    await db.collection(C.invites).add({
      code: code, usedBy: null, usedAt: null,
      expireAt: expireAt, createdAt: new Date()
    });
    codes.push(code);
  }
  return ok({ codes: codes, expireAt: expireAt.toISOString() });
}

/* ---------------------------------------------------------------- 反馈（#193） */

const FB = {
  text: 2000,          /* 正文上限（客户端 1000，这里留一倍余量） */
  pics: 3,             /* 最多 3 张图 */
  one: 700000,         /* 单张 dataURL 字符数上限（≈525 KB 的图） */
  total: 1500000,      /* 三张合计上限 —— 别去顶网关的请求体限制 */
  per10min: 5          /* 同一个邮箱 10 分钟内最多几条（防脚本刷爆开发者邮箱） */
};

/* 时间是给开发者看的，一律写清时区（云函数跑在 UTC，直接 toISOString 会差 8 小时） */
function bjTime(d) {
  return new Date(d.getTime() + 8 * 3600000).toISOString()
    .replace("T", " ").slice(0, 19) + " (+08:00)";
}
function short(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/* 信的内容：开发者第一眼要看到「谁、什么时候、什么版本、说了什么」。 */
function fbMailText(o, doc) {
  const line = "─────────────────────────────";
  const who = doc.uid ? (doc.account || doc.uid) : "未登录";
  return [
    "收到一条新反馈（阅迹 ReadTrace）",
    "",
    "时间：" + bjTime(doc.at),
    "版本：" + (doc.ver || "未知") + "（" + (doc.platform || "未知端") + "）",
    "账号：" + who,
    "联系邮箱：" + doc.mail + "（回这封信就能回到他手上）",
    "附图：" + (doc.imgCount || 0) + " 张" + (doc.imgCount ? "（见附件）" : ""),
    "",
    line,
    "反馈内容：",
    "",
    doc.text,
    line
  ].join("\n");
}

async function feedbackAction(event) {
  const text = String(event.text == null ? "" : event.text).trim();
  const m = normEmail(event.mail);
  const raw = Array.isArray(event.images) ? event.images.slice(0, FB.pics + 3) : [];

  if (text.length < 5) return fail("fb_short", "反馈内容太短了，多写两句吧");
  if (text.length > FB.text) return fail("fb_long", "反馈太长了，请精简到 " + FB.text + " 字以内");
  if (!isEmail(m)) return fail("fb_mail", "请填一个能收到回复的邮箱");

  const imgs = [];
  let chars = 0;
  for (let i = 0; i < raw.length; i++) {
    const mm = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(raw[i] || ""));
    if (!mm) return fail("fb_image", "有张图读不出来，重新选一次试试");
    if (imgs.length >= FB.pics) return fail("fb_many", "最多只能传 " + FB.pics + " 张图");
    const sub = mm[1] === "jpg" ? "jpeg" : mm[1];
    chars += mm[2].length;
    if (mm[2].length > FB.one) return fail("fb_image_big", "有张图太大了，换一张小一点的");
    if (chars > FB.total) return fail("fb_images_big", "图片加起来太大了，少传一张");
    imgs.push({ mime: "image/" + sub, ext: sub === "png" ? "png" : (sub === "webp" ? "webp" : "jpg"),
                data: mm[2] });
  }

  /* 同一个邮箱一段时间内只收几条：撞上就婉拒，别让脚本把开发者邮箱刷爆 */
  try {
    const r = await db.collection(C.feedback)
      .where({ mail: m, at: _.gt(new Date(Date.now() - 600000)) }).count();
    if ((r && r.total) >= FB.per10min) {
      return fail("fb_flood", "刚收到你的反馈了，稍等一会儿再提新的吧");
    }
    /* 全局软上限（v1.94）：邮箱限流按客户端自报的邮箱计数，换邮箱就能绕 ——
       再给整个集合加一道总闸（10 分钟 30 条），拦住换着邮箱灌的脚本。 */
    const g = await db.collection(C.feedback)
      .where({ at: _.gt(new Date(Date.now() - 600000)) }).count();
    if ((g && g.total) >= 30) {
      return fail("fb_flood", "反馈通道有点忙，过一会儿再来吧");
    }
  } catch (e) { console.warn("[rt-api] feedback 频次检查跳过：", e && e.message); }

  const u = await caller(event).catch(() => null);
  const doc = {
    uid: u ? u._id : "",
    account: u ? u.email : "",
    mail: m,
    text: text,
    ver: String(event.ver || "").slice(0, 40),
    platform: String(event.platform || "").slice(0, 40),
    imgCount: imgs.length,
    /* 存**完整 data URL**（不是裸 base64）：自描述 —— check_feedback.py 直接落盘、
       控制台里一眼看得出是 png 还是 jpg，不用再猜。（发信那一路仍用裸 base64，
       那是 MIME 附件本身要的形态。） */
    imgData: imgs.map(x => "data:" + x.mime + ";base64," + x.data),
    at: new Date(),
    mailed: false,
    mailErr: "",
    mailVia: ""
  };

  /* 先落库：授权码还没配 / 发信正巧失败时，这条反馈也不会丢（开发者能在控制台与
     `feedbacks` 里看到）。落库失败也不拦人，照样试着发信。 */
  let id = "";
  let storeErr = "";
  try {
    const r = await db.collection(C.feedback).add(Object.assign({}, doc));
    id = (r && (r.id || r._id)) || "";
  } catch (e) {
    storeErr = String((e && e.message) || e);
    /* ⚠️ 云开发的集合默认要人去控制台手建 —— `rt_feedback` 是 #193 新加的，
       上线后**第一条真反馈就是拿它当试金石**（实测报 `Db or Table not exist:
       rt_feedback`）。这里让首条反馈自己把表建出来，省掉一步人工操作、也免掉
       「上线了但没人知道要先建表」这种坑。建完再写一次，仍失败就认命记日志。 */
    if (/not exist|ResourceNotFound/i.test(storeErr)) {
      try {
        if (typeof db.createCollection === "function") await db.createCollection(C.feedback);
        const r2 = await db.collection(C.feedback).add(Object.assign({}, doc));
        id = (r2 && (r2.id || r2._id)) || "";
        if (id) storeErr = "";
      } catch (e2) {
        storeErr = String((e2 && e2.message) || e2);
      }
    }
    if (!id) console.error("[rt-api] feedback 落库失败：", storeErr);
  }

  let via = "";
  try {
    const res = await mail.send({
      subject: "【阅迹反馈】" + short(text, 24),
      fromName: "阅迹反馈",
      replyTo: m,
      text: fbMailText(null, doc),
      attachments: imgs.map((x, i) => ({ name: "fb-" + (i + 1) + "." + x.ext,
                                         mime: x.mime, data: x.data }))
    });
    via = (res && res.via) || "";
  } catch (e) {
    doc.mailErr = String((e && e.message) || e);
    console.warn("[rt-api] feedback 发信失败：", doc.mailErr,
                 "| smtp 已配置 =", mail.ready(), "| 已入库 =", !!id);
  }
  doc.mailed = !!via;
  doc.mailVia = via;

  if (id) {
    await db.collection(C.feedback).doc(id)
      .update({ mailed: doc.mailed, mailErr: doc.mailErr, mailVia: doc.mailVia })
      .catch(() => null);
  }

  if (!id && !doc.mailed) {
    /* 不回传 storeErr / mailErr 原话 —— 那是数据库与 SMTP 服务器的内部细节
       （v1.94 修复），细节已经在 console.error / console.warn 里留给日志。 */
    return fail("fb_failed", "反馈没送出去，稍后再试");
  }
  return ok({ id: id, mailed: doc.mailed });
}

/* 管理员看反馈：授权码没配的那几天，反馈只躺在库里 —— 用这个把最近的捞出来。
   （客户端不调它；check_feedback.py 是它的调用方。）
   带 id 时只回这一条，并且**把附图一起带回来**（列表里不带 —— 一条最多 1.5 MB 的 base64，
   20 条一起回会顶爆回包）。 */
async function feedbacksAction(event) {
  if (!ADMIN_KEY || !safeEqual(event.key, ADMIN_KEY)) return fail("forbidden", "无权限");
  const one = String(event.id || "");
  if (one) {
    const r = await db.collection(C.feedback).doc(one).get().catch(() => null);
    const d = r && r.data && r.data[0];
    if (!d) return fail("not_found", "没有这条反馈");
    return ok({ item: { id: d._id, at: d.at, mail: d.mail, account: d.account || "",
                        text: d.text, ver: d.ver, platform: d.platform,
                        imgCount: d.imgCount || 0, mailed: !!d.mailed,
                        mailErr: d.mailErr || "", mailVia: d.mailVia || "",
                        images: d.imgData || [] } });
  }
  const limit = Math.max(1, Math.min(50, Number(event.limit) || 20));
  const r = await db.collection(C.feedback).orderBy("at", "desc").limit(limit).get();
  const items = (r && r.data ? r.data : []).map(d => ({
    id: d._id, at: d.at, mail: d.mail, account: d.account || "", text: d.text,
    ver: d.ver, platform: d.platform, imgCount: d.imgCount || 0,
    mailed: !!d.mailed, mailErr: d.mailErr || "", mailVia: d.mailVia || ""
  }));
  return ok({ items: items });
}

/* ------------------------------------------------------------------ 入口 */

exports.main = async (event) => {
  event = event || {};
  const action = event.action;

  /* 密钥没配 = 全站鉴权是空谈（v1.94 起不再有硬编码兜底）。info 与 feedback
     不走 token，照常服务；其余一律拒绝 —— 拒绝服务好过悄悄退化成公开密钥。 */
  if (!SECRET && action !== "info" && action !== "feedback") {
    console.error("[rt-api] RT_TOKEN_SECRET 未配置 —— 已拒绝 action:", action);
    return fail("server_config", "服务端密钥未配置，请联系开发者");
  }

  try {
    if (action === "info") return await info();          /* 公开：不需要 token */
    if (action === "register") return await register(event);
    if (action === "login") return await login(event);
    if (action === "resetPwd") return await resetPwd(event);
    /* 本机免密（#171）：这两条**故意不要会话 token** —— 要的就是"会话没了也能进来"，
       以及"会话过期了也能把免密关掉"。它们要凭的是设备凭据本身。 */
    if (action === "deviceLogin") return await deviceLogin(event);
    if (action === "revokeDevice") return await revokeDevice(event);
    if (action === "genInvites") return await genInvites(event);
    /* 反馈（#193）**故意不要 token**：还没账号 / 登录已过期的人也要能吐槽。
       带了 token 就顺手记下 uid（内部自己试 caller，失败当匿名）。 */
    if (action === "feedback") return await feedbackAction(event);
    if (action === "feedbacks") return await feedbacksAction(event);

    /* 以下都需要有效 token */
    const u = await caller(event);
    if (!u) return fail("unauthorized", "登录状态已失效，请重新登录");
    const fresh = renewSession(event);   /* 会话剩余不足 30 天 → 顺手换一枚 */

    let out;
    if (action === "session") out = ok(publicUser(u));
    else if (action === "changePwd") out = await changePwd(event, u);
    else if (action === "rotateRc") out = await rotateRc(event, u);
    else if (action === "makeDevice") out = await makeDevice(u);
    else if (action === "deleteAccount") out = await deleteAccount(u);
    else if (action === "profile") out = await setProfile(event, u);
    else if (action === "pull") out = await pullAll(u, event.since);
    else if (action === "push") out = await pushAll(u._id, event);
    /* 预留：可直接问一句要回信（也方便调试模型）。
       客户端不调它 —— 回信一律随 pull 送达，等待感是这么来的。 */
    else if (action === "reply") {
      const fid = String(event.fid || "");
      const r = await db.collection(C.letters)
        .where({ _uid: u._id, fid: fid }).limit(PAGE).get().catch(() => null);
      const used = (r && r.data) ? r.data.filter(d => d.reply).map(d => d.reply) : [];
      out = ok({ reply: await replyEngine(fid, String(event.text || ""), used,
        event.book, event.who) });
    } else {
      return fail("unknown_action", "未知操作");
    }

    /* 续期只在回包上多带一枚 token，客户端 call() 自动换掉，调用方无感 */
    if (fresh && !out.token) out.token = fresh;
    return out;
  } catch (e) {
    console.error("[rt-api]", action, e && e.message, e && e.stack);
    /* 内部错误的原话不回给客户端 —— 云 SDK / 数据库的报错细节可能带出集合名、
       内网路径（v1.94 修复），细节留在上面的 console.error 里。 */
    return fail("internal", "服务异常，请稍后再试");
  }
};
