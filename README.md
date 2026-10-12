# 阅迹 ReadTrace

> 记录读过的书、写下的随笔、写给书中人的信。

一个**单机优先**的阅读记录 App：HTML/CSS/JS 前端（零依赖、零外部 CDN、离线可用）
+ Capacitor 打的 Android 壳 + 一份腾讯云开发的云函数做账号与同步。
书架是按你收藏的书本数**自动加层**的木质书柜，日记与书信都是纸张质感。

**本仓库不含任何已编译的安装包，也不含任何云环境凭据** —— 想自己跑一份，
照下面六步部署到你自己的云环境即可；不想碰后端也可以只跑前端（见「只跑前端」）。

---

## 它长什么样

| 书架 | 记录 | 互动 |
| --- | --- | --- |
| 书本按收藏数自动加层的书柜，长按书脊可拖动排序 | 日历 / 时间轴两种视角，逐词浮现的翻档阅读 | 给书里的人写一封信，回信会来 |

封面、图标与界面素材都在 `app/assets/` 里，随仓库分发。

---

## 六步自部署

### 第 1 步 · 注册一个云开发环境

去 [腾讯云开发](https://tcb.cloud.tencent.com/) 注册并新建一个环境（个人版免费额度够用）。
记下它的**环境 ID**（形如 `demo-xxxxxxxx`），后面两步都要用。

### 第 2 步 · 建 8 个数据库集合

在云开发控制台 →「数据库」里建这 8 个**集合**（名字必须一致，代码里是写死的）：

```
rt_users  rt_invites  rt_notes  rt_letters  rt_books  rt_booklists  rt_prefs  rt_feedback
```

权限都选「仅创建者可读写」即可 —— 服务端走管理员身份，不受这条限制。

### 第 3 步 · 部署云函数

把 `cloud/functions/rt-api/` 整个目录（`index.js` / `mail.js` / `personas.js` /
`package.json`，外加你自己按 `version.example.json` 复制出来的 `version.json`）
上传成一个名为 **`rt-api`** 的云函数，运行时选 **Node.js 20**，入口 `index.main`。

> `package.json` 里只有一个依赖 `@cloudbase/node-sdk`，平台会自动装。
> `version.json` 真身不进仓库（见 `.gitignore`）：复制 `version.example.json` 改名为
> `version.json` 再传，它只是「检查更新」用的版本元信息，写假的也无所谓。

### 第 4 步 · 配环境变量

在云函数的「环境变量」里，按 `cloud/.env.example` 填。**最少填两个**：

| 变量 | 说明 |
| --- | --- |
| `RT_TOKEN_SECRET` | token 签名密钥，随便一串 40 位以上的随机字符。**没有兜底值** —— 不填的话所有要登录的接口一律拒绝 |
| `RT_ADMIN_KEY` | 管理员口令，自己定一串（看用户反馈、批量发邀请码要用） |

其余可选：`RT_REPLY_DELAY_MS`（回信等多久，默认 20 秒）、
`RT_SMTP_USER` / `RT_SMTP_PASS`（反馈信投递；`RT_SMTP_PASS` 填**邮箱的 SMTP 授权码**，
不是登录密码 —— 不填就只落库、不发信，功能不残）。

### 第 5 步 · 填前端配置

编辑 `app/config.js`，把三个占位换成你自己环境的值：

```js
window.RT_CONFIG = {
  gatewayUrl:     "https://<你的环境ID>.api.tcloudbasegateway.com/v1/functions/rt-api/invoke",
  hostingUrl:     "https://<你的托管域名>/readtrace/",
  publishableKey: "<你环境里的可发布密钥>"
};
```

三个值的取法都写在 `app/config.js` 的注释里。**换云环境只改这一个文件。**

### 第 6 步 · 跑起来 / 打包

**只跑前端（不需要后端）**：直接用浏览器打开 `app/index.html` 就能用 ——
书架、日记、书单都是纯本地的；只有「注册登录 / 跨设备同步 / 收到回信」需要第 1~5 步。

**打 Android 包**：

```bash
cd shell
npm install
node sync-web.js          # 把 ../app 同步进 android/app/src/main/assets/public
npx cap sync android
cd android && ./gradlew assembleRelease
```

打包要自己的签名密钥（`shell/keystore/` 不进仓库）：用 `keytool` 生成一个 `.keystore`，
在 `shell/android/keystore.properties` 里写上路径与口令。`build.gradle` 里已经写成
「没有这个文件就跳过签名」—— 不配也能出 debug 包。

---

## 目录结构

```
app/                         前端（零依赖，双击 index.html 就能用）
  index.html  styles.css  app.js
  config.js                  你填的云环境地址（自部署第 5 步）
  assets/                    封面、字体
cloud/functions/rt-api/      云函数：账号 / 同步 / 邀请码 / 信 / 反馈投递
shell/                       Capacitor Android 工程
```

## 关于回信

公开版**不含内置大模型**：书里人的回信取自 `cloud/functions/rt-api/personas.js` 里
手写的素材池（纯本地计算、零外部依赖、绝不失败）。想接自己的大模型，
`index.js` 的 `replyEngine()` 上留了交接注释，照它插一步就行 —— 记得
**Key 只从环境变量读**（前端是明文、APK 可解包）。

## 许可

[MIT](LICENSE)。
