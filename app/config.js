/* 阅迹 ReadTrace · 前端配置（自部署必填）
   本文件在 index.html 里先于 app.js 加载，把 window.RT_CONFIG 挂上去。
   三处占位都必须换成你自己云环境的真值 —— 换一个云环境只改这一个文件。

   怎么拿到这三个值：
   · 【环境 ID】云开发控制台左上角那串 env-xxxx / demo-xxxx，就是它。
   · 【网关地址】https://<你的环境ID>.api.tcloudbasegateway.com/v1/functions/<函数名>/invoke
   · 【托管地址】静态托管给你分配的域名；本仓库前端放在它的 readtrace/ 子目录下，
       所以末尾带 /readtrace/（换路径的话这里也跟着改）。
   · 【publishable key】云开发控制台 → 环境 → 环境配置里的「可发布密钥」。
       它在设计上就是公开的（服务端按 Origin 判定来源），不是密钥 ——
       但它是**你环境专属**的，所以必须换成你自己的。
*/
window.RT_CONFIG = {
  gatewayUrl: "PUT_YOUR_GATEWAY_URL_HERE",
  hostingUrl: "PUT_YOUR_HOSTING_URL_HERE",
  publishableKey: "PUT_YOUR_PUBLISHABLE_KEY_HERE"
};
