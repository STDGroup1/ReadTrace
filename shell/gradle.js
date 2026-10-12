/* 调用 android/gradlew 的薄包装。
 * npm 脚本里写 "cd android && gradlew assembleRelease" 在 Windows 上会踩
 * cmd 解析与路径转义的坑，这里统一用 spawnSync 指定 cwd，跨平台一致。
 * 首次运行会由 Gradle Wrapper 自己下载 Gradle 发行包（约 150 MB），慢但只需一次。
 */
const { spawnSync } = require("child_process");
const path = require("path");

const args = process.argv.slice(2);
if (!args.length) {
  console.error("用法：node gradle.js <gradle 任务，如 assembleRelease>");
  process.exit(1);
}

const cwd = path.join(__dirname, "android");
const isWin = process.platform === "win32";
const cmd = path.join(cwd, isWin ? "gradlew.bat" : "gradlew");

const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: isWin });
process.exit(r.status === null ? 1 : r.status);
