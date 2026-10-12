/* 把 ../app 的网页三件套与素材原样同步到 shell/www，供 Capacitor 打进 APK。
 *
 * 为什么是"复制"而不是 webDir 直接指向 ../app：
 *   ① Capacitor 要求 webDir 在工程内，指向工程外会在 cap add / cap sync 时踩路径坑；
 *   ② Android 侧最终是把 webDir 整目录塞进 APK 的 assets/public，复制一份最直观；
 *   ③ app/ 始终是唯一真源 —— 改完 app/ 重跑 `npm run web` 即可，不要手改 www/。
 *
 * 注意：这里刻意**不用** fs.cpSync / fs.rmSync。Node 25 上这两个 API 在含中文的
 * Windows 路径下会以 0xC0000409（STATUS_STACK_BUFFER_OVERRUN）硬崩、且不打印任何错误，
 * 排查成本极高；手写递归只用 readdirSync / mkdirSync / copyFileSync / unlinkSync，
 * 慢一点但稳定，且能给出可读的进度。
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "app");
const DST = path.join(__dirname, "www");

if (!fs.existsSync(path.join(SRC, "index.html"))) {
  console.error("找不到 " + SRC + "\\index.html —— 外壳的网页源始终在 ../app");
  process.exit(1);
}

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  if (fs.lstatSync(p).isDirectory()) {
    for (const e of fs.readdirSync(p)) rmrf(path.join(p, e));
    fs.rmdirSync(p);
  } else {
    fs.unlinkSync(p);
  }
}

const stat = { files: 0, bytes: 0 };

function copyTree(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src)) copyTree(path.join(src, e), path.join(dst, e));
  } else {
    fs.copyFileSync(src, dst);
    stat.files++;
    stat.bytes += st.size;
  }
}

rmrf(DST);
copyTree(SRC, DST);

console.log("已同步 app/ -> www/：" + stat.files + " 个文件，" + (stat.bytes / 1048576).toFixed(1) + " MB");

const fonts = path.join(DST, "assets", "fonts");
if (fs.existsSync(fonts)) {
  console.log("字体：" + fs.readdirSync(fonts).map(function (f) {
    return f + " " + (fs.statSync(path.join(fonts, f)).size / 1048576).toFixed(1) + "MB";
  }).join(" / "));
} else {
  console.log("字体：无（将回退系统字体）");
}
