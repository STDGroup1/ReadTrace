/* =========================================================
   阅迹 ReadTrace · 交互原型
   零依赖 · localStorage 持久化 · file:// 可直接打开
   ========================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     1. 数据
     --------------------------------------------------------- */
  const STATUS = { reading: "在读", done: "已读", wish: "想读" };

  /* 书架初始为空 —— 2026-09-22 起不再预置任何书（用户要求书目与封面全部自己添加）。
     BOOKS 是可写工作副本：就地增删改，全文件 30+ 处 BOOKS. 引用因此一处都不用动；
     启动时若存档里有 books，会用存档内容就地替换（见 load() 之后那一段）。 */
  const BOOKS = [];

  /* 书单（#57）：原先预置的 4 个策展书单连同各自的合辑正文一并删除，改成用户自建。
     与 BOOKS 同一套写法 —— LISTS 是可写工作副本，就地增删改，启动时用存档内容替换。 */
  const LISTS = [];

  /* 已退役的演示数据名单 —— **只留 id，正文全部删除**（2026-09-22，#57）。
     原先预置 12 本书（b1–b12）与 44 条随笔（n1–n44），用户要求书架与随笔都清空、
     内容全部自己添。名单留着有三个用处：
       ① 启动时把老存档（localStorage）里那批演示数据剔掉，只跑一次（PURGE_VER）；
       ② 云端 rt_notes 里若已被旧版本推上去过，用同一批 id 派生的 rid 推墓碑清掉；
       ③ mergeRemote 里挡一道 —— 另一台设备上的旧版本仍会把种子当用户数据推回云端，
          少了这道过滤，刚清掉的东西会随下一次 pull 复活。
     因此名单**不能删**。 */
  const RETIRED_BOOK_IDS = ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9", "b10", "b11", "b12"];
  const RETIRED_NOTE_IDS = ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9", "n10", "n11", "n12", "n13", "n14", "n15", "n16", "n17", "n18", "n19", "n20", "n21", "n22", "n23", "n24", "n25", "n26", "n27", "n28", "n29", "n30", "n31", "n32", "n33", "n34", "n35", "n36", "n37", "n38", "n39", "n40", "n41", "n42", "n43", "n44"];
  const RETIRED_BOOK_IDS_SET = {};
  RETIRED_BOOK_IDS.forEach(id => { RETIRED_BOOK_IDS_SET[id] = 1; });
  const RETIRED_NOTE_IDS_SET = {};
  RETIRED_NOTE_IDS.forEach(id => { RETIRED_NOTE_IDS_SET[id] = 1; });
  /* 退役迁移版本号：只跑一次，跑完落盘（见 load()）。 */
  const PURGE_VER = 1;

  /* 书目精简迁移版本号：只跑一次。阅迹不再有阅读线，书目里 正文/总页数/已读%/
     类别 四个字段已无消费者（详情页、编辑表单、云同步都摘掉了）—— 读档时主动
     抹掉，免得老存档继续背着它们、每次都白跑一趟云同步。 */
  const SLIM_VER = 1;

  /* 写信对象 = 书里的人（#77 起只留名册）。名册是可以一直加人的 ——
     它是「一键就能写」的常用位，不是全集；名册里没有的人物，用户自己填
     「书名 + 人物名」也能写（见 renderCompose 的第二段输入）。
     原先每人还带着一整套碑林素材（造型、标签、生平、一池子预置回信），
     碑林与想你榜在 #77 全删了，回信也改由服务端产出 —— 客户端只需要
     「信寄给谁」这一点信息，其余一概不要。
     ⚠️ 服务端另有一份完整人物表（cloud/functions/rt-api/personas.js），
        两边的 id / name / short 必须一致，由 check_personas_sync.py 兜底。 */
  const FIGURES = [
    { id: "f1", name: "奥雷里亚诺·布恩迪亚上校", short: "上校", bookId: "b3", emoji: "🐟" },
    { id: "f2", name: "保罗·厄崔迪", short: "保罗", bookId: "b4", emoji: "🪱" },
    { id: "f3", name: "弗洛伦蒂诺·阿里萨", short: "阿里萨", bookId: "b6", emoji: "✉️" },
    { id: "f4", name: "乌尔苏拉·伊瓜兰", short: "乌尔苏拉", bookId: "b3", emoji: "🕯️" },
    { id: "f5", name: "悉达多", short: "悉达多", bookId: "b5", emoji: "🌊" },
    { id: "f6", name: "柏瑞尔·马卡姆", short: "柏瑞尔", bookId: "b1", emoji: "✈️" },
    { id: "f7", name: "史铁生", short: "史铁生", bookId: "b9", emoji: "🌿" },
    { id: "f8", name: "智人", short: "智人", bookId: "b2", emoji: "🦴" },
    { id: "f9", name: "孙悟空", short: "悟空", bookId: "b13", emoji: "🐒" },
    { id: "f10", name: "林黛玉", short: "黛玉", bookId: "b14", emoji: "🌸" },
    { id: "f11", name: "堂吉诃德", short: "堂吉诃德", bookId: "b15", emoji: "🐴" },
    { id: "f12", name: "安娜·卡列尼娜", short: "安娜", bookId: "b16", emoji: "🚂" },
    { id: "f13", name: "圣地亚哥", short: "圣地亚哥", bookId: "b17", emoji: "🎣" },
    { id: "f14", name: "盖茨比", short: "盖茨比", bookId: "b18", emoji: "🥂" }
  ];

  /* 每个写信对象挂靠的那本书（#57 书目清空后留下的固化表）。
     书名/作者/书封色原先都拿 bookId 去书目里查 —— 书目清空后就会变成「未收录的书」、
     `undefined` 作者与一片灰底（#77 之前 renderShrine 还会直接抛 TypeError）。
     这里把这三样固化一份：色值照抄原先那几本书的 c1/c2，
     于是书目为空时**视觉与改动前完全一致**。
     （b3 被上校与乌尔苏拉两个人共用，与原样一致。）
     ⚠️ 别删：人名册只给 id / short，写信面板与收件箱的颜色全靠这张表。 */
  const FIGURE_BOOK = {
    b1: { title: "夜航西飞",       author: "柏瑞尔·马卡姆",   c1: "#2b3a55", c2: "#6b7ea6" },
    b2: { title: "人类简史",       author: "尤瓦尔·赫拉利",   c1: "#7a5c3e", c2: "#c39a6b" },
    b3: { title: "百年孤独",       author: "加西亚·马尔克斯", c1: "#5b2a2a", c2: "#a8543f" },
    b4: { title: "沙丘",           author: "弗兰克·赫伯特",   c1: "#3d2f1b", c2: "#c08a3e" },
    b5: { title: "悉达多",         author: "赫尔曼·黑塞",     c1: "#22453c", c2: "#5f9e83" },
    b6: { title: "霍乱时期的爱情", author: "加西亚·马尔克斯", c1: "#4a2353", c2: "#9b6bb5" },
    b9: { title: "我与地坛",       author: "史铁生",         c1: "#2f4034", c2: "#7d9370" },
    b13: { title: "西游记",         author: "吴承恩",         c1: "#4a3520", c2: "#b98a3c" },
    b14: { title: "红楼梦",         author: "曹雪芹",         c1: "#5b2436", c2: "#b5677f" },
    b15: { title: "堂吉诃德",       author: "塞万提斯",       c1: "#4a3a22", c2: "#9d8250" },
    b16: { title: "安娜·卡列尼娜", author: "列夫·托尔斯泰", c1: "#2b3340", c2: "#6f7d99" },
    b17: { title: "老人与海",       author: "海明威",         c1: "#1f3a4a", c2: "#4f86a6" },
    b18: { title: "了不起的盖茨比", author: "菲茨杰拉德",     c1: "#26332a", c2: "#c9a227" }
  };
  /* figName / figAuthor 已删（v1.94）：全文件零调用的死代码 —— 取书名/作者
     一律走 bookOf()。1448 行那条注释里提到的 figName 随之不存在，取色只剩 figC。 */
  function figC(f, k) {
    const one = FIGURE_BOOK[f && f.bookId];
    return one ? one[k] : bookC(f && f.bookId, k);
  }

  /* 一封信的字数上限。与老坟头的「写一封信」同量级，
     足以装下一段完整的话，又不至于把碑前的版面撑成一篇长文。 */
  const RESP_MAX = 500;

  /* 阅迹是「读书记录」，不是阅读器 —— 「翻开这本书」那条阅读线整套删除
     （正文分页解析 / 翻页阅读器 / 粒子开场）。原先这里的 BOOK_PAGES /
     WISH_PAGES / PENDING_PAGES / bodyPages() / pagesFor() / bodyHintText()
     与 BODY_MAX 都是给那条线喂数据的，一并清掉。
     ⚠️ 别加回：正文数据已无消费者，书目里也不再留 pages / progress / cat / body。 */

  /* 书单（#57）：预置的 4 个策展书单（深夜航线 / 拉美文学入门 / 理解现实的书 /
     给未来的自己）连同各自的合辑正文 LIST_PAGES 一并删除 —— 用户要求开箱无任何预置
     内容，书单也改成自己建（2026-09-22）。数据在 state.booklists，工作副本 LISTS。 */

  /* 书籍类别（b.cat）连同编辑表单的「类别」一栏一并删除 —— 记录一本书不需要分类。 */

  /* ---------------------------------------------------------
     2. 工具 & 状态
     --------------------------------------------------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const byId = id => document.getElementById(id);
  const bookOf = id => BOOKS.filter(b => b.id === id)[0];
  /* 书被删掉之后，随笔与碑仍可能指向它 —— 取值一律走这里，别直接 bookOf(x).title */
  const FALLBACK_C = ["#3a3a3c", "#8e8e93"];
  function bookName(id) { const b = bookOf(id); return b ? b.title : "未收录的书"; }
  function bookC(id, k) { const b = bookOf(id); return b ? (b[k] || FALLBACK_C[k === "c1" ? 0 : 1]) : FALLBACK_C[k === "c1" ? 0 : 1]; }

  const STORE_KEY = "readtrace.v1";

  /* ---------------------------------------------------------
     2b. Repository —— 存档读写的唯一收口
     ---------------------------------------------------------
     改造前：load() / save() 直接读写 `localStorage`，全应用只有这一处落点
     （这也是整个内部改造方案敢说"不重写"的地基）。
     改造后：应用层依旧只认识 load() / save()，实际读写落到 Repository：

       · 本地适配器（当前）：行为与改造前**逐字节一致**，8 套探针为证；
       · 远端适配器（接 CloudBase 时新增）：已登录则拉远端合并、写时标脏 +
         约 800ms 防抖上行、失败进队列重试 —— 应用层**不需要改任何一行**。

     同步状态留给「我的」页账号区显示（S7）：
       'local'   未登录 / 未接云，纯本机数据
       'syncing' 正在上行
       'pending' 有 N 条待上行（可在账号区点一下手动重试）
     远端未接时恒为 'local'，队列恒空。 */
  /* 2a. 封面仓库（IndexedDB）—— 只把「封面」这一项搬出 localStorage。
     封面是 base64（512px/q0.78，实测 26,004 字符/张），也是唯一会把本地存档
     撑爆的东西：localStorage 实测上限 5,000,000 字符 = 192 张封面就写满，
     而 100 本带封面的书已吃掉 52% 配额（#89 压测）。
     IndexedDB 在同一台机器上实测配额 1,006 MB（≈200 倍），封面改存这里。

     ⚠️ 内存里的 state.books[i].cover 全程保留 —— 云端同步（toRemoteBook 内联
     封面）与详情页都读它。只有「写 localStorage」那一步把封面摘掉。
     ⚠️ 写顺序不能反：必须先确认封面已落 IndexedDB，再让 localStorage 瘦身。
     反过来的话，IndexedDB 写失败而 localStorage 已瘦身 —— 封面就真没了。
     ⚠️ IndexedDB 不可用（隐私模式 / 老内核）时整体退回旧行为：封面照旧内联进
     localStorage，一个字节都不动。降级路径必须始终可用。 */
  const CoverDB = (function () {
    const DB_NAME = "readtrace-covers";
    const OS = "covers";
    let dbp = null;
    let dead = false;

    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve, reject) {
        let req;
        try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
        req.onupgradeneeded = function () {
          const db = req.result;
          if (!db.objectStoreNames.contains(OS)) db.createObjectStore(OS);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error("coverdb")); };
        req.onblocked = function () { reject(new Error("coverdb-blocked")); };
      });
      dbp.catch(function () { dead = true; });
      return dbp;
    }

    /* 一批 {k, v} 一次事务写完；v 为 null 表示删。true = 事务已提交。 */
    function write(pairs) {
      if (dead || !pairs || !pairs.length) return Promise.resolve(false);
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          const t = db.transaction(OS, "readwrite");
          const st = t.objectStore(OS);
          pairs.forEach(function (p) {
            if (p.v == null) st.delete(p.k); else st.put(p.v, p.k);
          });
          t.oncomplete = function () { resolve(true); };
          t.onerror = function () { reject(t.error); };
          t.onabort = function () { reject(t.error); };
        });
      }).catch(function () { return false; });
    }

    /* 按 key 批量取，返回 { key: value }；库里没有的键不出现。 */
    function readAll(keys) {
      if (dead || !keys || !keys.length) return Promise.resolve({});
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          const out = {};
          const t = db.transaction(OS, "readonly");
          const st = t.objectStore(OS);
          keys.forEach(function (k) {
            const rq = st.get(k);
            rq.onsuccess = function () { if (rq.result != null) out[k] = rq.result; };
          });
          t.oncomplete = function () { resolve(out); };
          t.onerror = function () { reject(t.error); };
          t.onabort = function () { reject(t.error); };
        });
      }).catch(function () { return {}; });
    }

    function allKeys() {
      if (dead) return Promise.resolve([]);
      return open().then(function (db) {
        return new Promise(function (resolve) {
          const t = db.transaction(OS, "readonly");
          const rq = t.objectStore(OS).getAllKeys();
          rq.onsuccess = function () { resolve(rq.result || []); };
          t.onerror = function () { resolve([]); };
        });
      }).catch(function () { return []; });
    }

    return {
      write: write,
      readAll: readAll,
      allKeys: allKeys,
      available: function () { return !dead; }
    };
  })();

  /* 已确认落进 IndexedDB 的封面签名：id -> 签名。
     只有这里的 id 才允许从 localStorage 里摘掉 —— 这就是「先落盘再瘦身」的账本。
     签名只用来判「同一本书的封面换了没有」，不需要抗碰撞，取长度 + 首尾即可。 */
  const safeCoverSigs = new Map();
  function coverSig(s) {
    s = String(s == null ? "" : s);
    return s.length + "|" + s.slice(0, 24) + "|" + s.slice(-24);
  }

  /* 日记封面图的落盘键（#161）。用 "__hero" 前缀避开书目 id（b1、b2…），
     同占一个对象仓 —— 它与书封面的生命周期、迁移、瘦身规则完全一样，
     单独再开一个仓只会多一份要维护的开关（见 hydrateHero / pruneCovers）。 */
  const HERO_KEY = "__hero";

  /* 摘掉已安全落盘的封面，返回浅副本（其余条目原样引用，省内存也省 stringify）。
     没落盘的封面**保持内联** —— 宁可多占一点本地空间，也不能两处都没有。
     #161 起日记封面图（state.heroImg）走同一条规则，但多一档：
     **签名在账本上、图却不在内存里 = 用户刚点了「移除」**（见 removeHeroPhoto），
     这一档也一律摘掉 —— 否则上传那次异步落盘的收尾（比移除早发、晚到）会把
     图连同整份存档再写回去，把「移除」当场抹掉（#161 探针抓到的真缺陷）。 */
  function stripCovers(obj) {
    if (!obj || !CoverDB.available()) return obj;
    let dirty = false, out = obj;
    const hSig = safeCoverSigs.get(HERO_KEY);
    if (hSig !== undefined && (obj.heroImg == null || hSig === coverSig(obj.heroImg))) {
      out = {}; for (const k in obj) out[k] = obj[k];
      delete out.heroImg;
      dirty = true;
    }
    if (!Array.isArray(obj.books)) return out;
    const books = obj.books.map(function (b) {
      if (!b || !b.cover) return b;
      if (safeCoverSigs.get(b.id) !== coverSig(b.cover)) return b;
      dirty = true;
      const c = {};
      for (const k in b) { if (k !== "cover") c[k] = b[k]; }
      return c;
    });
    if (!dirty) return obj;
    if (out === obj) { out = {}; for (const k in obj) out[k] = obj[k]; }
    out.books = books;
    return out;
  }

  /* 把内存里「还没落盘 / 落盘后又被换掉」的封面写进 IndexedDB。
     落盘成功才登记签名，并顺手补写一次瘦身后的存档。 */
  function stashCovers() {
    if (!CoverDB.available()) return;
    const pairs = [];
    /* 日记封面图（#161）与书封面同一批写、同一本账（HERO_KEY 那格） */
    if (typeof state.heroImg === "string" && safeCoverSigs.get(HERO_KEY) !== coverSig(state.heroImg)) {
      pairs.push({ k: HERO_KEY, v: state.heroImg });
    }
    (state.books || []).forEach(function (b) {
      if (!b || !b.cover) return;
      if (safeCoverSigs.get(b.id) === coverSig(b.cover)) return;
      pairs.push({ k: b.id, v: b.cover });
    });
    if (!pairs.length) return;
    CoverDB.write(pairs).then(function (ok) {
      if (!ok) return;                       /* 没写成就先留着内联副本，下次再试 */
      pairs.forEach(function (p) { safeCoverSigs.set(p.k, coverSig(p.v)); });
      Repo.write(state);                     /* 到这里才允许真瘦身 */
    });
  }

  /* 老存档升级：封面还内联在 localStorage 里。先搬进 IndexedDB，搬成功了才瘦身。
     返回 true = 这次真的搬过东西（调用方据此重渲一次）。 */
  function migrateCovers() {
    if (!CoverDB.available()) return Promise.resolve(false);
    const inline = (state.books || []).filter(function (b) { return b && b.cover; });
    if (!inline.length) return Promise.resolve(false);
    const pairs = inline.map(function (b) { return { k: b.id, v: b.cover }; });
    return CoverDB.write(pairs).then(function (ok) {
      if (!ok) return false;                 /* 没搬成 → 保持原样，下次启动再试 */
      pairs.forEach(function (p) { safeCoverSigs.set(p.k, coverSig(p.v)); });
      Repo.write(state);
      return true;
    });
  }

  /* 启动补水：localStorage 里已经没有封面了，从 IndexedDB 读回内存。
     返回 true = 补到了（调用方据此重渲一次书架）。 */
  function hydrateCovers() {
    const want = [];
    (state.books || []).forEach(function (b) { if (b && !b.cover) want.push(b.id); });
    if (!want.length) return Promise.resolve(false);
    return CoverDB.readAll(want).then(function (map) {
      let hit = false;
      (state.books || []).forEach(function (b) {
        if (!b || b.cover || !map[b.id]) return;
        b.cover = map[b.id];
        safeCoverSigs.set(b.id, coverSig(b.cover));
        hit = true;
      });
      if (hit) {
        BOOKS.length = 0;
        Array.prototype.push.apply(BOOKS, state.books);
      }
      return hit;
    });
  }

  /* 日记封面图的补水（#161，与 hydrateCovers 同款）：存档里只留着 heroSig，
     图本体在 IndexedDB。**判据用签名，不用「内存里没图」** ——
     用户删过图时 heroSig 是 null（保存时摘掉了），那种情况绝不能去库里捞旧图回来。
     返回 true = 补到了（调用方据此重渲封面卡）。

     ⚠️ #174：**「签名为空」与「签名对不上」要分开**。
       · 对不上 = 库里的不是这一版 → 弃（宁可空着也不上错图）。
       · 为空但有图 = 这枚签名被抹过一道（用户报「每次更新日记封面就不见」时，
         它正是被上行那份 `hero: ""` 抹掉的），而**用户真删图是把库里这一行删掉**
         （removeHeroPhoto 与远端删除都写 null）→ 行还在就说明没人删过它，捡回来。
         捡回来还要把签名补回存档（save），并让这一份随下一轮同步回到云端。 */
  function hydrateHero() {
    if (!CoverDB.available()) return Promise.resolve(false);
    if (state.heroImg) return Promise.resolve(false);
    return CoverDB.readAll([HERO_KEY]).then(function (map) {
      const v = map[HERO_KEY];
      if (typeof v !== "string" || !v) return false;
      if (state.heroSig && coverSig(v) !== state.heroSig) return false;
      const adopt = !state.heroSig;
      state.heroImg = v;
      state.heroSig = coverSig(v);
      safeCoverSigs.set(HERO_KEY, coverSig(v));
      if (adopt) save();
      return true;
    });
  }

  /* IndexedDB 里那些已经没有对应书目的封面（书被删了）—— 启动时扫一次清掉，
     否则封面只进不出，库会一直涨。⚠️ HERO_KEY 不是书，一律豁免（#161）。 */
  function pruneCovers() {
    if (!CoverDB.available()) return Promise.resolve(false);
    return CoverDB.allKeys().then(function (keys) {
      if (!keys.length) return false;
      const alive = new Set();
      (state.books || []).forEach(function (b) { if (b) alive.add(b.id); });
      alive.add(HERO_KEY);
      const dead = keys.filter(function (k) { return !alive.has(k); });
      if (!dead.length) return false;
      return CoverDB.write(dead.map(function (k) { return { k: k, v: null }; }));
    });
  }

  const Repo = (function () {
    const QUEUE_KEY = "readtrace.queue";
    let status = "local";
    let queue = [];
    try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (e) { queue = []; }

    /* 读：现在是纯本地；接云后在这后面补"已登录则拉远端合并" */
    function read() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; }
    }
    /* 写：本地立即落盘（隐私模式下静默失败，保持改造前行为）；
       接云后在这后面补"标脏 + 防抖上行" */
    function write(obj) {
      try {
        /* 封面已落 IndexedDB 的（见 stripCovers）从这份里摘掉 —— 这就是本地
           容量从 5MB 涨到 1GB 的那一刀。还没落盘的封面保持内联，宁可多占一点
           也不能两处都没有；IndexedDB 不可用时 stripCovers 原样返回，即旧行为。 */
        const slim = stripCovers(obj);
        localStorage.setItem(STORE_KEY, JSON.stringify(slim));
        return true;
      } catch (e) { return false; }
    }
    function setQueue(items) {
      queue = items || [];
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) { /* 隐私模式 */ }
      status = queue.length ? "pending" : "local";
    }
    return {
      read: read,
      write: write,
      enqueue: function (item) { setQueue(queue.concat([item]).slice(-20)); },
      flush: function () { setQueue([]); },
      setStatus: function (s) { status = s; }
    };
  })();

  const state = load();

  /* #199 自愈（开机）：存档里可能还躺着「rid 撞车」留下的同 rid 双本 ——
     不在第一轮同步前拆开，它们就又互相覆盖一次。拆完立刻落盘。 */
  if (healBookRids()) Repo.write(state);

  /* 把存档里的书目灌进工作副本。BOOKS 是 const 数组 —— 就地替换内容，
     外面的引用（bookOf / renderShelf / 碑林…）全部照旧可用。 */
  if (Array.isArray(state.books) && state.books.length) {
    BOOKS.length = 0;
    Array.prototype.push.apply(BOOKS, state.books);
  }
  /* 书单同理（#57）。空数组时保持空 —— 书单页靠这个显示「还没有书单」的空态。 */
  if (Array.isArray(state.booklists) && state.booklists.length) {
    LISTS.length = 0;
    Array.prototype.push.apply(LISTS, state.booklists);
  }

  function load() {
    const saved = Repo.read() || {};
    const base = { notes: [], theme: "light", sound: false, haptic: true, miss: {}, letters: [] };
    let notes = Array.isArray(saved.notes) ? saved.notes.slice() : base.notes;
    let books = Array.isArray(saved.books) ? saved.books.slice() : [];

    /* 退役迁移（只跑一次）：把老存档里那批预置演示数据剔掉。
       用户 2026-09-22 要求书架与随笔清空、内容全部自己添 —— 但已经装在手机上的
       存档里还留着 12 本书和 44 条随笔，不在这里清掉，这次改动等于没做。
       用户自己加的书 / 写的随笔 id 都不在名单里，原样保留。 */
    let purged = false;
    if (saved.purgeVer !== PURGE_VER) {
      const nb = notes.length, nk = books.length;
      notes = notes.filter(n => !RETIRED_NOTE_IDS_SET[n.id]);
      books = books.filter(b => !RETIRED_BOOK_IDS_SET[b.id]);
      purged = (notes.length !== nb || books.length !== nk);
    }

    /* 书目精简迁移（只跑一次）：抹掉正文/页数/已读%/类别。这四个字段随阅读线
       下线，留着只会占存档体积、跟着云同步白推一遍。 */
    let slimmed = false;
    if (saved.slimVer !== SLIM_VER) {
      books.forEach(function (b) {
        if (!b) return;
        ["pages", "progress", "cat", "body"].forEach(function (k) {
          if (k in b) { delete b[k]; slimmed = true; }
        });
      });
    }

    const out = {
      notes: notes,
      purgeVer: PURGE_VER,
      /* 云端那批退役记录要推墓碑 —— 但 sigMap 在文件后段才声明（load() 跑在前面，
         直接引用会踩 TDZ），所以只在这里置位，真正的注入放到 loadSigs() 里做。
         ⚠️ 判据是 `purged`（老存档里**确实剔掉了**退役记录），不是「没跑过迁移」：
         全新安装（saved 为空）根本没有那批种子，若也置位，loadSigs 会凭空塞进
         44 条假签名 —— 后果有两个，都被探针抓过：
           ① sigMap 从空变非空，isFirstLogin() 判假 → 首登变成「先推后拉」，
              而首登必须先拉，否则空签名表会把本机内容当新增、静默盖掉云端；
           ② 白白往云端推 44 条墓碑，覆盖掉本机本来就该保留的推送。
         只有真的剔掉过东西（老版本装过、archive 里带着 b1–b12 / n1–n44）才需要清云端。 */
      needRetireTomb: purged,
      theme: saved.theme || base.theme,
      sound: typeof saved.sound === "boolean" ? saved.sound : base.sound,
      haptic: typeof saved.haptic === "boolean" ? saved.haptic : base.haptic,
      /* 日记封面图（#161）。图本身走 IndexedDB（同书封面），这里只存两样小东西：
         heroSig = 已落盘/已开云的那版图的签名（IndexedDB 里存 null 表示「用户删掉了」），
         heroAt  = 存档契约字段（verify_tlhero / verify_herocloud 断言它在；
                   逻辑上五处只写不读 —— LWW 开云比的是 prefsAt，不是它）。
         ⚠️ sig 与图**成对**：只有 heroSig 存在、图不在内存里，才代表「图在库里，等补水」。
         ⚠️⚠️ #174：**图真的内联在存档里时必须读回来**。IndexedDB 写失败 / 本地库不可用时
         stripCovers 会特意把图留在存档里当唯一副本（「宁可多占一点也不能两处都没有」），
         而这里以前没有 heroImg 这个键 —— 那份唯一的副本每次启动都被无声丢掉，用户看到
         的就是「每次更新，日记封面就不见」。书封面不会这样：它们的图在 books[] 里跟着读回来。
         （要图时才建这个键：探针与瘦身判据都认「存档里没有内联 heroImg」。） */
      heroSig: typeof saved.heroSig === "string" ? saved.heroSig : null,
      /* heroAt：五处只写不读（LWW 实际比的是 prefsAt），但它被 verify_tlhero /
         verify_herocloud 两支探针当「存档契约」断言 —— v1.94 删过后按护栏恢复，
         别再删；哪天真要删，先改那两支探针。 */
      heroAt: typeof saved.heroAt === "number" ? saved.heroAt : 0,
      /* 碑前的「想你了」与往来信件。老存档里没有这两项（那时互动页只有作者关注与点赞），
         必须给默认值 —— 否则第一次点「想你了」就会对 undefined 做加法。 */
      miss: saved.miss || base.miss,
      letters: Array.isArray(saved.letters) ? saved.letters : base.letters,
      /* 书目：老存档里没有这一项，回落到种子书 */
      books: books,
      /* 书目 id 的水位线。不存的话，删掉编号最大的那本再重启，新书会复用旧 id ——
         已删书目遗下的随笔就会挂到新书上。 */
      bookSeq: typeof saved.bookSeq === "number" ? saved.bookSeq : 0,
      /* 书单（#57）：老存档里没有这一项，回落空数组。 */
      booklists: Array.isArray(saved.booklists) ? saved.booklists.slice() : [],
      /* 书单 id 的水位线，理由同 bookSeq：删掉最大号那册再新建不能复用旧 id，
         否则别的设备上那条墓碑会把新书单一起抹掉。 */
      listSeq: typeof saved.listSeq === "number" ? saved.listSeq : 0,
      /* 精简迁移的版本水位线，理由同 purgeVer：跑过一次就别再跑。 */
      slimVer: SLIM_VER
    };
    /* #174：存档里真的内联着这份图（IndexedDB 没写成功 / 库不可用时 stripCovers 会
       特意留着它当唯一副本）→ 读回内存。键是**有图才建**：常年那份存档里
       「没有内联 heroImg」是探针与瘦身判据都认的事实。 */
    if (typeof saved.heroImg === "string" && saved.heroImg) out.heroImg = saved.heroImg;
    if (purged || slimmed) Repo.write(out);   /* 清完立刻落盘，否则每次加载都要再清一遍 */
    return out;
  }
  function save() {
    /* 返回值要传出去：自己传的封面（base64）会把存档撑大，配额满时
       Repo.write 会静默返回 false —— 上层得能据此回滚，不能当成功。 */
    const ok = Repo.write(state);
    /* 新出现 / 换过的封面落进 IndexedDB；落盘成功后它会自己补写一次瘦身存档。
       放在 Repo.write 之后是有意的：这一步只是「补搬」，而 localStorage 已经
       按现有账本瘦身过一次了，顺序反了也不会丢（见 stripCovers 的注释）。 */
    stashCovers();
    /* 未登录时这一行什么都不做 —— 网页版 / 单文件版行为与改造前逐字节一致。
       登录后：本地已即时落盘，这里只排一次约 800ms 的防抖上行。 */
    if (Cloud.signedIn()) scheduleSync();
    return ok;
  }

  let toastTimer = null;
  function toast(msg) {
    const el = byId("toast");
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-on"), 1900);
  }

  /* ---------------------------------------------------------
     3a. 自己传的封面：裁剪 → 压缩 → 取色
     ---------------------------------------------------------
     #92 起选完图先过一道裁剪台：裁成 3:4（书封比例）再存。
     为什么必须裁：书架上一律写书名（封面图不上架，见 renderShelf），
     封面只在点开书后的详情那一张上出现，而详情位就是 108×147（≈3:4）——
     不裁的话横图会被压成细条、长图会被切头去尾，比例全靠运气。

     图也不能原样存。书目要跟着账号上云（rt_books，一条一本），图作为 base64 内嵌；
     本机那份还落在 IndexedDB（#90 起，约 1 GB，但仍是按张算的）。两头都吃体积，
     所以裁完统一压到 384×512、JPEG q0.78（实测一本 40–70 KB）再谈存储。
     384×512 的依据：详情页显示 108×147 CSS px，2x 屏要 216×294，384×512 有富余。

     取色顺带做了：缩到 8×8 取平均 → c1，提亮一档 → c2。
     留着 c1/c2 是因为别处都认这一对色（书脊、书封底、碑林的碑面），
     有图之后它们不能变成 undefined —— 书脊现在不贴图，但它的配色仍来自这里。 */
  const COVER_W = 384, COVER_H = 512;
  /* 头像输出边长（1:1）。128（#122）→ 192（#138）→ 256（#140）→ **1280（#141）**：
     前三版都在「云端 20000 字符拒收线」底下讨生活，点开大图顶多 256px 源，用户看着
     还是又小又糊。#141 用户拍板「不压缩，体积大没事」→ 上限整段放开：
     1280 ≈ 主流 3x 屏的满屏宽度（360-426dp），大图全宽显示时约 1:1 物理像素；
     源图（裁剪台面）本身不足 1280 时按源出（cropResult 里取 min，不放大 —— 没有的细节拉不出来）。
     另有一道保险：cropResult 里超 AVA_MAX_CHARS 会自动降质重编，极端图也撞不到云端线。 */
  const AVA_OUT = 1280;
  const AVA_MAX_CHARS = 380000;             /* 头像 dataURL 的自留上限（服务端 400000，留 5% 缓冲） */
  const COVER_RATIO = COVER_W / COVER_H;    /* 3:4 —— 裁剪框与输出同源，不会打架 */
  /* 日记封面卡（#161 → 本轮补裁剪）：卡片是 212px 高的横长条（宽随屏，≈1.63:1），
     裁的时候就得按这个比例 —— 竖图不裁直接铺满，等于把上下两头切掉看不见。
     卡片必须真实量（宽 = 屏宽 − 40px 页边距，见 .page / .tl-hero），量不到再回落这个值。 */
  const CARD_RATIO_FALLBACK = 1.66;
  const COVER_Q = 0.78;
  const PRE_MAX = 2048;                     /* 裁剪台面上的图：#141 起 2048 —— 头像要出 1280，
                                               台面 1024 会让 1280 沦为 1.25 倍放大；封面裁局部同样受益 */

  function hexOf(r, g, b) {
    return "#" + [r, g, b].map(v => ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2)).join("");
  }

  /* 读文件 → 缩到 PRE_MAX。缩的是「台面用的这份」，不是存档那份：
     台面 2048 长边，裁出 3:4 约 1536×2048，再降到 384×512 是降采样，画质只有赚。 */
  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error("没有选到图片")); return; }
      if (!/^image\//.test(file.type || "")) { reject(new Error("请选一张图片")); return; }
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("这张图读不出来"));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("这张图打不开"));
        img.onload = () => {
          const scale = Math.min(1, PRE_MAX / Math.max(img.width, img.height));
          if (scale >= 1) { resolve(img); return; }
          try {
            const cv = document.createElement("canvas");
            cv.width = Math.max(1, Math.round(img.width * scale));
            cv.height = Math.max(1, Math.round(img.height * scale));
            cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
            const small = new Image();
            /* 缩小失败不拦人：拿原图接着裁，最坏是台面上转得慢一点 */
            small.onload = () => resolve(small);
            small.onerror = () => resolve(img);
            small.src = cv.toDataURL("image/jpeg", 0.92);
          } catch (e) { resolve(img); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* 裁好的 3:4 图取主色 —— c1/c2 是书脊 / 书封底 / 碑面那套配色的来源。
     8×8 求平均比扫全图快得多，观感无差。 */
  function coverTone(dataUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.onerror = () => resolve({ dataUrl: dataUrl, c1: "#7a5c3e", c2: "#c39a6b" });
      img.onload = () => {
        try {
          const mc = document.createElement("canvas");
          mc.width = 8; mc.height = 8;
          const mx = mc.getContext("2d");
          mx.drawImage(img, 0, 0, 8, 8);
          const d = mx.getImageData(0, 0, 8, 8).data;
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
          const n = d.length / 4;
          resolve({
            dataUrl: dataUrl,
            c1: hexOf(r / n, g / n, b / n),
            c2: hexOf(r / n * 1.34 + 28, g / n * 1.34 + 28, b / n * 1.34 + 28)
          });
        } catch (e) {
          resolve({ dataUrl: dataUrl, c1: "#7a5c3e", c2: "#c39a6b" });
        }
      };
      img.src = dataUrl;
    });
  }

  function takeCover(file) {
    return loadImageFile(file)
      .then(img => openCoverCropper(img))
      .then(url => coverTone(url));
  }

  /* ---------------------------------------------------------
     3a-2. 封面裁剪台
     ---------------------------------------------------------
     一张全屏台面 + 一个居中 3:4 的框；**动的是图片，不是框**（iOS 照片裁剪同款手感）。
     图片以「cover 铺满框」为基准再乘用户缩放，位移夹在「恰好盖住框」的范围内 ——
     所以框里永远不会露出台面的黑底，也就不需要额外的空白兜底。

     ⚠️ 布局必须在 is-open 之后量：display:none 时 stage 的 clientWidth 是 0，
        早一帧算出来的框会是 0×0，第一眼看到的是个空台面。
     ⚠️ 手势用 Pointer Events 一套（单指拖 / 双指捏）；stage 必须 touch-action:none，
        否则竖向拖图会被判成整页滚动。低端 WebView 没有 PointerEvent 时走 touch 兜底。 */
  let cropDone = null;                       /* 打开期间挂着的 Promise 收口 */
  const crop = { img: null, bs: 1, s: 1, x: 0, y: 0, fw: 0, fh: 0, fx: 0, fy: 0 };
  let cropCfg = null;                        /* 当前模式：{ ratio, title, sub }（见 openCoverCropper） */
  let cropMode = null;                       /* null = 封面(3:4) / "avatar" = 头像(1:1) / "card" = 封面卡 */
  const cropPtrs = new Map();                /* pointerId -> {x,y}（client 坐标） */
  let cropDrag = null;                       /* 单指：{x,y,ox,oy} */
  let cropPinch = null;                      /* 双指：{d,s,cx,cy} */

  /* 卡片裁剪框的比例 = 卡片真身量出来的（宽随屏，量不到再回落）。 */
  function heroCardRatio() {
    const h = byId("tlHero");
    if (h && h.clientWidth > 40 && h.clientHeight > 40) {
      return h.clientWidth / h.clientHeight;
    }
    return CARD_RATIO_FALLBACK;
  }

  function cropImgSize() {
    const n = crop.img;
    return { w: n.naturalWidth || n.width || 1, h: n.naturalHeight || n.height || 1 };
  }

  function openCoverCropper(img, mode, ratio) {
    return new Promise((resolve, reject) => {
      crop.img = img; crop.s = 1;
      /* mode：null = 封面（3:4 → 384×512），"avatar" = 头像（1:1 → AVA_OUT 见上），
         "card" = 日记封面卡（比例随卡片实测，输出长边 HERO_MAX）。
         同一个裁剪台三种裁法：框比例、输出尺寸与文案随模式切（#124 头像上传，本轮 #162 封面卡）。 */
      const pres = {
        avatar: { ratio: 1, title: "编辑头像",
                  sub: "拖动挪位置 · 双指或拉杆缩放 · 框内这块就是你的头像（正方形）" },
        card:   { ratio: ratio || heroCardRatio(), title: "裁剪封面图",
                  sub: "拖动挪位置 · 双指或拉杆缩放 · 框内这块铺在卡片上" },
        cover:  { ratio: COVER_RATIO, title: "裁剪封面",
                  sub: "拖动挪位置 · 双指或拉杆缩放 · 只保留框内这一块（3:4）" }
      };
      cropCfg = pres[mode === "avatar" ? "avatar" : mode === "card" ? "card" : "cover"];
      cropMode = cropCfg === pres.cover ? null : mode;   /* 输出尺寸分支还得认它 */
      cropDone = { resolve: resolve, reject: reject };
      byId("crTitle").textContent = cropCfg.title;
      byId("crSub").textContent = cropCfg.sub;
      byId("crImgEl").src = img.src;
      byId("cropper").classList.add("is-open");
      byId("cropper").setAttribute("aria-hidden", "false");
      /* is-open 之后同步量一次（clientWidth 强制排版，尺寸立刻可用）；
         rAF 里再量一次兜转屏/键盘导致的尺寸变化。纯 rAF 在 virtual-time
         探针下不推进，框会是 0×0（§5.3）。 */
      layoutCrop();
      requestAnimationFrame(layoutCrop);
    });
  }

  function layoutCrop() {
    const stage = byId("crStage"), frame = byId("crFrame");
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if (!sw || !sh) return;
    /* 框：两个方向都留 32px 呼吸，取能放下的最大目标比例（封面 3:4 / 头像 1:1 / 封面卡随卡片） */
    const ratio = cropCfg.ratio;
    crop.fh = Math.round(Math.min(sh - 32, (sw - 32) / ratio));
    crop.fw = Math.round(crop.fh * ratio);
    crop.fx = Math.round((sw - crop.fw) / 2);
    crop.fy = Math.round((sh - crop.fh) / 2);
    frame.style.left = crop.fx + "px";
    frame.style.top = crop.fy + "px";
    frame.style.width = crop.fw + "px";
    frame.style.height = crop.fh + "px";
    /* 基准缩放 = 让图「cover」铺满框；用户缩放 1→4 倍，越放大裁得越局部 */
    const sz = cropImgSize();
    crop.bs = Math.max(crop.fw / sz.w, crop.fh / sz.h);
    crop.s = 1;
    crop.x = crop.fx + (crop.fw - sz.w * crop.bs) / 2;
    crop.y = crop.fy + (crop.fh - sz.h * crop.bs) / 2;
    byId("crZoom").value = 100;
    applyCrop();
  }

  /* 位移夹取：图片的框必须完整盖住裁剪框（允许刚好贴边，不允许漏空） */
  function clampCrop() {
    const sz = cropImgSize();
    const dw = sz.w * crop.bs * crop.s, dh = sz.h * crop.bs * crop.s;
    crop.x = Math.min(crop.fx, Math.max(crop.fx + crop.fw - dw, crop.x));
    crop.y = Math.min(crop.fy, Math.max(crop.fy + crop.fh - dh, crop.y));
  }

  function applyCrop() {
    clampCrop();
    byId("crImg").style.transform =
      "translate(" + crop.x + "px," + crop.y + "px) scale(" + (crop.bs * crop.s) + ")";
  }

  /* 以 (cx,cy)（client 坐标）为不动点缩放：该点压在图上哪一处，缩放后还在那一处 */
  function cropZoomTo(ns, cx, cy) {
    const r = byId("crStage").getBoundingClientRect();
    const ax = cx - r.left, ay = cy - r.top;
    const k0 = crop.bs * crop.s, k1 = crop.bs * ns;
    crop.x = ax - (ax - crop.x) * (k1 / k0);
    crop.y = ay - (ay - crop.y) * (k1 / k0);
    crop.s = ns;
    applyCrop();
  }

  function cropBoxCenterClient() {
    const r = byId("crStage").getBoundingClientRect();
    return { x: r.left + crop.fx + crop.fw / 2, y: r.top + crop.fy + crop.fh / 2 };
  }

  function cropResult() {
    const sz = cropImgSize();
    const k = crop.bs * crop.s;
    let sx = (crop.fx - crop.x) / k, sy = (crop.fy - crop.y) / k;
    let sw = crop.fw / k, sh = crop.fh / k;
    /* 浮点与夹取的零头：源矩形收回图内，宁可少裁一两个像素也不要 drawImage 出黑边 */
    sx = Math.max(0, Math.min(sz.w - 1, sx));
    sy = Math.max(0, Math.min(sz.h - 1, sy));
    sw = Math.min(sz.w - sx, sw);
    sh = Math.min(sz.h - sy, sh);
    if (sw < 2 || sh < 2) return "";
    const cv = document.createElement("canvas");
    /* 输出尺寸随模式：封面 384×512 / 头像目标 AVA_OUT（#141 起 1280）/ 封面卡长边
       HERO_MAX（#161 的压缩口径，换成裁剪后也不再要二次缩放）—— 但源区域
       （裁剪框那块在台面图上的像素）不足时就按源出，不放大：台面只有 800px 细节，
       硬画成 1600 是无中生有的糊。 */
    let ow = COVER_W, oh = COVER_H;
    if (cropMode === "avatar") {
      ow = oh = Math.min(AVA_OUT, Math.max(Math.round(sw), Math.round(sh)));
    } else if (cropMode === "card") {
      const k2 = Math.min(1, HERO_MAX / Math.max(sw, sh));
      ow = Math.round(sw * k2); oh = Math.round(sh * k2);
    }
    cv.width = ow; cv.height = oh;
    const cx = cv.getContext("2d");
    if (cx.imageSmoothingQuality) cx.imageSmoothingQuality = "high";
    cx.drawImage(crop.img, sx, sy, sw, sh, 0, 0, ow, oh);
    let url = cv.toDataURL("image/jpeg", cropMode === "card" ? HERO_Q : COVER_Q);
    /* 头像还要上云，服务端对超 400000 字符是**拒收**（不是截断，#141 起 1280px 源）——
       这里只兜极端图：逐档降质重编，宁可略糊也不让用户撞「头像图片太大」。
       封面与封面卡不进这道。 */
    if (cropMode === "avatar") {
      let q = COVER_Q;
      while (url.length > AVA_MAX_CHARS && q > 0.5) {
        q = Math.round((q - 0.06) * 100) / 100;
        url = cv.toDataURL("image/jpeg", q);
      }
    }
    return url;
  }

  function closeCoverCropper(url) {
    byId("cropper").classList.remove("is-open");
    byId("cropper").setAttribute("aria-hidden", "true");
    byId("crStage").classList.remove("is-moving");
    cropPtrs.clear(); cropDrag = null; cropPinch = null;
    const d = cropDone; cropDone = null;
    if (!d) return;
    /* 取消 = reject：调用方据此不弹"处理不了"的提示（那是给真失败用的） */
    if (url) d.resolve(url); else d.reject(new Error("已取消"));
  }

  (function bindCropper() {
    const stage = byId("crStage");
    const ptrDist = (a, b) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));

    function down(id, x, y) {
      cropPtrs.set(id, { x: x, y: y });
      stage.classList.add("is-moving");
      if (cropPtrs.size === 1) {
        cropDrag = { x: x, y: y, ox: crop.x, oy: crop.y };
      } else if (cropPtrs.size === 2) {
        cropDrag = null;
        const p = Array.from(cropPtrs.values());
        cropPinch = {
          d: ptrDist(p[0], p[1]), s: crop.s,
          cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2
        };
      }
    }
    function move(id, x, y) {
      if (!cropPtrs.has(id)) return;
      cropPtrs.set(id, { x: x, y: y });
      if (cropPtrs.size >= 2 && cropPinch) {
        const p = Array.from(cropPtrs.values());
        const d = ptrDist(p[0], p[1]);
        if (d > 0 && cropPinch.d > 0) {
          const ns = Math.max(1, Math.min(4, cropPinch.s * d / cropPinch.d));
          cropZoomTo(ns, cropPinch.cx, cropPinch.cy);
          byId("crZoom").value = Math.round(ns * 100);
        }
        return;
      }
      if (cropDrag) {
        crop.x = cropDrag.ox + (x - cropDrag.x);
        crop.y = cropDrag.oy + (y - cropDrag.y);
        applyCrop();
      }
    }
    function up(id) {
      cropPtrs.delete(id);
      if (cropPtrs.size < 2) cropPinch = null;
      if (cropPtrs.size === 1) {
        const p = Array.from(cropPtrs.values())[0];
        cropDrag = { x: p.x, y: p.y, ox: crop.x, oy: crop.y };
      } else if (!cropPtrs.size) {
        cropDrag = null;
        stage.classList.remove("is-moving");
      }
    }

    if (window.PointerEvent) {
      stage.addEventListener("pointerdown", e => {
        if (!byId("cropper").classList.contains("is-open")) return;
        if (stage.setPointerCapture) { try { stage.setPointerCapture(e.pointerId); } catch (err) {} }
        down(e.pointerId, e.clientX, e.clientY);
      });
      stage.addEventListener("pointermove", e => move(e.pointerId, e.clientX, e.clientY));
      ["pointerup", "pointercancel", "pointerleave"].forEach(t =>
        stage.addEventListener(t, e => up(e.pointerId)));
    } else {
      /* 没有 PointerEvent 的老内核：touch 走 identifier，鼠标走单指 */
      stage.addEventListener("touchstart", e => {
        Array.from(e.changedTouches).forEach(t => down(t.identifier, t.clientX, t.clientY));
      }, { passive: true });
      stage.addEventListener("touchmove", e => {
        if (e.cancelable) e.preventDefault();
        Array.from(e.touches).forEach(t => {
          if (cropPtrs.has(t.identifier)) move(t.identifier, t.clientX, t.clientY);
        });
      });
      ["touchend", "touchcancel"].forEach(t => stage.addEventListener(t, e => {
        Array.from(e.changedTouches).forEach(ch => up(ch.identifier));
      }));
      stage.addEventListener("mousedown", e => down("m", e.clientX, e.clientY));
      window.addEventListener("mousemove", e => move("m", e.clientX, e.clientY));
      window.addEventListener("mouseup", () => up("m"));
    }

    byId("crZoom").addEventListener("input", function () {
      const c = cropBoxCenterClient();
      cropZoomTo(Number(this.value) / 100, c.x, c.y);
    });
    byId("crCancel").addEventListener("click", () => closeCoverCropper(null));
    byId("crOk").addEventListener("click", () => {
      const url = cropResult();
      if (!url) { toast("裁不出来，换一张图试试"); return; }
      closeCoverCropper(url);
    });
    /* 转屏 / 键盘弹出导致台面尺寸变了：重新排一次框。
       缩放与位移一并重置 —— 保住相对位置要按新旧尺寸换算，收益不抵复杂度。 */
    window.addEventListener("resize", () => {
      if (byId("cropper").classList.contains("is-open")) requestAnimationFrame(layoutCrop);
    });
  })();

  function coverHTML(b) {
    /* 自己传了封面就显示图，并且**不叠书名** —— 图片上压白字多半看不清，
       而书名在封面下方本来就有独立一行（.book-name）。
       没传图的还是原来那款按色渐变的封面。 */
    if (b.cover) {
      return '<div class="cover-art is-img">' +
        '<img src="' + b.cover + '" alt="" draggable="false">' +
        '<span class="cover-tag">' + STATUS[b.status] + '</span>' +
        '</div>';
    }
    return '<div class="cover-art" style="background:linear-gradient(150deg,' + b.c1 + ',' + b.c2 + ');color:#fff">' +
      '<div class="cover-spine"></div>' +
      '<div class="cover-line"></div>' +
      '<div><div class="cover-title">' + esc(b.title) + '</div>' +
      '<div class="cover-author">' + esc(b.author || "") + '</div></div>' +
      '<span class="cover-tag">' + STATUS[b.status] + '</span>' +
      '</div>';
  }

  /* ---------------------------------------------------------
     3. 书架
     --------------------------------------------------------- */
  /* #117：底部滑动条 —— 书架是一整面墙（柜宽 ≈ 2.6 屏），拖它左右平移看墙的两头。
     双向绑定：拖 thumb → 柜横移；柜横移 → thumb 跟随。thumb 宽度按可见比例算。
     renderShelf 在 setup 之前跑第一遍，所以先用 no-op 占位。 */
  let syncShelfSlider = function () {};
  function setupShelfSlider() {
    const sc = byId("shelfScroll"), track = byId("shelfSliderTrack"),
          thumb = byId("shelfThumb"), slider = byId("shelfSlider");
    if (!sc || !track || !thumb || !slider) return;
    const thumbW = function () {
      return Math.max(56, track.clientWidth * sc.clientWidth / Math.max(1, sc.scrollWidth));
    };
    const sync = function () {
      const max = sc.scrollWidth - sc.clientWidth;
      const can = max > 4;
      slider.hidden = !can;
      if (!can) return;
      const tw = thumbW();
      thumb.style.width = tw + "px";
      const x = (sc.scrollLeft / max) * (track.clientWidth - tw);
      thumb.style.transform = "translateX(" + x + "px)";
    };
    syncShelfSlider = sync;
    sc.addEventListener("scroll", sync, { passive: true });
    /* #200：墙面横移了，长按亮出的玻璃「删除」锚着的还是旧位置 —— 立刻收起。 */
    sc.addEventListener("scroll", () => { if (armedSpineId) disarmSpine(); }, { passive: true });
    window.addEventListener("resize", () => { sizeCabinet(shelfRowsN); sync(); });
    let dragging = false;
    const setFromPointer = function (clientX) {
      const max = sc.scrollWidth - sc.clientWidth;
      if (max <= 0) return;
      const r = track.getBoundingClientRect();
      const tw = thumb.getBoundingClientRect().width || thumbW();
      let x = clientX - r.left - tw / 2;
      x = Math.max(0, Math.min(track.clientWidth - tw, x));
      thumb.style.transform = "translateX(" + x + "px)";
      sc.scrollLeft = (x / (track.clientWidth - tw)) * max;
    };
    track.addEventListener("pointerdown", function (e) {
      dragging = true;
      try { track.setPointerCapture(e.pointerId); } catch (err) {}
      setFromPointer(e.clientX);
    });
    track.addEventListener("pointermove", function (e) { if (dragging) setFromPointer(e.clientX); });
    track.addEventListener("pointerup", function () { dragging = false; });
    track.addEventListener("pointercancel", function () { dragging = false; });
    requestAnimationFrame(sync);
  }

  /* ---- 分层（#201 抽成共用）----
     书脊宽/高/斜靠/书口/封面朝外全部由书 id 哈希稳定决定（strHash，签名表同款），
     刷新、重排、换筛选都不会变脸。按累计宽度分到每层，放满一层自动换层。
     #79 二段：照 shelf.stories 的摆法，约 1/9 的书**宽面朝外**平铺展示
     （h%9===3；视频 107 本里 5-6 本朝外 ≈1/18，手机柜窄取 1/9 折中），
     比书脊宽三四倍 —— 视频里 Stephen King / Silverview 那种。
     #92 起朝外那面写的是横排书名 + 作者，不再是封面图。
     #117：行宽按加宽后的柜体算（柜 = 260% 屏宽，窄屏兜底 980px；
     940 ≈ 980 - 柜 padding - 行 padding），一层能摆下视频里那密密一排。 */
  const ROW_W = 940;
  function dims(b) {
    const h = parseInt(strHash("s" + b.id), 16) || 7;
    const fout = h % 9 === 3;
    return { h, fout, w: fout ? 60 + h % 22 : 22 + h % 14 };
  }
  /* 分层规则（#167）：先摆「钉住层」的书（`b.shelf` = 1..N），再让「自动」的书
     按空隙顺序填 —— 光标只向前走，所以**一本都不钉时结果与老的「累计宽度入层」
     逐字一致**（观感不变），钉住的书则老老实实落在指定那一层。
     ROW_W 是软上限：钉住的书超了就地溢出到下一层，不把它挪走（钉住优先于排满）。
     行数恒 ≥ 5（五层空柜是既有观感），装不下的书往后追加新层 ——
     这就是「书架满了自动往下再加一个书架」（#201）的排序那一半；
     看得见的那一半在 sizeCabinet()：柜体撑到实际高度、柜内纵向可滚。
     pinFn：长按拖动的落点预告要用「假设这本书钉到第 R 层」来算（#201），
     渲染走默认的 b.shelf，两边**必须**是同一个函数，亮哪儿落哪儿。 */
  function computeShelfRows(list, pinFn) {
    if (!pinFn) pinFn = b => Math.round(Number(b.shelf) || 0);
    let maxPin = 5;
    list.forEach(b => { const k = pinFn(b); if (k >= 1 && k > maxPin) maxPin = Math.min(k, 60); });
    const rows = [], rowW = [];
    for (let i = 0; i < maxPin; i++) { rows.push([]); rowW.push(0); }
    const autos = [];
    list.forEach(b => {
      const k = pinFn(b);
      if (k >= 1 && k <= rows.length) { rows[k - 1].push(b); rowW[k - 1] += dims(b).w; }
      else autos.push(b);
    });
    let cur = 0;
    autos.forEach(b => {
      const d = dims(b);
      while (cur < rows.length && rows[cur].length && rowW[cur] + d.w > ROW_W) cur++;
      if (cur >= rows.length) { rows.push([]); rowW.push(0); }
      rows[cur].push(b); rowW[cur] += d.w;
    });
    return rows;
  }
  /* #201：层数 > 5 时把柜体撑到实际高度 —— 「书架满了自动往下再加一个书架」
     看得见的那一半（原先柜高锁死 100%、行 flex:1，第六层起全被挤成一条缝）。
     ≤5 层维持原样：高度 100%、五层均分、不上下滚。
     层高与五层均分同一条账：边框 14 + 上内边距 10 + 五条层板 14 —— rowH 就取
     「五层均分时每层的高」，新层与老层一样高，柜子只是变长，不换比例。 */
  function sizeCabinet(n) {
    const sc = byId("shelfScroll"), cab = byId("shelfGrid");
    if (!sc || !cab) return;
    if (n <= 5) { cab.style.height = ""; return; }
    const H = sc.clientHeight;
    if (H < 120) return;                      /* 切页动画中量不到高：下一轮重画再撑 */
    const rowH = Math.max(88, (H - 14 - 10 - 5 * 14) / 5);
    cab.style.height = Math.round(14 + 10 + n * (14 + rowH)) + "px";
  }
  let shelfRowsN = 5;                          /* 当前层数：resize 时 sizeCabinet 要用 */

  /* #206：书架页头的状态筛选（全部 / 在读 / 已读）。两条老规矩都没动 ——
     ① 书架摆的仍是全部「实体书」（在读 + 已读），想读的不上架（`status !== "wish"`）；
     ② 这一格只在实体书里再切一刀，**不进存档**：切页 / 重画 / 重启都回到「全部」
        （书架是唯一视图，筛一下只是"看一眼某个状态的书"，不构成下次打开时的默认）。
     渲染、拖动落点预告、落库三处共用 shelfBooks() —— 三边必须是**同一个列表**，
     否则落点预告会亮在没有书的那一层上（#201「亮哪儿落哪儿」那条口径）。 */
  let shelfFilter = "all";
  function shelfBooks() {
    const on = BOOKS.filter(b => b.status !== "wish");
    return shelfFilter === "all" ? on : on.filter(b => b.status === shelfFilter);
  }

  function renderShelf() {
    /* 重画即收起（#200）：书脊整批重建，旧那枚玻璃「删除」锚着的书已经不在了 ——
       同 renderLists 的 #178 口径，先收再画。 */
    if (dragSp) endSpineDrag(false);   /* #201 拖动中重画（云端合并等）：书回原位，别拿旧坐标落库 */
    disarmSpine();
    const grid = byId("shelfGrid");
    /* #78 木书架：柜里摆的是「实体书」——在读 + 已读；想读的不上架
       （点开想读的书开始读，它就自动摆上来了）。
       #94 曾把页头那颗「已读」筛选整条撤掉（用户：「不需要已读，只需要书架」），
       #206 用户点名要回来 —— 状态筛选这一格回来了（全部 / 在读 / 已读），
       但「摆什么」这条规则没变：list 永远是 shelfBooks()，不是另一种排序、
       也不是另一批书。 */
    const list = shelfBooks();
    /* #116：空态只留书架本身 —— 不再有「书架还是空的」指引文案（用户：把书去掉，
       只留下书架）。柜子永远摆满层：书按累计宽度入层，不足五层就补空层
       （视频里的柜子是五层；想读的书仍不上架，点开它开始读就摆上来）。 */
    /* #201：分层交给 computeShelfRows() —— 渲染与拖动落点预告共用同一个函数。 */
    const rows = computeShelfRows(list);

    function spineHTML(b, i) {
      const d = dims(b);
      /* #92：书脊上写的是**书名**，不是封面图 —— 封面留给点开书籍后的详情那一张。
         自传的封面并没有白传：它取出来的主色 c1/c2 就是这一格的颜色，
         所以「自己传过封面的书」在架子上仍然认得出来。 */
      let cls = "spine", style = "width:" + d.w + "px;";   /* #117：高度交给 CSS 层高 */
      if (d.fout) {
        /* 封面朝外的平铺书：宽 = 高 × 0.72（≈3:4.1 封面比例），横排书名 + 作者 */
        cls += " faceout";
        style += "background:linear-gradient(160deg," + shadeHex(b.c1, 14) + "," + b.c1 + " 38%," + b.c2 + " 100%)";
      } else {
        style += "background:linear-gradient(90deg," + shadeHex(b.c1, -18) + "," + b.c1 + " 22%," + b.c2 + " 96%)";
        if (d.w >= 39) cls += " pages";             /* 厚书右缘露书口纸页 */
        if (i > 0 && d.h % 4 === 0) cls += " lean"; /* 斜靠在左邻身上（行首不斜，悬空难看） */
      }
      /* .t 一律输出（faceout 用 CSS 藏掉）：探针按 .t 的文本找书，DOM 结构不因摆法变 */
      return '<div class="' + cls + '" data-book="' + b.id + '" style="' + style + '">' +
        '<span class="t">' + esc(b.title) + '</span>' +
        (d.fout
          ? '<span class="ft">' + esc(b.title) + '</span><span class="fa">' + esc(b.author || "") + '</span>'
          : (d.w >= 39 ? '<span class="pgs"></span>' : '')) +
      '</div>';
    }

    grid.innerHTML = rows.map((row, ri) =>
      '<div class="cab-row">' + row.map(spineHTML).join("") + '</div>' +
      '<div class="cab-plank"><span class="cab-tag">Shelf ' + ("0" + (ri + 1)).slice(-2) + ' · ' + row.length + ' 本</span></div>'
    ).join("");
    shelfRowsN = rows.length;
    sizeCabinet(rows.length);   /* #201：层数变了柜体跟着长高（≤5 层回原样） */
    syncShelfSlider();       /* #116：书量变化 → 柜高变化 → 滑动条重新定位 */

    const reading = BOOKS.filter(b => b.status === "reading").length;
    const done = BOOKS.filter(b => b.status === "done").length;
    /* #206：页头计数 = **当前视图摆着几本**。三格因此自洽：全部 = 在读 + 已读
       （想读的不上架，本来就不该算进来）。原先这里写的是 BOOKS.length（含想读），
       单独看没毛病，可三格筛子一出来，「全部 4 / 在读 2 / 已读 1」当场对不上账 ——
       顺手把口径收成「这一格有几本」。整座书目的状态分布仍由下面那行副标题回答。 */
    byId("shelfCount").textContent = list.length;
    /* 副标题恒报全局账（含想读，那是「书目」的口径），不随筛选变 —— 它就是
       「整座书目什么状态」那一行，"这一格有几本"由上面的计数牌回答。 */
    byId("shelfSub").textContent = BOOKS.length
      ? reading + " 本在读 · 已读完 " + done + " 本"
      : "还没有书 · 都靠你自己添加";

    /* #206：筛到空给一句说明。「全部」为空照 #116 只留空柜、一句文案都不加；
       筛选中为空必须说明白，否则看着像书架坏了（空柜五层照摆，#116 的观感不变）。 */
    const none = byId("shelfNone");
    if (none) {
      none.hidden = !(shelfFilter !== "all" && !list.length);
      none.textContent = shelfFilter === "done" ? "还没有已读的书" : "还没有在读的书";
    }

    $$(".spine", grid).forEach(sp => {
      bindSpineLongPress(sp);
      sp.addEventListener("click", () => {
        /* 长按弹出来的那一下别顺手开详情（同 #178/#141 那套） */
        if (spineLpFired) { spineLpFired = false; return; }
        /* 删除按钮已经亮着：点这本书自己 = 先收起来，别把人丢进详情 */
        if (armedSpineId) { disarmSpine(); return; }
        openBookSheet(sp.dataset.book);
      });
    });
  }

  /* ---- 长按书脊 → 书上方浮一枚玻璃「删除」（#200，照 #178 书单同款手势，2026-10-11 定） ----
     同一套口径：按住 450ms 才算数、动了 >10px 算拖不算按、弹过之后那一下 click 吞掉、
     同一时刻只亮一本书、震动 8ms。收起入口五处：点这本书自己 / 点别处（捕获监听）/
     墙面横移（锚点已失效）/ 重画（renderShelf）/ 返回键（closeTopOverlay 挂着）。
     胶囊不塞在书脊里 —— 书脊只有二十来像素宽、柜体 overflow:hidden 会裁掉外溢部分，
     它挂在 .screen 层（#shelfDelPop）按书脊 rect 现场摆位。 */
  let armedSpineId = null;
  let spineLpTimer = 0, spineLpFired = false, spineLpPt = null;
  function spineLpCancel() { clearTimeout(spineLpTimer); spineLpTimer = 0; }

  function armSpine(id) {
    if (armedSpineId && armedSpineId !== id) disarmSpine();
    const sp = document.querySelector('.spine[data-book="' + id + '"]');
    if (!sp) return;
    armedSpineId = id;
    sp.classList.add("is-armed");
    positionSpinePop(sp);
    if (state.haptic && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
  }

  function disarmSpine() {
    if (!armedSpineId) return;
    armedSpineId = null;
    const sp = document.querySelector(".spine.is-armed");
    if (sp) sp.classList.remove("is-armed");
    const pop = byId("shelfDelPop");
    if (pop) pop.classList.remove("is-on");
  }

  function positionSpinePop(sp) {
    const pop = byId("shelfDelPop");
    if (!pop) return;
    const r = sp.getBoundingClientRect();
    /* 胶囊横向锚在书脊中线，太贴屏沿就往里收（半个胶囊 + 余量）；
       顶行书顶离屏沿不够放一枚胶囊（≈76px）时翻到书下方。 */
    const vw = document.documentElement.clientWidth;
    const cx = Math.max(64, Math.min(vw - 64, r.left + r.width / 2));
    const below = r.top < 76;
    pop.classList.toggle("is-below", below);
    pop.style.left = cx + "px";
    pop.style.top = (below ? r.bottom + 12 : r.top - 12) + "px";
    pop.classList.add("is-on");
  }

  function bindSpineLongPress(sp) {
    /* 长按会被系统的「选中文字 / 上下文菜单」抢走（Android WebView 尤其明显） */
    sp.addEventListener("contextmenu", e => e.preventDefault());
    sp.addEventListener("pointerdown", e => {
      spineLpCancel();
      spineLpFired = false;
      spineLpPt = { x: e.clientX, y: e.clientY };
      spineLpTimer = setTimeout(() => {
        spineLpFired = true;
        spineLpTimer = 0;      /* 已触发：清零，否则拖走松手后 move 的 cancel 在空转 */
        armSpine(sp.dataset.book);
      }, 450);
    });
    sp.addEventListener("pointermove", e => {
      if (spineLpTimer && spineLpPt &&
          (Math.abs(e.clientX - spineLpPt.x) > 10 || Math.abs(e.clientY - spineLpPt.y) > 10)) spineLpCancel();
      /* #201：胶囊已经亮着（长按成立）再拖 = 桌面图标同款「拿起来搬走」。
         未满 450ms 的移动不算 —— 那是平移墙面的手势，照旧。 */
      else if (armedSpineId === sp.dataset.book && !dragSp && spineLpPt &&
          (Math.abs(e.clientX - spineLpPt.x) > 10 || Math.abs(e.clientY - spineLpPt.y) > 10)) startSpineDrag(sp, e);
    });
    sp.addEventListener("pointerup", spineLpCancel);
    sp.addEventListener("pointercancel", spineLpCancel);
  }

  /* 手指落在**别处**（别的书 / 滑动条 / 空白）时把「删除」收起来 —— 它不该挂在那儿等。
     捕获阶段先收，免得同一下又开出详情或另一本书的长按。胶囊与本书自己不算「别处」。 */
  document.addEventListener("pointerdown", e => {
    if (!armedSpineId) return;
    const pop = byId("shelfDelPop");
    if (pop && pop.contains(e.target)) return;
    const sp = document.querySelector(".spine.is-armed");
    if (sp && sp.contains(e.target)) return;
    disarmSpine();
  }, true);

  /* 胶囊本体：点它 = 收起自己 + 走与书籍详情「删除」同一个确认（confirmDeleteBook）。 */
  byId("shelfDelBtn").addEventListener("click", () => {
    const b = armedSpineId ? bookOf(armedSpineId) : null;
    disarmSpine();           /* 先收自己：确认弹窗（z 85）起来时底下不该还亮着 */
    if (b) confirmDeleteBook(b);
  });

  /* ---- 长按后拖动换位（#201，桌面图标同款）----
     手势：长按 450ms 先亮「删除」胶囊（#200 原样）；胶囊亮着再拖 = 进入拖动 ——
     书离开书架（幽灵跟随手指），手指走到哪层哪缝，落点预告就亮到哪（落点**不是**
     按几何猜的：它把「这本书钉到第 R 层、数组里跟在谁后面」喂给渲染**同一个**
     computeShelfRows() 算出真会落在哪，亮哪儿落哪儿），松手落位。
     能落到任意层任意缝（含第 6 层起的新层）；落库 = b.shelf 钉层 + 数组顺序
     （跟在哪本书后面）两样一起，下次渲染一字不差地还在那儿。
     边缘自动滚：贴左右边墙面平移、贴上下边柜体纵滚（柜子高了以后），拖着的书
     一直跟着内容坐标算，滚到哪亮到哪。松手在墙外 / pointercancel / 返回键 = 放弃。 */
  let dragSp = null;   /* { id, ghost, sc, scR, scW, scH, offX, offY, pt, rowIds, bookRects, rowBands, target, raf } */

  function startSpineDrag(sp, e) {
    const id = sp.dataset.book, b = bookOf(id);
    if (!b || b.status === "wish") return;      /* 想读的不上架，也谈不上搬 */
    const sc = byId("shelfScroll"), cab = byId("shelfGrid");
    if (!sc || !cab) return;
    disarmSpine();                              /* 拿起来了，「删除」胶囊先收 */
    const scR = sc.getBoundingClientRect();
    /* 书与层的**内容坐标**（视口坐标 + 起手时的滚动量）：拖动中墙面/柜体一滚，
       内容坐标不动 —— 手指位置加当前滚动量就是它在柜里的位置，一次缓存用到底。 */
    const sl0 = sc.scrollLeft, st0 = sc.scrollTop;
    const rowIds = $$("#shelfGrid .cab-row").map(r => $$(".spine", r).map(x => x.dataset.book));
    const bookRects = {};
    $$("#shelfGrid .spine").forEach(x => {
      const r = x.getBoundingClientRect();
      bookRects[x.dataset.book] = { left: r.left - scR.left + sl0, right: r.right - scR.left + sl0,
                                    top: r.top - scR.top + st0, bottom: r.bottom - scR.top + st0 };
    });
    const rowBands = $$("#shelfGrid .cab-row").map(r => {
      const rr = r.getBoundingClientRect();
      return { top: rr.top - scR.top + st0, bottom: rr.bottom - scR.top + st0 + 18 };  /* +18 = 层板 14 + 投影 4 */
    });
    const r0 = sp.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.style.background = "linear-gradient(150deg," + shadeHex(b.c1, 14) + "," + b.c2 + ")";
    ghost.textContent = b.title;
    document.querySelector(".screen").appendChild(ghost);
    dragSp = {
      id, ghost, sc, scR, scW: sc.clientWidth, scH: sc.clientHeight,
      offX: Math.max(10, Math.min(30, e.clientX - r0.left)),
      offY: Math.max(20, Math.min(r0.height / 2, e.clientY - r0.top)),
      pt: { x: e.clientX, y: e.clientY },
      rowIds, bookRects, rowBands, target: null, raf: 0
    };
    sp.classList.add("is-drag-src");
    moveSpineDrag(e.clientX, e.clientY);
    document.addEventListener("pointermove", onSpineDragMove);
    document.addEventListener("pointerup", onSpineDragUp);
    document.addEventListener("pointercancel", onSpineDragCancel);
    dragFrame();
    if (state.haptic && navigator.vibrate) { try { navigator.vibrate(8); } catch (err) {} }
  }

  function moveSpineDrag(cx, cy) {
    const d = dragSp; if (!d) return;
    d.pt = { x: cx, y: cy };
    d.ghost.style.transform = "translate(" + (cx - d.offX) + "px," + (cy - d.offY) + "px)";
    /* 悬停（落点预告）跟着**每个 move 事件**算，不等帧 —— 帧会停（无头探针的虚拟
       时钟一帧都不给、真机偶发掉帧），悬停一停 target 就冻在起手点，松手会被
       「原地不动」守卫白白拦掉。rAF 只负责边缘自动滚那半件事。 */
    updateSpineHover();
  }

  function dragFrame() {
    const d = dragSp; if (!d) return;
    /* 边缘自动滚（桌面图标的同款手感）：贴边匀速推，滚了内容坐标照旧成立 */
    const m = 44, v = 7;
    const px = d.pt.x - d.scR.left, py = d.pt.y - d.scR.top;
    const maxL = d.sc.scrollWidth - d.scW, maxT = d.sc.scrollHeight - d.scH;
    if (px < m && d.sc.scrollLeft > 0) d.sc.scrollLeft = Math.max(0, d.sc.scrollLeft - v);
    else if (px > d.scW - m && d.sc.scrollLeft < maxL) d.sc.scrollLeft = Math.min(maxL, d.sc.scrollLeft + v);
    if (py < m && d.sc.scrollTop > 0) d.sc.scrollTop = Math.max(0, d.sc.scrollTop - v);
    else if (py > d.scH - m && d.sc.scrollTop < maxT) d.sc.scrollTop = Math.min(maxT, d.sc.scrollTop + v);
    updateSpineHover();
    d.raf = requestAnimationFrame(dragFrame);
  }

  function updateSpineHover() {
    const d = dragSp; if (!d) return;
    const cx = d.pt.x - d.scR.left + d.sc.scrollLeft;
    const cy = d.pt.y - d.scR.top + d.sc.scrollTop;
    let R = -1;
    for (let i = 0; i < d.rowBands.length; i++) {
      if (cy >= d.rowBands[i].top && cy < d.rowBands[i].bottom) { R = i; break; }
    }
    if (R < 0) { if (d.target) { d.target = null; hideDragGap(); } return; }
    let after = null;                           /* 插到它后面；null = 行首 */
    const ids = d.rowIds[R];
    for (let i = 0; i < ids.length; i++) {
      const r = d.bookRects[ids[i]];
      if (r && cx > (r.left + r.right) / 2) after = ids[i];
      else break;
    }
    if (d.target && d.target.R === R && d.target.after === after) return;
    d.target = { R, after };
    showDragGap(d.id, R, after);
  }

  /* 落点预告：把「id 钉到第 R+1 层、数组里跟在 after 后面」喂给渲染同一个
     computeShelfRows()，返回它真会落到的（层，缝）—— 亮哪儿落哪儿。 */
  function dragLanding(id, R, after, list) {
    const src = list.filter(b => b.id === id)[0];
    if (!src) return null;
    const rest = list.filter(b => b.id !== id);
    let at = after ? (rest.findIndex(x => x.id === after) + 1) : 0;
    if (at < 0) at = 0;
    rest.splice(at, 0, src);
    const rows = computeShelfRows(rest, b => (b.id === id ? R + 1 : Math.round(Number(b.shelf) || 0)));
    for (let r = 0; r < rows.length; r++) {
      const i = rows[r].findIndex(x => x.id === id);
      if (i >= 0) return { row: r, idx: i, rows };
    }
    return null;
  }

  function showDragGap(id, R, after) {
    const gap = byId("dragGap");
    const d = dragSp;
    if (!gap || !d) return;
    const land = dragLanding(id, R, after, shelfBooks());
    const band = land && d.rowBands[land.row];
    if (!land || !band) { hideDragGap(); return; }
    const prev = land.idx > 0 ? d.bookRects[land.rows[land.row][land.idx - 1].id] : null;
    const next = land.idx < land.rows[land.row].length ? d.bookRects[land.rows[land.row][land.idx].id] : null;
    let x;
    if (prev) x = prev.right + 2;
    else if (next) x = Math.max(4, next.left - 6);
    else x = 8;                                 /* 空层：贴左摆一道 */
    gap.style.left = x + "px";
    gap.style.top = (band.top + 4) + "px";
    gap.style.height = Math.max(40, band.bottom - band.top - 30) + "px";
    gap.classList.add("is-on");
  }

  function hideDragGap() { const g = byId("dragGap"); if (g) g.classList.remove("is-on"); }

  function applySpineMove(id, target, firstId) {
    const b = bookOf(id);
    if (!b) { renderShelf(); return; }
    const act = shelfBooks();   /* #206：与渲染同一份列表（筛选中拖书，落点才对得上画面） */
    /* 原地不动（拖起来又放回原缝）就不折腾存档了 */
    const cur = (() => {
      const rows = computeShelfRows(act);
      for (let r = 0; r < rows.length; r++) {
        const i = rows[r].findIndex(x => x.id === id);
        if (i >= 0) return { row: r, idx: i };
      }
      return null;
    })();
    const want = dragLanding(id, target.R, target.after, act);
    /* 拖起来又放回原缝：什么都不改 —— 已经钉着的不动钉、自动的继续保持自动 */
    if (cur && want && cur.row === want.row && cur.idx === want.idx) { renderShelf(); return; }
    b.shelf = target.R + 1;
    const rest = BOOKS.filter(x => x.id !== id);
    let at;
    if (target.after) at = rest.findIndex(x => x.id === target.after) + 1;
    else if (firstId) at = rest.findIndex(x => x.id === firstId);
    else at = rest.length;                      /* 空层：排到活动书末尾，钉层保证它落对 */
    if (at < 0) at = rest.length;
    /* ⚠️ 先从原位摘掉再插：不摘的话同一本书在 BOOKS 里出现两份、架子上画两本。
       落库必须走 stashBooks（state.books = BOOKS.slice()）—— 裸 save() 只写 state.books
       的**旧顺序**，层内「跟在谁后面」落不了盘，重启后位置会跳回去。 */
    const bi = BOOKS.indexOf(b);
    if (bi >= 0) BOOKS.splice(bi, 1);
    BOOKS.splice(Math.min(at, rest.length), 0, b);
    stashBooks();                               /* 层位与顺序跟着存档（含下一次同步）走 */
    renderShelf();
  }

  function endSpineDrag(commit) {
    const d = dragSp;
    if (!d) return;
    dragSp = null;
    if (d.raf) cancelAnimationFrame(d.raf);
    document.removeEventListener("pointermove", onSpineDragMove);
    document.removeEventListener("pointerup", onSpineDragUp);
    document.removeEventListener("pointercancel", onSpineDragCancel);
    d.ghost.remove();
    hideDragGap();
    const src = document.querySelector(".spine.is-drag-src");
    if (src) src.classList.remove("is-drag-src");
    if (!commit || !d.target) return;           /* 松手在墙外 / 手势被打断：原地不动 */
    const firstId = (!d.target.after && d.rowIds[d.target.R]) ? d.rowIds[d.target.R][0] : null;
    applySpineMove(d.id, d.target, firstId);
  }
  function onSpineDragMove(e) { if (dragSp) moveSpineDrag(e.clientX, e.clientY); }
  function onSpineDragUp() { endSpineDrag(true); }
  function onSpineDragCancel() { endSpineDrag(false); }

  /* 拖书中（以及长按亮着胶囊时）不许墙面/柜体跟着手滚 —— 桌面图标同款：
     按住 = 已经拿起来了，这时候的移动是「搬书」不是「平移」。 */
  document.addEventListener("touchmove", e => {
    if (dragSp || armedSpineId) e.preventDefault();
  }, { passive: false });

  /* 把 #rrggbb 压暗（amt<0）或提亮（amt>0）—— 书脊左缘高光条用。
     与 gen_cover_assets.py 的 PAPER/INK/BG 无关：书脊颜色永远取自书的封面主色。 */
  function shadeHex(hex, amt) {
    const n = parseInt(hex.slice(1), 16) || 0;
    const f = v => Math.max(0, Math.min(255, v + amt));
    return "rgb(" + f(n >> 16) + "," + f((n >> 8) & 255) + "," + f(n & 255) + ")";
  }

  /* #206：书架页头状态筛选的点击处理 —— 点哪一格就把柜子切到哪一格（「全部」回整柜）。
     与 #94 撤掉的那颗胶囊是**同一件事回来了**（#58 起它是个开关：点一下只看已读、
     再点一下回到全部）；这次是用户点名要的，做成三格分段控件、默认「全部」，
     所以不存在"再也回不到整柜"那种状态。纯视图态：改完只重画书架，不落盘、不走云端。
     `.segmented` 这套控件同时被日记页（列表/日历）、编辑浮层（状态）与合规页共用。 */
  byId("shelfFilter").addEventListener("click", e => {
    const el = e.target.closest(".seg");
    if (!el || !el.dataset.filter || el.dataset.filter === shelfFilter) return;
    shelfFilter = el.dataset.filter;
    $$("#shelfFilter .seg").forEach(x => x.classList.toggle("is-on", x === el));
    renderShelf();
  });

  /* ---------------------------------------------------------
     4. 书籍详情 Sheet
     --------------------------------------------------------- */
  function openBookSheet(id) {
    const b = bookOf(id);
    if (!b) return;
    const body = byId("bookSheetBody");
    body.innerHTML =
      '<div class="sheet-grab"></div>' +
      '<button class="sheet-close" data-close-sheet type="button">✕</button>' +
      /* 封面位保留（#150：用户说「封面用户可以自己选上传还是不上传」—— 是可选项，
         不是要删）。不传图的书走 coverHTML 的配色封面，外观与以前一致。 */
      '<div class="bs-hero">' +
        '<div class="bs-cover">' + coverHTML(b) + '</div>' +
        '<div class="bs-info">' +
          '<div class="bs-title">' + esc(b.title) + '</div>' +
          '<div class="bs-author">' + esc(b.author || "") + '</div>' +
          '<div class="bs-rate">' + "★".repeat(b.rate) + '<span style="color:var(--muted)">' + "☆".repeat(5 - b.rate) + '</span></div>' +
          '<div class="bs-num"><span class="chip">' + STATUS[b.status] + '</span></div>' +
        '</div>' +
      '</div>' +
      /* 只留「编辑」一件事：书架是记录，详情页不再有「翻开这本书」与「阅读进度」。
         评分（上面那排星）与状态只读展示，改值进编辑浮层。 */
      '<div class="bs-actions">' +
        '<button class="bs-btn" data-edit="' + id + '" type="button">编辑</button>' +
      '</div>';
    /* 「这本书里的摘抄」整块删掉了（#57）：随笔改成纯备忘录、不再挂书，
       这里既数不出条数，也再没有「记一笔」能往这本书里写。 */

    byId("bookSheet").classList.add("is-open");
    byId("bookSheet").setAttribute("aria-hidden", "false");

    /* 先收起详情再拉起编辑：两张浮层的 z-index 同为 40，让它们依次进场，
       不会出现一开一关叠在一起。 */
    $$("[data-edit]", body).forEach(el => el.addEventListener("click", () => {
      closeSheet();
      setTimeout(() => openBookEdit(id), 300);
    }));
    $$("[data-close-sheet]", body).forEach(el => el.addEventListener("click", closeSheet));
  }

  function closeSheet() {
    byId("bookSheet").classList.remove("is-open");
    byId("bookSheet").setAttribute("aria-hidden", "true");
  }
  byId("bookSheet").addEventListener("click", e => { if (e.target.classList.contains("sheet-scrim")) closeSheet(); });

  /* ---------------------------------------------------------
     4b. 书目的增 / 改 / 删
     书架原先只是展示种子数据 —— 加不了书、改不了状态与进度、删不掉。
     现在改动写进 state.books（本地存档 + 随账号同步），BOOKS 是它的工作副本。
     --------------------------------------------------------- */
  /* 封面色板：新书按书架规模取一组，保证与既有书封同一套观感 */
  const COVER_HUES = [
    ["#2b3a55", "#6b7ea6"], ["#7a5c3e", "#c39a6b"], ["#5b2a2a", "#a8543f"],
    ["#3d2f1b", "#c08a3e"], ["#22453c", "#5f9e83"], ["#4a2353", "#9b6bb5"],
    ["#1f3a5f", "#4f86c6"], ["#3b3151", "#7b6bab"], ["#2f4034", "#7d9370"],
    ["#4d2f3c", "#a9707f"], ["#2c4a4a", "#68a0a0"], ["#39332c", "#8d7b63"]
  ];

  let editingBookId = null;   /* null = 新增，否则是被编辑书目的 id */
  let bedRate = 0;            /* 编辑浮层里当前选中的评分 */

  function stashBooks() { state.books = BOOKS.slice(); return save(); }

  /* id 单调递增，且记住历史最大值 —— 删掉一本再添加不会复用旧 id，
     否则旧随笔会莫名其妙挂到新书上。 */
  function nextBookId() {
    let mx = 0;
    BOOKS.forEach(b => { const m = /^b(\d+)$/.exec(b.id); if (m) mx = Math.max(mx, Number(m[1])); });
    /* 随笔里可能还留着已删书目的 id（删书不删随笔）—— 也要避开，
       否则新书会继承旧书遗下的随笔。 */
    state.notes.forEach(n => { const m = /^b(\d+)$/.exec(n.bookId || ""); if (m) mx = Math.max(mx, Number(m[1])); });
    state.bookSeq = Math.max(mx, state.bookSeq || 0) + 1;
    return "b" + state.bookSeq;
  }

  /* 书目一变，这几处都得跟着重画：书架、日记列表、书单（卡片上写着书名）、
     碑林（碑下也写着书名）。 */
  function refreshAfterBookChange() {
    renderShelf();
    renderRecord();
    renderInteract();
    /* 删掉一本书会让书单里那条引用悬空 —— 先摘掉数据，再重画书单页与详情浮层。
       ⚠️ 摘完必须落盘：删书的调用方是在 refresh 之前 save() 的，那时候悬空引用
       还在，不在这里补一次写，摘掉的只是内存里的一份，一重启就回来。 */
    if (pruneLists()) save();
    renderLists();
    if (byId("listSheet").classList.contains("is-open") && openListId) openListSheet(openListId);
    closeBookEdit();
  }

  /* 封面选图的待存值（跨「打开表单 → 选图 → 保存」三步）：
       null  = 这次没动封面（沿用原值，或本来就没有）
       ""    = 用户点了「移除」
       其它  = 压缩后的 dataURL
     bedColor 是随之算出的 [c1, c2]；只在有新图时才有值。 */
  let bedCover = null;
  let bedColor = null;

  function bedCoverFaceHTML() {
    if (bedCover === "") {
      return '<div class="bed-cover-none"><span>封面已移除<br>将使用配色封面</span></div>';
    }
    if (bedCover) return '<img src="' + bedCover + '" alt="">';
    const hues = bedColor || COVER_HUES[BOOKS.length % COVER_HUES.length];
    /* #150：空态先把「可以不上传」说清楚 —— 不放图也有配色封面，
       想换再点右边。 */
    return '<div class="bed-cover-none" style="background:linear-gradient(150deg,' +
      hues[0] + ',' + hues[1] + ')"><span>封面可选<br>不上传就用这个配色</span></div>';
  }

  function openBookEdit(id) {
    editingBookId = id || null;
    const b = id ? bookOf(id) : null;
    const v = b || { title: "", author: "", status: "reading", rate: 0 };
    bedRate = v.rate || 0;
    bedCover = (b && b.cover) ? b.cover : null;
    bedColor = (b && b.cover) ? [b.c1, b.c2] : null;

    /* 首屏：封面 / 书名 / 作者 / 阅读状态 / 评分 —— 记录一本书就这五件，全部平铺，
       不再有「更多选项」折叠。原先的正文 / 总页数 / 已读% / 类别随阅读线一并删。 */
    byId("bookEditBody").innerHTML =
      '<div class="sheet-grab"></div>' +
      '<button class="sheet-close" data-edit-close type="button">\u2715</button>' +
      '<div class="bed-head">' +
        '<div class="bed-title">' + (b ? "编辑这本书" : "添加一本书") + '</div>' +
        '<div class="bed-sub">' + (b ? "改完点保存" : "新书会排到书架最前面") + '</div>' +
      '</div>' +
      /* #92：封面的用途写在标签里。**封面是可选项**（#150 用户原话「封面用户可以
         自己选上传还是不上传」）—— 不传图的书走配色封面，外观与从前一致。 */
      '<div class="bed-field"><div class="bed-lab">封面（可选：点开书时显示 · 选完先裁成 3:4 · 不上传就用配色封面）</div>' +
        '<div class="bed-cover">' +
          '<div class="bed-cover-face" id="bedCoverFace">' + bedCoverFaceHTML() + '</div>' +
          '<div class="bed-cover-acts">' +
            '<button class="bed-mini" data-cover-src="album" type="button">从相册选</button>' +
            '<button class="bed-mini" data-cover-src="cam" type="button">拍照</button>' +
            '<button class="bed-mini is-ghost" data-cover-src="clear" type="button">移除封面</button>' +
          '</div>' +
        '</div></div>' +
      '<div class="bed-field"><div class="bed-lab">书名</div>' +
        '<input class="bed-in" id="bedTitle" type="text" placeholder="例如：夜航西飞" value="' + esc(v.title) + '"></div>' +
      '<div class="bed-field"><div class="bed-lab">作者</div>' +
        '<input class="bed-in" id="bedAuthor" type="text" placeholder="例如：柏瑞尔·马卡姆" value="' + esc(v.author || "") + '"></div>' +
      '<div class="bed-field"><div class="bed-lab">阅读状态</div>' +
        '<div class="bed-seg" id="bedStatus">' +
          ["reading", "done", "wish"].map(s =>
            '<button class="seg' + (v.status === s ? " is-on" : "") + '" data-status="' + s + '" type="button">' + STATUS[s] + '</button>').join("") +
        '</div></div>' +
      '<div class="bed-field"><div class="bed-lab">我的评分</div>' +
        '<div class="bed-stars" id="bedRate">' +
          [1, 2, 3, 4, 5].map(i => '<i data-rate="' + i + '" class="' + (i <= bedRate ? "on" : "") + '">\u2605</i>').join("") +
        '</div></div>' +
      /* 摆在第几层：原先书架一律「按书脊宽度自动分层」，这里让用户自己钉一层。
         「自动」＝老行为（按空隙排在前面几层，尽量摆满一面墙）—— 老书目没有
         shelf 字段，一律落回「自动」，观感一字不变。
         #201 起层数能长过 5（满了自动加层 + 拖动可钉到新层）—— 选项跟着
         当前实际层数走（至少 5 格，拖出过第 7 层就亮到 7）。 */
      '<div class="bed-field"><div class="bed-lab">摆在第几层（自动＝按空隙排在前面几层）</div>' +
        '<div class="bed-seg" id="bedShelf">' +
          (() => {
            const maxK = Math.max(5, shelfRowsN, Math.round(Number(v.shelf) || 0));
            const ks = []; for (let k = 0; k <= maxK; k++) ks.push(k);
            return ks.map(k =>
              '<button class="seg' + ((Number(v.shelf) || 0) === k ? " is-on" : "") + '" data-shelf="' + k + '" type="button">' + (k || "自动") + '</button>').join("");
          })() +
        '</div></div>' +
      '<div class="bed-acts">' +
        '<button class="bed-btn main" id="bedSave" type="button">' + (b ? "保存" : "添加到书架") + '</button>' +
        (b ? '<button class="bed-btn danger" id="bedDel" type="button">删除</button>' : "") +
      '</div>';

    /* 状态三选一 */
    $$("#bedStatus [data-status]").forEach(el => el.addEventListener("click", () => {
      $$("#bedStatus [data-status]").forEach(x => x.classList.toggle("is-on", x === el));
    }));
    /* 摆在第几层：单选，0 = 自动 */
    $$("#bedShelf [data-shelf]").forEach(el => el.addEventListener("click", () => {
      $$("#bedShelf [data-shelf]").forEach(x => x.classList.toggle("is-on", x === el));
    }));
    /* 评分：点第 n 颗 = n 分；再点同一颗归零 */
    $$("#bedRate [data-rate]").forEach(el => el.addEventListener("click", () => {
      const r = Number(el.dataset.rate);
      bedRate = (r === bedRate) ? 0 : r;
      $$("#bedRate [data-rate]").forEach(x => x.classList.toggle("on", Number(x.dataset.rate) <= bedRate));
    }));

    /* 封面：两个隐藏 input 在 index.html 里全局一份 —— 表单体是 innerHTML
       反复重建的，input 跟着重建会丢 change 监听（见下方注册处）。 */
    $$("#bookEditBody [data-cover-src]").forEach(el => el.addEventListener("click", () => {
      const src = el.dataset.coverSrc;
      if (src === "clear") {
        bedCover = ""; bedColor = null;
        byId("bedCoverFace").innerHTML = bedCoverFaceHTML();
        return;
      }
      byId(src === "cam" ? "coverCam" : "coverAlbum").click();
    }));

    byId("bedSave").addEventListener("click", saveBookEdit);
    if (byId("bedDel")) byId("bedDel").addEventListener("click", deleteBookEdit);
    $$("#bookEditBody [data-edit-close]").forEach(el => el.addEventListener("click", closeBookEdit));

    byId("bookEdit").classList.add("is-open");
    byId("bookEdit").setAttribute("aria-hidden", "false");
  }

  /* 隐藏 input 的 change 只注册一次。相册不带 capture、拍照带 capture ——
     Capacitor 的 BridgeWebChromeClient 认这个属性（onShowFileChooser 里
     按 isCaptureEnabled + image/* 分流到 ACTION_IMAGE_CAPTURE）。 */
  ["coverAlbum", "coverCam"].forEach(function (fid) {
    byId(fid).addEventListener("change", function () {
      const f = this.files && this.files[0];
      this.value = "";                     /* 清空，否则同一张图再选一次不触发 change */
      if (!f) return;
      /* #92：选完图先上裁剪台（3:4），确认后才落到表单里 */
      takeCover(f).then(res => {
        bedCover = res.dataUrl;
        bedColor = [res.c1, res.c2];
        const face = byId("bedCoverFace");
        if (face) face.innerHTML = bedCoverFaceHTML();
        toast("封面已裁好，记得点保存");
      }).catch(err => {
        const m = (err && err.message) || "这张图处理不了";
        if (m !== "已取消") toast(m);       /* 自己点取消不弹提示 */
      });
    });
  });

  function saveBookEdit() {
    const title = byId("bedTitle").value.trim();
    const author = byId("bedAuthor").value.trim();
    if (!title) { toast("先给这本书起个名字"); return; }
    const stEl = $("#bedStatus .seg.is-on");
    const status = stEl ? stEl.dataset.status : "reading";
    /* 摆在第几层：0 = 自动（按空隙排）。只有指定了层才写字段，老书一律「自动」。 */
    const shEl = $("#bedShelf .seg.is-on");
    const shelf = shEl ? Math.max(0, Math.min(60, Number(shEl.dataset.shelf) || 0)) : 0;

    if (editingBookId && bookOf(editingBookId)) {
      const b = bookOf(editingBookId);
      const before = Object.assign({}, b);
      b.title = title; b.author = author || "佚名"; b.status = status; b.rate = bedRate;
      if (shelf) b.shelf = shelf; else delete b.shelf;            /* 选「自动」就把字段摘掉 */
      if (bedCover === "") delete b.cover;                        /* 移除封面 → 回到配色封面 */
      else if (bedCover) { b.cover = bedCover; b.c1 = bedColor[0]; b.c2 = bedColor[1]; }
      state.books = BOOKS.slice();
      /* 封面是 base64，会把存档撑大；配额满时 Repo.write 静默失败 —— 这里必须
         检查并**整本回滚**，否则界面显示"已保存"、重启后却少了一张封面。 */
      if (!save()) {
        Object.assign(b, before);
        state.books = BOOKS.slice();
        Repo.write(state);
        toast("本机存不下这张封面了 —— 先删掉几本，或换张小图");
        return;
      }
      refreshAfterBookChange();
      toast("已保存《" + title + "》");
    } else {
      const hues = bedColor || COVER_HUES[BOOKS.length % COVER_HUES.length];
      const nb = {
        id: nextBookId(), title: title, author: author || "佚名", status: status,
        rate: bedRate, c1: hues[0], c2: hues[1]
      };
      if (bedCover) nb.cover = bedCover;
      if (shelf) nb.shelf = shelf;
      BOOKS.unshift(nb);
      state.books = BOOKS.slice();
      if (!save()) {
        BOOKS.shift();
        state.books = BOOKS.slice();
        Repo.write(state);
        toast("本机存不下这张封面了 —— 换一张小一点的图");
        return;
      }
      refreshAfterBookChange();
      toast("《" + title + "》已上架");
    }
  }

  function deleteBookEdit() {
    const b = editingBookId ? bookOf(editingBookId) : null;
    if (b) confirmDeleteBook(b);
  }

  /* 删除一本书的共用核心（#200）：书籍详情「删除」（deleteBookEdit）与书架长按玻璃
     「删除」都走到这里 —— 同一句确认、同一条删除路径，两条入口不许长出两套行为。 */
  function confirmDeleteBook(b) {
    if (!b) return;
    /* 原先这里有一条「书架至少要留一本书」的不变量，理由是统计页与撰写抽屉都假定
       至少有一本书。现在书架**本来就允许为空**（#57 起不再预置书）：统计页已删（#58），
       抽屉的日期与书目无关，故去掉。 */
    askConfirm({
      title: "从书架删掉这本书？",
      body: "《" + b.title + "》会从书架移走。\n\n只删这一本，其它书和你的随笔都不受影响。",
      ok: "删除", danger: true
    }).then(ok => {
      if (!ok) return;
      BOOKS.splice(BOOKS.indexOf(b), 1);
      state.books = BOOKS.slice();
      save();
      refreshAfterBookChange();
      toast("已删除《" + b.title + "》");
    });
  }

  function closeBookEdit() {
    byId("bookEdit").classList.remove("is-open");
    byId("bookEdit").setAttribute("aria-hidden", "true");
    editingBookId = null;
  }

  /* 书架页的新增入口（#58 起在右下角悬浮，#191 回到页头右上角那颗 ＋） */
  byId("shNew").addEventListener("click", () => openBookEdit(null));
  /* 点浮层底色关闭（✕ 按钮在浮层内容里，单独绑） */
  byId("bookEdit").addEventListener("click", e => {
    if (e.target.hasAttribute && e.target.hasAttribute("data-edit-close")) closeBookEdit();
  });

  /* ---------------------------------------------------------
     5. 记录 · 日记
     --------------------------------------------------------- */
  /* 随笔是纯备忘录（#57）：抽屉里没有「在读 · 书名」这一行，落笔也不写 bookId/page ——
     「记一笔」与书籍详情里的摘抄卡片都已删除，随笔不再挂在任何一本书上。 */

  /* 老存档里的 ts 可能还是相对说法（今天 / 3 天前 / 上周…），日记列表要按天分组，
     故在此统一换算成真实日期。新增笔记的 ts 写作「刚刚」，即当天。 */
  const TS_REL = [["刚刚", 0], ["今天", 0], ["昨天", 1], ["前天", 2], ["上周", 7], ["2 周前", 14], ["两周前", 14]];

  function noteDate(n) {
    const ts = n.ts || "";
    /* 绝对日期优先（"2026.09.14 20:05"）。相对说法只是旧存档的兜底。 */
    const abs = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(ts);
    if (abs) return new Date(+abs[1], +abs[2] - 1, +abs[3]);
    let off = 0;
    for (let i = 0; i < TS_REL.length; i++) {
      if (ts.indexOf(TS_REL[i][0]) === 0) { off = TS_REL[i][1]; break; }
    }
    const m = /(\d+)\s*天前/.exec(ts);
    if (m) off = parseInt(m[1], 10);
    /* 周与月的说法也接住：不接的话「3 周前」这类旧 ts 会静默落到 off=0，
       被冻结成「今天」，日期凭空挪了（v1.94 补）。月按 30 天模糊换算 ——
       兜底只求日期不漂，不求精确。 */
    const w = /(\d+)\s*周前/.exec(ts);
    if (w) off = parseInt(w[1], 10) * 7;
    const mo = /(\d+)\s*个?月前/.exec(ts);
    if (mo) off = parseInt(mo[1], 10) * 30;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - off);
    return d;
  }

  function pad2(v) { return (v < 10 ? "0" : "") + v; }
  /* key 用作 DOM id / data-day 的一部分（2026-09-17），stamp 是给人看的（2026.09.17）。 */
  function keyOf(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  /* 日期一律写成绝对日期：相对说法（今天/昨天/3 天前）会让同一条随笔的显示日期
     随时间漂移，也无法支撑「按年月日跳转」——导航需要一个稳定的键值。 */
  function stampOf(d) { return d.getFullYear() + "." + pad2(d.getMonth() + 1) + "." + pad2(d.getDate()); }
  function dayTitle(d) { return stampOf(d); }

  /* 列表按 state.notes 的原顺序渲染、遇到日期变化才开新分组：
     一旦允许把随笔写到过去的日子，就不能再把新写的直接顶到数组最前面，
     否则列表里会出现 2025.12 排在 2026.09 前面的倒序。
     故每次落笔后按日期重排 —— Array.sort 自 ES2019 起保证稳定，
     同一天内多条随笔仍保持写入先后（新写的在同组最前）。 */
  function sortNotes() {
    /* 稳定性：Array.sort 保证稳定是 ES2019 规范（V8 落地于 Chromium 70），更老的
       WebView 上同日多条随笔的顺序会乱。这里用原始下标做 tie-breaker，把"稳定性"
       写进比较函数本身，不再依赖引擎 —— 同一天内多条仍保持数组里的先后。 */
    const ord = new Map();
    state.notes.forEach((n, i) => ord.set(n, i));
    state.notes.sort((a, b) =>
      (noteDate(b).getTime() - noteDate(a).getTime()) || (ord.get(a) - ord.get(b)));
  }

  /* 旧存档里的 ts 可能是「刚刚 / 3 天前」这类相对说法，它会随时间漂移：
     今天写的随笔，明天再看就变成昨天、后天变成前天。
     加载时把它们固化成一次绝对日期，至少从此不再漂。 */
  const ABS_TS = /^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/;
  function freezeNoteDates() {
    let changed = false;
    state.notes.forEach(n => {
      if (!ABS_TS.test(n.ts || "")) { n.ts = stampOf(noteDate(n)); changed = true; }
    });
    if (changed) save();
  }

  /* 配图位（`.tl-fig` 那块 118px 的渐变块）已整体退役 —— 用户 2026-10-09：
     「我写的日记下面还带有封面呢」。它本来就只是「书封同色系渐变块占位」
     （项目内没有照片素材），正文够长（≥60 字）就自动长出来、且不能换成真图，
     看着像一张空封面。配图的取色（`figColors` / `FIG_DIY`）与判定（`hasFig`）
     一并删掉，别加回来：日记列表现在就是「日期分组 + 正文 + 底行」。
     （`figC` / `figOf` 是互动页碑林那套，与本条无关，别误删；figName 已删。） */

  /* ---- 展开时的逐词浮现（#150，照日记视频里那段文字动画）----
     折叠靠 -webkit-line-clamp 藏住后半段；展开那一下把正文拆成一粒粒
     （汉字逐字、西文按词、空白黏在前一粒上），**原本被藏住的那部分**依次淡入上浮，
     露出文字的过程本身就是动效。已在屏幕上的前几行不动 —— 不然整段重排会很闹。
     切点用 Range 二分实测高度，不靠「三行 × 行高」反推：换字号、换行都不错位。
     上限 RV_MAX 粒：三千字的随笔只动画前 400 粒，其余立刻出现（铺上千个 span 会卡）。 */
  const RV_MAX = 400;
  function clampCut(el) {
    const h = el.clientHeight;
    const node = el.firstChild;
    if (!h || !node || node.nodeType !== 3) return 0;
    const len = node.length;
    if (!len) return 0;
    const r = document.createRange();
    let lo = 0, hi = len;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      r.setStart(node, 0);
      r.setEnd(node, mid);
      if (r.getBoundingClientRect().height <= h + 1.5) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  function revealNote(el, cut) {
    const text = el.textContent;
    if (!text) return;
    const re = /[A-Za-z0-9'’\-]+|\s+|[^\sA-Za-z0-9]/g;
    const toks = [];
    let m;
    while ((m = re.exec(text))) toks.push([m[0], m.index]);
    const move = {};
    let movers = 0;
    for (let i = 0; i < toks.length && movers < RV_MAX; i++) {
      if (toks[i][1] + toks[i][0].length > cut) { move[i] = 1; movers++; }
    }
    if (!movers) return;
    const from = Number(Object.keys(move)[0]);
    const frag = document.createDocumentFragment();
    toks.forEach((tk, i) => {
      const sp = document.createElement("span");
      sp.className = "rvw" + (move[i] ? " is-in" : "");
      if (move[i]) sp.style.animationDelay = Math.min(480, (i - from) * 18) + "ms";
      sp.textContent = tk[0];
      frag.appendChild(sp);
    });
    el.textContent = "";
    el.appendChild(frag);
  }

  /* ---- 双指捏合的三档（#151，照日记视频）----
     视频里两指在列表上捏合，条目在「一行摘要」与「整段全文」之间来回切：**字号不变**，
     变的是每条露出多少字（摘要是全文的头几个词），切换那一下文字一粒粒长出来 ——
     正是上面那套 .rvw 的复用。档位挂在 #timeline 的 data-tlzoom 上：
       0 摘要（每条约一行）/ 1 标准（折叠三行 + 展开按钮）/ 2 全文（全部摊开、没有按钮）。
     收起态一律是 .tl-text.is-clamped，只是夹的行数不同（行数在 styles.css 里按档位给）。
     ⚠️ 页面级缩放是红线（verify_nozoom）：手势里 preventDefault 就地吃掉，只翻档、绝不碰 scale。 */
  let tlZoom = 1;
  const TL_ZOOM_MAX = 2;
  const TL_ZOOM_NAME = ["摘要视图", "标准视图", "全文视图"];

  function bindTlToggle(el) {
    el.addEventListener("click", () => {
      const card = el.closest(".tl-card");
      const t = card.querySelector(".tl-text");
      const open = !card.classList.contains("is-open");
      /* 切点必须在**还夹着**的时候量（展开后 clientHeight 就是全文高度了） */
      const cut = (open && t) ? clampCut(t) : 0;
      card.classList.toggle("is-open", open);
      if (t) {
        t.classList.toggle("is-clamped", !open);
        if (open) revealNote(t, cut);
        else t.textContent = t.textContent;   /* 收起：把拆开的 span 还原成一整段文本 */
      }
      el.textContent = open ? "收起 ▴" : "展开 ▾";
      el.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* 翻档本体。anim=true 时给**视口附近**的卡片做动画 —— 远处的直接翻档，
     不然几千条会一次铺出成千上万个 span。三个阶段各自成批（见 renderRecord 里
     那段 O(n²) 的注释）：① 读切点 → ② 写档位 → ③ 读溢出 → ④⑤⑥ 写按钮与动画。
     翻完的不变量只有两条，一眼可查：
       · 有「展开 ▾」 ⟺ 这条正文在当前档位下溢出了（摘要 / 全文两档由 CSS 藏按钮）；
       · 有 .is-plain ⟺ 没溢出（也是删除按钮的显隐来源之一，摊开档每条都删得掉）。 */
  function applyTlZoom(anim, folding) {
    const tl = byId("timeline");
    if (!tl) return;
    const cards = $$("#timeline .tl-card");
    const open = tlZoom === TL_ZOOM_MAX;
    const h = window.innerHeight || 800;
    /* ① 读：视口附近的卡片（上下各多留半屏）才参与动画；切点还夹着的时候量，
       摊开之后 clientHeight 就是全文高度了。 */
    const view = [], cuts = [];
    if (anim) cards.forEach(c => {
      const t = c.querySelector(".tl-text");
      if (!t) return;
      const r = c.getBoundingClientRect();
      if (r.bottom < -h / 2 || r.top > h * 1.5) return;
      view.push(t);
      if (t.classList.contains("is-clamped")) cuts.push([c, clampCut(t)]);
    });
    /* ② 写：翻档本体。先把上一档拆开的粒子还原成一整段，免得 span 混进新档。 */
    tl.setAttribute("data-tlzoom", String(tlZoom));
    cards.forEach(c => {
      const t = c.querySelector(".tl-text");
      if (!t) return;
      if (t.querySelector(".rvw")) t.textContent = t.textContent;
      c.classList.remove("is-open", "is-plain");
      t.classList.toggle("is-clamped", !open);
    });
    /* ③ 读：按新夹高整批量一遍「还溢不溢出」（读里不写、写里不读） */
    const plains = [], plenty = [];
    cards.forEach(c => {
      const t = c.querySelector(".tl-text");
      if (t) (t.scrollHeight - t.clientHeight <= 2 ? plains : plenty).push(c);
    });
    /* ④ 写：溢出没了的摘按钮去夹，还溢出的补回按钮 —— 从「全文」捏回来的卡片
       正是在这儿重新长出「展开 ▾」。 */
    plains.forEach(c => {
      const t = c.querySelector(".tl-text"), b = c.querySelector(".tl-toggle");
      if (b) b.remove();
      t.classList.remove("is-clamped");
      c.classList.add("is-plain");
    });
    plenty.forEach(c => {
      if (c.querySelector(".tl-toggle")) return;
      const t = c.querySelector(".tl-text");
      const b = document.createElement("button");
      b.className = "tl-toggle";
      b.type = "button";
      b.textContent = "展开 ▾";
      b.setAttribute("aria-expanded", "false");
      const del = c.querySelector("[data-del]");
      if (del) b.dataset.toggle = del.dataset.del;
      t.insertAdjacentElement("afterend", b);
      bindTlToggle(b);
    });
    /* ⑤ 写：这次新露出来的那截逐词长出来（量过切点的都在长；本来就摊着的没切点） */
    cuts.forEach(row => {
      const t = row[0].querySelector(".tl-text");
      if (t) revealNote(t, row[1]);
    });
    /* ⑥ 写：往回捏那一下给视口里的正文一段短淡入 —— 就地换档看着"跳"。只动 opacity，
       且只给视口里这几条（上千条一起播动画是低端机红线外的事）。 */
    if (folding) view.forEach(t => t.classList.add("is-refold"));
  }

  function stepTlZoom(dir) {
    const v = Math.max(0, Math.min(TL_ZOOM_MAX, tlZoom + dir));
    if (v === tlZoom) return false;
    tlZoom = v;
    applyTlZoom(true, dir < 0);
    toast(TL_ZOOM_NAME[v]);
    return true;
  }

  /* ---- 封面卡（#161，用户 2026-10-09 定）----
     顶部这张大卡片从「程序生成的风景 + 大字 + 七天周条 + 圆钮」改成
     **用户自己上传的图片**，框里只留左上角一行完整日期（读的仍是**今天**，
     与列表里最新那条随笔的日期是两回事）。点卡片 = 换一张图。
     图片的存储三段（对着书封面那套抄的，别自创）：
       ① 选图 → 长边压到 HERO_MAX、JPEG q0.82 → 内存里的 state.heroImg；
       ② 落盘走 CoverDB（同一个对象仓，键 "__hero"）—— base64 塞进 localStorage
          会挤掉存档配额；落盘成功才摘掉内联副本（先落盘后瘦身，同封面铁律）；
       ③ 开云时随 prefs 走一趟（rt_prefs 单文档），别的设备拉到就换上。
     ⚠️ 空库与「用户删过图」必须分得开：heroSig 存在但图不在 = 图在库里（等补水）；
        heroSig 为空 = 从来没传过或用户删掉了 —— 别去库里乱翻（见 hydrateHero）。 */
  const HERO_MAX = 1600;             /* 长边上限：212px 高的卡片在 3x 屏上够用，几十到几百 KB */
  const HERO_Q = 0.82;

  function renderHero() {
    const hero = byId("tlHero");
    if (!hero) return;
    const t = today0();
    byId("tlHeroPill").textContent = t.getFullYear() + " 年 " + (t.getMonth() + 1) + " 月 " + t.getDate() + " 日";
    const img = byId("tlHeroImg");
    if (state.heroImg) {
      if (img.getAttribute("src") !== state.heroImg) img.src = state.heroImg;
      img.hidden = false;
      hero.classList.add("has-img");
    } else {
      /* 空态：撤 src 之外还要 hidden —— 没有 src 的 <img> 在部分内核上会画一个破图图标，
         正好压在那行日期旁边（#161 空态截图里露出来的）。CSS 里配了 [hidden]{display:none}。 */
      img.removeAttribute("src");
      img.hidden = true;
      hero.classList.remove("has-img");
    }
  }

  /* 用户选的图 → 裁剪台（按卡片比例）→ 压好的 dataURL。
     ⚠️ 必须过裁剪台（本轮补，与书封面 / 头像同款）：卡片是横长条，竖图直接铺满
        等于把上下切掉、还不能挪 —— 用户第一反应就是「怎么不让我裁」。
     台面用的那份走 loadImageFile（长边 PRE_MAX=2048），裁完再按 HERO_MAX / HERO_Q 出。 */
  function heroPhotoFile(file) {
    return loadImageFile(file)
      .then(img => openCoverCropper(img, "card", heroCardRatio()))
      .then(heroShrink);
  }

  /* 裁好的图再压一道（同占位，防超大源图原样进存档）：jpg / png / heic 由系统解码，
     这里只管缩放与编码。画布失败（超大图 / 隐私模式）时退回裁好那份 —— 观感差一点，
     也好过选不了封面。 */
  function heroShrink(dataUrl) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onerror = function () { resolve(dataUrl); };
      img.onload = function () {
        const scale = Math.min(1, HERO_MAX / Math.max(img.width, img.height));
        if (scale >= 1) { resolve(dataUrl); return; }
        try {
          const cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(img.width * scale));
          cv.height = Math.max(1, Math.round(img.height * scale));
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL("image/jpeg", HERO_Q));
        } catch (e) { resolve(dataUrl); }
      };
      img.src = dataUrl;
    });
  }

  /* 压好的图 → 内存 + 渲染 + 三段存储。save() 里那条 stashCovers 会把图补进 IndexedDB
     （账本认到了签名才摘内联副本），这里只需保证「渲染 + 落盘 + 排云同步」三件事都发。 */
  function applyHeroPhoto(dataUrl) {
    state.heroImg = dataUrl;
    state.heroSig = coverSig(dataUrl);
    state.heroAt = Date.now();   /* 存档契约字段（探针断言它在），逻辑上只写不读 */
    renderHero();
    save();
  }

  /* 移除封面图：内存与三段存储一起清（heroSig 置 null 是「用户删掉了」的记号，
     hydrateHero 与 stashCovers 都认它 —— 不清就会被启动补水捞回来或白写一次库）。
     与书封面的「移除封面」同一个语义，不做二次确认（选错了再传一张就好）。
     ⚠️ 库里那行必须真的删掉：IndexedDB 偶发失败时先重试一次；再失败就明说 ——
        行还在的话下次启动 hydrateHero 会按 #174 的口径把它捡回来（= 删除没生效，
        数据无损），但用户得知道刚才那一下没成。 */
  function removeHeroPhoto() {
    state.heroImg = null;
    state.heroSig = null;
    state.heroAt = Date.now();   /* 存档契约字段（探针断言它在） */
    /* 账本那格**留一个哨兵**（不是 delete）：上传那次落盘可能还在路上，
       写回时 stripCovers 见到「签名在、图不在」会把图摘掉；顺带把库里的图删了。 */
    safeCoverSigs.set(HERO_KEY, "gone");
    const delHero = () => CoverDB.write([{ k: HERO_KEY, v: null }]);
    delHero()
      .then(ok => ok ? true : delHero())          /* 偶发失败重试一次 */
      .then(ok => toast(ok ? "封面图已移除" : "封面图移除没成功，重进软件再试一次"))
      .catch(() => toast("封面图移除没成功，重进软件再试一次"));
    renderHero();
    save();
  }

  function setupTlHero() {
    const hero = byId("tlHero"), input = byId("heroPhoto");
    const pick = () => { if (input) input.click(); };
    if (hero) {
      hero.addEventListener("click", pick);
      /* 卡片挂了 role="button" + tabindex，键盘也要能开（回车 / 空格是按钮的默认键） */
      hero.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
      });
    }
    /* 「移除」挂在卡片里面 —— 点它会冒泡到卡片上又把选图弹出来，必须拦住 */
    const del = byId("tlHeroDel");
    if (del) del.addEventListener("click", e => { e.stopPropagation(); removeHeroPhoto(); });
    if (input) input.addEventListener("change", function () {
      const f = this.files && this.files[0];
      this.value = "";                    /* 清空，否则同一张图再选一次不触发 change */
      if (!f) return;
      heroPhotoFile(f).then(url => {
        applyHeroPhoto(url);
        toast("封面图已换好");
      }).catch(err => {
        const m = (err && err.message) || "这张图处理不了";
        if (m !== "已取消") toast(m);     /* 自己点取消不弹提示（同书封面那条） */
      });
    });
    renderHero();
  }

  function renderRecord() {
    /* 渲染全部随笔。原先截前 60 条，而日历视角按全量统计 ——
       一旦超出 60 条，月历上带点的日子点下去就找不到对应内容。
       两边同源才不会互相打架：这里不截断，跳转就永远找得到落点。 */
    const items = state.notes;
    let html = "";
    let lastDay = null, lastMon = null;

    items.forEach(n => {
      const d = noteDate(n);
      if (d.getTime() !== lastDay) {
        lastDay = d.getTime();
        const k = keyOf(d);
        /* 换月插一行月份标签（#152，视频里 JULY 那种大字）。
           **最新那个月不插** —— 视频里最上面那组也只有「22 September」，没有
           SEPTEMBER 标签（封面卡左上角本来就写着年月，不重复一遍）。
           ⚠️ 它自成一行兄弟节点，别并进 .tl-day：.tl-day-txt 里只能放日期本身
           （verify_date / verify_recview 按它的文本比对分组日期）。 */
        const mon = d.getFullYear() * 12 + d.getMonth();
        if (lastMon === null) lastMon = mon;
        else if (mon !== lastMon) {
          lastMon = mon;
          html += '<div class="tl-mon">' + d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月</div>";
        }
        /* #150 照日记视频改版：粗体日期 + 灰星期（原来是虚线圆点 + 细横线的时间线）。
           .tl-day-txt 里只放日期 —— 探针按它的文本比对分组日期，星期另起一个 span。 */
        html += '<div class="tl-day" id="day-' + k + '" data-day="' + k + '">' +
          '<span class="tl-day-txt">' + dayTitle(d) + '</span>' +
          '<span class="tl-day-wk">星期' + WEEK_CN[d.getDay()] + '</span>' +
        '</div>';
      }
      html += '<article class="tl-item">' +
        '<div class="tl-card">' +
          '<p class="tl-text is-clamped">' + esc(n.text) + '</p>' +
          '<button class="tl-toggle" data-toggle="' + n.id + '" type="button">展开 ▾</button>' +
          '<div class="tl-foot">' +
            '<span class="tl-date">' + stampOf(d) + '</span>' +
            '<button class="tl-del" data-del="' + n.id + '" type="button">删除</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    });

    byId("timeline").innerHTML = html ||
      '<div class="tl-empty">还没有日记，点右上角的 ＋ 写下第一篇。</div>';

    /* 封面卡与列表同源刷新：随笔增删后周条上的实心点要跟着变 */
    renderHero();

    $$("#timeline [data-toggle]").forEach(bindTlToggle);

    /* 删除只在展开态现身：折叠时卡片上除正文外只剩一行日期。 */
    $$("#timeline [data-del]").forEach(el => el.addEventListener("click", () => {
      const id = el.dataset.del;
      state.notes = state.notes.filter(x => x.id !== id);
      save();
      renderRecord();
      toast("已删掉这条");
    }));

    /* 收尾（量溢出 / 落档位）统一走这里 —— 也由「切回列表」那条路复用 */
    settleTlList();

    /* 日历视角开着时，日期可能刚变过（比如刚在日历里补记了一条）—— 跟着刷新 */
    if (recViewOn === "cal") renderRecCal();
  }

  /* 短随笔没必要给「展开」——按实际溢出与否增删按钮。
     判定必须在 clamp 生效的状态下读 scrollHeight（此时 clientHeight 是截断后的高度）。

     被摘掉展开按钮的卡片要加 is-plain：否则它的删除永远藏在「展开态」里，
     而它根本没有展开态 —— 短随笔就再也删不掉了。

     ⚠️ 两阶段：先整批读完，再整批写。原先「读一次 scrollHeight → 改一次
     DOM」交替进行，每次改动都让布局缓存失效，下一张卡片又得把整张表重新
     布局一遍 —— 单次渲染 O(n²)。实测 1000 条 4.6 秒、3000 条界面直接打不开
     （#89 压测）。拆开之后第一次读触发一次全表布局、其后全部命中缓存，
     写阶段只在末尾失效一次，整体回到 O(n)。
     改这里务必保持「读循环里不写、写循环里不读」——混一行回去就退化了。 */
  function settleTlPlains() {
    const plains = [];
    $$("#timeline .tl-card").forEach(card => {
      const t = card.querySelector(".tl-text");
      const btn = card.querySelector(".tl-toggle");
      if (!t || !btn) return;
      if (t.scrollHeight - t.clientHeight <= 2) plains.push([card, t, btn]);
    });
    plains.forEach(function (row) {
      row[2].remove();
      row[1].classList.remove("is-clamped");
      row[0].classList.add("is-plain");
    });
  }

  /* 列表的「量溢出 + 落档位」收尾。标准档走上面那套（老行为一字不改，不加档位属性）；
     别的档位整份交给 applyTlZoom（它也含同一套溢出判据，夹的行数不同而已）。
     ⚠️ **列表不可见时一律不量**：日历视角下 #timeline 是 display:none，
     scrollHeight / clientHeight 都是 0，「0-0 ≤ 2」会把每一条都判成「放得下」
     —— 夹全摘、正文全摊开、按钮全没。这条路真会走到：在日历视角里补记一条
     （saveNote 照样调 renderRecord），切回列表时长文就再也收不起来了。 */
  function settleTlList() {
    const tl = byId("timeline");
    if (!tl || !tl.clientHeight) return;
    if (tlZoom === 1) settleTlPlains(); else applyTlZoom(false);
  }

  /* ---------------------------------------------------------
     5b. 日期工具：日历视角与写日记抽屉共用
     原先「年份快切胶囊」与「整屏日历浮层」是两套入口做同一件事，
     楼下还藏着写抽屉里的第二套月历 —— 三份实现互相打架，且周的起始日
     两边还不一致（浮层周一开头、抽屉周日开头）。
     现在只留一套：monthCells() 渲染日期格、yearMonthsHTML() 渲染年视图，
     两处挂载（页面里的日历视角 / 抽屉里的月历）只是尺寸与类名不同。
     --------------------------------------------------------- */
  /* 星期名：#74 起跟 iOS 日历对齐，每周从「日」开始 —— 就是 WEEK_CN 本来的顺序。
     （此前是周一起始的中文习惯排法，#74 按截图改回 iOS 排法。） */
  const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];

  /* ---- 农历 / 节气（#74）：iOS 日历风格里，公历大字下面那行小字来自这里 ----
     LUNAR_INFO：1900–2100 逐年一个 hex —— 低 4 位＝闰月月号（0＝无闰）、
       0x10000 位＝闰月的大小、0x8000>>(m-1) 位＝第 m 月的大小（一律 29 / 30 天）。
     TERM_DAYS：逐年 24 个节气的「日」。第 i 个节气恒在 floor(i/2)+1 月，故每年
       只需存 24 个日号；每个字符＝String.fromCharCode(47 + 日)。
     数据来源：由 lunar-javascript@1.7.7（寿星天文历，天文推算而非查表）生成。
       生成时逐年校验「每月 29/30 天、恰好一个闰月、月份序列 1..12 完整、
       月长合计＝相邻两年春节之差」，并逐日回读比对 73,384 天零差异。
     ⚠️ 早前那份 calendar.js 公开查表数据在 1933 / 1996 / 2060 三年把某个月的
       月长判反（整段差一天），节气另有 50 余处差一天 —— 故弃用。 */
  const LUNAR_INFO = [
    0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
    0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
    0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
    0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
    0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
    0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
    0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
    0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
    0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
    0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
    0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
    0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
    0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
    0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
    0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
    0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
    0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
    0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
    0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
    0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
    0x0d520
  ];
  const TERM_DAYS = [
    "5C3B5D4C5D5E6F7F7F8G7F6E","5D3B5D4D5E5E7F7G7G8G7F7E","5D4B5D5D5E6E7G7G7G8G7F7F",
    "5D4C6E5D6E6E7G8G8G8G7F7F","6D4C5D4C5D5E6F7F7F8G7F6E","5D3B5D4D5E5E7F7G7G8G7F7E",
    "5D4B5D5D5E5E7G7G7G8G7F7F","5D4C6E5D6E6E7G8G8G8G7F7F","6D4C5D4C5D5E6F7F7F8G7F6E",
    "5D3B5D4D5E5E7F7G7G8G7F7E","5D4B5D5D5E5E7G7G7G8G7F7F","5D4C6E5D6E6E7G8G8G8G7F7F",
    "6D4C5D4C5D5E6F7F7F8G7E6E","5C3B5D4D5E5E7F7G7F8G7F7E","5D3B5D4D5E5E7G7G7G8G7F7F",
    "5D4C5E5D5E6E7G7G8G8G7F7F","5D4C5D4C5D5E6F7F7F7G7E6E","5C3B5D4D5D5E7F7G7F8G7F7E",
    "5D3B5D4D5E5E7G7G7G8G7F7E","5D4C5E5D5E6E7G7G8G8G7F7F","5D4C5D4C5D5E6F7F7F7G7E6E",
    "5C3B5D4C5D5E7F7G7F8G7F6E","5D3B5D4D5E5E7G7G7G8G7F7E","5D4B5D5D5E6E7G7G8G8G7F7F",
    "5D4C5D4C5D5E6F7F7F7G7E6E","5C3B5D4C5D5E7F7G7F8G7F6E","5D3B5D4D5E5E7F7G7G8G7F7E",
    "5D4B5D5D5E6E7G7G8G8G7F7F","5D4C5D4C5D5E6F7F7F7F6E6E","5C3B5D4C5D5E6F7F7F8G7F6E",
    "5D3B5D4D5E5E7F7G7G8G7F7E","5D4B5D5D5E6E7G7G7G8G7F7F","5D4C5D4C5D5D6F7F7F7F6E6E",
    "5C3B5D4C5D5E6F7F7F8G7F6E","5D3B5D4D5E5E7F7G7G8G7F7E","5D4B5D5D5E5E7G7G7G8G7F7F",
    "5D4C5D4C5D5D6F7F7F7F6E6E","5C3B5D4C5D5E6F7F7F8G7F6E","5D3B5D4D5E5E7F7G7G8G7F7E",
    "5D4B5D5D5E5E7G7G7G8G7F7F","5D4C5D4C5D5D6F7F7F7F6E6E","5C3B5D4C5D5E6F7F7F8G7F6E",
    "5D3B5D4D5E5E7F7G7G8G7F7E","5D4B5D5D5E5E7G7G7G8G7F7F","5D4C5D4C4D5D6F7F7F7F6E6E",
    "5C3B5D4C5D5E6F7F7F7G7E6E","5C3B5D4D5E5E7F7G7F8G7F7E","5D3B5D4D5E5E7G7G7G8G7F7F",
    "5D4C4D4C4D5D6F6F7F7F6E6E","4C3B5D4C5D5E6F7F7F7G7E6E","5C3B5D4C5D5E7F7G7F8G7F7E",
    "5D3B5D4D5E5E7G7G7G8G7F7F","5D4C4D4C4D5D6F6F7F7F6E6E","4C3B5D4C5D5E6F7F7F7G7E6E",
    "5C3B5D4C5D5E7F7G7F8G7F6E","5D3B5D4D5E5E7F7G7G8G7F7E","5D4C4C4C4D5D6F6F7F7F6E6E",
    "4C3B5D4C5D5E6F7F7F7G7E6E","5C3B5D4C5D5E6F7F7F8G7F6E","5D3B5D4D5E5E7F7G7G8G7F7E",
    "5D4B4C4C4D5D6F6F6F7F6E6E","4C3B5D4C5D5D6F7F7F7F6E6E","5C3B5D4C5D5E6F7F7F8G7F6E",
    "5D3B5D4D5E5E7F7G7G8G7F7E","5D4B4C4C4D5D6F6F6F7F6E6E","4C3B5D4C5D5D6F7F7F7F6E6E",
    "5C3B5D4C5D5E6F7F7F8G7F6E","5D3B5D4D5E5E7F7G7G8G7F7E","5D4B4C4C4D4D6F6F6F7F6E6E",
    "4C3B5D4C5D5D6F7F7F7F6E6E","5C3B5D4C5D5E6F7F7F8G7F6E","5D3B5D4D5E5E7F7G7G8G7F7E",
    "5D4B4C4C4D4D6F6F6F7F6E6E","4C3B5D4C4D5D6F7F7F7F6E6E","5C3B5D4C5D5E6F7F7F8G7F6E",
    "5D3B5D4D5E5E7F7G7F8G7F7E","5D4B4C3C4D4D6F6F6F7F6E6E","4C3B5D4C4D5D6F6F7F7F6E6E",
    "5C3B5D4C5D5E6F7F7F7G7F6E","5C3B5D4D5D5E7F7G7F8G7F7E","5D4B4C3C4D4D6F6F6F7F6E6E",
    "4C3B5D4C4D5D6F6F7F7F6E6E","5C3B5D4C5D5E6F7F7F7G7E6E","5C3B5D4C5D5E7F7G7F8G7F7E",
    "5D3B4C3C4D4D6E6F6F7F6E6E","4C3B4D4C4D5D6F6F7F7F6E6E","4C3B5D4C5D5E6F7F7F7G7E6E",
    "5C3B5D4C5D5E6F7G7F8G7F6E","5D3B4C3C4D4D6E6F6F7F6E6D","4C3B4C4C4D5D6F6F6F7F6E6E",
    "4C3B5D4C5D5D6F7F7F7G7E6E","5C3B5D4C5D5E6F7F7F8G7F6E","5D3B4C3C4D4D6E6F6F7F6E6D",
    "4C3A4C4C4D5D6F6F6F7F6E6E","4C3B5D4C5D5D6F7F7F7F6E6E","5C3B5D4C5D5E6F7F7F8G7F6E",
    "5D3B4C3C4D4D6E6F6F7F6E6D","4C3A4C4C4D4D6F6F6F7F6E6E","4C3B5D4C5D5D6F7F7F7F6E6E",
    "5C3B5D4C5D5E6F7F7F8G7F6E","5D3B4C3C4D4D6E6F6F7F6E6D","4C3A4C4C4D4D6F6F6F7F6E6E",
    "4C3B5D4C5D5D6F7F7F7F6E6E","5C3B5D4C5D5E6F7F7F8G7F6E","5D3B4C3C4D4D6E6F6F7F6E6D",
    "4C3A4C4C4D4D6F6F6F7F6E6E","4C3B5D4C4D5D6F6F7F7F6E6E","5C3B5D4C5D5E6F7F7F8G7F6E",
    "5D3B4C3C4D4D6E6F6E7F6E6D","4C3A4C3C4D4D6F6F6F7F6E6E","4C3B5D4C4D5D6F6F7F7F6E6E",
    "5C3B5D4C5D5E6F7F7F7G7F6E","5D3B4C3C4C4D6E6F6E7F6E6D","4C3A4C3C4D4D6E6F6F7F6E6E",
    "4C3B5D4C4D5D6F6F7F7F6E6E","5C3B5D4C5D5E6F7F7F7G7E6E","5C3B4C3B4C4D6E6F6E7F6E6D",
    "4C2A4C3C4D4D6E6F6F7F6E6E","4C3B4D4C4D5D6F6F7F7F6E6E","4C3B5D4C5D5D6F7F7F7G7E6E",
    "5C3B4C3B4C4D5E6E6E7F6E6D","4C2A4C3C4D4D6E6F6F7F6E6D","4C3B4C4C4D5D6F6F6F7F6E6E",
    "4C3B5D4C5D5D6F7F7F7G7E6E","5C3B4C3B4C4D5E6E6E7F6E5D","4C2A4C3C4D4D6E6F6F7F6E6D",
    "4C3A4C4C4D4D6F6F6F7F6E6E","4C3B5D4C5D5D6F7F7F7F6E6E","5C3B4C3B4C4D5E6E6E7F6E5D",
    "4C2A4C3C4D4D6E6F6F7F6E6D","4C3A4C4C4D4D6F6F6F7F6E6E","4C3B5D4C5D5D6F7F7F7F6E6E",
    "5C3B4C3B4C4D5E6E6E7F6E5D","4C2A4C3C4D4D6E6F6F7F6E6D","4C3A4C4C4D4D6F6F6F7F6E6E",
    "4C3B5D4C4D5D6F6F7F7F6E6E","5C3B4C3B4C4D5E6E6E7F6E5D","4C2A4C3C4D4D6E6F6F7F6E6D",
    "4C3A4C4C4D4D6F6F6F7F6E6E","4C3B5D4C4D5D6F6F7F7F6E6E","5C3B4C3B4C4D5E6E6E7F6E5D",
    "4C2A4C3C4C4D6E6F6E7F6E6D","4C3A4C3C4D4D6F6F6F7F6E6E","4C3B5D4C4D5D6F6F7F7F6E6E",
    "5C3B4C3B4C4D5E6E6E6F6E5D","4C2A4C3B4C4D6E6F6E7F6E6D","4C3A4C3C4D4D6E6F6F7F6E6E",
    "4C3B5D4C4D5D6F6F7F7F6E6E","5C3B4C3B4C4C5E6E6E6F6D5D","4B2A4C3B4C4D5E6E6E7F6E6D",
    "4C2A4C3C4D4D6E6F6F7F6E6E","4C3B4C4C4D5D6F6F6F7F6E6E","4C3B4C3B4C4C5E6E6E6F6D5D",
    "4B2A4C3B4C4D5E6E6E7F6E6D","4C2A4C3C4D4D6E6F6F7F6E6E","4C3B4C4C4D4D6F6F6F7F6E6E",
    "4C3B4C3B4C4C5E6E6E6F6D5D","4B2A4C3B4C4D5E6E6E7F6E5D","4C2A4C3C4D4D6E6F6F7F6E6D",
    "4C3B4C4C4D4D6F6F6F7F6E6E","4C3B4C3B4C4C5E6E6E6E5D5D","4B2A4C3B4C4D5E6E6E7F6E5D",
    "4C2A4C3C4D4D6E6F6F7F6E6D","4C3A4C4C4D4D6F6F6F7F6E6E","4C3B4C3B4C4C5E6E6E6E5D5D",
    "4B2A4C3B4C4D5E6E6E7F6E5D","4C2A4C3C4D4D6E6F6F7F6E6D","4C3A4C4C4D4D6F6F6F7F6E6E",
    "4C3B4C3B3C4C5E5E6E6E5D5D","4B2A4C3B4C4D5E6E6E7F6E5D","4C2A4C3C4C4D6E6F6E7F6E6D",
    "4C3A4C4C4D4D6F6F6F7F6E6E","4C3B4C3B3C4C5E5E6E6E5D5D","4B2A4C3B4C4D5E6E6E6F6E5D",
    "4C2A4C3C4C4D6E6F6E7F6E6D","4C3A4C3C4D4D6E6F6F7F6E6E","4C3B4C3B3C4C5E5E6E6E5D5D",
    "4B2A4C3B4C4D5E6E6E6F6E5D","4C2A4C3B4C4D5E6F6E7F6E6D","4C3A4C3C4D4D6E6F6F7F6E6E",
    "4C3B4C3B3C4C5E5E6E6E5D5D","4B2A4C3B4C4C5E6E6E6F6D5D","4C2A4C3B4C4D5E6E6E7F6E6D",
    "4C2A4C3C4D4D6E6F6F7F6E6E","4C3B3B3B3C4C5E5E5E6E5D5D","3B2A4C3B4C4C5E6E6E6F6D5D",
    "4B2A4C3B4C4D5E6E6E7F6E6D","4C2A4C3C4D4D6E6F6F7F6E6E","4C3B3B3B3C3C5E5E5E6E5D5D",
    "3B2A4C3B4C4C5E6E6E6F6D5D","4B2A4C3B4C4D5E6E6E7F6E5D","4C2A4C3C4D4D6E6F6F7F6E6D",
    "4C3B3B3B3C3C5E5E5E6E5D5D","3B2A4C3B4C4C5E6E6E6E5D5D","4B2A4C3B4C4D5E6E6E7F6E5D",
    "4C2A4C3C4D4D6E6F6F7F6E6D","4C3A3B3B3C3C5E5E5E6E5D5D","3B2A4C3B4C4C5E5E6E6E5D5D",
    "4B2A4C3B4C4D5E6E6E7F6E5D","4C2A4C3C4D4D6E6F6F7F6E6D","4C3A4C4C4D4D6F6F6F7F6E6E"
  ];
  const TERM_CN = ["小寒","大寒","立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至",
    "小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至"];
  const L_MON = ["正","二","三","四","五","六","七","八","九","十","冬","腊"];
  const L_DAY = ["初一","初二","初三","初四","初五","初六","初七","初八","初九","初十",
    "十一","十二","十三","十四","十五","十六","十七","十八","十九","二十",
    "廿一","廿二","廿三","廿四","廿五","廿六","廿七","廿八","廿九","三十"];
  const GAN = "甲乙丙丁戊己庚辛壬癸", ZHI = "子丑寅卯辰巳午未申酉戌亥";
  const ANIMAL = "鼠牛虎兔龙蛇马羊猴鸡狗猪";
  /* 节气日缓存：同一年 24 个节气一次解出来（从字符串取码点，纯算术） */
  const termCache = {};
  function termDays(y) {
    if (termCache[y]) return termCache[y];
    const row = TERM_DAYS[y - 1900], out = [];
    for (let n = 0; n < 24; n++) out.push(row.charCodeAt(n) - 47);
    return (termCache[y] = out);   /* out[n-1] = 第 n 个节气的「日」 */
  }
  /* 农历 y 年总天数 / m 月天数 / 闰月位 */
  function lYearDays(y) {
    let sum = 348;
    for (let i = 0x8000; i > 0x8; i >>= 1) sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
    return sum + ((LUNAR_INFO[y - 1900] & 0xf) && (LUNAR_INFO[y - 1900] & 0x10000) ? 30 :
      (LUNAR_INFO[y - 1900] & 0xf) ? 29 : 0);
  }
  function lMonthDays(y, m) { return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29; }
  /* 公历 → 格子里的那行小字。节气优先（紫红小字），其次农历：初一显示月名、
     其余显示日名 —— 与 iOS 日历同规则。1900-01-31（农历基准日）之前查不到，返回 null。 */
  function lunarLabel(dt) {
    const y = dt.getFullYear();
    if (y < 1900 || y > 2100) return null;
    const m = dt.getMonth() + 1, d = dt.getDate();
    const td = termDays(y);
    for (const n of [m * 2 - 1, m * 2]) if (td[n - 1] === d) return { text: TERM_CN[n - 1], term: 1 };
    let offset = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1900, 0, 31)) / 86400000);
    if (offset < 0) return null;
    let ly = 1900, temp = 0;
    for (; ly < 2101 && offset > 0; ly++) { temp = lYearDays(ly); offset -= temp; }
    if (offset < 0) { offset += temp; ly--; }
    const leap = LUNAR_INFO[ly - 1900] & 0xf;
    let lm = 1, isLeap = false;
    for (; lm < 13 && offset > 0; lm++) {
      if (leap > 0 && lm === leap + 1 && !isLeap) { --lm; isLeap = true; temp = (LUNAR_INFO[ly - 1900] & 0x10000) ? 30 : 29; }
      else temp = lMonthDays(ly, lm);
      if (isLeap && lm === leap + 1) isLeap = false;
      offset -= temp;
    }
    if (offset === 0 && leap > 0 && lm === leap + 1) {
      if (isLeap) isLeap = false; else { isLeap = true; --lm; }
    }
    if (offset < 0) { offset += temp; --lm; }
    const day = offset + 1;
    return { text: day === 1 ? (isLeap ? "闰" + L_MON[lm - 1] + "月" : L_MON[lm - 1] + "月") : L_DAY[day - 1], month: day === 1 };
  }
  /* 干支 + 生肖年（年视图标题旁的图例）：2026 → 丙午马年 */
  function gzYear(y) {
    return GAN[(y - 4) % 10] + ZHI[(y - 4) % 12] + ANIMAL[(y - 4) % 12] + "年";
  }

  function today0() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function dateOfKey(k) { const p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayOffset(k) { return Math.round((today0() - dateOfKey(k)) / 86400000); }

  /* 年份仍是自由翻的：只留一个远得不会误触的软边界（1900 / 今年 +10）。 */
  const MIN_YEAR = 1900;
  function maxYear() { return today0().getFullYear() + 10; }
  function clampYear(y) { return Math.min(maxYear(), Math.max(MIN_YEAR, y || MIN_YEAR)); }

  /* 周数（月历最左那列小字）：iOS 同款简单算法 —— 1 月 1 日恒为第 1 周的开头，
     之后每 7 天进一周。2026-09-06 那行 = 36、09-13 = 37 … 与截图一致。 */
  function weekNum(dt) {
    const doy = Math.round((dt - new Date(dt.getFullYear(), 0, 1)) / 86400000) + 1;
    return Math.floor((doy - 1) / 7) + 1;
  }

  /* key（2026-09-17）→ 那天几条日记。日历视角要覆盖全部随笔 ——
     只统计渲染出来的那些，更早的日期在月历上就会显示为空白、点不动。 */
  function noteDayCount() {
    const map = {};
    state.notes.forEach(n => { const k = keyOf(noteDate(n)); map[k] = (map[k] || 0) + 1; });
    return map;
  }

  /* 一个月的日期格（#74 改 iOS 日历风格）：
     - 每周从「日」开始，首日偏移就是 getDay()（此前周一起始的 (getDay()+6)%7 已废）；
     - 每行最左多一格周数（.cald-wn / .cd-wn），所以网格是 8 列；
     - 每格两层：<b>公历</b> + <span>农历/节气</span>（节气、初一=月名，与 iOS 同规则）；
     o 至少要给 { cls, counts, todayK, sel }；futureOff = true 时未来的日子不可点
       （抽屉里它是落款日期，还没到的日子不能写）。 */
  function monthCells(y, m, o) {
    const first = new Date(y, m - 1, 1);
    const total = new Date(y, m, 0).getDate();
    let html = "";
    const lead = first.getDay();            /* 周日起始：首日是周几就空几格 */
    let d = 1, row = 0;
    while (d <= total) {
      /* 行首那格是 ISO 周号。首行若不满（首日不是周日），这一行的周日落在上个月里，
         标出周号会把人指到上个月去 —— iOS 那边这格就是空的，跟着留空。 */
      html += (row === 0 && lead > 0)
        ? '<i class="' + o.cls + '-wn is-blank"></i>'
        : '<i class="' + o.cls + '-wn">' + weekNum(new Date(y, m - 1, d)) + '</i>';
      for (let c = 0; c < 7; c++) {
        if (row === 0 && c < lead) { html += '<i class="' + o.cls + ' is-blank"></i>'; continue; }
        if (d > total) break;
        const dt = new Date(y, m - 1, d);
        const k = keyOf(dt);
        const lb = lunarLabel(dt);
        const off = o.futureOff && k > o.todayK;
        html += '<button class="' + o.cls + (off ? " is-off" : "") +
          (o.counts[k] ? " is-has" : "") + (k === o.todayK ? " is-today" : "") +
          (k === o.sel ? " is-sel" : "") +
          '" data-day="' + k + '" type="button"' + (off ? " disabled" : "") + '><b>' + d + '</b>' +
          (lb ? '<span class="' + (lb.term ? "is-term" : lb.month ? "is-mon" : "") + '">' + lb.text + '</span>' : '') + '</button>';
        d++;
      }
      row++;
    }
    return html;
  }

  /* 年视图（#74 改 iOS 年历）：标题年份 + 12 个月宫格，每格一个迷你月历
     （只有公历数字），当月标题红、今天红圈，点某月跳进那个月的月历。
     此前的 24 年选年宫格（yearGridHTML）已删 —— 跳年份靠 ‹‹ ›› 逐年翻。 */
  function yearMonthsHTML(y, todayK, off, counts) {
    const ty = today0().getFullYear(), tm = today0().getMonth() + 1;
    const cnt = counts || {};
    let html = '<div class="ym-head">' +
        '<b class="ym-year">' + y + '年</b>' +
        '<span class="ym-legend">' +
          '<i class="is-gz">' + gzYear(y) + '</i>' +
          '<i class="is-lunar">农历初一</i>' +
        '</span>' +
      '</div><div class="ymgrid">';
    for (let m = 1; m <= 12; m++) {
      const blocked = off && (y > off || (y === off && m > tm));
      const first = new Date(y, m - 1, 1);
      const total = new Date(y, m, 0).getDate();
      html += '<button class="ymon' + (blocked ? " is-off" : "") + '" data-month="' + m +
        '" type="button"' + (blocked ? " disabled" : "") + '><h4' +
        (y === ty && m === tm ? ' class="is-cur"' : '') + '>' + m + '月</h4><div class="ymd">';
      for (let i = 0; i < first.getDay(); i++) html += '<i></i>';
      for (let d = 1; d <= total; d++) {
        const k = keyOf(new Date(y, m - 1, d));
        const cls = (k === todayK ? " is-today" : "") + (cnt[k] ? " is-has" : "");
        html += '<b' + (cls ? ' class="' + cls.trim() + '"' : '') + '>' + d + '</b>';
      }
      html += '</div></button>';
    }
    return html + '</div><div class="calp-hint">带点 = 这天写过随笔 · 点月份跳过去</div>';
  }

  function recordPage() { return document.querySelector('.page[data-page="record"]'); }

  /* 跳转：把目标日期的分组行滚到粘性头部正下方，并短暂点亮。
     滚动容器是 .page[data-page="record"]（overflow-y:auto），不是 window ——
     外层 .screen 是 overflow:hidden 的固定尺寸画框，window.scrollTo 不会有任何反应。 */
  function jumpToDay(y, m, d) {
    const key = y + "-" + pad2(m) + "-" + pad2(d);
    const page = recordPage();
    const target = byId("day-" + key);
    if (!page || !target) { toast("这天的日记不在当前范围里"); return; }

    const head = page.querySelector(".tl-head");
    const top = target.getBoundingClientRect().top - page.getBoundingClientRect().top
      + page.scrollTop - (head ? head.getBoundingClientRect().height : 0) - 10;
    try { page.scrollTo({ top: Math.max(0, top), behavior: "smooth" }); }
    catch (e) { page.scrollTop = Math.max(0, top); }

    $$(".tl-day.is-focus").forEach(el => el.classList.remove("is-focus"));
    target.classList.add("is-focus");
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => { target.classList.remove("is-focus"); }, 1900);
  }

  /* jumpToKey 已删（v1.94）：定义后零调用的死代码 —— 跳转一律走 jumpToDay(y,m,d)，
     key→三数字的拆分只有这一处需要，调用方自己 split 更直接。 */

  function timelineTop() {
    const page = recordPage();
    if (!page) return;
    try { page.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { page.scrollTop = 0; }
  }

  /* ---------------------------------------------------------
     5c. 两个视角：列表 / 日历
     列表 = 按天分组的日记本体；日历 = 月历直接铺在页面上。
     日历收进页面之后，「哪天写了」不必先点一层浮层才看得见；
     点某天也在月历下方就地列出当天的内容，不再把人甩回列表。
     原先是「年份胶囊 + 整屏浮层（年/月/年网格三档）」两套入口，
     同一件事有三处入口 —— 现在只留这一个 seg。
     --------------------------------------------------------- */
  const recState = { y: 0, m: 1, sel: null, grid: false };
  let recViewOn = "list";
  let focusTimer = 0;

  function setRecView(v) {
    recViewOn = v;
    const tl = byId("timeline"), cal = byId("recCal"), hero = byId("tlHero");
    if (tl) tl.hidden = v !== "list";
    /* 封面卡跟列表同进同出（它是列表的头，日历视角里没有它的位置） */
    if (hero) hero.hidden = v !== "list";
    if (cal) cal.hidden = v !== "cal";
    $$("#recView .seg").forEach(s => s.classList.toggle("is-on", s.dataset.recview === v));
    if (v === "cal") renderRecCal();
    /* 切回列表：把「谁溢出了」重新量一遍 —— 在日历视角里补记过的话，上一次
       renderRecord 是在列表隐藏状态下跑的，没量成（见 settleTlList）。 */
    else settleTlList();
    timelineTop();
  }

  function renderRecCal() {
    const counts = noteDayCount();
    const todayK = keyOf(today0());
    recState.y = clampYear(recState.y);

    /* 8 列网格：第一个空 <i> 占掉周数列的位置，7 个星期名跟在后面 */
    byId("rcWeek").innerHTML = "<i></i>" + WEEK_CN.map(w => "<i>" + w + "</i>").join("");
    /* 年视图里年份由宫格顶部那个大标题承担，胶囊改说「选月份」；同时挂 is-yr，
       把「‹ › 翻月」两支箭头收起来（年视图里没有月可翻，只有年）。 */
    byId("recCal").classList.toggle("is-yr", recState.grid);
    byId("rcTitle").textContent = recState.grid ? "选月份" : recState.y + " 年 " + recState.m + " 月";
    byId("rcTitle").classList.toggle("is-open", recState.grid);
    byId("rcTitle").setAttribute("aria-expanded", recState.grid ? "true" : "false");
    /* 年视图里 ‹ › ‹‹ ›› 四支箭头都 = ±1 年（月历里才区分月/年两档） */
    byId("rcPrev").disabled = byId("rcPrevY").disabled = recState.y <= MIN_YEAR;
    byId("rcNext").disabled = byId("rcNextY").disabled = recState.y >= maxYear();

    if (recState.grid) {
      byId("rcGrid").hidden = true;
      byId("rcWeek").hidden = true;
      byId("rcYGrid").hidden = false;
      byId("rcYGrid").innerHTML = yearMonthsHTML(recState.y, todayK, 0, counts);
      $$("#rcYGrid [data-month]").forEach(el => el.addEventListener("click", () => {
        recState.m = Number(el.dataset.month);
        recState.grid = false;
        renderRecCal();
      }));
      byId("rcDay").innerHTML = "";
      /* 年视图里没有「所选某天」这回事 —— 面板空着也会留一条 13px 的上边框
         横在 12 宫格下面，整块收起来。 */
      byId("rcDay").hidden = true;
      return;
    }

    byId("rcYGrid").hidden = true;
    byId("rcWeek").hidden = false;
    byId("rcGrid").hidden = false;
    byId("rcDay").hidden = false;
    byId("rcGrid").innerHTML = monthCells(recState.y, recState.m,
      { cls: "cald", counts: counts, todayK: todayK, sel: recState.sel, futureOff: true });
    $$("#rcGrid [data-day]").forEach(el => el.addEventListener("click", () => {
      recState.sel = el.dataset.day;
      renderRecCal();
    }));
    renderRecDay();
  }

  /* 月历下方：所选那天的内容就地列出 —— 「写了什么、什么时候写的」都落在这一屏 */
  function renderRecDay() {
    const k = recState.sel;
    const box = byId("rcDay");
    if (!k) { box.innerHTML = ""; return; }
    const list = state.notes.filter(n => keyOf(noteDate(n)) === k);
    const off = dayOffset(k);
    const rel = off === 0 ? " · 今天" : off === 1 ? " · 昨天" : off > 0 ? " · " + off + " 天前" : "";
    box.innerHTML =
      '<div class="rc-day-h"><b>' + stampOf(dateOfKey(k)) + '</b><span>' +
        (list.length ? list.length + " 条" + rel : "还没写") + '</span></div>' +
      (list.length
        ? list.map(n => '<div class="rc-item"><p>' + esc(n.text) + '</p></div>').join("")
        : '<div class="rc-empty">这天还没有记录</div>') +
      '<button class="rc-go" data-day-go="' + k + '" type="button">写这一天</button>';
    $$("#rcDay [data-day-go]").forEach(el => el.addEventListener("click", () => {
      openComposer({ key: el.dataset.dayGo });
    }));
  }

  /* 翻页动效（#126）：新月份/新年份从手指来的方向滑入 —— 去「下」从右进、
     回「上」从左进。点箭头与手势滑动共用同一份，方向语义一致。
     只动 transform/opacity 不触布局；类名一直挂着、下次翻页先摘再挂，
     探针禁了 animation 也能靠类名断言「这一下翻了、往哪边翻」。 */
  function calSlide(el, dir) {
    if (!el) return;
    el.classList.remove("cal-in-next", "cal-in-prev");
    void el.offsetWidth;
    el.classList.add(dir > 0 ? "cal-in-next" : "cal-in-prev");
  }
  /* 手势翻页（#126）：触屏在月历上左右滑 = 翻月（年视图里翻年）。
     门槛跟阅读器翻页同款（|dx|>42 且大于 |dy|，passive 监听不拦页面滚动）；
     滑动本身不搬月份，只挑出方向对应的那颗导航键去点 —— 边界钳制
     （未来月份 / 1900）仍然只有按钮 disabled 一处实现，滑到头自然停住。 */
  function calSwipe(el, dirBtn) {
    let sx = 0, sy = 0;
    el.addEventListener("touchstart", e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    el.addEventListener("touchend", e => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
        const b = dirBtn(dx < 0 ? 1 : -1);
        if (b && !b.disabled) b.click();
      }
    }, { passive: true });
  }

  /* 切年 / 切月：‹ › 走一个月、‹‹ ›› 走一年。走的步子再大也不会越过软边界。
     切月用绝对月序号（y*12 + m）一次算完跨年 —— 逐月 if 判断不出边界。 */
  function recStepMonth(n) {
    let idx = recState.y * 12 + recState.m + n;
    idx = Math.min(maxYear() * 12 + 12, Math.max(MIN_YEAR * 12 + 1, idx));
    recState.y = Math.floor((idx - 1) / 12);
    recState.m = idx - recState.y * 12;
    renderRecCal();
    calSlide(byId("rcGrid"), n);
  }
  function recStepYear(n) {
    recState.y = clampYear(recState.y + n);
    renderRecCal();
    calSlide(byId(recState.grid ? "rcYGrid" : "rcGrid"), n);
  }
  /* 日历视角首次进入时停在「今天」所在的那一月，选中今天 ——
     不带点就说明这个月还没写过，翻回去看历史也是明确的一步。
     （不选「最近写过的那天」：那会让月历与选中日错开到两个月份去。） */
  function recCalBoot() {
    const t = today0();
    recState.y = t.getFullYear();
    recState.m = t.getMonth() + 1;
    recState.sel = keyOf(t);
    recState.grid = false;
  }

  $$("#recView .seg").forEach(el => el.addEventListener("click", () => {
    if (!recState.y) recCalBoot();
    setRecView(el.dataset.recview);
  }));
  /* ‹ › 在月历里走一个月、在年视图里走一年（年视图没有「月」可走） */
  byId("rcPrev").addEventListener("click", () => recState.grid ? recStepYear(-1) : recStepMonth(-1));
  byId("rcNext").addEventListener("click", () => recState.grid ? recStepYear(1) : recStepMonth(1));
  byId("rcPrevY").addEventListener("click", () => recStepYear(-1));
  byId("rcNextY").addEventListener("click", () => recStepYear(1));
  /* 点月份标题 → 在「月历 ↔ 年视图」之间切，不新增入口 */
  byId("rcTitle").addEventListener("click", () => {
    recState.grid = !recState.grid;
    renderRecCal();
  });
  /* 手势：日记页整块日历上左右滑都能翻（#126）—— 手指落在日期格、星期行
     还是标题上都行，touchstart 在格子上、冒泡到容器照样算数 */
  calSwipe(byId("recCal"), d =>
    byId(recState.grid ? (d > 0 ? "rcNextY" : "rcPrevY") : (d > 0 ? "rcNext" : "rcPrev")));

  /* ---- 写一条：底部抽屉 ---- */
  /* ---- 挑日子：默认今天，也能补记过去的任意一天 ----
     选中值用 key（2026-09-14）保存：定长字符串的字典序正好等于时间序，
     可以直接拿来做大小比较（比如判断是不是未来的日期）。
     写进随笔的 ts 必须转成 stamp（2026.09.14）—— noteDate() 只认这一种绝对写法。 */
  const pick = { key: "", vy: 0, vm: 0, grid: false };
  /* #119：「写完 → 选日期」步骤的开关。false = 平时（月历是预选落款的普通入口）；
     true = ✓ 之后进入的选择步骤（点日子即落到那天保存，见 saveNoteTo / renderCal）。 */
  let pickMode = false;
  /* today0 / dateOfKey / dayOffset / WEEK_CN 已在 5b 定义（日历视角与抽屉共用），
     这里不再重复声明 —— 两份字面量正是「两张月历周起始日不一致」那类 bug 的温床。 */

  /* 日期胶囊与保存按钮的文案都跟着选中日期走。
     按钮默认就是「保存」—— 日期已经在左边那个胶囊上了，不必再重复一遍；
     只有补记到过去时才把日期顶到按钮上，免得落笔之后才发现记错了日子。 */
  function syncPick() {
    const off = dayOffset(pick.key);
    const lab = off === 0 ? "今天" : off === 1 ? "昨天" : off > 0 ? "补记 · " + off + " 天前" : "今天";
    const stamp = stampOf(dateOfKey(pick.key));
    byId("cpDateTxt").textContent = lab + " · " + stamp;
    /* #114：完成键改成 ✓ 图标后，落款日期写进 aria-label（读屏与探针都读它）——
       补记时它仍会说清「保存到哪天」，只是不再占顶栏的视觉位置。 */
    byId("saveNote").setAttribute("aria-label", off === 0 ? "保存" : "保存到 " + stamp);
  }

  /* 年视图（写日记抽屉版）：走 5b 里那个 yearMonthsHTML()，未来月份不可点。
     补记到几年前的某天：点标题 → 年视图 → 点月份，三步到位。 */
  function renderYGrid() {
    const ty = today0().getFullYear();
    byId("calYGrid").innerHTML = yearMonthsHTML(pick.vy, keyOf(today0()), ty, noteDayCount());
    byId("calYGrid").hidden = false;
    byId("calGrid").hidden = true;
    byId("cpCal").classList.add("is-ygrid");
    byId("calTitle").classList.add("is-open");
    byId("calTitle").setAttribute("aria-expanded", "true");
    byId("calTitle").textContent = "选月份";
    byId("calPrev").disabled = true;        /* 年视图没有「月」可翻 */
    byId("calNext").disabled = true;
    byId("calPrevYr").disabled = pick.vy <= MIN_YEAR;
    byId("calNextYr").disabled = pick.vy >= ty;

    $$("#calYGrid [data-month]").forEach(el => el.addEventListener("click", () => {
      pick.vm = Number(el.dataset.month) - 1;
      pick.grid = false;
      renderCal();
    }));
  }

  function renderCal() {
    if (pick.grid) { renderYGrid(); return; }
    /* 日期格走与日历视角同一个 monthCells() —— 周的起始日、首日偏移、
       「今天」「选中」「未来不可点」的标法只有一处实现（#74 起统一周日开头）。 */
    byId("calGrid").innerHTML = '<i class="cw"></i>' +
      WEEK_CN.map(w => '<i class="cw">' + w + '</i>').join("") +
      monthCells(pick.vy, pick.vm + 1, {
        cls: "cd", counts: noteDayCount(), todayK: keyOf(today0()), sel: pick.key, futureOff: true
      });
    byId("calGrid").hidden = false;
    byId("calYGrid").hidden = true;
    byId("cpCal").classList.remove("is-ygrid");
    byId("calTitle").classList.remove("is-open");
    byId("calTitle").setAttribute("aria-expanded", "false");
    byId("calTitle").textContent = pick.vy + " 年 " + (pick.vm + 1) + " 月";
    const thisMonth = today0().getFullYear() * 12 + today0().getMonth();
    byId("calNext").disabled = pick.vy * 12 + pick.vm >= thisMonth;
    byId("calPrev").disabled = pick.vy <= MIN_YEAR && pick.vm === 0;
    byId("calPrevYr").disabled = pick.vy <= MIN_YEAR;
    byId("calNextYr").disabled = pick.vy >= today0().getFullYear();

    $$("#calGrid [data-day]").forEach(el => el.addEventListener("click", () => {
      /* #119：「写完 → 选日期」步骤里点日子 = 落到那天保存；
         平时（元信息行展开的预选）点日子仍是只改落款、收起月历。 */
      if (pickMode) { saveNoteTo(el.dataset.day); return; }
      pick.key = el.dataset.day;
      toggleCal(false);
    }));
  }

  function toggleCal(open) {
    byId("cpCal").classList.toggle("is-open", open);
    byId("cpCal").setAttribute("aria-hidden", open ? "false" : "true");
    byId("cpDateBtn").classList.toggle("is-open", open);
    byId("cpDateBtn").setAttribute("aria-expanded", open ? "true" : "false");
    /* 收起时无论停在月历还是年网格，下次展开都从月历开始；
       #119：收起即退出「选日期」步骤（提示行一并收掉）。 */
    if (open) renderCal(); else { pick.grid = false; exitPick(); }
  }

  function pickReset() {
    const t = today0();
    pick.key = keyOf(t); pick.vy = t.getFullYear(); pick.vm = t.getMonth();
    pick.grid = false;
    toggleCal(false);   /* 内部已走 exitPick→syncPick，不必再调一次（v1.94 去重） */
  }

  byId("cpDateBtn").addEventListener("click", () =>
    toggleCal(!byId("cpCal").classList.contains("is-open")));
  /* 点标题在「月历 ↔ 年视图」之间切换 */
  byId("calTitle").addEventListener("click", () => {
    pick.grid = !pick.grid;
    renderCal();
  });
  byId("calPrev").addEventListener("click", () => {
    pick.vm--; if (pick.vm < 0) { pick.vm = 11; pick.vy--; }
    renderCal();
    calSlide(byId("calGrid"), -1);
  });
  byId("calNext").addEventListener("click", () => {
    pick.vm++; if (pick.vm > 11) { pick.vm = 0; pick.vy++; }
    renderCal();
    calSlide(byId("calGrid"), 1);
  });
  /* ‹‹ / ›› 一次退 / 进一年 —— 月历逐月翻之外多了个快通道 */
  byId("calPrevYr").addEventListener("click", () => {
    if (pick.vy <= MIN_YEAR) return;
    pick.vy--;
    renderCal();
    calSlide(byId(pick.grid ? "calYGrid" : "calGrid"), -1);
  });
  byId("calNextYr").addEventListener("click", () => {
    if (pick.vy >= today0().getFullYear()) return;
    pick.vy++;
    renderCal();
    calSlide(byId(pick.grid ? "calYGrid" : "calGrid"), 1);
  });
  /* 手势：抽屉月历（含年视图）左右滑翻页（#126）—— 与日记页日历同一套；
     落款是未来不可写的，滑过头会被导航键的 disabled 挡住 */
  calSwipe(byId("cpCal"), d =>
    byId(pick.grid ? (d > 0 ? "calNextYr" : "calPrevYr") : (d > 0 ? "calNext" : "calPrev")));
  /* 打开写日记抽屉。默认路径只有「打字 → 保存」—— 日期默认今天，直接开写。
     opt.key  预置落款日期（日历视角里点「写这一天」时带过来）
     #57 起随笔不再挂书：改成纯备忘录之后，写下的就是一段带日期的文字，
     唯一入口是日记页，抽屉里也没有任何书目相关的行。 */
  function openComposer(opt) {
    opt = opt || {};
    draftTouched = false;    /* 清空草稿的守卫：没动过输入框就不许清（见 saveDraftNow） */
    if (opt.key) {
      pick.key = opt.key;
      const d = dateOfKey(opt.key);
      pick.vy = d.getFullYear(); pick.vm = d.getMonth();
      toggleCal(false);      /* 内部会把 pick.grid 复位并刷新日期文案 */
    } else {
      pickReset();           /* 没指定日期就回到「今天」：补记是一个主动选择的动作 */
      restoreDraft();        /* #111：普通打开 —— 上回没写完的草稿原样回来（含那天日期） */
    }
    byId("tlComposer").classList.add("is-open");
    byId("tlComposer").setAttribute("aria-hidden", "false");
    /* 草稿恢复后把字数对上（#63 起的职责，现在只剩计数），并拉起帧盯循环（#115） */
    syncNoteBox();
    startNoteWatch();
    /* #111：100ms 就 focus —— 键盘与全屏页并行入场（iOS 备忘录手感）；
       原先 280ms 等抽屉落位是两段式，还把键盘 resize 正好撞在动画收尾上。 */
    setTimeout(() => { try { byId("noteInput").focus(); } catch (e) {} }, 100);
  }
  function closeComposer() {
    saveDraftNow();          /* #111：关这刻先把草稿钉进 localStorage（开着抽屉才允许清空态） */
    byId("tlComposer").classList.remove("is-open");
    byId("tlComposer").setAttribute("aria-hidden", "true");
    /* #204：收起时把焦点交出去 —— 只摘 is-open 的话输入框还攥着焦点，而抽屉是
       `visibility:hidden` 收的（不是 display:none），WebView 不会替我们收键盘，
       表现就是「面板都滑走了、输入法还在屏幕上」（用户 2026-10-12 报图二：下拉滑条后
       输入法没消失）。写信面板 closeCompose 一直在这么做（见 SHEET_CLOSE 那句注释），
       写日记这条只是一直漏着。 */
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
  }

  /* ---- #111：草稿自动保存 ----
     旧版「关抽屉不清空」只保到 DOM —— App 被系统杀掉或闪退，没点保存的字就全没了。
     现在三层保险：打字 500ms 防抖落盘、关抽屉即时落盘、切后台（visibilitychange /
     appStateChange）即时落盘；打开抽屉时回填。草稿带 pick.key，补记到过去某天写到
     一半的，回来还落在那天。存不进去（隐私模式）静默放过 —— 草稿是保险不是功能。 */
  const DRAFT_KEY = "readtrace.draft";
  let draftTimer = 0;
  /* 这次打开抽屉以来，用户**真的动过输入框**吗（打字 / 撤销 / 删空都算）。
     清空草稿必须以它为前提：日历视角「写这一天」打开时框是空的、旧草稿还挂在
     盘上，若只凭「抽屉开着 + 框空」就清，500ms 后那份草稿就被误删了
     （v1.94 修复：原先 syncNoteBox 无条件排了清空定时器，2471 行的注释说 A 代码做 B）。 */
  let draftTouched = false;
  function scheduleDraft() {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraftNow, 500);
  }
  function composerOpen() { return byId("tlComposer").classList.contains("is-open"); }
  function saveDraftNow() {
    if (draftTimer) { clearTimeout(draftTimer); draftTimer = 0; }
    const el = byId("noteInput");
    if (!el) return;
    try {
      if (!el.value.trim()) {
        /* 只有抽屉开着（或正在保存收起）**且用户动过输入框**才允许清空草稿 ——
           日历视角「写这一天」走的路径没装草稿，别把之前那份误清掉。 */
        if (composerOpen() && draftTouched) localStorage.removeItem(DRAFT_KEY);
        return;
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ key: pick.key, text: el.value, at: Date.now() }));
    } catch (e) { /* 静默 */ }
  }
  function restoreDraft() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { d = null; }
    if (!d || !d.text) return false;
    const el = byId("noteInput");
    if (!el || el.value) return false;   /* 输入框不空就别动 —— 正在写的东西最大 */
    el.value = d.text;
    if (d.key) {
      pick.key = d.key;
      const dd = dateOfKey(d.key);
      pick.vy = dd.getFullYear(); pick.vm = dd.getMonth();
      syncPick();
    }
    return true;
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") saveDraftNow();
  });

  /* 随笔输入框：实时字数（#63）。
     全屏化（#111）后书写区 flex:1 恒满，#63 的「随内容长高」整套退役 —— 打字卡顿的
     真凶是那套「写 height:auto → 读 scrollHeight → 写回」的每键强制同步布局，它已经
     消失了；剩下的每键工作只有一次**无读**的 textContent 写 + 草稿防抖调度，直接做
     即可，不必再套 rAF 合帧（rAF 在没有渲染损伤时不会被执行 —— 无头探针的虚拟时钟
     下会整批饿死，真机上也是白搭一帧延迟）。 */
  /* 单篇上限（#113 用户定的）。maxlength 挡输入/粘贴，保存时再挡一道 ——
     value 可以被程序赋值绕过 maxlength（草稿回填、探针），上限必须两边都有。 */
  const NOTE_MAX = 99999;
  let lastLen = -1;            /* 帧盯循环的去重水位（syncNoteBox 与循环共用） */
  function syncNoteBox() {
    const el = byId("noteInput");
    if (!el) return;
    lastLen = el.value.length;
    const cnt = byId("noteCount");
    if (cnt) cnt.textContent = lastLen >= NOTE_MAX
      ? "已到上限 " + NOTE_MAX + " 字"
      : lastLen + " 字";
    scheduleDraft();         /* #111：草稿跟着同一拍走 */
  }
  byId("noteInput").addEventListener("input", () => { draftTouched = true; syncNoteBox(); });

  /* #115：字数跟手。拼音组合期 / 语音输入 / 整段替换时，不少安卓输入法不逐键派发
     input 事件（要等候选上屏才来一下），只靠 input 监听字数会一顿一顿 —— 用户实测
     「字数显示没那么及时」。书写页开着时挂一个 rAF 盯帧循环：每帧比一次 value.length
     （纯属性读，不触发布局），变了才写。打字本身就在产帧，所以组合中每帧都跟得上；
     停止条件 = 书写页关掉（循环自己退出，openComposer 再拉起）。input 监听保留 ——
     无帧可蹭的环境（无头探针的虚拟时钟）仍走事件路径。 */
  let watchActive = false;
  function noteWatch() {
    if (!composerOpen()) { watchActive = false; return; }
    const el = byId("noteInput");
    if (el && el.value.length !== lastLen) { draftTouched = true; syncNoteBox(); }
    requestAnimationFrame(noteWatch);
  }
  function startNoteWatch() {
    if (watchActive) return;
    watchActive = true;
    requestAnimationFrame(noteWatch);
  }

  /* #114：撤销 / 重做 —— 走浏览器原生编辑栈（execCommand），对 textarea 有效；
     命令不保证派发 input 事件，成功后手动把字数与草稿对一遍。 */
  function editorStep(cmd) {
    const el = byId("noteInput");
    if (!el) return;
    el.focus();
    let done = false;
    try { done = document.execCommand(cmd); } catch (e) { done = false; }
    if (done) { draftTouched = true; syncNoteBox(); }
  }
  byId("tlcUndo").addEventListener("click", () => editorStep("undo"));
  byId("tlcRedo").addEventListener("click", () => editorStep("redo"));

  /* 写一条的入口只有页头右侧那颗笔（#190 删掉了右下角的悬浮加号 —— 两颗做同一件事）。
     #201 起先看一眼盘上有没有没写完的草稿：有，先弹胶囊玻璃的询问
     （回到没写完的 / 新建一篇）；没有（或刚保存过 —— 保存会顺手清草稿键），直接开写。
     「算了」（点底色 / 返回键）= 什么都不开，草稿原样留着 —— 收起一律是取消。 */
  function tlNewTap() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { d = null; }
    if (d && d.text && !composerOpen()) { openDraftAsk(d); return; }
    openComposer();
  }
  function openDraftAsk(d) {
    const m = byId("draftAsk");
    if (!m) { openComposer(); return; }         /* 兜底：弹窗节点没了就走老路径 */
    const dt = d.key ? dateOfKey(d.key) : new Date();
    const snip = d.text.length > 26 ? d.text.slice(0, 26) + "…" : d.text;
    byId("daMeta").textContent = "落款 " + stampOf(dt) + " · " + snip;
    m.classList.add("is-open");
  }
  function closeDraftAsk() {
    const m = byId("draftAsk");
    if (m) m.classList.remove("is-open");
  }
  byId("daBack").addEventListener("click", () => { closeDraftAsk(); openComposer(); });
  byId("daNew").addEventListener("click", () => {
    closeDraftAsk();
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}   /* 「新建」= 那篇旧的不要了 */
    openComposer();                             /* restoreDraft 摸不到草稿：空白开写 */
    /* #111 关书写页不清 DOM —— 上回没保存的字可能还留在框里，「新建」就得真给一张白纸 */
    const el = byId("noteInput");
    if (el && el.value) { el.value = ""; syncNoteBox(); }
  });
  byId("daMask").addEventListener("click", closeDraftAsk);
  byId("tlNew").addEventListener("click", tlNewTap);
  /* 写信入口（#77 起在右下角悬浮，#191 回到互动页页头右上角那颗 ＋） */
  byId("ltNew").addEventListener("click", () => openCompose());
  $$("#tlComposer [data-compose-close]").forEach(el => el.addEventListener("click", closeComposer));
  /* #202：顶上那根灰条也能下拖收起（#tlcGrab）—— 写信面板同款手势。跟手平移整块
     面板，松手过阈（110px 或快甩）→ 先滑出屏外再走 closeComposer()（与返回箭头
     同一条路：草稿照旧钉盘、不清输入框）；不过阈弹回。只认灰条起手 —— 编辑区里的
     触摸一律不碰（选词 / 滚动 / 光标都是 textarea 自己的地盘）。
     ⚠️ 键盘开着时 --kb-inset 把抽屉底边抬起来了，滑出面板会探进键盘那一条带子：
     键盘是原生层压在 WebView 上面，看得见它的只有键盘收起之后的 300ms ——
     与 .sheet 的下拖是同一个观感，不另作处理。 */
  (function setupTlcGrab() {
    const comp = byId("tlComposer"), panel = $(".tlc-panel"), grab = byId("tlcGrab");
    if (!comp || !panel || !grab) return;
    const CLOSE_PX = 110, FLICK_MIN = 36, FLICK_V = 0.5;   /* 阈值与 setupSheetDrag 一致 */
    let sy = 0, dy = 0, on = false, claimed = false;
    const pts = [];                                        /* 最近几个采样点：算「甩」的速度 */
    const note = y => { pts.push({ t: Date.now(), y: y }); if (pts.length > 6) pts.shift(); };
    const speed = () => {
      const a = pts[0], z = pts[pts.length - 1];
      return (a && z && z.t > a.t) ? (z.y - a.y) / (z.t - a.t) : 0;
    };
    const scrim = () => $(".tlc-scrim");
    function down(y) {
      if (!comp.classList.contains("is-open")) return;
      sy = y; dy = 0; on = true; claimed = false;
      pts.length = 0; note(y);
    }
    function move(y) {
      if (!on) return;
      const my = y - sy;
      if (!claimed) {
        if (Math.abs(my) < 8) return;                      /* 阈值内：再等等 */
        if (my <= 0) { on = false; return; }               /* 往上推不是收起，放手 */
        claimed = true;
        panel.classList.add("is-dragging");                /* 停掉 .42s 过渡，改跟手 */
      }
      dy = Math.max(0, my);
      note(y);
      panel.style.transform = "translateY(" + dy + "px)";
      const sc = scrim();
      if (sc) { sc.style.transition = "none"; sc.style.opacity = String(Math.max(0, 1 - dy / Math.max(1, panel.offsetHeight))); }
    }
    function up(y) {
      if (!on) return;
      on = false;
      if (typeof y === "number") { dy = Math.max(0, y - sy); note(y); }
      const took = claimed && (dy > CLOSE_PX || (dy > FLICK_MIN && speed() > FLICK_V));
      panel.classList.remove("is-dragging");
      const sc = scrim();
      if (!took) {                                         /* 弹回：清内联值，CSS 过渡接手 */
        panel.style.transform = "";
        if (sc) { sc.style.transition = ""; sc.style.opacity = ""; }
        return;
      }
      if (sc) { sc.style.transition = ""; sc.style.opacity = "0"; }
      /* #204：判定「要收」之后再交焦点 —— 太早（跟手刚起）不行：真机上键盘一收、视口一变，
         这一拖会被系统 cancel 掉（同 setupSheetDrag.dropCancelled 里那句），面板反而弹回去。
         松手时才交，键盘与面板一起走：收起那一瞬用户看到的是「面板下移、键盘同时退场」。 */
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
      panel.style.transition = "transform .3s var(--ease)";
      panel.style.transform = "translateY(100%)";
      /* 滑完再收：此刻面板已在屏外，closeComposer 摘 is-open 的瞬时隐藏看不见 */
      setTimeout(function () {
        panel.style.transition = ""; panel.style.transform = "";
        if (sc) sc.style.opacity = "";
        closeComposer();
      }, 300);
    }
    grab.addEventListener("touchstart", e => {
      if (e.touches.length !== 1) return;
      down(e.touches[0].clientY);
    }, { passive: true });
    grab.addEventListener("touchmove", e => {
      move(e.touches[0].clientY);
      if (claimed && e.cancelable) e.preventDefault();     /* 接管了才拦，别碰滚动链 */
    }, { passive: false });
    grab.addEventListener("touchend", e => {
      const t = e.changedTouches && e.changedTouches[0];
      up(t ? t.clientY : undefined);
    });
    grab.addEventListener("touchcancel", () => up());
    /* 桌面（可编辑版在 Chrome 里看）：按住灰条往下拖同样收 */
    grab.addEventListener("mousedown", e => { if (e.button === 0) down(e.clientY); });
    window.addEventListener("mousemove", e => { if (on) move(e.clientY); });
    window.addEventListener("mouseup", e => { if (on) up(e.clientY); });
  })();
  /* 写信浮层(#77)自己的遮罩：index.html 里的 scrim 与日记书写抽屉共用同一个属性名，
     但作用域不同 —— 漏掉这条的话，点 #composeSheet 的底色就没反应（v1.94 修复）。 */
  $$("#composeSheet [data-compose-close]").forEach(el => el.addEventListener("click", closeCompose));

  /* #119：选日期步骤。提示行挂在月历里（cpCalHint），进步骤就点亮、退出就收掉；
     ✓ 在步骤里再按一次 = 不选了，回到书写（toggleCal(false) 会顺带走 exitPick）。 */
  function setCalHint(s) {
    const h = byId("cpCalHint");
    if (!h) return;
    h.textContent = s || "";
    h.hidden = !s;
  }
  function enterPick() {
    pickMode = true;
    setCalHint("点一个日子，这篇就记到那天");
    if (!byId("cpCal").classList.contains("is-open")) toggleCal(true);
    byId("saveNote").setAttribute("aria-label", "选择日期");
  }
  function exitPick() {
    pickMode = false;
    setCalHint("");
    syncPick();
  }

  /* #119：落到 key 那天保存 —— 「写完 → 选日期」步骤的终点。
     原先 ✓ 直接存进当前落款；现在 ✓ 只负责把人带到日历前，落哪天由这一下决定。 */
  function saveNoteTo(key) {
    const txt = byId("noteInput").value.trim();
    if (!txt) { toggleCal(false); return; }   /* 步骤里把字清空了：不存，回书写态 */
    if (txt.length > NOTE_MAX) { toggleCal(false); toast("单篇最多 " + NOTE_MAX + " 字"); return; }
    pick.key = key;
    const d = dateOfKey(key);
    const off = dayOffset(key);
    /* 纯备忘录：只记「哪天 + 写了什么」，不再带书目与页码（#57）。 */
    /* id 必须带随机尾巴：rid 由 id 派生，两台设备同一毫秒各写一条的话，
       毫秒戳撞出同一个 rid，云端合并时后到的静默覆盖先到的（v1.94 补）。 */
    state.notes.unshift({
      id: "n" + Date.now() + Math.random().toString(36).slice(2, 6),
      ts: stampOf(d), text: txt
    });
    sortNotes();
    save();                  /* 落盘保持同步 —— 日记丢不起，这几十毫秒省不得 */
    byId("noteInput").value = "";
    saveDraftNow();          /* 框空了：草稿（开着抽屉，允许清空态）一并清掉 */
    syncNoteBox();           /* 计数归零；框高交给 flex，不用再复位 */
    /* #111：先收全屏页、后渲染 —— 顺序换了，**同步性没换**：「写完就地刷新」是
       这条链路的硬契约（保存回来列表/月历/当天面板必须当场就是新的），渲染不许
       推迟。顺序调换的收益有限但真实：class 先翻，收起过渡的首帧不用等渲染跑完。
       （数据量大了之后若渲染本身变重，正确解法是增量 prepend，不是推迟刷新。）
       补记到过去的那天时，卡片插在列表中段 —— 不滚过去会以为没保存成功；
       日历视角不必滚：那边已把那天选中并展开。 */
    toggleCal(false);        /* #119：落盘即收步骤 —— 日历收起、提示行熄掉、aria 回「保存」 */
    closeComposer();
    const wasCal = recViewOn === "cal";
    if (wasCal) {
      recState.sel = key;
      recState.y = d.getFullYear();
      recState.m = d.getMonth() + 1;
    }
    renderRecord();
    if (off !== 0 && !wasCal) {
      jumpToDay(d.getFullYear(), d.getMonth() + 1, d.getDate());
      toast("已补记到 " + stampOf(d));
    } else {
      toast(off === 0 ? "已记在今天" : "已补记到 " + stampOf(d));
    }
  }

  /* ✓ 完成（#119 改）：字数两道守卫不变（空文案、超限文案），过检后不再直接落盘，
     而是进入「选日期」步骤 —— 用户写完才决定落到哪天，补记不再要抢在写之前预选。
     元信息行的老预选路径保留：先选好日子再动笔的，进了步骤那天已高亮，点它即可。 */
  byId("saveNote").addEventListener("click", () => {
    const txt = byId("noteInput").value.trim();
    if (!txt) { toast("先写点什么吧"); return; }
    if (txt.length > NOTE_MAX) { toast("单篇最多 " + NOTE_MAX + " 字"); return; }
    if (pickMode) { toggleCal(false); return; }
    enterPick();
  });

  /* ---------------------------------------------------------
     7. 互动 · 写信与收信（#77）
     只做两件事：给书里的人写一封信，等他的回信。
       · 碑林、想你榜、「想你了」在 #77 全删 —— 用户要的只剩写信与收信；
       · 回信**不在本地生成**：寄出后这封信停在「等待回信」，由服务端产出
         （rt-api 的 replyEngine，将来换成内置模型时客户端一行都不用改），
         随下一次同步落进收件箱 —— 「寄出 → 等一会儿 → 回信来了」是这么来的；
       · 未登录 / 离线也能写：信先留在本机，等登录后同步上去再等回信。
     --------------------------------------------------------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  /* lineBr（esc + \n→<br>）已删（#198）：信与回信要接捏合翻档的逐词浮现
     （revealNote / clampCut 只认单一文本节点），必须渲染成纯文本 ——
     .lb-text 本来就是 white-space:pre-wrap，换行观感一字不变。别把它加回来。 */
  /* lbEsc 与 esc 同义（都做 HTML 转义），只是它**对 null / undefined 也安全**：
     合规页与更新卡喂进来的字段可能整个缺失，esc 会渲染出 "undefined" 字面量。
     ⚠️ 它原先定义在已删除的 renderLetterbox 块里，删整段时跟着一起没了 ——
        而合规页 / 更新卡 / 注册恢复码五处还在用，于是这些页面整片空白。
        别再把它塞进任何会被整段删掉的功能块。 */
  const lbEsc = s => esc(s == null ? "" : s);
  const figureOf = id => FIGURES.filter(f => f.id === id)[0];
  /* 老存档里可能留着已删人物的信 —— 取值一律走这里，别直接 figureOf(x).short */
  const figOf = id => figureOf(id) || { id: id, name: "书中人", short: "书中人", bookId: "", emoji: "✉️" };
  /* 收信人有两种：名册里的人（fid），与用户自己填的「书名 + 人物名」（fid 为空、带 book / who）。
     收件箱与删信确认都走这里 —— 自定义的信按 who 显示，不然后一排全是「书中人」。 */
  function figOfLetter(l) {
    if (l && l.fid) return figOf(l.fid);
    const who = (l && l.who) || "书中人";
    return { id: "", name: who, short: who, bookId: "", emoji: "✉️" };
  }
  /* 抬头里的称呼：自定义的信带上书名（「《西游记》里的 悟空」），名册里的只写短名。 */
  function letterTo(l) {
    const nm = figOfLetter(l).short;
    return (l && !l.fid && l.book) ? ("《" + l.book + "》里的 " + nm) : nm;
  }

  /* 回信不是即时到的：服务端给每封信留了 REPLY_DELAY（默认 20s，见 rt-api），
     客户端多等 5s 再自己拉一次 —— 于是不必让用户手动刷新才等到回信。 */
  const REPLY_WAIT_MS = 25000;
  let replyTimer = null;

  function pendingLetters() { return (state.letters || []).filter(l => !l.reply); }

  /* 以**最老那封**未回信的寄出时刻为准算截止点：多封信同时在等时，
     一次拉取就能把到点的全部补齐，不必为每封各排一个定时器。
     at 缺失（老数据）时退到 updatedAt，再没有就按"现在"起算。 */
  function replyDeadline() {
    let oldest = Infinity;
    pendingLetters().forEach(l => {
      const t = Number(l.at) || Number(l.updatedAt) || 0;
      if (t && t < oldest) oldest = t;
    });
    return isFinite(oldest) ? oldest + REPLY_WAIT_MS : Date.now() + REPLY_WAIT_MS;
  }

  /* 按"还剩多久"排期，而不是每次都重新等满 REPLY_WAIT_MS ——
     renderInteract 会被反复调用（切 tab、拉完同步、删信…），
     若每次都从头计时，用户只要在互动页多切几次就永远等不到回信。 */
  function scheduleReplyCheck() {
    clearTimeout(replyTimer);
    if (!isSignedIn() || !pendingLetters().length) return;
    /* 早该到了还没到就别再空转：最多比预期多试 2 个等待周期（约 50s），
       之后交给用户的手动刷新 / 下次启动。不会因为一封永远回不了的信把请求打满。 */
    if (replyDeadline() + REPLY_WAIT_MS * 2 < Date.now()) return;
    const wait = Math.max(10000, Math.min(replyDeadline() - Date.now(), REPLY_WAIT_MS));
    replyTimer = setTimeout(() => { if (isSignedIn()) syncNow(); }, wait);
  }

  /* #205：互动页「等回信的小家伙」整体退役 —— 6 段小家伙视频素材，连同
     index.html 里那一块宠物槽、以及上面这一整段常量与十二个函数一并删掉。
     收件箱里只剩「已寄出 · 等待回信」那一行字；别再按名字加回来（素材已删）。 */

  /* 刚到的回信：这一轮同步比出来的「原本在等、现在有回信了」的信。
     rid → 1；renderInteract 在互动页上把它消费掉，播一次惊醒动画（见下）。 */
  const freshReplies = {};

  /* ---- 收件箱的两指捏合翻档（#198，照日记列表那套 #151）----
     档位挂在 #inboxList 的 data-ltzoom 上（标准档没有属性 = 老样子）：
       0 摘要（正文 / 回信各一行、删除收起）/ 1 标准（夹三行 + 展开钮）/ 2 全文（全摊开）。
     每张卡有**两个**可折叠的文本块（信正文 + 回信正文），各自独立量溢出、各配一枚
     「展开 ▾」；展开那一下的逐词浮现与收起的短淡入直接复用日记那套
     （revealNote / clampCut / rvIn / tlFold）。档位不落存档，与日记同一条（重开回标准）。
     ⚠️ 页面级缩放是红线（verify_nozoom）：手势里 preventDefault 就地吃掉，只翻档、绝不碰 scale。 */
  let ltZoom = 1;

  function bindLtToggle(el) {
    el.addEventListener("click", () => {
      const t = el.previousElementSibling;
      if (!t || !t.classList.contains("lb-text")) return;
      const open = !t.classList.contains("is-open");
      /* 切点必须在**还夹着**的时候量（展开后 clientHeight 就是全文高度了） */
      const cut = (open && t.classList.contains("is-clamped")) ? clampCut(t) : 0;
      t.classList.toggle("is-open", open);
      t.classList.toggle("is-clamped", !open);
      if (open) revealNote(t, cut);
      else t.textContent = t.textContent;   /* 收起：把拆开的 span 还原成一整段文本 */
      el.textContent = open ? "收起 ▴" : "展开 ▾";
      el.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* 翻档本体（照 applyTlZoom 的读/写两阶段：① 读视口附近 → ② 写档位 →
     ③ 读溢出 → ④ 写按钮与动画）。收件箱量级小，但判据跟日记长得一样才好对：
     「有展开钮 ⟺ 这块正文在当前档位下溢出了」。 */
  function applyLtZoom(anim, folding) {
    const box = byId("inboxList");
    if (!box) return;
    const texts = $$("#inboxList .lb-text");
    const open = ltZoom === 2;
    const h = window.innerHeight || 800;
    /* ① 读：视口附近的块才参与动画；切点还夹着的时候量 */
    const view = [], cuts = [];
    if (anim) texts.forEach(t => {
      const r = t.getBoundingClientRect();
      if (r.bottom < -h / 2 || r.top > h * 1.5) return;
      view.push(t);
      if (t.classList.contains("is-clamped")) cuts.push([t, clampCut(t)]);
    });
    /* ② 写：翻档本体（标准档摘属性）。先把上一档拆开的粒子还原成一整段。 */
    if (ltZoom === 1) box.removeAttribute("data-ltzoom");
    else box.setAttribute("data-ltzoom", String(ltZoom));
    texts.forEach(t => {
      if (t.querySelector(".rvw")) t.textContent = t.textContent;
      t.classList.remove("is-open");
      t.classList.toggle("is-clamped", !open);
    });
    /* ③ 读：按新夹高整批量一遍「还溢不溢出」（读里不写、写里不读） */
    const plains = [], plenty = [];
    texts.forEach(t => (t.scrollHeight - t.clientHeight <= 2 ? plains : plenty).push(t));
    /* ④ 写：溢出没了的摘按钮去夹，还溢出的补回按钮 —— 从别的档捏回标准档时
       「展开 ▾」就在这儿重新长出来。 */
    plains.forEach(t => {
      const b = t.nextElementSibling;
      if (b && b.classList.contains("lb-toggle")) b.remove();
      t.classList.remove("is-clamped");
    });
    plenty.forEach(t => {
      if (t.nextElementSibling && t.nextElementSibling.classList.contains("lb-toggle")) return;
      const b = document.createElement("button");
      b.className = "lb-toggle";
      b.type = "button";
      b.textContent = "展开 ▾";
      b.setAttribute("aria-expanded", "false");
      t.insertAdjacentElement("afterend", b);
      bindLtToggle(b);
    });
    /* ⑤ 写：这次新露出来的那截逐词长出来 */
    cuts.forEach(row => revealNote(row[0], row[1]));
    /* ⑥ 写：往回捏那一下给视口里的正文一段短淡入（只动 opacity，与日记同一对动画） */
    if (folding) view.forEach(t => t.classList.add("is-refold"));
  }

  function stepLtZoom(dir) {
    const v = Math.max(0, Math.min(2, ltZoom + dir));
    if (v === ltZoom) return false;
    ltZoom = v;
    applyLtZoom(true, dir < 0);
    toast(TL_ZOOM_NAME[v]);
    return true;
  }

  /* 收件箱重画后的「量溢出 + 落档位」收尾。⚠️ 列表不可见时一律不量 —— 与日记的
     settleTlList 同一条坑（scrollHeight 全 0 会把每条都判成「放得下」）；现在
     .page 藏页用的是 opacity（布局恒在），这条是给将来的 display:none 留的闸。 */
  function settleLtList() {
    const box = byId("inboxList");
    if (!box || !box.clientHeight) return;
    applyLtZoom(false);
  }

  /* 两指在收件箱上捏合 = 翻档。单指一律放行 —— 滚动、点删除、长按都不受影响，
     所以监听全挂在页面级且只在**两指**时才接管。写信面板（.sheet）不在 .page 里面，
     面板里的两指到不了这里，不必再设例外门。桌面 / 网页版没有两指，
     留 Ctrl+滚轮 等价操作（调试也用它）。 */
  function setupLtZoom() {
    const pg = $('.page[data-page="interact"]');
    if (!pg) return;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    let base = 0;
    pg.addEventListener("touchstart", e => {
      base = 0;
      if (e.touches.length !== 2) return;
      base = dist(e.touches) || 0;
    }, { passive: true });
    pg.addEventListener("touchmove", e => {
      if (!base || e.touches.length !== 2) return;
      e.preventDefault();
      const d = dist(e.touches);
      /* 一步一档、每档重设基准：连续捏合能一路走到头，慢慢捏也不会连跳两档 */
      if (d / base >= 1.3) { if (stepLtZoom(1)) base = d; }
      else if (d / base <= 0.77) { if (stepLtZoom(-1)) base = d; }
    }, { passive: false });
    const stop = e => { if (!e.touches || e.touches.length < 2) base = 0; };
    pg.addEventListener("touchend", stop, { passive: true });
    pg.addEventListener("touchcancel", stop, { passive: true });
    /* 收起时的短淡入用完自己摘类 —— 类还在就重播不了（与日记同一个收尾） */
    pg.addEventListener("animationend", e => {
      if (e.animationName === "tlFold") e.target.classList.remove("is-refold");
    });
    pg.addEventListener("wheel", e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      stepLtZoom(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
  }

  /* 收件箱：最近写的一封在最上面；回信还没到的那封显示「等待回信」。 */
  function renderInteract() {
    const box = byId("inboxList");
    const cnt = byId("inboxCount");
    const list = (state.letters || []).slice();
    if (cnt) cnt.textContent = String(list.length);
    /* 每次重画收件箱都顺手校一遍回信的排期：寄出、拉完同步、切回这一页都走这里，
       「等一会儿再来」才不会漏掉某条路径。 */
    scheduleReplyCheck();
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<p class="lb-empty">还没有写过信。<br>点右上角的 ＋，给书里的人写第一封。</p>';
      return;
    }
    box.innerHTML = list.map(l => {
      const f = figOfLetter(l);
      const rid = ensureLetterRid(l);
      /* 刚到的回信只在互动页上消费，用户在别的页时留着，等他切回来那一刻再显
         （这才是「回信来了」该被看见的时机）。#205 起小家伙没了，这里只剩
         「回信正文晚半拍淡进来」这一件（.lb-reply.is-fresh / lbTextIn）。 */
      const fresh = !!(l.reply && freshReplies[rid] && currentTab === "interact");
      if (fresh) delete freshReplies[rid];
      return '<div class="lb-item">' +
        '<div class="lb-head">' +
          '<span class="lb-to"><span class="lb-fig" style="--fc:' + figC(f, "c1") + '">' +
            (f.emoji || "✉️") + '</span>写给 ' + esc(letterTo(l) || "书中人") + '</span>' +
          '<span class="lb-date">' + esc(l.ts || "") + '</span>' +
        '</div>' +
        /* 正文与回信按「标准档」形态直接画出来（夹三行 + 展开钮），溢不溢出交给
           settleLtList() 收尾量 —— 模板里不预判（与日记 .tl-text 同一条路）。
           必须是纯文本节点：捏合翻档的逐词浮现只认它（见上面 lineBr 那条）。 */
        '<p class="lb-text is-clamped">' + esc(l.text) + '</p>' +
        '<button class="lb-toggle" type="button">展开 ▾</button>' +
        (l.reply
          ? '<div class="lb-reply' + (fresh ? " is-fresh" : "") + '">' +
            '<span class="lb-lab">回信</span>' +
            '<p class="lb-text is-clamped">' + esc(l.reply) + '</p>' +
            '<button class="lb-toggle" type="button">展开 ▾</button></div>'
          : '<div class="lb-await">' +
            '<p class="lb-wait">已寄出 · 等待回信' +
            (isSignedIn() ? "" : "（登录后才会收到）") + '</p></div>') +
        '<button class="lb-del" data-lt-del="' + esc(rid) + '" type="button">删除</button>' +
      '</div>';
    }).join("");
    /* 捏合档位收尾：量溢出 / 摘掉装得下的展开钮 */
    $$("#inboxList .lb-toggle").forEach(bindLtToggle);
    settleLtList();

    $$("#inboxList [data-lt-del]").forEach(btn => btn.addEventListener("click", async e => {
      e.stopPropagation();
      const rid = btn.dataset.ltDel;
      const l = (state.letters || []).filter(x => ensureLetterRid(x) === rid)[0];
      if (!l) return;
      const yes = await askConfirm({
        title: "删掉这封信？",
        body: "写给" + (letterTo(l) || "书中人") + "的这封信和它的回信会一起删掉，删了找不回来。",
        ok: "删除", danger: true
      });
      if (!yes) return;
      const i = (state.letters || []).findIndex(x => ensureLetterRid(x) === rid);
      if (i < 0) return;
      state.letters.splice(i, 1);
      save();
      renderInteract();
      toast("已删除这封信");
    }));
  }

  /* --- 写一封信 --- */

  let composeFid = null;
  /* 等面板升起再聚焦的那记 setTimeout：收层时必须清掉 —— 不然 400ms 内收起写信层，
     到点仍会 focus 藏在已收起面板里的输入框，Android 上键盘凭空弹出（v1.94 修复）。 */
  let composeFocusTimer = 0;

  function openCompose() {
    const sh = byId("composeSheet");
    if (!sh) return;
    if (!composeFid) composeFid = (FIGURES[0] && FIGURES[0].id) || "f1";
    renderCompose();
    sh.classList.add("is-open");
    sh.setAttribute("aria-hidden", "false");
    if (composeFocusTimer) clearTimeout(composeFocusTimer);
    /* 等面板升起动画基本走完再聚焦，否则键盘会跟动画抢拍（与登录浮层同一个节奏） */
    composeFocusTimer = setTimeout(() => { composeFocusTimer = 0; try { byId("cmpInput").focus(); } catch (e) {} }, 400);
  }

  function closeCompose() {
    const sh = byId("composeSheet");
    if (!sh) return;
    if (composeFocusTimer) { clearTimeout(composeFocusTimer); composeFocusTimer = 0; }
    sh.classList.remove("is-open");
    sh.setAttribute("aria-hidden", "true");
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
  }

  function renderCompose() {
    byId("composeBody").innerHTML =
      '<div class="sheet-grab"></div>' +
      '<button class="sheet-close" id="cmpClose" type="button" aria-label="关闭">✕</button>' +
      '<div class="cmp-sec">寄给谁</div>' +
      '<div class="cmp-who">' + FIGURES.map(f =>
        '<button class="cmp-chip' + (f.id === composeFid ? " is-on" : "") + '" data-who="' + f.id + '" type="button">' +
          '<span class="cmp-emo" style="--fc:' + figC(f, "c1") + '">' + (f.emoji || "✉️") + '</span>' +
          '<span class="cmp-nm">' + esc(f.short) + '</span>' +
        '</button>').join("") + '</div>' +
      /* 名册之外的人：用户自己填「哪本书里的哪个人物」——
         这两个词会随信上行，服务端靠它现搭这个人物该有的口吻（名册里查不到就现问模型）。 */
      '<div class="cmp-custom">' +
        '<input class="cmp-cs" id="cmpBook" type="text" maxlength="40" placeholder="书名" autocomplete="off">' +
        '<span class="cmp-mid">里的</span>' +
        '<input class="cmp-cs" id="cmpPerson" type="text" maxlength="24" placeholder="人物名" autocomplete="off">' +
      '</div>' +
      '<div class="cmp-hint">名册里没有？填上面两栏，也能写信给他。</div>' +
      '<div class="cmp-sec">写点什么</div>' +
      '<div class="letter-box">' +
        '<textarea class="note-input cmp-input" id="cmpInput" rows="5" maxlength="' + RESP_MAX + '"' +
          ' placeholder="' + esc(composePlaceholder()) + '"></textarea>' +
        '<div class="letter-foot">' +
          '<span class="letter-count"><b id="cmpCount">0</b> / ' + RESP_MAX + '</span>' +
          '<button class="btn-primary cmp-send" id="cmpSend" type="button">寄出</button>' +
        '</div>' +
      '</div>';

    byId("cmpClose").addEventListener("click", closeCompose);
    $$("#composeBody [data-who]").forEach(b => b.addEventListener("click", () => {
      composeFid = b.dataset.who;
      renderCompose();          /* 换人只重画面板：占位符里的称呼得跟着换，自定义那两栏也一并清掉 */
    }));
    /* 自定义那两栏一开写就摘掉名册的选中态 —— 面板里同时只能有一个「收信人」。
       这里**不重画**面板（重画会把光标弄丢），只改选中态与占位符。 */
    ["cmpBook", "cmpPerson"].forEach(id => byId(id).addEventListener("input", () => {
      $$("#composeBody .cmp-chip").forEach(c => c.classList.remove("is-on"));
      byId("cmpInput").setAttribute("placeholder", composePlaceholder());
    }));
    const inp = byId("cmpInput");
    inp.addEventListener("input", () => { byId("cmpCount").textContent = inp.value.length; });
    byId("cmpSend").addEventListener("click", sendLetter);
  }

  /* 撰写框的占位符：名册里的人 → 「想对 上校 说些什么…」；
     自定义两栏都填了 → 带上书名；只填一栏 → 先按「书里的人」兜着（寄出时再拦）。 */
  function composePlaceholder() {
    const bk = byId("cmpBook"), pe = byId("cmpPerson");
    const book = (bk ? bk.value : "").trim();
    const who = (pe ? pe.value : "").trim();
    if (book && who) return "想对 《" + book + "》里的 " + who + " 说些什么…";
    if (book || who) return "想对书里的人说些什么…";
    return "想对 " + figOf(composeFid).short + " 说些什么…";
  }

  /* 寄出 = 只在本地记一封「我写的」，回信留给服务端。
     不在本地塞回信是有意的：一旦本地生成，模型接上之后就会出现
     「同一封信有两个版本」的撕裂，签名表也会来回抖动。 */
  function sendLetter() {
    const inp = byId("cmpInput");
    const text = (inp.value || "").slice(0, RESP_MAX).trim();
    if (!text) { toast("信还是空的"); inp.focus(); return; }
    const bookEl = byId("cmpBook"), whoEl = byId("cmpPerson");
    const book = (bookEl ? bookEl.value : "").trim();
    const who = (whoEl ? whoEl.value : "").trim();
    /* 两栏要么都填（写给名册之外的人），要么都不填（写给名册里的人）——
       只填一栏多半是漏了，拦下来，别给一个残缺的收信人寄信。 */
    if ((book && !who) || (who && !book)) {
      toast(book ? "再填一下人物名" : "再填一下书名");
      (book ? whoEl : bookEl).focus();
      return;
    }
    const rec = {
      /* id 带随机尾巴（同随笔）：rid 由 id 派生，两台设备同毫秒寄信会撞 rid（v1.94 补） */
      id: "L" + Date.now() + Math.random().toString(36).slice(2, 6),
      ts: stampOf(new Date()),
      at: Date.now(),           /* 寄出时刻：服务端按它算"多久之后回信" */
      text: text
    };
    let nm;
    if (book && who) {
      rec.fid = "";             /* 名册之外：fid 留空，靠 book / who 指认 */
      rec.book = book.slice(0, 40);
      rec.who = who.slice(0, 24);
      nm = who;
    } else {
      rec.fid = figOf(composeFid).id;
      nm = figOf(composeFid).short || "TA";
    }
    state.letters.unshift(rec);
    save();
    closeCompose();
    renderInteract();
    if (isSignedIn()) { scheduleSync(); scheduleReplyCheck(); }
    toast("信已寄出 · 等 " + nm + " 的回信");
  }

  /* ---------------------------------------------------------
     8. 书单（#57 起全部由用户自建）
     ---------------------------------------------------------
     原先这里是 4 个预置的策展书单，点开是一篇写死的合辑正文（LIST_PAGES）。
     用户要求开箱无任何预置内容，于是书单也改成自建：新建一册，从书架里挑书收进去，
     名字与简介自己写。数据在 state.booklists，随账号同步到云端 rt_booklists。
     与书目是**弱引用**关系 —— 书单只记 bookIds，书的真身始终在 BOOKS 里，删书不会
     连坐删掉随笔（沿用既有语义），但会把悬空的那一条从书单里摘掉（pruneLists）。
     --------------------------------------------------------- */

  /* 书单配色：由 id 哈希到一条固定色带，不占数据字段、不用跟着上云，
     同一册在任何设备上都是同一个颜色。 */
  const LIST_HUES = [
    ["#12213d", "#3b6ea5"], ["#4a2353", "#9b6bb5"], ["#1f4636", "#5f9e83"],
    ["#5a3320", "#c08a3e"], ["#3b3151", "#7b6bab"], ["#2c4a4a", "#68a0a0"],
    ["#4d2f3c", "#a9707f"], ["#39332c", "#8d7b63"]
  ];
  function listColors(id) {
    const s = String(id || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return LIST_HUES[h % LIST_HUES.length];
  }

  function syncListsFromState() {
    LISTS.length = 0;
    Array.prototype.push.apply(LISTS, state.booklists || []);
    if (draftList) LISTS.push(draftList);   /* 草稿不在 state 里，得单独补回来（见它的声明处） */
  }
  const listOf = id => LISTS.filter(l => l.id === id)[0];
  const listBooks = l => (l.bookIds || []).map(bookOf).filter(Boolean);
  /* 当前摊开的是哪一册 —— 删书导致书目变了要就地重画详情（refreshAfterBookChange）。 */
  let openListId = null;
  /* 详情浮层里「把名字与简介写回去」的那一步。挂在模块级是为了让 closeListSheet
     能直接调它：**不能指望 blur()** —— 按规范 blur() 对未聚焦的元素直接返回、
     连事件都不派发，用户没点过输入框就按 ✕ 的话，刚改的名字会丢。 */
  let listPersist = null;
  /* 刚新建、还没被「认领」的那一册（#172 起；2026-10-10 改成**只在内存里的槽**）。
     createList 摊开详情让人改名，比先弹一个只有输入框的空表单少一步。
     ⚠️ 这一册**不进 state.booklists、也不落盘**，只挂在这个槽里 —— 直到它**真的收到一本书**
     （挑书层「完成」时有勾选 / 自定添加那一刻）才由 claimDraft() 挪进 state。
     ⚠️ #176 用户定：「不管写没写，下拉就该整份取消」—— 所以**改名字 / 写简介都不算认领**，
     写过的字只留在内存那一份里，收起手势一来就跟着整份丢掉。
     ⚠️ #204 起「点过加入书籍」也**不算**认领（此前算）：那一刻卡片会先冒出来、再被挑书层
     的收场判据撤掉，用户看到的就是「闪一下又没了」（2026-10-12 报的那句）。
     现在空书单根本没机会露脸，与 #176「空书单一律留不住」是同一条口径。
     为什么非这样不可（#175，用户 2026-10-10 回访「那个下拉新建书单的问题还是没解决」）：
     落盘 = 进存档 = 跟着上云 = 下次启动会被捡回来。而面板的每一条收起手势
     （下拉 / 点 ✕ / 点底色）都要等滑出动画跑完（drop() 里 +320ms）才执行，这几百
     毫秒里任何一条**离开面板却不走 closeListSheet 的路**都会把这一册留在存档里：
       · 真机上触摸被系统 cancel（键盘收起 / 手势导航）→ 面板弹回去、根本没关，
         用户以为取消过了，随后杀进程或刷新页面；
       · 云端同步正好在这几百毫秒里落一次盘（save() 写的是整个 state）。
     重开就以一张「新书单 · 0 本」的卡片冒出来。不进 state 从根上没有这个问题 ——
     没认领的东西不存在「留在存档里」一说。`_drive_ghost.js` 复现的就是这条
     （旧代码：点完新建一个字没写，存档里就已经多一册；重载后还画出一张卡）。 */
  let draftList = null;

  /* id 单调递增，删掉一册再新建不复用旧 id —— 否则别的设备上那条墓碑会把新书单抹掉。 */
  function nextListId() {
    let mx = 0;
    LISTS.forEach(l => { const m = /^k(\d+)$/.exec(l.id); if (m) mx = Math.max(mx, Number(m[1])); });
    state.listSeq = Math.max(mx, state.listSeq || 0) + 1;
    return "k" + state.listSeq;
  }

  /* 书目被删之后，书单里那一条引用就悬空了 —— 渲染时会跳过它（listBooks 里的 filter），
     这里顺手把数据也摘掉，免得越积越多、还跟着上云。 */
  function pruneLists() {
    let changed = false;
    (state.booklists || []).forEach(l => {
      const before = l.bookIds || [];
      const kept = before.filter(id => !!bookOf(id));
      if (kept.length !== before.length) { l.bookIds = kept; changed = true; }
    });
    return changed;
  }

  function renderLists() {
    /* 重画即收起（#178）：卡片整块重建，旧那层蒙层跟着没了 —— 但 armedListId 还指着
       它，不清掉「点别处收起」就会去查一张已经不在的卡。 */
    disarmList();
    const wrap = byId("bookLists");
    const addBtn = '<button class="list-add" id="listAdd" type="button">' +
      '<span class="list-add-plus" aria-hidden="true">＋</span>新建书单</button>';

    /* ⚠️ 还没认领的草稿**不上卡片**（#172b）—— 面板是滑出动画跑完（drop() 里
       +320ms）才真正收起的，这期间面板背后已经能看见书单页，摆上那张空卡就是
       用户报的「新的书单闪一下再消失」（2026-10-09 追加报的）。
       #175 起更彻底：草稿根本不在 state 里（见 draftList 的声明处），要由 claimDraft()
       挪进 state 才补画。#204 起认领的唯一时点是「这一册收到第一本书」—— 点「加入书籍」
       不再认领，于是连「点过加入书籍再 ✕ 掉」那条路上也不会再闪（2026-10-12 用户报的
       「加入书籍后看到书单短暂出现，再点 ✕ 就没了」）。 */
    const shown = LISTS.filter(l => l !== draftList);

    if (!shown.length) {
      wrap.innerHTML = addBtn +
        '<div class="list-empty">' +
          '<div class="list-empty-t">还没有书单</div>' +
          '<div class="list-empty-s">把同一条航线上的书收进一册 —— 先新建书单，再从书架里挑书。</div>' +
        '</div>';
    } else {
      wrap.innerHTML = addBtn + shown.map(l => {
        const c = listColors(l.id), n = (l.bookIds || []).length;
        /* #201：右上角摆这册第一本书的封面色块（照参考图：书单卡右上一本立着的书）。
           空册 / 书目已删时给一块默认深蓝 —— 视觉锚点不缺席。 */
        const fb = bookOf((l.bookIds || [])[0]);
        const cov = fb ? ("linear-gradient(150deg," + fb.c1 + "," + fb.c2 + ")")
                       : "linear-gradient(150deg,#33518e,#131f3d)";
        return '<div class="list-card" data-list="' + l.id + '"' +
                 ' style="--lc1:' + c[0] + ';--lc2:' + c[1] + '">' +
          '<div class="list-cov" style="background:' + cov + '" aria-hidden="true"></div>' +
          '<div class="list-num">' + n + '<span style="font-size:12px;font-weight:600;opacity:.75"> 本</span></div>' +
          '<div class="list-name">' + esc(l.name) + '</div>' +
          '<div class="list-desc">' + esc(l.desc || "还没有写简介") + '</div>' +
          '<span class="list-open">翻开书单 ▸</span>' +
          /* #178：长按才露出来的那一层 —— 蒙在卡片上、居中摆一枚玻璃「删除书单」。
             平时 pointer-events:none（见 .list-veil），所以点卡片照旧翻开书单。 */
          '<div class="list-veil" aria-hidden="true">' +
            '<button class="list-del" data-del-list="' + l.id + '" type="button">删除书单</button>' +
          '</div>' +
        '</div>';
      }).join("");
    }

    byId("listAdd").addEventListener("click", createList);
    $$("[data-list]", wrap).forEach(el => bindListCard(el));
  }

  /* ---- 长按书单卡片 → 居中的玻璃「删除书单」（#178，用户 2026-10-10 定） ----
     手势沿用 #141 头像看图页那套：按住 450ms 才算数，动了 >10px 算拖不算按，
     弹过之后那一下 click 要吞掉（否则长按完顺手把详情浮层开出来）。
     同一时刻只允许一张卡亮着；灯光取消的入口有三处：点卡片自己 / 点别处 /
     重画（renderLists）—— 见 disarmList 的调用点。 */
  let armedListId = null;
  let listLpTimer = 0, listLpFired = false, listLpPt = null;
  function listLpCancel() { clearTimeout(listLpTimer); listLpTimer = 0; }

  function armList(id) {
    if (armedListId && armedListId !== id) disarmList();
    const el = document.querySelector('.list-card[data-list="' + id + '"]');
    if (!el) return;
    armedListId = id;
    el.classList.add("is-armed");
    if (state.haptic && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
  }

  function disarmList() {
    if (!armedListId) return;
    armedListId = null;
    const el = document.querySelector(".list-card.is-armed");
    if (el) el.classList.remove("is-armed");
  }

  function bindListCard(el) {
    const id = el.dataset.list;
    /* 长按会被系统的「选中文字 / 上下文菜单」抢走（Android WebView 尤其明显） */
    el.addEventListener("contextmenu", e => e.preventDefault());
    el.addEventListener("pointerdown", e => {
      listLpCancel();
      listLpFired = false;
      listLpPt = { x: e.clientX, y: e.clientY };
      listLpTimer = setTimeout(() => {
        listLpFired = true;
        listLpTimer = 0;      /* 已触发：清零，否则 move>10px 走 cancel 是空转、拖走松手后 veil 收不掉 */
        armList(id);
      }, 450);
    });
    el.addEventListener("pointermove", e => {
      if (listLpTimer && listLpPt &&
          (Math.abs(e.clientX - listLpPt.x) > 10 || Math.abs(e.clientY - listLpPt.y) > 10)) listLpCancel();
    });
    el.addEventListener("pointerup", listLpCancel);
    el.addEventListener("pointercancel", listLpCancel);
    el.addEventListener("click", e => {
      /* 长按弹出来的那一下别顺手开详情（同 #141 头像那套） */
      if (listLpFired) { listLpFired = false; e.stopPropagation(); return; }
      /* 删除按钮已经亮着：点卡片 = 先收起来，别把人丢进详情 */
      if (armedListId) { disarmList(); return; }
      openListSheet(id);
    });
    const del = el.querySelector("[data-del-list]");
    if (del) del.addEventListener("click", e => {
      e.stopPropagation();               /* 别让这一下又冒到卡片的 click 上 */
      disarmList();
      deleteList(el.dataset.list);
    });
  }

  /* 手指落在**别处**（别的卡 / 底栏 / 空白）时把删除按钮收起来 —— 它不该挂在那儿等。
     捕获阶段先收，免得同一下又开出一张浮层。 */
  document.addEventListener("pointerdown", e => {
    if (!armedListId) return;
    const el = document.querySelector(".list-card.is-armed");
    if (el && el.contains(e.target)) return;
    disarmList();
  }, true);

  /* 草稿「认领」：从这一刻起它才进 state.booklists —— 于是才落盘、才上云、才在书单页
     上占一张卡（渲染时跳过 draftList，见 renderLists），所以认领必须顺手落盘 + 重画。
     ⚠️ #176 起**只有一个调用点**：用户点「加入书籍」（= 明确要往这一册里收书了）。
     改名字 / 写简介都不认领 —— 下拉（以及 ✕ / 点底色）一律整份取消。 */
  function claimDraft() {
    if (!draftList) return;
    const l = draftList;
    draftList = null;
    state.booklists.unshift(l);
    save();
    syncListsFromState();
    renderLists();
  }

  /* 撤掉「刚由草稿转正、还一本书都没收进来」的那一册（#203）。
     用户 2026-10-12：「点击新建书单以后……我点击加入书籍后，没有加入书籍，书单依旧
     新建成功」——#176 只封住了「认领**前**下拉 = 整份取消」，认领**后**（点过「加入
     书籍」、一本书没加就收场）仍会留一张空卡。这里把那一册连数据带卡片一起撤掉。
     ⚠️ 只认 pickFreshId 指的那一册：**已经建过的空书单**（真给用户留着的）一律不动。
     ⚠️ #204 起还可能是「仍是草稿」的那一份 —— 那种情况它从没进过 state，
       清掉内存槽 draftList 就行（见 draftList 的声明处）。
     ⚠️ 用户手填的「自定添加」书目**不**回滚：那是他自己敲进去的想读书，撤掉等于替他
       删数据（#204 起自定添加当场就把书收进书单、那一册已经不是草稿了，根本走不到这里）。 */
  function dropFreshList(l) {
    if (!l) return;
    if (l === draftList) draftList = null;      /* 还是草稿：从没落过盘，清槽即可 */
    const i = state.booklists.indexOf(l);
    if (i >= 0) state.booklists.splice(i, 1);
    syncListsFromState();
    save();
  }

  /* 新建：摊开详情让用户改名 —— 比先弹一个只有输入框的空表单少一步。
     ⚠️ 这一册**只在内存里**（draftList），不落盘、不进 state：没认领的东西不该进存档
     （见 draftList 的声明处）。#204 起认领 = **这一册收到第一本书**那一刻（claimDraft），
     所以「不写名字直接去加书」这条路照样不丢 —— 点「加入书籍」时它只跟着进挑书层，
     还不是「已建」；
     ⚠️ 只改名字不算认领（#176）—— 下拉照样整份取消。 */
  function createList() {
    /* 上一册草稿要是还挂在槽里（极端路径没走到收起），先丢掉再建：它没被认领过，
       就没写进过任何地方，丢掉不丢东西；留着反而会叠出第二册、或把「新建」一直挡着。 */
    draftList = null;
    const l = { id: nextListId(), name: "新书单", desc: "", bookIds: [], ts: stampOf(new Date()) };
    draftList = l;
    syncListsFromState();   /* listOf / renderLists / openListSheet 都读 LISTS，先把这一册补进去 */
    renderLists();
    openListSheet(l.id);
    /* ⚠️ 必须 preventScroll：此刻详情面板还在 .52s 升起动画的起点（.sheet-body 的
       translateY(100%)），输入框整个在屏幕下方。不带这个参数，浏览器为了「把聚焦的
       元素挪进视野」会去滚最近的可滚动祖先 —— 那是外层画框 .screen（overflow:hidden
       只挡用户手势**不挡程序滚动**）。实测它被滚下去 491px 且不会自己回来：
       整屏错位、面板看着像一片空白，关掉浮层也仍然歪着（#164）。 */
    const nm = byId("lsxName");
    if (nm) { nm.focus({ preventScroll: true }); nm.select(); }
  }

  /* 书单详情：名字与简介就是输入框本身（改完 blur 即存），书目逐行带「移出」。 */
  function openListSheet(id) {
    const l = listOf(id);
    if (!l) return;
    openListId = id;
    const books = listBooks(l);
    const body = byId("listSheetBody");
    body.innerHTML =
      '<div class="sheet-grab"></div>' +
      '<button class="sheet-close" data-close-lsheet type="button">\u2715</button>' +
      '<div class="lsx-fields">' +
        '<input class="lsx-name" id="lsxName" type="text" maxlength="24"' +
          ' placeholder="给这册书单起个名字" value="' + esc(l.name) + '">' +
        '<input class="lsx-desc" id="lsxDesc" type="text" maxlength="60"' +
          ' placeholder="写一句简介（可以留空）" value="' + esc(l.desc || "") + '">' +
        '<div class="lsx-meta" id="lsxMeta">' + books.length + ' 本 · 建于 ' + esc(l.ts || "") + '</div>' +
      '</div>' +
      '<div class="lsx-acts">' +
        '<button class="bs-btn main" id="lsxPick" type="button">加入书籍</button>' +
        '<button class="bs-btn danger" id="lsxDel" type="button">删除书单</button>' +
      '</div>' +
      '<div class="lsx-list">' + (books.length
        ? books.map(b =>
            '<div class="lsx-row" data-lbid="' + b.id + '">' +
              '<div class="lsx-cv">' + coverHTML(b) + '</div>' +
              '<div class="lsx-info">' +
                '<div class="lsx-bt">' + esc(b.title) + '</div>' +
                '<div class="lsx-ba">' + esc(b.author || "佚名") + '</div>' +
              '</div>' +
              '<button class="lsx-x" data-lrm="' + b.id + '" type="button" aria-label="移出书单">\u2715</button>' +
            '</div>').join("")
        : '<div class="lsx-none">这一册还是空的 · 点「加入书籍」从书架里挑</div>') +
      '</div>';

    byId("listSheet").classList.add("is-open");
    byId("listSheet").setAttribute("aria-hidden", "false");

    const nm = byId("lsxName"), ds = byId("lsxDesc");
    const persist = () => {
      const name = (nm.value || "").trim().slice(0, 24) || "新书单";
      const desc = (ds.value || "").trim().slice(0, 60);
      if (name === l.name && desc === (l.desc || "")) return;
      l.name = name;
      l.desc = desc;
      /* ⚠️ 草稿里写名字**不算认领**（#176 用户定：「不管写没写，下拉就该整份取消」）——
         这里只把字写进内存那一份，仍然不落盘、不进 state；点「加入书籍」才是认领
         （lsxPick 那里调 claimDraft，写的字会跟着一起落盘）。 */
      if (l === draftList) return;
      save();
      renderLists();
    };
    listPersist = persist;
    nm.addEventListener("blur", persist);
    ds.addEventListener("blur", persist);

    byId("lsxPick").addEventListener("click", () => {
      /* #203：这一册是不是「由草稿刚转正」的 —— 记下来，整条挑书流程收场时若它还是
         空的就整份撤掉（见 pickFreshId 的声明处与 dropFreshList）。 */
      const wasDraft = (l === draftList);
      persist();
      /* ⚠️ #204 起这里**不再认领**。用户 2026-10-12：「点击新建书单，然后再点击加入书籍后，
         我看到会短暂出现一个书单在页面，然后我再点击右上角那个 x 号，那个书单就没了」——
         认领 = 落盘 + 在书单页上补出卡片，而此刻用户还一本书都没往里放：卡片先冒出来、
         挑书层一收又整份撤掉，看着就是「闪一下又没了」。
         新口径（与 #176「空书单一律留不住」合上）：**收到书才算数** —— 落盘/上卡推迟到
         这一册第一次收到书（「完成」时有勾选、或自定添加那一刻），在那之前它一直只是草稿
         （草稿不落盘、不上卡，见 draftList / renderLists）。
         所以调用 closeListSheet 时要带 keepDraft：不带的话它会按「收起＝取消」把这份草稿
         撤掉，接着 openListPick 找不到这一册、挑书层干脆不弹（点「加入书籍」像没反应）。 */
      pickFreshId = wasDraft ? id : null;
      closeListSheet(true);
      /* 两张浮层的 z-index 同为 40 —— 依次进场，别叠在一起（与书详情 → 编辑同一做法） */
      setTimeout(() => openListPick(id), 300);
    });
    byId("lsxDel").addEventListener("click", () => deleteList(id));

    $$("#listSheetBody [data-lrm]").forEach(el => el.addEventListener("click", () => {
      const bid = el.dataset.lrm;
      l.bookIds = (l.bookIds || []).filter(x => x !== bid);
      save();
      renderLists();
      openListSheet(id);          /* 就地重画，行数/计数/空态都得跟着变 */
    }));
    /* ✕ 只走 #listSheet 上的委托（3479 行那一条）—— 这里再直绑一遍的话，
       每次点 ✕ closeListSheet 跑两遍（靠幂等才没出事，v1.94 去重）。 */
  }

  /* keepDraft：这次收起是「去挑书」而不是「算了」（#204，唯一调用点是 lsxPick）——
     草稿得活着进挑书层，不能被下面那一支按「收起＝取消」撤掉。 */
  function closeListSheet(keepDraft) {
    /* 关闭时补一次落盘：点 ✕ 常常就是「改完名字直接退」。直接调 persist，
       不靠 blur() —— 见 listPersist 的声明处。
       （对已经认领的那一册，persist 把名字/简介写回并落盘；草稿则只写进内存那一份。） */
    if (listPersist) listPersist();
    listPersist = null;
    const l = openListId ? listOf(openListId) : null;
    if (!keepDraft && l && l === draftList) {
      /* 还没认领的草稿：收起手势（下拉 / 点 ✕ / 点底色）一律**整份取消** —— #176 用户定：
         「不管写没写，下拉就该整份取消」，所以名字 / 简介里写过的字一并丢掉，不再按
         「写过字就留下」分情况（那是 #172 的旧口径）。
         它从没进过 state（见 draftList 的声明处），这里**没有「撤数据」这一步** ——
         清掉内存槽就行，存档与云端从头到尾不知道有过它。
         ⚠️ 能留下来的唯一一条路是**收到书**（挑书层「完成」时有勾选 / 自定添加那一刻，
         由 claimDraft 转正，见 #204 起 lsxPick 的注释）—— 那时它已经不在 draftList 上了，
         走不到这一支。
         ⚠️ 清槽之后必须重画：LISTS 里少了这一册，卡片与空态都得跟着变
         （draftList 不在 state 里，重画时它本来就被跳过，所以这里不会先画再撤）。 */
      draftList = null;
      syncListsFromState();
      renderLists();
    }
    byId("listSheet").classList.remove("is-open");
    byId("listSheet").setAttribute("aria-hidden", "true");
    openListId = null;
  }

  function deleteList(id) {
    const l = listOf(id);
    if (!l) return;
    /* 破坏性操作用浅红底按钮（.bs-btn.danger，与书籍详情页的「删除」同一范式），
       确认走应用内弹窗（#62）—— 原先这里是 window.confirm，在 App 里是系统蓝字弹窗。
       弹窗期间用户动不了列表本身，但 then 回来仍按 id 重查一遍（cur）：
       弹窗开着时云端墓碑可能刚好把这册删掉。 */
    askConfirm({
      title: "删掉这册书单？",
      body: "《" + l.name + "》会从书单里移走。\n\n只删这一册书单，里面的书还在书架上，你的随笔也不受影响。",
      ok: "删除", danger: true
    }).then(ok => {
      if (!ok) return;
      const cur = listOf(id) || l;
      const isDraft = cur === draftList;
      if (isDraft) draftList = null;
      else {
        const i = state.booklists.indexOf(cur);
        if (i >= 0) state.booklists.splice(i, 1);
      }
      if (isDraft) syncListsFromState();   /* 草稿不在 state 里：只需重灌工作副本 */
      save();
      syncListsFromState();
      closeListSheet();
      renderLists();
      toast("已删除书单《" + l.name + "》");
    });
  }

  /* 从书架挑书：勾选式的清单，一次改完。书架上没有的书也能**自定添加**（#202）：
     手填书名/作者，按「想读」记进书目（不占书架层位，想转正在书籍详情里改），
     加完当场勾上 —— 完成「加入书籍」这一步不再受限于书架里已有的那几本。 */
  let pickingListId = null;
  /* #203/#204：「加入书籍」那一刻**还是草稿**的那一册（本来就在 state 里的老书单 → null）。
     整条挑书流程收场（完成 / ✕ / 点底色 / 下拉）时它若还是一本书都没收进来，就整份
     丢掉 —— 见 dropFreshList 的注释（用户报的「没有加入书籍，书单依旧新建成功」）。
     ⚠️ #204 起挑书期间它**一直是草稿**（认领推迟到收到第一本书那一刻），所以空册收场
     只是清个内存槽，存档从头到尾不知道有过它。 */
  let pickFreshId = null;
  function openListPick(id) {
    const l = listOf(id);
    if (!l) return;
    pickingListId = id;
    const has = {};
    (l.bookIds || []).forEach(x => { has[x] = 1; });
    byId("listPickBody").innerHTML =
      '<div class="sheet-grab"></div>' +
      '<button class="sheet-close" data-close-lpick type="button">\u2715</button>' +
      '<div class="bed-head">' +
        '<div class="bed-title">加入书籍</div>' +
        '<div class="bed-sub">选中的会收进《' + esc(l.name) + '》</div>' +
      '</div>' +
      '<div class="lpk-new">' +
        '<button class="lpk-new-tog" id="lpkNewTog" type="button">＋ 自定添加书籍（书架上没有也行）</button>' +
        '<div class="lpk-new-form" id="lpkNewForm">' +
          '<input class="bed-in" id="lpkNewTitle" type="text" maxlength="24" placeholder="书名（必填）" autocomplete="off">' +
          '<input class="bed-in" id="lpkNewAuthor" type="text" maxlength="24" placeholder="作者（可留空）" autocomplete="off">' +
          '<button class="lpk-new-go" id="lpkNewGo" type="button">添加进书单</button>' +
          '<div class="lpk-new-hint">随手加的书按「想读」记 —— 不占书架，收进书单后在书籍详情里可再改。</div>' +
        '</div>' +
      '</div>' +
      (BOOKS.length
        ? '<div class="lpk-list">' + BOOKS.map(b =>
            '<label class="lpk-row">' +
              '<input type="checkbox" data-lpk="' + b.id + '"' + (has[b.id] ? " checked" : "") + '>' +
              '<span class="lpk-cv">' + coverHTML(b) + '</span>' +
              '<span class="lpk-info"><b>' + esc(b.title) + '</b>' +
                '<i>' + esc(b.author || "佚名") + ' · ' + esc(STATUS[b.status] || "") + '</i></span>' +
            '</label>').join("") + '</div>'
        : '<div class="lsx-none" id="lpkNone">书架还是空的 · 点上面「自定添加」手填一本，或先去书架添书</div>') +
      '<div class="bed-acts">' +
        '<button class="bed-btn main" id="lpkSave" type="button">完成</button>' +
      '</div>';
    byId("listPick").classList.add("is-open");
    byId("listPick").setAttribute("aria-hidden", "false");

    /* 自定添加：展开/收起手填表 */
    byId("lpkNewTog").addEventListener("click", () => {
      const f = byId("lpkNewForm");
      const open = f.classList.toggle("is-open");
      if (open) byId("lpkNewTitle").focus({ preventScroll: true });
    });
    byId("lpkNewGo").addEventListener("click", addCustomToList);

    byId("lpkSave").addEventListener("click", () => {
      /* 落库前按 id 重查：层开着的时候云端墓碑可能已把这册删掉 —— 闭包里那份 l
         是孤儿，写它等于白写，用户还以为勾选保存了（v1.94 修复）。 */
      const cur = listOf(pickingListId);
      if (!cur) {
        closeListPick();
        renderLists();
        toast("这册书单刚被删除了");
        return;
      }
      const keep = {};
      $$("#listPickBody [data-lpk]").forEach(el => { if (el.checked) keep[el.dataset.lpk] = 1; });
      /* 按书架顺序落库，而不是勾选顺序 —— 这样同一册书单在两台设备上顺序一致 */
      cur.bookIds = BOOKS.filter(b => keep[b.id]).map(b => b.id);
      pickFreshId = null;
      /* #204：这一册**还是草稿**（点「加入书籍」之后一直没收到书）—— 「完成」这一下就是
         它的判决：收着书了才认领落盘 + 上卡；一本没勾就整份丢掉（#176 起「空书单一律
         留不住」，也就是用户报的「没有加入书籍，书单依旧新建成功」）。 */
      if (cur === draftList) {
        if (!cur.bookIds.length) {
          draftList = null;
          syncListsFromState();
          renderLists();
          closeListPick();
          toast("一本书都没选，这一册没建");
          return;
        }
        claimDraft();            /* 落盘 + 补出它那张卡 */
        closeListPick();
        setTimeout(() => openListSheet(cur.id), 300);
        return;
      }
      save();
      renderLists();
      closeListPick();
      setTimeout(() => openListSheet(cur.id), 300);
    });
  }

  /* 自定添加落库（#202）：新书按「想读」进书目（书架放不下它，也不该占层位 ——
     想读的不上架是书架的既有语义），配色沿 saveBookEdit 同一排色轮；
     存档配额满同样整本回滚。加完把行**当场插进勾选清单最上面、勾上**：
     表单不清、焦点回书名框 —— 用户多半要连加几本，别让他一层层重开。 */
  function addCustomToList() {
    const cur = listOf(pickingListId);
    if (!cur) {
      closeListPick();
      renderLists();
      toast("这册书单刚被删除了");
      return;
    }
    const tin = byId("lpkNewTitle"), ain = byId("lpkNewAuthor");
    const title = ((tin && tin.value) || "").trim().slice(0, 24);
    if (!title) { toast("先给这本书起个名字"); return; }
    const author = ((ain && ain.value) || "").trim().slice(0, 24);
    const hues = COVER_HUES[BOOKS.length % COVER_HUES.length];
    const nb = { id: nextBookId(), title: title, author: author || "佚名", status: "wish",
                 rate: 0, c1: hues[0], c2: hues[1] };
    BOOKS.unshift(nb);
    state.books = BOOKS.slice();
    if (!save()) {
      BOOKS.shift();
      state.books = BOOKS.slice();
      Repo.write(state);
      toast("本机存不下这一本了 —— 先删掉几本再试");
      return;
    }
    refreshAfterBookChange();     /* 书单卡上的书目数、各页计数跟着真数据走 */
    /* #204：手填的这本**当场收进书单**（那句 toast 本来就是这么说的：「已收进《X》」）——
       顺带把草稿认领落盘：他给这一册放进第一本书了，这一册从这一刻起就是真的，
       后面挑书层再 ✕ / 下拉也不会把它带走（#203 那套「收场时看是否空册」的判据因此
       不适用了：那时它已经不在 draftList 上、也不是 pickFreshId 指向的空册）。 */
    cur.bookIds = (cur.bookIds || []).concat([nb.id]);
    if (cur === draftList) { pickFreshId = null; claimDraft(); }
    else save();
    const row = '<label class="lpk-row">' +
      '<input type="checkbox" data-lpk="' + nb.id + '" checked>' +
      '<span class="lpk-cv">' + coverHTML(nb) + '</span>' +
      '<span class="lpk-info"><b>' + esc(nb.title) + '</b>' +
        '<i>' + esc(nb.author) + ' · ' + esc(STATUS[nb.status] || "") + '</i></span>' +
      '</label>';
    const listEl = $("#listPickBody .lpk-list");
    const none = byId("lpkNone");
    if (listEl) listEl.insertAdjacentHTML("afterbegin", row);
    else if (none) {
      none.insertAdjacentHTML("afterend", '<div class="lpk-list">' + row + '</div>');
      none.remove();
    }
    if (tin) tin.value = "";
    if (ain) ain.value = "";
    if (tin) tin.focus({ preventScroll: true });
    toast("《" + title + "》已收进《" + cur.name + "》");
  }

  /* 取消选书：收起挑书层，回到那册书单的详情 —— 别把用户丢在书单页上，
     他刚才还在改名字。
     #203：若这一册是「加入书籍」时那份还没收到书的草稿，那就不是「回详情接着改」，
     而是整份丢掉 —— 撤掉它、留在书单页（回详情也没东西可改，那一册已经没了）。
     #204 起这份草稿**只在内存里**（没落过盘、也没上过卡），所以「撤掉」= 清槽，
     用户从头到尾就没在页面上见过它（不再有「闪一下又没了」）。 */
  function cancelListPick() {
    const id = pickingListId;
    const fresh = (id === pickFreshId);
    const l = id ? listOf(id) : null;
    pickFreshId = null;
    closeListPick();
    if (fresh && l && !(l.bookIds || []).length) {
      dropFreshList(l);
      renderLists();
      toast("一本书都没选，这一册没建");
      return;
    }
    if (id) setTimeout(() => openListSheet(id), 300);
  }

  function closeListPick() {
    byId("listPick").classList.remove("is-open");
    byId("listPick").setAttribute("aria-hidden", "true");
    pickingListId = null;
  }

  /* 点浮层底色关闭。✕ 与底色走同一个动作（与书籍详情同一做法）：
     详情层的 ✕ / 底色都是「收起并保存」，挑书层的是「取消，回到详情」。 */
  byId("listSheet").addEventListener("click", e => {
    if (e.target.hasAttribute && e.target.hasAttribute("data-close-lsheet")) closeListSheet();
  });
  byId("listPick").addEventListener("click", e => {
    if (e.target.hasAttribute && e.target.hasAttribute("data-close-lpick")) cancelListPick();
  });

  /* ---------------------------------------------------------
     9. 我的 · 设置
     --------------------------------------------------------- */
  /* pad2 统一用文件上方「工具 & 状态」区那份实现（`(v<10?"0":"")+v`，ES5 可用）。
     这里曾有一份用 String.padStart 的重复定义，与上面那份**同名、同处一个 IIFE 作用域**，
     函数声明提升后它会**覆盖**前者 —— 于是 keyOf() / stampOf() 这些渲染主路径也依赖
     padStart（ES2017 / Chromium 57+），在更老的 WebView 上抛 TypeError，直接中断
     日记 / 日历的渲染（不是"状态栏时间不走"这种小毛病）。
     两版输出完全一致（v<10 补零，v≥10 原样），删掉这份没有任何行为变化。 */

  /* 只负责设备顶部状态栏的时间走动。
     这里原先还兼管「世界时钟」卡片（ZONES / zoneHour / renderClockRows 已随卡片一并删除，见工作日志 #23）。 */
  function tickStatusTime() {
    const now = new Date();
    const el = byId("stTime");
    const s = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
    /* 同值不写：textContent 每秒白写一次也会让这行invalidate —— 分钟才翻一次 */
    if (el && el.textContent !== s) el.textContent = s;
  }

  /* `when` 决定这一行在当前状态下是否出现（账号相关的三行随登录态增删）。
     退出登录与注销账号是两件事：前者只清本机缓存，后者连云端一起删。

     #62 精简：未登录时 10 行 → 7 行。撤掉的四项及去向 ——
       · 轻触反馈    开关撤下（轻触震动本身保留，按存档里的值走，默认开）
       · 导入阅读数据 功能整体去掉，见上面 importData 处的说明
       · 用户协议    并入「隐私与协议」页，页内分段切换
     #132 增删：「翻页音效」开关整行撤下（音效本身一并撤，beep() 已删；
       state.sound 字段保留只为云端 prefs / 导出 JSON 口径不变）；
       「导出阅读数据」行移进「关于阅迹」浮层（行文案不变，verify_books /
       verify_lists 改从浮层里找行）；新增「关于阅迹」行（openAboutSheet）。

     iOS 化（方案预览-我的页-iOS化建议）：列表画成「偏好 / 账号与数据」两组，
     危险区两行各自成卡（红字、无图标无箭头 —— 红色本身就是全部强调）。
     行文案被多处探针按字符串找行（verify_confirm C3 的 rowByLab、
     verify_update / verify_noseed / verify_v14_fix），改名要连探针一起改；
     verify_account 的行数断言 #132 起未登录为 6 行；第一个 .set-row .switch
     必须仍是「深色模式」（verify_account E 抓它切主题；verify_covers90 的
     存档回弹检查 #132 起也点它 —— 原来点的「翻页音效」行已撤）。
     蓝色图标底改走 var(--blue)：原先写死的 #0071e3 是全局之外的第三个蓝，
     深色模式也不会跟着翻。 */
  const SETTINGS = [
    { key: "theme", ico: "◐", c: "#1c1c1e", lab: "深色模式", get: () => state.theme === "dark", set: v => setTheme(v ? "dark" : "light") },
    { key: "update", ico: "↑", c: "var(--blue)", lab: "检查更新", val: updRowText, act: function () { checkUpdate(true); } },
    { key: "about", ico: "阅", c: "#5a4632", lab: "关于阅迹", val: function () { return localVer ? "v" + localVer : ""; }, act: openAboutSheet },
    { key: "login", ico: "⇢", c: "var(--blue)", lab: "登录 / 注册", when: () => !isSignedIn(), val: "邮箱", act: function () { openAuth("login"); } },
    /* #171：本机免密（开关状态 = 本机此刻真有凭据）+ 恢复码可重签（原先只在注册时露一次） */
    { key: "device", ico: "◉", c: "var(--green)", lab: "本机免密登录", when: isSignedIn, get: hasDevice, set: toggleDevice },
    { key: "rotate", ico: "⟲", c: "var(--blue)", lab: "重新生成恢复码", when: isSignedIn, act: function () { openAuth("rotate"); } },
    { key: "logout", lab: "退出登录", danger: true, when: isSignedIn, act: askLogout },
    { key: "legal", ico: "◈", c: "#5e5ce6", lab: "隐私与协议", act: function () { openLegal("privacy"); } },
    { key: "nuke", lab: "注销账号", danger: true, when: isSignedIn, act: confirmDeleteAccount },
    { key: "reset", ico: "⟳", c: "#ff9f0a", lab: "清空我的数据", act: resetData }
  ];

  /* 分组只管排布：按 key 取 SETTINGS 里的行，when 过滤后空组整组不画 */
  const ME_GROUPS = [
    { ttl: "偏好", keys: ["theme"] },
    { ttl: "账号与数据", keys: ["login", "rotate", "device", "update", "about", "legal", "reset"] }
  ];

  function renderSettings() {
    const byKey = {};
    SETTINGS.forEach(s => { byKey[s.key] = s; });
    /* vis 是本次真的画出来的行，按 DOM 顺序 —— 开关与行点击都按它的下标找 */
    const vis = [];
    const rowHtml = s => {
      const i = vis.push(s) - 1;
      if (s.danger)
        return '<div class="set-row is-danger" data-act="' + i + '"><span class="set-lab">' + s.lab + '</span></div>';
      /* val 允许是函数：版本号这类每次渲染都可能变的值不能写死 */
      const val = typeof s.val === "function" ? s.val() : s.val;
      return '<div class="set-row" data-act="' + i + '">' +
        '<span class="set-ico" style="background:' + s.c + '">' + s.ico + '</span>' +
        '<span class="set-lab">' + s.lab + '</span>' +
        (val ? '<span class="set-val">' + val + '</span>' : "") +
        (s.get
          ? '<button class="switch' + (s.get() ? " is-on" : "") + '" data-set="' + i + '" type="button" aria-label="' + s.lab + '"></button>'
          : '<span class="set-val is-chev">›</span>') +
      '</div>';
    };
    let html = "";
    ME_GROUPS.forEach(g => {
      const rows = g.keys.map(k => byKey[k]).filter(s => s && (!s.when || s.when()));
      if (!rows.length) return;
      html += '<div class="me-gttl">' + g.ttl + '</div>' +
              '<div class="me-card"><div class="set-list">' + rows.map(rowHtml).join("") + '</div></div>';
    });
    SETTINGS.filter(s => s.danger && (!s.when || s.when()))
      .forEach(s => { html += '<div class="me-card is-danger"><div class="set-list">' + rowHtml(s) + '</div></div>'; });
    byId("setList").innerHTML = html;

    $$("[data-set]").forEach(el => el.addEventListener("click", () => {
      const s = vis[+el.dataset.set];
      const next = !el.classList.contains("is-on");
      s.set(next);
      el.classList.toggle("is-on", next);
    }));
    $$("#setList .set-row").forEach(row => {
      const s = vis[+row.dataset.act];
      if (s && s.act) row.addEventListener("click", () => s.act());
    });
  }

  /* 阅读足迹（#136）：全部实算，一处到底 —— 日记累计（日记正文字数）+ 篇日记 / 本书 /
     封信 / 册书单 四个计数（原独立「数据带」并入；那时「本书」与足迹的「在读+读完」是同一批
     书算两遍，用户点名重复）。点格子跳对应页，改完书 / 写完随笔进「我的」当场跟上。
     不放假数据、不加字段。 */
  function renderFootprint() {
    const wrap = byId("meFoot");
    if (!wrap) return;
    let chars = 0;
    state.notes.forEach(n => { chars += String(n.text || "").length; });
    /* 万字向上模糊到一位小数：12480 → 1.2 万；十万位起不带小数 */
    const wan = chars >= 10000 ? (chars / 10000).toFixed(chars >= 100000 ? 0 : 1).replace(/\.0$/, "") : "";
    const charTxt = wan ? wan + "<i>万字</i>" : chars + "<i>字</i>";
    const cells = [
      { wide: 1, tab: "record", dot: "var(--blue)", txt: charTxt, lab: "日记累计" },
      { tab: "record", dot: "var(--amber)", txt: state.notes.length, lab: "篇日记" },
      { tab: "shelf", dot: "var(--green)", txt: BOOKS.length, lab: "本书" },
      { tab: "interact", dot: "var(--purple)", txt: state.letters.length, lab: "封信" },
      { tab: "booklist", dot: "var(--teal)", txt: (state.booklists || []).length, lab: "册书单" }
    ];
    wrap.innerHTML =
      '<div class="me-gttl">阅读足迹</div>' +
      '<div class="me-foot">' +
        cells.map(c =>
          '<button class="me-fc' + (c.wide ? " is-wide" : "") + '" data-tab="' + c.tab + '" type="button" aria-label="' + c.lab + " " + String(c.txt).replace(/<[^>]*>/g, "") + '">' +
            '<span class="fdot" style="background:' + c.dot + '"></span>' +
            '<b>' + c.txt + '</b><span>' + c.lab + '</span>' +
          '</button>').join("") +
      '</div>';
  }

  function setTheme(t) {
    const changed = state.theme !== t;   /* 冷启动 init 调它时值相同：别白写一次盘（v1.94） */
    state.theme = t;
    document.body.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#000000" : "#f7f6f3");
    syncNativeStatusBar(t);   /* 原生壳里让系统状态栏跟着换底色与图标色 */
    /* #69：把主题落到原生 SharedPreferences —— 下次冷启动 MainActivity 在
       super.onCreate 之前读它，深色主题的开屏底色就能跟上来（网页版无此插件，跳过）。 */
    try {
      const TS = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ThemeStore;
      if (TS && TS.set) TS.set({ theme: t });
    } catch (e) { /* 网页版 / 插件未就绪：忽略 */ }
    if (changed) save();
  }

  function exportData() {
    /* 「导出全部数据」—— 与隐私政策里的措辞对齐：随笔、信件、书目、书单，
       以及主题 / 音效 / 触感三项设置，一个都不落。
       原先只导 books + notes，信件与设置会丢，和隐私政策写的「导出全部数据」对不上。
       （miss 是碑林时代的「想你了」计数，#77 起没人再写它，但存档里可能还有旧值，
         照旧导出 —— 导出的是用户的数据，不是当前 UI 认不认。） */
    const data = {
      app: "阅迹 ReadTrace",
      schema: 3,
      exportAt: new Date().toISOString(),
      books: BOOKS,
      notes: state.notes,
      letters: state.letters,
      miss: state.miss,
      booklists: state.booklists || [],
      settings: { theme: state.theme, sound: !!state.sound, haptic: !!state.haptic },
      profile: profile ? { signature: profile.signature || "", avatar: profile.avatar || "" } : null
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "readtrace-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast("已导出全部数据");
  }

  /* 导入（#62 整体撤掉）：原先有「导入阅读数据」一行 + 隐藏的 #importFile，
     把一份 JSON 备份整体还原（含 settings 与 booklists）。
     撤掉的原因：用户明确不要这个功能，设置页也因此少一行。
     顺带删掉的：pickImport()、#importFile 的 change 监听、index.html 里那个隐藏 input。
     保留的：exportData 原样（导出仍是刚需），以及 importData 里用到的各渲染函数。
     ⚠️ 别把它当「临时隐藏」再加回来 —— 加回来要连带补回 input、监听与探针。 */

  /* 「清空我的数据」—— 原先叫「重置示例数据」（把书架与随笔还原成预置那批）。
     种子退役后没有"示例"可还原，语义改成清空：书、随笔、书单与往来信件全清掉。
     （#77 起碑林与「想你了」计数都没了，提示文案里的「碑信」也跟着改成「信件」。）
     破坏性操作，所以要点两次：第一次只提示，5 秒内再点一次才真清 —— 比弹一个
     自制确认层省事，也不会误触。 */
  let resetArmed = 0;
  function resetData() {
    const now = Date.now();
    if (!resetArmed || now - resetArmed > 5000) {
      resetArmed = now;
      toast("会删掉全部书、随笔、书单与信件 —— 5 秒内再点一次确认");
      return;
    }
    resetArmed = 0;
    state.notes = [];
    state.miss = {};
    state.letters = [];
    BOOKS.length = 0;
    state.books = [];
    /* 书单跟着一起清 —— 它们的 bookIds 全都指向刚被删掉的书，留着只会剩一堆空壳。 */
    LISTS.length = 0;
    state.booklists = [];
    /* 书单相关的内存槽一并清掉：未认领草稿（draftList）要是留着，
       下一次 syncListsFromState 会把它重新 push 回 LISTS —— 刚清空的状态里
       又冒出一册幽灵书单（v1.94 补）。 */
    draftList = null;
    openListId = null;
    pickingListId = null;
    save();
    renderRecord();
    renderShelf();
    renderInteract();
    renderLists();
    renderFootprint();  /* 入口就在「我的」页：足迹五格当场归零，不等切页（v1.94 补） */
    closeCompose();     /* #77：碑林浮层没了，这里关的是写信面板 */
    toast("已清空：书、随笔、书单与信件都没了");
  }

  /* beep() 已随「翻页音效」撤下（#132）：设置里不再有开关，翻页 / 寄信也不再发声。
     state.sound 字段保留 —— 云端 prefs 与导出 JSON 的口径不变（verify_books N 断言它
     仍是 boolean），老存档里的 true 只是不再被任何地方读到。 */

  /* ---------------------------------------------------------
     10. Tab 切换
     --------------------------------------------------------- */
  let currentTab = "shelf";

  /* #191：`syncFabs()` 连同两颗悬浮加号一起删了 —— 新增入口现在各自长在各自页头里
     （书架 #shNew / 互动 #ltNew / 记录页 #tlNew），不再需要「按 currentTab 互斥点亮」，
     也就不再需要「首屏不走 switchTab、得在 init() 里补调一次」那套补丁。 */

  function switchTab(name) {
    if (currentTab === name) return;
    currentTab = name;
    disarmList();   /* #178：长按亮着的「删除书单」不跟着跨页 —— 离开书单页就收起 */
    disarmSpine();  /* #200：书脊长按亮出的玻璃「删除」同理，不跟着跨页 */
    $$(".tab").forEach(t => t.classList.toggle("is-on", t.dataset.tab === name));
    $$(".page").forEach(p => p.classList.toggle("is-active", p.dataset.page === name));
    syncNativeStatusBar(state.theme);   /* #185：换页了，屏顶那一条的底色也跟着换（「我的」页是香槟金） */
    if (name === "record") renderRecord();
    if (name === "interact") renderInteract();
    if (name === "me") renderFootprint();   /* 每次进「我的」都重算足迹计数，不放假数据 */
    if (state.haptic && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
  }

  byId("tabbar").addEventListener("click", e => {
    const btn = e.target.closest(".tab");
    if (btn) switchTab(btn.dataset.tab);
  });

  /* 底栏是浮在页面之上的一层：手指落在它上面上下滑，浏览器不会把滚动转交下去
     （底栏自己不可滚，它下面那个 .page 也不在它的祖先链上），于是「在底栏上划
     不动内容」。这里手动把垂直位移转给当前页：位移量按手指走，方向与「拖内容」
     一致（手指下滑 → 内容跟着下来 → scrollTop 减小）。
     只认垂直分量 —— 横向一律不碰，那是点击与将来的 tab 滑动的地盘。 */
  (function () {
    let sy = 0, sx = 0, target = null;
    const bar = byId("tabbar");
    bar.addEventListener("touchstart", e => {
      if (e.touches.length !== 1) { target = null; return; }
      sy = e.touches[0].clientY; sx = e.touches[0].clientX;
      target = $(".page.is-active");
    }, { passive: true });
    bar.addEventListener("touchmove", e => {
      if (!target || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - sy;
      const dx = e.touches[0].clientX - sx;
      if (Math.abs(dy) <= Math.abs(dx)) return;
      target.scrollTop -= dy;
      sy = e.touches[0].clientY; sx = e.touches[0].clientX;
    }, { passive: true });
    bar.addEventListener("touchend", () => { target = null; }, { passive: true });
    bar.addEventListener("touchcancel", () => { target = null; }, { passive: true });
  })();

  /* 11. 翻页阅读器（整节删除）
     阅迹是「读书记录」，不是阅读器 —— pgHTML / openReader / flip / updateReaderBar
     以及 #reader 的翻页手势与左右方向键全部随「翻开这本书」一起下线。
     ⚠️ 别加回：书目已不带正文，没有任何入口能再打开它。 */

  /* 12. 每本书的启动动画 · 文字粒子汇聚（整节删除）
     原先「翻开这本书」会先播一段粒子开场（playParticles / afterParticles +
     #particles）。入口没了，这节与那段 DOM 一并删除。 */

  /* 全局快捷键。原先这里还有 ⌘K/Ctrl+K 打开命令面板（原第 13 节），
     #58 随搜索框一并删除 —— 它唯一的点击入口就是书架页那个搜索框，
     手机上够不着，留着只是一段永远跑不到的死代码。
     Esc 与 Android 返回键**走同一张层表**（#179）—— 以前这里手写
     `closeSheet(); closeComposer();`，只认书籍详情与写日记抽屉：在「添加一本书」
     上按 Esc 同样毫无反应（与返回键那次漏接是同一个缺口，只是没人报）。
     接管到 closeTopOverlay() 后，新增浮层只要进了那张表，两个入口一起生效。 */
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") closeTopOverlay();
  });

  /* ---------------------------------------------------------
     13. 启动页 & 初始化
     ---------------------------------------------------------
     启动页的画面就是**一张静止的封面** assets/cover.png（#49 起换掉了 boot.mp4）。
     原先那段 <video> 的自动起播 / 切后台暂停逻辑随之删净 —— 入场动画只剩
     CSS 的 coverIn 缩放与文案淡入，不需要脚本参与解码。 */
  /* 启动遮罩跟主题（#68 起不再恒浅色）：底色统一读 --boot-bg（浅 = --cover-bg，
     深 = --bg，见 styles.css）—— 与系统开屏的 splashBackground（含 values-night）、
     .launch、#bootveil 同一来源。状态栏底色与图标风格随之切换。
     ⚠️ 本函数体里不许出现写死的 hex 色值（verify_palette 会拦）——兜底走 coverBg()。 */
  function coverBg() {
    let v = "";
    try {
      v = getComputedStyle(document.documentElement)
        .getPropertyValue("--cover-bg").trim();
    } catch (e) { /* 忽略 */ }
    return v || "#e9dec6";
  }

  function bootBg() {
    let v = "";
    try {
      v = getComputedStyle(document.documentElement)
        .getPropertyValue("--boot-bg").trim();
    } catch (e) { /* 忽略 */ }
    return v || coverBg();
  }

  function syncLaunchStatusBar() {
    if (!isNativeShell()) return;
    const P = window.Capacitor && window.Capacitor.Plugins;
    const sb = P && P.StatusBar;
    if (!sb) return;
    try {
      /* 开屏这一条也走同一条路（#186）：封面底色 + 按亮度定图标 —— 自画的色条在
         Android 15 上才是唯一有效的那条，开屏那一下它也得跟封面对上 */
      applyStatusBar(bootBg(), sb, P);
    } catch (e) { /* 插件未就绪 / 网页版：静默放过，默认样式本身也是对的 */ }
  }

  /* 「进过一次」的标记（#64）。**独立于存档单独存一个键** ——
     退出登录（doLogout 会清 STORE_KEY / SIG_KEY）与「清空我的数据」都不该把它抹掉，
     否则每退一次登录都要重放一遍欢迎页。 */
  const ENTERED_KEY = "readtrace.entered";
  function hasEntered() {
    try { return localStorage.getItem(ENTERED_KEY) === "1"; } catch (e) { return false; }
  }

  function enterApp() {
    const l = byId("launch");
    /* 真正「进过一次」才算数：写在点击里，而不是开机就写。
       用户若从没点过（一直停在封面），下次打开仍应看到封面。 */
    try { localStorage.setItem(ENTERED_KEY, "1"); } catch (e) {}
    /* 先让主界面完成一次栅格化，再开始淡出。
       启动层是不透明的整屏层，会**推迟**下面主界面的栅格化（Chromium 对完全被
       遮挡的内容不做栅格化）。若直接淡出，就会出现「一边淡出、一边才栅格化」的
       一两帧低清 —— 观感正是「点进去糊一下、不跟手」。
       这里先把不透明度压到 0.999：肉眼无色差，但已不算「完全遮挡」，合成器必须
       把主界面栅格化出来；隔两帧再走正常的 0.7s 淡出，那时下层已经就绪。
       （`.pg-head` 的 backdrop-filter:blur(36px) 是首帧最贵的一笔，全靠这招避开。） */
    l.style.opacity = "0.999";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      l.style.opacity = "";          /* 必须先清内联值，否则它会压过 .is-gone 的 opacity:0 */
      l.classList.add("is-gone");
    }));
    syncNativeStatusBar(state.theme);   /* #185：把状态栏交回「屏顶那一条」（封面此时已 is-gone，让位给下面那一页） */
    setTimeout(() => { l.style.display = "none"; }, 900);   /* 800 + 预热的两帧余量 */
    /* #130：未登录 → 淡出中途把登录门拉起来（z 76 在封面 90 之下，
       封面褪去正好露出门口）。立即开会让键盘抢在封面退场前弹起，等 450ms。 */
    if (!Cloud.signedIn()) {
      setTimeout(() => { if (!Cloud.signedIn() && !obdOpen) obdOpenGate(); }, 450);
    }
  }
  byId("launchBtn").addEventListener("click", enterApp);
  byId("launchSkip").addEventListener("click", enterApp);

  /* #109：首帧就绪条件。老用户路径上，主界面在 bootveil 之下排版，但有两件事
     天然发生在「揭幕之后」，观感就是界面出来了还在变：
       ① 字体按 font-display:swap 后装 —— 整屏文字先系统字体后 HarmonyOS 地
          「变一次脸」（#109 同批已把全量 16MB 字体裁成 2×1.8MB 子集，换装更早）；
       ② hydrateCovers() 从 IndexedDB 补回封面后把四个页面各重渲一次，封面后弹出。
     这里把揭幕条件从「两帧预热」升级成「字体装载完 + 封面补齐，再两帧」，第一次
     露面即完成态。兜底 1500ms：慢机器 / FontFaceSet 缺失时绝不拖死首帧（那两下
     「补拍」退化回 #68 当时的样子，而不是黑屏）。 */
  let coversSettled = null;      /* init() 末尾接住 hydrateCovers() 的 promise */
  function fontsSettled() {
    try {
      const F = document.fonts;
      if (!F) return Promise.resolve();
      const wants = [];
      if (F.load) {
        wants.push(F.load('400 16px "HarmonyOS Sans SC"'));
        wants.push(F.load('500 16px "HarmonyOS Sans SC"'));
      }
      if (F.ready) wants.push(F.ready);
      return Promise.all(wants).then(function () {}, function () {});
    } catch (e) { return Promise.resolve(); }
  }
  function bootSettled() {
    const parts = [fontsSettled()];
    if (coversSettled) parts.push(coversSettled);
    const cap = new Promise(function (res) { setTimeout(res, 1500); });
    return Promise.race([Promise.all(parts).then(function () {}, function () {}), cap]);
  }

  /* #110：交还原生开屏。launchAutoHide:false 后开屏不再定时自退 —— 由网页在
     「底下已经有同色内容顶着」的时机调 hide() 让它淡出，根治「开屏先撤、露出另一色
     的窗口背景，网页首帧又顶回来」的来回闪色。网页版 / 探针桩没有插件，静默跳过；
     hide() 幂等，重复调（兜底定时器）无副作用。 */
  function hideNativeSplash() {
    if (!isNativeShell()) return;
    const P = window.Capacitor && window.Capacitor.Plugins;
    const sp = P && P.SplashScreen;
    if (!sp || typeof sp.hide !== "function") return;
    try { sp.hide(); } catch (e) { /* 收不到就按系统默认行为兜底 */ }
  }

  /* 老用户（进过一次）冷启动：**启动层整层不画** —— 不放那 1.1s 入场动画，也不用再点。
     `display:none` 比只加 `.is-gone` 更彻底：连合成层都不建，也就不存在「淡出一半
     又露出来」的可能。网页版 / 单文件版同此逻辑（三端共用一份代码）。
     状态栏仍要交回主题 —— 跳过封面不等于跳过这一步，否则原生状态栏会一直停在
     上面 `syncLaunchStatusBar()` 给它刷的封面底色上。 */
  if (hasEntered()) {
    const l0 = byId("launch");
    if (l0) { l0.classList.add("is-gone"); l0.style.display = "none"; }
    /* #68：bootveil 盖住首帧 —— 主界面在纯色层之下完成排版与栅格化，两帧后遮罩淡出。
       没有它，「封面整层不画」的首帧会直接露出正在成形的界面。主题 class 先行设置
       （init() 在文件末尾才跑，而遮罩配色跟主题走）。 */
    const v0 = byId("bootveil");
    if (v0) {
      document.body.dataset.theme = state.theme;
      v0.hidden = false;
      /* #110：0.999 预热（enterApp 同款手法）—— 不透明的整屏遮罩会让合成器推迟
         主界面的栅格化：肉眼无色差，但遮罩不再算「完全遮挡」，下面的主界面在
         字体/封面装载期间就完成栅格化，揭幕那一下不会「糊一下」。 */
      v0.style.opacity = "0.999";
      /* #109：等字体与封面就绪再揭幕（bootSettled 自带 1500ms 兜底）。
         微任务里才读 coversSettled —— 本块在脚本求值期先跑，init() 在文件末尾
         同步执行完，微任务回调时 hydrate 的 promise 已经接上了。 */
      Promise.resolve().then(function () { return bootSettled(); })
        .then(function () {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            /* #110：三件事同一拍 —— 先清内联 0.999（否则压过 .is-gone 的 opacity:0）、
               遮罩淡出、状态栏交回主题；开屏也在这一拍交还。暖米（开屏）遮着
               暖米（遮罩）、遮罩遮着主界面，全程只剩「遮罩淡出 → 界面」一次过渡，
               状态栏不再在遮罩期间提前变成界面色、顶上多出一条灰白细带。 */
            v0.style.opacity = "";
            v0.classList.add("is-gone");
            syncNativeStatusBar(state.theme);
            hideNativeSplash();
            setTimeout(() => { v0.hidden = true; v0.classList.remove("is-gone"); }, 600);
          }));
        });
    }
  } else {
    /* 封面层底色跟主题（#68）：深色主题首次启动时，系统开屏（#69 后同为深色）→
       封面 → 主界面全程同色，不再「恒浅色」。 */
    document.body.dataset.theme = state.theme;
    syncLaunchStatusBar();      /* 第一次：状态栏先跟着封面底色走，进主界面时再交回 */
    /* #110：launchAutoHide:false 后开屏不会自己退场 —— 封面页首帧画完就交还，
       开屏淡出（400ms）期间底下是同色的封面页，交接无缝（跟老用户路径同一拍原则）。 */
    requestAnimationFrame(() => requestAnimationFrame(hideNativeSplash));
  }
  /* #110：兜底 —— launchAutoHide:false 后开屏只能由 JS 收回。bootSettled 若被拖到
     上限（1.5s）也要再过 rAF 才交还，最迟 5s 强制补一记，开屏绝不过夜。 */
  setTimeout(hideNativeSplash, 5000);

  /* ---------------------------------------------------------
     14b. 原生壳适配（Android / Capacitor）
     ---------------------------------------------------------
     网页版、单文件版与 App 版**共用这一份代码**，原生环境只多做两件事：
     ① 给 html / body 加 .is-native —— 由 CSS 隐藏自绘状态栏与 homebar、让机身壳让位。
        **只隐藏、不删元素**：网页版 / PWA / 单文件版仍要靠它们撑机身观感。
     ② 把真实安全区高度写进 --safe-top / --safe-bottom，交给 CSS 消费。
     判定**不看屏宽**，所以平板、折叠屏展开态、横屏都会正确落到全屏（媒体查询那条
     只能覆盖到 900px 宽以内，超宽屏会掉回"带机身壳的演示态"）。 */
  function isNativeShell() {
    const c = window.Capacitor;
    return !!(c && ((c.isNativePlatform && c.isNativePlatform()) || c.isNative));
  }

  /* env(safe-area-inset-*) 在 Android WebView 上不如 iOS 可靠，但原生壳可以注入真值：
     window.ReadTraceNative.insets = { top, bottom }（由 Capacitor 侧写入）。
     没有注入就退回读 env()，再没有就是 0 —— 于是网页版完全不受影响。 */
  function readSafeInsets() {
    const injected = window.ReadTraceNative && window.ReadTraceNative.insets;
    if (injected) return { top: injected.top || 0, bottom: injected.bottom || 0 };
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;" +
      "height:env(safe-area-inset-top,0px);padding-top:env(safe-area-inset-bottom,0px)";
    document.body.appendChild(probe);
    const top = probe.getBoundingClientRect().height;
    const bottom = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.parentNode.removeChild(probe);
    return { top: top, bottom: bottom };
  }

  function applyShellInsets() {
    const insets = readSafeInsets();
    const root = document.documentElement;
    root.style.setProperty("--safe-top", insets.top + "px");
    root.style.setProperty("--safe-bottom", insets.bottom + "px");
  }

  function setupNativeShell() {
    if (!isNativeShell()) return;
    document.documentElement.classList.add("is-native");
    document.body.classList.add("is-native");
    applyShellInsets();
    /* 旋转 / 折叠屏展开 / 手势条切换都会改变安全区，跟随一次即可 */
    window.addEventListener("resize", applyShellInsets);
    window.addEventListener("orientationchange", applyShellInsets);
    watchStatusBarTop();               /* #185：顶边换人（全屏层开关）就跟着换状态栏底色 */
    syncNativeStatusBar(state.theme);   /* 插件此刻一定就绪，补一次免得首次调用落空 */
  }

  /* iPhone「添加到主屏幕」后是 standalone PWA：真状态栏 / 手势条在场，自绘的 9:41
     与 homebar 得退场（styles.css 的 .is-pwa 一族），安全区也从 env() 量真值。
     Safari 正常开网页时两样都不做 —— 那里自绘状态栏仍是「机身观感」的一部分。
     判据用 navigator.standalone（iOS 专用信号）兜 display-mode 媒体查询。 */
  function setupStandalonePWA() {
    let alone = false;
    try { alone = window.navigator.standalone === true; } catch (e) { /* 老引擎：当不在主屏 */ }
    if (!alone && window.matchMedia) {
      try { alone = window.matchMedia("(display-mode: standalone)").matches; } catch (e) {}
    }
    if (!alone) return;
    document.documentElement.classList.add("is-pwa");
    document.body.classList.add("is-pwa");
  }

  /* 网页版的安全区：原生壳走 setupNativeShell（注入优先，别让 env() 抢在注入前写错值）；
     这里只管网页 —— iPhone 加到主屏后 env(safe-area-inset-*) 是真值，这才落内联；
     浏览器态与桌面恒 0，**一个字都不写**（「网页版不注入安全区」是 #188 起的老契约，
     verify_account 量的是内联属性缺席，不是数值 0）。转屏 / Safari 工具条收展
     都会触发 resize，跟着重读一次；真值环境归零时也把内联摘掉。 */
  function setupWebInsets() {
    if (isNativeShell()) return;
    const put = function () {
      const i = readSafeInsets();
      const root = document.documentElement;
      if (!i.top && !i.bottom) {
        root.style.removeProperty("--safe-top");
        root.style.removeProperty("--safe-bottom");
        return;
      }
      root.style.setProperty("--safe-top", i.top + "px");
      root.style.setProperty("--safe-bottom", i.bottom + "px");
    };
    put();
    window.addEventListener("resize", put);
    window.addEventListener("orientationchange", put);
  }

  /* 系统状态栏的底色 = 「贴着它那一条」的实色（#185）。刻意**不覆盖 WebView**（overlay:false）：
     于是排版区域本来就落在状态栏之下，--safe-top 保持 0 即可 ——
     不必去赌 env(safe-area-inset-top) 在 Android WebView 上给不给值。
     ⚠️ 底色**不能写死**：状态栏是纯色，而屏顶那一条不是 —— 默认四页的顶边是玻璃页头
     （≈ --bg），「我的」页却是沉浸头部的香槟金。写死一个色，总有一页顶上多出一条带子
     （用户 2026-10-10：「最顶部的那些时间，电量跟我这个软件页面怎么不一样」：
     深色档状态栏 rgb(14,13,15) vs 页面顶 rgb(42,36,32)，浅色档 rgb(247,245,242) vs rgb(245,239,225)）。
     **约定：谁铺到屏顶，谁在 styles.css 里自己声明 `--sb-top`**（背景色写在哪，声明就写在哪）。
     没声明的层（玻璃页头 / 蒙层 / 底部面片 / 引导的步骤层）一路让位给下面那一层；
     ⚠️ 透明层不许声明 —— 声明了就会把下面那一页的顶边色顶掉。

     ⚠️ 两个坑（#185 真机上栽过：v1.85 发出去以后状态栏还是兜底色）：
     ① **老 WebView 读自定义属性时不一定替我们做 `var()` 替换** —— 取回来会是原样的
        `var(--me-hero1)` 而不是 `#f6f0e2`，正则一判就当「没人声明」。所以这里见到
        `var(--x)` 就把 `--x` 再取一次（最多四层）。
     ② 屏顶正中那一列万一是空的 / 落在没继承到的元素上 → 退到**当前激活页**声明的值。 */
  function sbColorOf(el) {
    let name = "--sb-top";
    for (let d = 0; d < 4; d++) {
      let v = "";
      try { v = window.getComputedStyle(el).getPropertyValue(name).trim(); } catch (e) { return ""; }
      const m = /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$/.exec(v);
      if (m) { name = m[1]; continue; }   /* 没被替换的 var()：自己往下一层取 */
      /* 递原生的必须是 #rrggbb：Color.parseColor 只认长短两种写法，`#000` 这种三位简写
         它解析不了（抛的异常会被 catch 吞掉＝状态栏留在上一个色上）——这里补齐六位 */
      if (/^#[0-9a-fA-F]{3}$/.test(v)) v = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "";
    }
    return "";
  }

  function statusBarTopColor() {
    try {
      const list = document.elementsFromPoint(Math.round(window.innerWidth / 2), 2) || [];
      for (let i = 0; i < list.length; i++) {
        const c = sbColorOf(list[i]);   /* 从屏顶往下：第一层给了色的就是它 */
        if (c) return c;
      }
    } catch (e) { /* 取不到就往下兜 */ }
    const pg = document.querySelector(".page.is-active");
    return (pg && sbColorOf(pg)) || "";
  }

  function syncNativeStatusBar(theme) {
    if (!isNativeShell()) return;
    const P = window.Capacitor && window.Capacitor.Plugins;
    const sb = P && P.StatusBar;
    if (!sb) return;
    const dark = theme === "dark";
    try {
      /* #188 起是**真贴边**（原生 setDecorFitsSystemWindows(false)，见 MainActivity）：
         网页铺满整屏、自己画到屏顶，所以既不设 overlays、也不再给原生送底色 ——
         那条「自画色条」连同 `setBackgroundColor` 一起撤了（它们会在网页自己的画面上盖一层）。
         现在还用得着 --sb-top 的地方只剩**图标明暗**：深底的面片（裁剪台/大图页）要浅色图标。 */
      applyStatusBar(statusBarTopColor() || (dark ? "#0e0e10" : "#f7f6f3"), sb, P);
    } catch (e) { /* 插件未就绪 / 网页版：静默放过，默认样式本身也是对的 */ }
  }

  /* 把「屏顶那一条」的实色交给原生 —— **#188 起只剩一件事：图标明暗**。
     来路（都踩过，别再走回头路）：#185 想让原生状态栏去读 --sb-top，可 Android 15 起
     `Window.setStatusBarColor` 被系统忽略（@capacitor/status-bar 的 setBackgroundColor 内部
     正是调它）→ #186 改成原生自己画一条色条（StatusStripPlugin）才让那条带子对上页面；
     但那终究是「在网页外面贴一块纯色」，滚动时内容从它下面穿过就露馅（#187 又去跟滚动对账）。
     #188 起换成**真贴边**：原生 `setDecorFitsSystemWindows(false)` 让网页铺满整屏、自己画到屏顶，
     色条与 setBackgroundColor 一起撤掉 —— 带子不存在了，也就无所谓「对不对得上」。
     还留着这个函数是因为图标：按**这条的亮度**定明暗，不按主题 —— 裁剪台那种深底的面片
     在浅色主题下也得配浅色图标（按主题会给深色图标、压在深底上看不清）。
     Capacitor 的命名：LIGHT = 浅底配深色图标。 */
  function applyStatusBar(color, sb, P) {
    const hex = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "";
    if (!hex) return;
    try {
      if (sb && sb.setStyle) {
        sb.setStyle({ style: luminance(hex) > 0.55 ? "LIGHT" : "DARK" });
      }
    } catch (e) {}
  }

  /* 0..1 的相对亮度（sRGB 的加权和就够用：这里只用来挑深/浅图标） */
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (((n >> 16) & 255) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722) / 255;
  }

  /* 顶边换人了就跟着换（#185）：全屏层（引导 / 合规页 / 裁剪台 / 大图页）开关都是改 class。
     监听一次就够 —— 否则每一处开关都得各补一句 syncNativeStatusBar()，漏一处就是一条带子。
     节流到一帧一次；算出来跟上次一样就不惊动原生（这条路径每帧都可能被唤醒）。 */
  function watchStatusBarTop() {
    if (!isNativeShell() || typeof MutationObserver !== "function" || !document.body) return;
    let last = "";
    let queued = false;
    const tick = () => {
      queued = false;
      const c = statusBarTopColor() || (state.theme === "dark" ? "#0e0e10" : "#f7f6f3");
      if (c === last) return;
      last = c;
      syncNativeStatusBar(state.theme);
    };
    try {
      new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(tick);
      }).observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme"], subtree: true });
    } catch (e) { /* 忽略 */ }
  }

  /* #187：「我的」页那张香槟金头部跟着内容滚走，滚出屏顶之后贴着状态栏的变成**页面自己的底色**
     （见 styles.css 里 .page[data-page="me"].is-scrolled 的注释）—— 这里负责挂/摘那个类。
     阈值 = 头部整块滚出屏顶，带 8px 迟滞（免得在临界点来回抖）；只在**状态翻转**时才惊动原生。
     网页版没有系统状态栏，syncNativeStatusBar() 自己会静默放过，留着无副作用。 */
  function watchMeScroll() {
    const pg = document.querySelector('.page[data-page="me"]');
    const hero = pg && pg.querySelector(".me-hero");
    if (!pg || !hero || pg.dataset.sbScrollWatched) return;
    pg.dataset.sbScrollWatched = "1";
    let on = false;
    const tick = function () {
      /* 顺畅度（2026-10-12）：document 捕获监听收到的是**全 App 任何一个滚动容器**的
         scroll —— 书架横移、信件列表、挑书清单都在里面。人不在「我的」页时那些滚动
         每帧都要来这里白跑一趟（同帧里若别处写过 DOM，读 offsetHeight 就是一次
         强制重排），一概早退。is-scrolled 类留着不动：切回「我的」时滚动位置没变，
         类也不该变。 */
      if (currentTab !== "me") return;
      const h = hero.offsetHeight;
      /* ⚠️ 别假设滚动一定发生在 `.page` 上：Android WebView 里滚动有时被外层接走
         （实测：内容明明动了、pg.scrollTop 还是 0）。两个都读，取大的那个当作滚了多少。 */
      const y = Math.max(pg.scrollTop,
        document.scrollingElement ? document.scrollingElement.scrollTop : 0);
      const next = on ? y > h - 8 : y > h + 8;
      if (next === on) return;
      on = next;
      pg.classList.toggle("is-scrolled", on);
      syncNativeStatusBar(state.theme);
    };
    /* `scroll` 事件**不冒泡、但会经过捕获阶段** —— 挂 document + capture，
       才不管滚动发生在哪一层（#187 在模拟器上踩过：只挂 .page 收不到）。 */
    document.addEventListener("scroll", tick, { capture: true, passive: true });
  }

  /* 回到前台时系统会把状态栏图标色重置回主题默认，而主题底色是写死的亮色
     → 浅色主题下亮底白字、时间电量看不清（#105）。切主题能立刻好是因为
     setTheme() 会重设；resume 这条路没人补，所以显式挂一次。 */
  function setupResumeSync() {
    if (!isNativeShell()) return;
    const P = window.Capacitor && window.Capacitor.Plugins;
    const app = P && P.App;
    if (!app || !app.addListener) return;
    try {
      app.addListener("appStateChange", function (s) {
      if (s.isActive === false) { try { saveDraftNow(); } catch (e) {} }   /* #111：切后台钉草稿 */
        if (s && s.isActive) syncNativeStatusBar(state.theme);
      });
    } catch (e) { /* 插件未就绪：静默放过 */ }
  }

  /* 返回键一次只退一层：按 CSS 的 z-index 从高到低找"最上面那层"关掉。
     层级实测：启动遮罩 90 > 写随笔抽屉 60 > 命令面板 58 > 粒子 55 > 阅读器 50 >
     碑详情 / 书籍详情 / 日历 40。不接管的话，按一下返回键就直接退出 App，
     这是"给朋友用"时最容易被吐槽的一点。 */
  function closeTopOverlay() {
    const l = byId("launch");
    /* 启动仪式还开着：返回键 = 跳过动画直接进 App，而不是退出 */
    if (l && !l.classList.contains("is-gone")) { enterApp(); return true; }
    const layers = [
      /* 写日记草稿询问（#201）：比确认弹窗更浅一层 —— 它只在根上开（身下没有别的层），
         返回键 =「算了」：不进书写页，草稿原样留在盘上（与「面板收起一律是取消」同一条）。 */
      ["draftAsk", closeDraftAsk],
      /* 确认弹窗（z 85）：它浮在其它所有浮层之上（常由书单/书籍详情里发起），
         返回键等于「取消」—— 只收弹窗，不动底下的详情层。 */
      ["cfmModal", () => closeConfirm(false)],
      /* 封面裁剪台（z 78，#92）：返回键 = 放弃这张图，退回加书表单 */
      ["cropper", () => closeCoverCropper(null)],
      /* 保存头像抽屉（z 73，#141）：浮在大图(72)之上，返回键先收它，再收大图 */
      ["avaSave", closeAvaSave],
      /* 头像大图（z 72，#138）：从「我的」页头部直接弹起，身下不会压着别的层，
         位置只求"排在页内容之前"；点任意处本来就能收，返回键同一件事。 */
      ["avView", closeAvaView],
      /* 合并弹窗（z 80）刻意"吞掉"返回键：首登时本机与云端都有数据，
         替他选一个就是替他做数据决定。必须点一个按钮。 */
      ["mergeModal", () => {}],
      /* 头像选择面板（z 77，#130）：先于引导层收 —— 裁剪台(78)又排在它前面，
         拍照裁剪时返回键先弃图，再收面板，最后才轮到引导切步。 */
      ["avaWrap", closeAvaSheet],
      /* 合规页（z 86）：能从登录门顶上打开（隐私政策），返回先收它 */
      ["legalPage", closeLegal],           /* z 86（#130 从 65 提到门之上） */
      /* 首启引导（z 76，#130）：登录步是必经之门，返回键不关它，只在
         引导链内部回退（头像→称呼→欢迎…）；到登录步就停在原地。 */
      ["obd", obdStepBack],
      ["authSheet", closeAuth],            /* z 70 */
      ["profSheet", closeProfSheet],       /* 编辑资料（#122），与登录浮层同层：不会叠着打开 */
      ["aboutSheet", closeAboutSheet],     /* 关于阅迹（#132），同层不叠开 */
      ["helpSheet", closeHelpSheet],       /* 帮助与反馈（#132），同层不叠开 */
      ["fbSheet", closeFbSheet],           /* 问题反馈（#193），从帮助面板里开（点它时帮助已先收） */
      ["tlComposer", closeComposer],
      ["composeSheet", closeCompose],
      ["bookSheet", closeSheet],
      /* 书目编辑浮层（#179）：新增 / 编辑 / 删除共用同一张表。它要么从书架页右下
         那颗「＋」直接开（身下没有别的层），要么从书籍详情的「编辑」开（详情已先
         收起）—— 永远单独一层，所以排在详情之后即可。以前**漏接在这里**：在书架页
         开它再按返回键，层表里找不到它 → 一路落到「已在书架根层」→ 直接退出 App。 */
      ["bookEdit", closeBookEdit],
      /* 书单（#57）：挑书层排在详情层**之前** —— 它是在详情之上打开的，
         返回键必须先收它，再收详情。 */
      ["listPick", cancelListPick],
      ["listSheet", closeListSheet]
    ];
    /* 书单长按亮出的「删除书单」玻璃层（#178）排在最前：它不是 .sheet 浮层，
       但同样是「能退回去」的一层 —— 返回键先收它，别让这一下直接落到切 tab /
       退出（v1.94 补；与「面板收起手势一律是取消」的约定精神一致）。 */
    /* 书脊长按亮出的玻璃「删除」（#200）与书单那枚（#178）同理：不是 .sheet 浮层，
       但同样是「能退回去」的一层 —— 返回键先收它，别让这一下直接落到切 tab / 退出。 */
    if (dragSp) { endSpineDrag(false); return true; }   /* #201 拖书中：返回 = 松手放弃，书回原位 */
    if (armedSpineId) { disarmSpine(); return true; }
    if (armedListId) { disarmList(); return true; }
    for (let i = 0; i < layers.length; i++) {
      const el = byId(layers[i][0]);
      if (el && el.classList.contains("is-open")) { layers[i][1](); return true; }
    }
    /* 浮层都关完了，才轮到视角：日历视角不是浮层，但它同样是「能退回去」的一层 ——
       返回键先回到列表，再按一次才轮到退出 App。 */
    if (recViewOn === "cal") { setRecView("list"); return true; }
    return false;
  }

  function setupBackButton() {
    const P = window.Capacitor && window.Capacitor.Plugins;
    const App = P && P.App;
    if (!App || !App.addListener || !isNativeShell()) return;
    App.addListener("backButton", function () {
      if (closeTopOverlay()) return;          /* 有关着的层：先关它 */
      if (currentTab !== "shelf") { switchTab("shelf"); return; }   /* 其余 tab：回书架 */
      if (App.exitApp) App.exitApp();          /* 已在书架根层：交回系统（退出） */
    });
  }

  /* 软键盘：写随笔抽屉 .tlc-panel 贴底，键盘弹出会被顶到屏幕外。
     原生壳若已按 adjustResize 收缩视口，这里算出的差值就是 0（无副作用）；
     若只有 visualViewport 变化，则把差值写进 --kb-inset，由 CSS 把抽屉抬起来。
     低于 24px 的一律当 0，避免地址栏/工具栏抖动导致抽屉乱跳。 */
  function setupKeyboardInset() {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb-inset", (gap > 24 ? gap : 0) + "px");
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
  }

  /* 外层画框 .screen 是固定尺寸的「手机边框」（position:absolute;inset:0），
     overflow:hidden 只挡用户手势，**挡不住程序滚动** —— 浏览器为「把聚焦的元素
     挪进视野」、或真机上软键盘弹起时的 IME 联动，都会去滚它。一旦被滚，
     整个界面（含浮层）跟着上移且不会自己回来，看着就是「弹窗空白 + 底部一条白」
     （#164：新建书单在面板升起动画中途聚焦名字框，画框被滚下 491px）。
     该滚的是里面的 .page / .sheet-body，画框本身永远不该动 —— 这里兜一道：
     它只要动过就立刻按回 0。 */
  function setupFrameGuard() {
    const sc = document.querySelector(".screen");
    if (!sc) return;
    sc.addEventListener("scroll", () => { if (sc.scrollTop) sc.scrollTop = 0; }, { passive: true });
  }

  /* ---------------------------------------------------------
     13b. 应用内确认弹窗（#62）

     原先四处破坏性操作（删书 / 删书单 / 退出登录 / 注销账号）用的是
     window.confirm()。它在 Android WebView 里渲染成系统样式的蓝色
     CANCEL / OK（截图里那块白底蓝字），跟这套暖纸色界面完全是两套语言，
     而且没法改文案排版、没法做危险色。

     askConfirm() 返回 Promise<boolean>，调用处写成 `.then(ok => …)`：
       askConfirm({ title, body, ok, cancel, danger }).then(ok => { … })
     —— body 里照旧可以写 \n 分段（CSS 用 white-space:pre-line 还原）。
     弹窗只保留一个实例：真并发时先到来的那个当取消，避免 Promise 悬着。
     --------------------------------------------------------- */
  let cfmResolve = null;
  function askConfirm(o) {
    const m = byId("cfmModal");
    /* 兜底：万一 index.html 的弹窗被删了，退回原生 —— 宁可难看，不可不确认 */
    if (!m) return Promise.resolve(window.confirm(o.title + "\n\n" + o.body));
    if (cfmResolve) closeConfirm(false);
    byId("cfmTitle").textContent = o.title || "";
    byId("cfmBody").textContent = o.body || "";
    byId("cfmYes").textContent = o.ok || "确定";
    byId("cfmNo").textContent = o.cancel || "取消";
    byId("cfmYes").classList.toggle("is-danger", !!o.danger);
    m.classList.add("is-open");
    return new Promise(res => { cfmResolve = res; });
  }
  function closeConfirm(v) {
    const m = byId("cfmModal");
    if (m) m.classList.remove("is-open");
    const r = cfmResolve;
    cfmResolve = null;
    if (r) r(!!v);
  }
  function setupConfirm() {
    const yes = byId("cfmYes"), no = byId("cfmNo"), mask = byId("cfmMask");
    if (yes) yes.addEventListener("click", () => closeConfirm(true));
    if (no) no.addEventListener("click", () => closeConfirm(false));
    if (mask) mask.addEventListener("click", () => closeConfirm(false));   /* 点遮罩 = 取消 */
  }

  /* ---------------------------------------------------------
     面板下拖收起（#134）：所有 .sheet 通用
     ---------------------------------------------------------
     用户预期（iOS 底部面板的常识手势）：抓住顶上那根灰条往下拖 = 收起。
     指法规矩 —— 任一条不满足就完全不插手，交回原生滚动：
       · 单指；按在打开着的 .sheet-body 上（多行文本域 / 下拉除外：那里是编辑与
         自身滚动。**单行输入框不算例外**（#165）：面板顶部那一栏常整条都是单行框，
         豁免它就把顶部变成死区，见 singleLine 的注释）
       · 面板已滚到顶（scrollTop ≤ 0）；纵向位移压过横向（|dy| > |dx|）且朝下
     判定前一个字节都不拦（阈值 8px，起手点在输入框里时 14px），判定成立才
     preventDefault + 停过渡跟手 —— 所以面板内的正常滚动、评分星星 / 滑杆这类
     横向操作照旧。松手：过 110px、或过 36px 且甩得够快（> .5px/ms＝500px/s）
     → 走该面板**自己的**收起函数（书单要落盘、写信要 blur，不是裸
     remove("is-open")）；否则弹回原位。 */
  const SHEET_CLOSE = {
    bookSheet: () => closeSheet(),
    bookEdit: () => closeBookEdit(),
    composeSheet: () => closeCompose(),
    listSheet: () => closeListSheet(),
    listPick: () => cancelListPick(),
    profSheet: () => closeProfSheet(),
    aboutSheet: () => closeAboutSheet(),
    helpSheet: () => closeHelpSheet(),
    fbSheet: () => closeFbSheet()
  };

  /* 两指在日记列表上捏合 = 翻档（#151，照日记视频）。单指一律放行 —— 滚动、点卡片、
     长按都不受影响，所以监听全挂在页面级且只在**两指**时才接管。
     页面级缩放被 viewport 锁死（verify_nozoom），这里再把两指手势 preventDefault 吃掉：
     免得 WebView 侧留着别的默认行为（长按菜单 / 页面平移），也让「捏合只翻档」这件事
     在手指底下就是确定的。桌面 / 网页版没有两指，留 Ctrl+滚轮 等价操作（调试也用它）。 */
  function setupTlZoom() {
    const pg = $('.page[data-page="record"]');
    if (!pg) return;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    let base = 0;
    pg.addEventListener("touchstart", e => {
      base = 0;
      if (e.touches.length !== 2 || recViewOn !== "list") return;
      /* 底部面板 / 写日记的抽屉里捏合不翻档（那里有自己的手势与输入框） */
      const tg = e.target;
      if (tg && tg.closest && tg.closest(".tl-composer,.sheet,.sheet-body")) return;
      base = dist(e.touches) || 0;
    }, { passive: true });
    pg.addEventListener("touchmove", e => {
      if (!base || e.touches.length !== 2) return;
      e.preventDefault();
      const d = dist(e.touches);
      /* 一步一档、每档重设基准：连续捏合能一路走到头，慢慢捏也不会连跳两档 */
      if (d / base >= 1.3) { if (stepTlZoom(1)) base = d; }
      else if (d / base <= 0.77) { if (stepTlZoom(-1)) base = d; }
    }, { passive: false });
    const stop = e => { if (!e.touches || e.touches.length < 2) base = 0; };
    pg.addEventListener("touchend", stop, { passive: true });
    pg.addEventListener("touchcancel", stop, { passive: true });
    /* 收起时的短淡入用完自己摘类 —— 类还在就重播不了（下次翻档加的是同一个类） */
    pg.addEventListener("animationend", e => {
      if (e.animationName === "tlFold") e.target.classList.remove("is-refold");
    });
    pg.addEventListener("wheel", e => {
      if (!e.ctrlKey || recViewOn !== "list") return;
      e.preventDefault();
      stepTlZoom(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
  }

  function setupSheetDrag() {
    const SLOP = 8, INPUT_SLOP = 14, CLOSE_PX = 110, FLICK_MIN = 36, FLICK_V = 0.5;
    let host = null, body = null, scrim = null, tracking = false, owned = false, adjusted = false;
    let fromInput = false;
    let sx = 0, sy = 0, dy = 0, h = 1;
    /* #203：起手那一下**这条触摸链上所有能滚的容器**（从触点一路到 sheet-body）——
       挑书层的 `.lpk-list` 就是一只嵌在面板里的滚动框，见 canScrollUp()。 */
    let scrolls = [];
    const pts = [];        /* 最近几个采样点：算「甩」的速度用（整段平均会把起手那几帧算进去，偏慢） */

    function note(y) {
      pts.push({ t: Date.now(), y: y });
      if (pts.length > 6) pts.shift();            /* 真机 ~16ms 一帧 → 窗口约 100ms */
    }
    function speed() {
      const a = pts[0], z = pts[pts.length - 1];
      if (!a || !z || z === a) return 0;
      const dt = z.t - a.t;
      return dt > 0 ? (z.y - a.y) / dt : 0;       /* px/ms */
    }

    /* 这一下是不是真的点在编辑区里？要点在**输入框自己的框**里才算（外扩 2px 容忍
       边缘抖动）—— 不能只看 e.target：Chrome 的触摸目标校正会把灰条附近的点判给
       紧挨着的输入框（书单详情里改名框就在灰条下方 2px，按灰条收到的是它）。 */
    function onEdit(target, x, y) {
      const el = target && target.closest ? target.closest("input, textarea, select") : null;
      if (!el || !el.getBoundingClientRect) return null;
      const r = el.getBoundingClientRect();
      return (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) ? el : null;
    }

    /* #165：**单行**输入框不再从拖拽里摘出去。原先编辑区一律豁免，于是「面板顶部那一栏」
       整条成了死区 —— 书单详情的改名框 width:100% 铺满第一行，用户在顶部按住往下拖，
       面板一动不动（真触摸探针实测：灰条能拖、空白处能拖，只有这一行纹丝不动）。
       单行框自己没有纵向滚动可让，纵向拖本来就是空手势，改判给面板；多行 textarea
       与下拉仍有各自的滚动 / 选择，照旧放行。 */
    function singleLine(el) { return !!el && el.tagName === "INPUT"; }

    function start(x, y, el, fromEdit, target) {
      const sh = el.parentNode;
      if (!sh || !sh.classList || !sh.classList.contains("is-open") || el.scrollTop > 0) return false;
      host = sh; body = el; scrim = sh.querySelector(".sheet-scrim");
      /* #203：记下这条触摸链上**所有还能往上滚的容器**（含 sheet-body 自己）。
         面板级下拉手势原先只看 sheet-body 的 scrollTop —— 而挑书清单
         `#listPickBody .lpk-list` 自己有 `max-height:52vh;overflow-y:auto`，
         于是「清单往下滚过之后、手指往回滑（想把上面几本滚回来）」被面板抢走：
         面板整块被拖出屏外 → 走 cancelListPick → 勾选全丢、挑书层当场关掉，而那一册
         早在点「加入书籍」时认领落盘。用户 2026-10-12 报的
        「我点击加入书籍后，没有加入书籍，书单依旧新建成功」就是这条路（书多到清单
         能滚时才现形，所以手工派发鼠标事件的探针一直是假绿）。
         判据（真触摸、CDP dispatchTouchEvent）：_drive_pick_scroll.js。 */
      scrolls = [];
      for (let n = target; n && n.nodeType === 1 && n !== el && el.contains(n); n = n.parentNode) {
        if (n.scrollHeight > n.clientHeight + 1) scrolls.push(n);
      }
      scrolls.push(el);
      sx = x; sy = y; dy = 0; h = Math.max(1, el.offsetHeight);
      fromInput = !!fromEdit;
      pts.length = 0; note(y);
      tracking = true; owned = false;
      return true;
    }

    /* 链上还有任何一只容器能往上滚吗？有 → 这一拖先归它，面板不许接管
       （纯 sheet-body 场景下 scrolls 只有它自己，与 #134 的老判据逐字等价）。 */
    function canScrollUp() {
      for (let i = 0; i < scrolls.length; i++) {
        const s = scrolls[i];
        if (s && s.scrollTop > 0) return true;
      }
      return false;
    }

    /* 判定这一拖归不归我们：true 归我们 / false 放手 / null 还没看出来 */
    function claim(mx, my) {
      if (owned) return true;
      /* 起手点在输入框里：门槛抬到 INPUT_SLOP —— 手指抖一下的「点」不能把面板拖走 */
      const slop = fromInput ? INPUT_SLOP : SLOP;
      if (Math.abs(mx) < slop && Math.abs(my) < slop) return null;
      if (Math.abs(mx) >= Math.abs(my) || my <= 0 || canScrollUp()) return false;
      owned = true;
      /* 从输入框起手拖起来 = 要收起面板，先把焦点交出去：面板滑走时键盘 / 光标
         不该还挂在里面（blur 也顺带触发各自的落盘，如书单改名框的 persist） */
      if (fromInput) {
        fromInput = false;
        const a = document.activeElement;
        if (a && a.blur) a.blur();
      }
      body.classList.add("is-dragging");     /* 跟手期间停掉 .52s 过渡（CSS 里注明） */
      return true;
    }

    function move(x, y) {
      if (!tracking || !body) return false;
      const mx = x - sx, my = y - sy, st = claim(mx, my);
      if (st === false) { tracking = false; return false; }
      if (st !== true) return true;          /* 阈值内：再等等，这次手势仍归我们盯着 */
      dy = Math.max(0, my);
      note(y);
      body.style.transform = "translateY(" + dy + "px)";
      if (scrim) {
        scrim.style.transition = "none";
        scrim.style.opacity = String(Math.max(0, 1 - dy / h));   /* 面板走多少，遮罩淡多少 */
      }
      return true;
    }

    /* 手势被「拿走」时的收尾 —— touchcancel（真机上从名字框起手拖时键盘收起引起的
       视口变化、OS 手势导航、浏览器接管）或第二根手指落下都会走到这里。
       **不能一律弹回**：手既然已经把面板拖下去了，意图就是收起；弹回去等于
       「我下拉取消，它还是新建成功」的另一半（面板没关，用户以为取消过了，
       随后就带着那册空书单离开）。判定沿用松手那一套 —— 只是没有末点位置，
       用已累积的位移；连拖都没拖起来的（手指抖一下被系统取消）才弹回。 */
    function dropCancelled() { drop(!owned); }

    /* 松手：过阈 → 从当前位移接着滑出屏外，落定后再交给各自收起函数；否则弹回。
       末点位置从 touchend / mouseup 补一笔 —— 快甩时最后几十像素常没有 move 事件。 */
    function drop(back, y) {
      if (!tracking) return false;
      if (owned && body && typeof y === "number") { dy = Math.max(0, y - sy); note(y); }
      const y2 = dy, v = speed();
      const b = body, s = scrim, sh = host;
      const took = !!b && owned && !back && (y2 > CLOSE_PX || (y2 > FLICK_MIN && v > FLICK_V));
      tracking = false; owned = false; body = null; scrim = null; host = null; scrolls = [];
      if (!b) return false;
      b.classList.remove("is-dragging");
      if (!took) {                           /* 弹回：清掉内联值，CSS 过渡自己接上 */
        b.style.transform = "";
        if (s) { s.style.transition = ""; s.style.opacity = ""; }
        return false;
      }
      if (s) { s.style.transition = ""; s.style.opacity = "0"; }
      b.style.transition = "transform .3s var(--ease)";
      b.style.transform = "translateY(100%)";
      /* 滑完再清内联（那一刻类规则给的也是 100%，不会跳），然后走收起函数 */
      setTimeout(function () {
        b.style.transition = ""; b.style.transform = "";
        if (s) s.style.opacity = "";
        const close = SHEET_CLOSE[sh.id];
        if (close) close(); else sh.classList.remove("is-open");
      }, 320);
      return true;
    }

    $$(".sheet").forEach(function (sh) {
      const el = sh.querySelector(".sheet-body");
      if (!el) return;

      el.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        adjusted = false;
        const ed = onEdit(e.target, t.clientX, t.clientY);
        /* 多行框 / 下拉：那里是编辑与自身的滚动，照旧不接管（单行框见 singleLine 注释） */
        if (ed && !singleLine(ed)) return;
        /* 点是灰条/空白、却被校正给了输入框：记一笔，touchend 时把 Chrome 顺带
           要弹的键盘按掉（不拦默认行为，滚动手势照旧） */
        adjusted = !ed && !!(e.target && e.target.closest && e.target.closest("input, textarea, select"));
        start(t.clientX, t.clientY, el, ed, e.target);
      }, { passive: true });

      el.addEventListener("touchmove", function (e) {
        /* 只有这次手势被我们接管时才拦默认行为 —— 面板内滚动不受影响 */
        if (e.touches.length !== 1) { dropCancelled(); return; }
        const t = e.touches[0];
        if (move(t.clientX, t.clientY)) e.preventDefault();
      }, { passive: false });

      el.addEventListener("touchend", function (e) {
        const t = e.changedTouches && e.changedTouches[0];
        const took = drop(false, t ? t.clientY : undefined);
        /* 灰条上轻点一下（没构成拖动）而目标被校正给了输入框：把 Chrome 随后要发的
           兼容鼠标事件按掉 —— 不然焦点落到输入框、键盘弹出来（人只是戳了下灰条）。 */
        if (!took && adjusted && e.cancelable) e.preventDefault();
        adjusted = false;
      });
      el.addEventListener("touchcancel", function () { adjusted = false; dropCancelled(); });

      /* 桌面（可编辑版在 Chrome 里看）没有触摸：鼠标拖灰条也能收。
         只在灰条上起手 —— 别处留给选词 / 拖选。 */
      sh.addEventListener("mousedown", function (e) {
        if (e.button !== 0) return;
        const t = e.target;
        if (!t || !t.closest || !t.closest(".sheet-grab")) return;
        if (!start(e.clientX, e.clientY, el, null, e.target)) return;
        owned = true;                        /* 灰条起手：不用判定，直接归我们 */
        body.classList.add("is-dragging");
        e.preventDefault();                  /* 免得拖出一片选区 */
      });
    });

    /* 鼠标拖动会跑出灰条，甚至跑出面板：move / up 挂在 document 上，
       没在跟踪时它们是空转（touch 路径不经过这里）。 */
    document.addEventListener("mousemove", function (e) {
      if (!tracking) return;
      if (move(e.clientX, e.clientY)) e.preventDefault();
    });
    document.addEventListener("mouseup", function (e) { drop(false, e.clientY); });
  }

  function init() {
    setTheme(state.theme);
    /* 原生壳：先落 .is-native 与安全区，再渲染 —— 否则冷启动会闪一下"带机身壳"的演示态 */
    setupNativeShell();
    setupStandalonePWA();  /* iOS 加到主屏：先把 .is-pwa 落下（同 .is-native 一个道理） */
    setupWebInsets();      /* 网页版也吃 env() 安全区（浏览器态恒 0，无副作用） */
    setupKeyboardInset();
    setupFrameGuard();     /* 画框永不滚动：挡掉聚焦 / IME 联动的程序滚动（#164） */
    setupBackButton();
    setupResumeSync();     /* 后台切回：重设状态栏图标色，防"亮底白字"（#105） */
    watchMeScroll();       /* #187：网页版也挂上（没系统状态栏时它只挂类，无副作用；探针靠它测） */
    setupConfirm();
    setupSheetDrag();      /* 八张底部面板通用：按住灰条下拖 = 收起（#134） */
    setupTlZoom();         /* 日记列表：两指捏合翻档（摘要 / 标准 / 全文，#151） */
    setupLtZoom();         /* 互动收件箱：两指捏合翻档（与日记同一套，#198） */
    setupTlHero();         /* 日记页封面卡：日期 / 周条 / 右上圆钮翻档（#152） */
    /* 先把旧存档里的相对日期冻结成绝对日期，再排序渲染 */
    freezeNoteDates();
    sortNotes();
    renderShelf();
    setupShelfSlider();
    renderRecord();
    renderInteract();
    renderLists();
    renderSettings();
    renderAccount();       /* 账号区两态：未登录 / 已登录 + 同步状态 */
    renderFootprint();     /* 阅读足迹五格（探针不点 tab 也读得到真实值） */
    setupCloud();          /* 读本地登录态；已登录则后台拉远端合并（本地秒开，云端后到） */
    setupPerfGuard();      /* 低端设备关掉毛玻璃（S4） */
    setupUpdateCheck();    /* 原生壳：后台查一次新版本（网页版直接跳过） */
    tickStatusTime();
    setInterval(tickStatusTime, 1000);
    /* 封面仓收尾（三条互相独立，都是本地操作，几毫秒量级）：
       migrate 把老存档里内联的封面搬进 IndexedDB 并让存档瘦身；
       hydrate 把已搬走的封面（和 #161 的日记封面图）读回内存；prune 清掉书目已删的孤儿封面。
       补到东西就重渲一次 —— 否则首屏会是「封面还没回来的」配色封面。 */
    migrateCovers();
    pruneCovers();
    coversSettled = Promise.all([hydrateCovers(), hydrateHero()]).then(function (r) {
      if (!r[0] && !r[1]) return;
      if (r[1]) renderHero();
      renderShelf();
      renderRecord();
      renderInteract();
      renderLists();
    });
  }

  /* ---------------------------------------------------------
     14. 账号与云同步
     ---------------------------------------------------------
     三条形态（网页 / 单文件 / App）共用这一份代码。未登录时**行为与本改造前
     完全一致**（纯 localStorage，八套探针为证）；登录后才多出"本地秒开 →
     后台拉取合并 → 重渲染"这一段。

     为什么客户端直接用 fetch 而不是 js-sdk？
     实测：云函数 HTTP 端点在 Capacitor 默认 origin（https://localhost）下
     CORS 预检返回 204 + 完整允许头，陌生域名返回 403 —— 即网关已默认放行
     localhost。于是既不需要 js-sdk、也不需要匿名会话，更不需要安全域名。
     端点：POST https://{env}.api.tcloudbasegateway.com/v1/functions/rt-api/invoke

     为什么所有读写都过云函数、不直连数据库？
     ① 体验版套餐加不了安全域名；② 平台无纯密码注册路径；③ 自定义登录的
     auth.uid 语义依赖密钥装载。全过云函数后，权限只剩"自签 token 校验"一处，
     链路短、可测、不依赖任何平台配置。

     id 策略：**不改现有 id**（种子仍是 n1…n44、自写仍是时间戳）。
     另加一个派生字段 rid，由原 id 确定性哈希而来 —— 同一份数据在任何设备上
     算出的 rid 都一致，于是多端合并既能对齐，又不会动到既有渲染与探针。
     --------------------------------------------------------- */

  /* --- 15a. 派生 id 与远端映射 --- */

  /* FNV-1a ×4 → 36 位 UUID 形状。确定性：同一 seed 永远得同一个 id，
     所以"同一台机器重装"与"两台机器各自首登"都能对齐到同一条记录。 */
  function uuidFrom(seed) {
    var h = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
    for (var i = 0; i < seed.length; i++) {
      var c = seed.charCodeAt(i);
      for (var k = 0; k < 4; k++) { h[k] = Math.imul(h[k] ^ c, 16777619) >>> 0; }
    }
    var hex = "";
    for (var j = 0; j < 4; j++) hex += ("00000000" + h[j].toString(16)).slice(-8);
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-4" + hex.slice(13, 16) +
           "-a" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
  }

  /* 上线的字段名必须是 ts，不是 date。
     本应用里"这条随笔/这封信算哪一天"一直存在 `ts` 里（绝对写法字符串，
     见 noteDate()），`date` 这个名字在业务侧压根不存在 —— 早先按 date 上线，
     结果推出去日期全空、拉回来全被 noteDate() 兜底成"今天"，整条日记列表错位。 */
  function ensureNoteRid(n) {
    if (!n.rid) n.rid = uuidFrom("rt.note:" + n.id);
    return n.rid;
  }
  function ensureLetterRid(l) {
    if (!l.rid) {
      /* 名册里的人：种子与改动前**逐字节相同**（老信已发的 rid 不能变，变了云端会当成两封）；
         名册之外的人 fid 为空，得拿 book/who 顶上去，否则同一天写的两封会撞同一个 rid。 */
      const tag = l.fid || ("@" + (l.book || "") + "/" + (l.who || ""));
      l.rid = uuidFrom("rt.letter:" + tag + ":" + (l.ts || "") + ":" + String(l.text || "").slice(0, 48));
    }
    return l.rid;
  }
  function stampNow() { return Date.now(); }

  /* 上行时间戳**一律取"此刻"**，绝不回传本地残留的 updatedAt。
     回传的话，一条从云端拉下来的随笔改完再推，时间戳还是旧的那一个，
     另一台设备按 LWW 一比就判它"没变"，改动永远传不过去。 */
  function toRemoteNote(n) {
    var d = { id: ensureNoteRid(n), ts: n.ts || "", text: n.text || "", updatedAt: stampNow() };
    if (n.bookId) d.bookId = n.bookId;
    if (n.seed) d.seed = true;
    return d;
  }
  function toRemoteLetter(l) {
    var d = { id: ensureLetterRid(l), fid: l.fid || "", ts: l.ts || "", text: l.text || "", updatedAt: stampNow() };
    if (l.reply) d.reply = l.reply;
    /* at = 寄出时刻。服务端按它算"多久之后回信"（sentAt），
       不带上它的话服务端只能拿 updatedAt 兜底，而 updatedAt 每次推送都会往后挪，
       等待时间会被无限重置。老信没有这个字段，服务端按"现在"起算，行为不变。 */
    if (l.at) d.at = Number(l.at);
    /* 名册之外的收信人：书名 / 人物名随信上行，服务端靠它现搭这个人物的口吻 */
    if (!l.fid && (l.book || l.who)) { d.book = l.book || ""; d.who = l.who || ""; }
    return d;
  }
  function fromRemoteNote(d) {
    var n = { id: d._id, rid: d._id, ts: d.ts || "", text: d.text || "" };
    if (d.bookId) n.bookId = d.bookId;
    if (d.seed) n.seed = true;
    n.updatedAt = Date.parse(d.updatedAt) || 0;
    return n;
  }
  function fromRemoteLetter(d) {
    var l = { rid: d._id, fid: d.fid || "", ts: d.ts || "", text: d.text || "" };
    if (d.reply) l.reply = d.reply;
    if (!l.fid && (d.book || d.who)) { l.book = d.book || ""; l.who = d.who || ""; }
    l.updatedAt = Date.parse(d.updatedAt) || 0;
    /* sentAt 是服务端存的那份「寄出时刻」（由上行时的 at 得来），必须收回来：
       拉一次就丢的话，客户端再也不知道这封信是什么时候寄的，
       回信轮询（scheduleReplyCheck）也就没得算了。 */
    if (d.sentAt) l.at = Date.parse(d.sentAt) || 0;
    return l;
  }

  /* --- 书目（#57 起内容全部由用户自己添）也走同一套 LWW 同步。
     云端集合 rt_books：一本一个文档，封面以 dataURL 内联（512px/q0.78，几十 KB）。 */
  function ensureBookRid(b) {
    if (!b.rid) {
      /* rid 不能只从本机 id 派生（#199）：b1、b2 这类计数 id 在重装/清数据/换设备
         登录后会从头再来 —— 云拉下来的书 id 是 rid（uuid）形态，nextBookId 扫不出
         历史最大值，新书又是 "b1"，与云上旧书算出**同一个 rid** → 同一个云端文档，
         LWW 互相覆盖：用户看到的就是「新加的书吞掉旧书」。书目自 #57 起全是用户
         手添，没有需要跨机对齐的种子数据（对齐靠云端文档本身），所以掺一次性
         随机量，让每一本的 rid 天下无双。rid 只在首用时发一次，之后存在书上不再变。 */
      b.rid = uuidFrom("rt.book:" + b.id + ":" + Date.now() + ":" + Math.random());
    }
    return b.rid;
  }
  /* 签名必须短：封面是几十上百 KB 的 base64，整串塞进签名表（readtrace.sig，
     与存档是两个 localStorage 键）会直接把本机配额撑爆。封面只留一个哈希。 */
  function strHash(s) {
    var h = 0x811c9dc5;
    s = String(s == null ? "" : s);
    for (var i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; }
    return h.toString(16);
  }
  /* 封面是长 base64，只把哈希放进签名串（签名表在 readtrace.sig，
     与存档是两个键，塞整张封面会把它撑大）。 */
  const bookSig = b => [b.title, b.author, b.status, b.rate, b.shelf || 0,
                        b.c1, b.c2, strHash(b.cover)].join("|");
  function toRemoteBook(b) {
    var d = { id: ensureBookRid(b), title: b.title || "", author: b.author || "",
              status: b.status || "reading", rate: b.rate || 0,
              c1: b.c1 || "", c2: b.c2 || "", updatedAt: stampNow() };
    if (b.shelf) d.shelf = Math.round(b.shelf);
    if (b.cover) d.cover = b.cover;
    return d;
  }
  function fromRemoteBook(d) {
    var b = { id: d._id, rid: d._id, title: d.title || "", author: d.author || "佚名",
              status: d.status || "reading", rate: d.rate || 0,
              c1: d.c1 || FALLBACK_C[0], c2: d.c2 || FALLBACK_C[1] };
    if (d.shelf) b.shelf = Math.max(1, Math.min(5, Math.round(Number(d.shelf) || 0)));
    if (d.cover) b.cover = d.cover;
    b.updatedAt = Date.parse(d.updatedAt) || 0;
    return b;
  }
  /* 合并进 state.books 之后，工作副本 BOOKS 得跟着对齐 —— 渲染层读的是 BOOKS。
     改已有条目不用管（两边共享同一批对象引用），只有「新增 / 删除」要重灌。 */
  function syncBooksFromState() {
    BOOKS.length = 0;
    Array.prototype.push.apply(BOOKS, state.books || []);
  }

  /* 同一 rid 挂两本书 = 早先「rid 由本机 id 派生」撞车留下的伤（#199）：两份在本机
     各占一条，云端却只有一个文档，每轮同步互相覆盖 —— 用户视角就是「新书吞旧书」，
     复本也永远删不干净。给排在后面的那份发一个全新 rid，让它从此作为独立的书上云；
     前一份保住原 rid（云端文档还认它）。返回是否动过，落盘由调用方负责。
     开机与每轮拉回合并各跑一遍：新 rid 是随机的，此后不会再产生同 rid 双本。 */
  function healBookRids() {
    const seen = {};
    let hit = false;
    (state.books || []).forEach(b => {
      if (!b) return;
      const r = ensureBookRid(b);
      if (seen[r]) {
        b.rid = uuidFrom("rt.book:" + b.id + ":" + Date.now() + ":" + Math.random());
        hit = true;
      } else {
        seen[r] = 1;
      }
    });
    return hit;
  }

  /* --- 书单（#57 起由用户自建）与书目同一套 LWW 同步，云端集合 rt_booklists。
     一册一个文档，装的是**书的 rid 数组**而不是书本身的副本 —— 书有它自己的文档，
     书单只做引用，改一次名字或挪一本书不必顺带上行几十 KB 的封面。 */
  function ensureListRid(l) {
    if (!l.rid) l.rid = uuidFrom("rt.list:" + l.id);
    return l.rid;
  }
  /* 签名里带上所收书的签名，是为了让「书被改名」也能触发书单上行 ——
     书单页卡片上写着书名，书名变了卡片就变了。但**不能**把整个封面塞进来：
     签名表在 readtrace.sig，与存档是两个键，几十上百 KB 的 base64 会把它撑爆
     （bookSig 早就把封面压成了一个哈希，所以整串仍然很短）。 */
  const listSig = l => [l.name, l.desc, (l.bookIds || []).join(","),
                        (l.bookIds || []).map(bookOf).filter(Boolean).map(bookSig).join("~")].join("|");
  function toRemoteList(l) {
    /* bookIds 存的是本机 id（b1、b2…），别的设备上同一本书的 id 可能不同
       （比如它是那边先建的）。所以上行时换成设备无关的 rid。 */
    const rids = (l.bookIds || []).map(id => {
      const b = bookOf(id);
      return b ? ensureBookRid(b) : null;
    }).filter(Boolean);
    return { id: ensureListRid(l), name: l.name || "", desc: l.desc || "",
             rids: rids, ts: l.ts || "", updatedAt: stampNow() };
  }
  function fromRemoteList(d) {
    /* 云端存的是 rid，本机数据一律只认本机 id —— 这里必须换算，否则书单里会躺着
       一串 uuid，bookOf() 一个都认不出，卡片上的本数恒为 0。 */
    return { id: d._id, rid: d._id, name: d.name || "新书单", desc: d.desc || "",
             bookIds: listBookIdsFromRids(d.rids), ts: d.ts || "",
             updatedAt: Date.parse(d.updatedAt) || 0 };
  }
  /* 从云端回来的 bookIds 是 rid 形态，合并进 state 时要换算回本机 id。 */
  function listBookIdsFromRids(rids) {
    const byRid = {};
    (state.books || []).forEach(b => { byRid[ensureBookRid(b)] = b.id; });
    return (rids || []).map(r => byRid[r]).filter(Boolean);
  }

  /* --- 15b. 网络层 --- */

  const Cloud = (function () {
    /* ⚙️ 自部署（见 README「六步」第 5 步）：网关地址与 publishable key 都从 config.js 读，
       本文件里不放任何具体环境的值 —— 换一个云环境只需要改 config.js。 */
    const RT_CFG = (typeof window !== "undefined" && window.RT_CONFIG) || {};
    const URL_FN = RT_CFG.gatewayUrl || "PUT_YOUR_GATEWAY_URL_HERE";
    /* publishable key：设计上就可公开（服务端按 Origin 判定来源），不是密钥 */
    const KEY = RT_CFG.publishableKey || "PUT_YOUR_PUBLISHABLE_KEY_HERE";
    const AUTH_KEY = "readtrace.auth";
    /* 本机免密（#171）：设备凭据与账号缓存存在同一层 localStorage —— 与现有会话 token
       同一信任级别（都是本机可读的 bearer）。**退出登录只清会话、不清它**，
       这正是"退出后还能一键回来"的全部依据；设置里关掉开关时才真的删。
       一并存住上次的邮箱：凭据本身是不透明的串，退出后要显示"上次是哪一号"只能靠它。 */
    const DEV_KEY = "readtrace.device";
    let acc = null;
    let lastSync = 0;

    function devRec() {
      let raw = null;
      try { raw = localStorage.getItem(DEV_KEY); } catch (e) { return { t: "", e: "" }; }
      if (!raw) return { t: "", e: "" };
      try {
        const o = JSON.parse(raw);
        if (o && o.t) return { t: String(o.t), e: String(o.e || "") };
      } catch (e) { /* 万一存成裸串，按裸串兜底 */ }
      return { t: String(raw), e: "" };
    }

    function loadAuth() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { raw = null; }
      acc = (raw && raw.token) ? raw : null;
      try { lastSync = Number(localStorage.getItem("readtrace.syncAt")) || 0; } catch (e) { lastSync = 0; }
      return acc;
    }
    function saveAuth(a) {
      acc = a || null;
      try {
        if (acc) localStorage.setItem(AUTH_KEY, JSON.stringify(acc));
        else localStorage.removeItem(AUTH_KEY);
        if (!acc) localStorage.removeItem("readtrace.syncAt");
      } catch (e) { /* 隐私模式 */ }
    }
    function call(payload) {
      const body = {};
      for (const k in payload) { if (Object.prototype.hasOwnProperty.call(payload, k)) body[k] = payload[k]; }
      if (acc && acc.token) body.token = acc.token;
      /* 25 秒硬超时：云函数整体上限 20s，网关再慢也该到了。没有它，一次悬挂的
         请求会让 promise 永不 settle —— 同步永远停在「同步中」，catch 与退避
         重试全都进不来（v1.94 补）。 */
      const ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 25000) : 0;
      return fetch(URL_FN, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + KEY },
        body: JSON.stringify(body),
        signal: ctl ? ctl.signal : undefined
      }).then(res => res.text().then(txt => {
        let j = null;
        try { j = JSON.parse(txt); } catch (e) { j = null; }
        if (!j || j.ok !== true) {
          const err = new Error((j && j.msg) || "网络连接失败，请稍后再试");
          err.code = (j && j.err) || "network";
          throw err;
        }
        /* 会话续期（#171）：服务端在剩余不足 30 天时会顺带回一枚新 token。
           调用方完全无感 —— 就在这儿换掉，免得某天突然被踢出去要重输密码。 */
        if (j.token && acc) {
          acc.token = j.token;
          try { localStorage.setItem(AUTH_KEY, JSON.stringify(acc)); } catch (e) {}
        }
        return j;
      })).catch(e => {
        /* 超时中止（AbortError）换成人话，code 归到 timeout —— 退避重试照走 */
        if (e && e.name === "AbortError") {
          const err = new Error("请求超时，请稍后再试");
          err.code = "timeout";
          throw err;
        }
        throw e;
      }).finally(() => { if (timer) clearTimeout(timer); });
    }
    return {
      account: () => acc,
      signedIn: () => !!(acc && acc.token),
      loadAuth: loadAuth,
      saveAuth: saveAuth,
      call: call,
      lastSync: () => lastSync,
      setLastSync: v => {
        lastSync = v || 0;
        try { localStorage.setItem("readtrace.syncAt", String(lastSync)); } catch (e) {}
      },
      /* 本机免密：凭据（含上次邮箱）存取。clearDevice 只在"关开关 / 注销账号"时调 */
      deviceToken: () => devRec().t,
      deviceMail: () => devRec().e,
      saveDevice: (t, email) => {
        try {
          if (t) localStorage.setItem(DEV_KEY, JSON.stringify({ t: String(t), e: String(email || "") }));
          else localStorage.removeItem(DEV_KEY);
        } catch (e) { /* 隐私模式 */ }
      },
      clearDevice: () => { try { localStorage.removeItem(DEV_KEY); } catch (e) {} }
    };
  })();

  /* --- 15c. 同步：差异收集 → 防抖上行 → 拉取合并 --- */

  const SIG_KEY = "readtrace.sig";
  let sigMap = {};
  let syncStatus = "local";       /* local | syncing | pending | error */
  let syncTimer = null;
  let retryStep = 0;
  let syncBusy = false;           /* 有一轮同步在途（v1.94：防手动重试/防抖上行并发起第二条链） */
  const RETRY_MS = [2000, 8000, 30000];
  /* 拉取游标回退量。拉取筛选用的是**写入设备自己写进云端的** updatedAt（客户端钟），
     而游标从服务端的 serverTime 走 —— 两台钟差多少就漏多少条。原先只退 2 分钟，
     写入设备慢 2 分钟以上时新数据对其他设备永久不可见（since 只进不退）。
     退 24 小时把这点偏差彻底吃掉：多拉的都是内容比对相同的回声，
     mergeRemote 的签名比对会拦住它们，不触发多余重渲染（v1.94 从 2 分钟放大）。 */
  const PULL_SLACK = 86400000;

  function loadSigs() {
    try { sigMap = JSON.parse(localStorage.getItem(SIG_KEY)) || {}; } catch (e) { sigMap = {}; }

    /* 退役演示数据：给它们派生的 rid 记一个"曾同步过"的假签名（值不是 "tomb"），
       于是 collectDirty 里"签名表有、本机已无"的分支会为它们生成墓碑 —— 复用现成
       机制清掉云端那批，不另开通道。只做一次，做完置位并落盘。
       注：existing 真签名会被覆盖成假签名，这是**故意**的 —— 它们本来就要被删。 */
    if (state.needRetireTomb) {
      RETIRED_NOTE_IDS.forEach(id => { sigMap["n:" + uuidFrom("rt.note:" + id)] = "seed-x"; });
      state.needRetireTomb = false;
      persistSigs();
      Repo.write(state);
    }
  }
  function persistSigs() {
    try { localStorage.setItem(SIG_KEY, JSON.stringify(sigMap)); } catch (e) {}
  }

  const noteSig = n => (n.ts || "") + "|" + (n.text || "") + "|" + (n.bookId || "");
  /* ⚠️ 名册里的人签名必须与改动前**逐字节相同**（老信的签名表已经落盘，格式一变
     全部判成「脏」→ 全量重推一次）。名册之外的信才追加 book/who 一段。 */
  const letterSig = l => (l.fid || "") + "|" + (l.ts || "") + "|" + (l.text || "") + "|" + (l.reply || "")
    + ((!l.fid && (l.book || l.who)) ? ("|" + (l.book || "") + "/" + (l.who || "")) : "");
  /* 不传参就是本机现状；传一个远端 prefs 文档也能算 —— 用来判断"值其实没变"，
     避免每次同步都因为时间戳更新而白重渲染一遍。
     ⚠️ 日记封面图（#161）只把**哈希**放进签名 —— 它是几十上百 KB 的 base64，
     整串进签名表（readtrace.sig 与存档是两个键）会把它撑爆（同 bookSig 的做法）。
     全空（从没传过）时写空串，别让 strHash(undefined) 参与比较：undefined 与
     "" 会算成同一串，那么"从没传过"与"用户删掉了"就分不开了。 */
  function prefsSig(src) {
    const s = src || state;
    /* ⚠️ #174：远端那份 prefs 文档里字段叫 **hero**，本机内存里叫 **heroImg**
       （#161 的历史口径），这里两个都要认 —— 只读 heroImg 的话，传远端文档进来时
       它恒为 undefined，于是「只有图不一样」被判成相等，别的设备换了图本机**永远
       拉不下来**（同一份比对还兼管「值其实没变就别白重渲染」）。 */
    const hero = (typeof s.hero === "string") ? s.hero : (s.heroImg || "");
    return JSON.stringify({ theme: s.theme, sound: !!s.sound, haptic: !!s.haptic, miss: s.miss || {},
                            hero: hero ? strHash(hero) : "", lsq: s.listSeq || 0 });
  }

  /* 收集"与上次成功上行时不同"的条目。不碰业务代码：
     新建/改写在数组里表现为签名变化，删除表现为 id 消失 → 生成墓碑。 */
  function collectDirty() {
    const out = { notes: [], letters: [], books: [], booklists: [], prefs: null };
    const alive = {};

    (state.notes || []).forEach(n => {
      const key = "n:" + ensureNoteRid(n);
      alive[key] = 1;
      if (sigMap[key] !== noteSig(n)) out.notes.push(toRemoteNote(n));
    });
    (state.letters || []).forEach(l => {
      const key = "l:" + ensureLetterRid(l);
      alive[key] = 1;
      if (sigMap[key] !== letterSig(l)) out.letters.push(toRemoteLetter(l));
    });
    (state.books || []).forEach(b => {
      const key = "b:" + ensureBookRid(b);
      alive[key] = 1;
      if (sigMap[key] !== bookSig(b)) out.books.push(toRemoteBook(b));
    });
    (state.booklists || []).forEach(l => {
      const key = "k:" + ensureListRid(l);
      alive[key] = 1;
      if (sigMap[key] !== listSig(l)) out.booklists.push(toRemoteList(l));
    });

    /* 已同步过、如今不在了 → 墓碑（软删除），否则另一台设备会把它"复活"。
       已经记成 "tomb" 的不再重放：墓碑推一次就够，否则每次同步都会白上行一条。 */
    for (const key in sigMap) {
      if (key === "p" || alive[key] || sigMap[key] === "tomb") continue;
      const id = key.slice(2);
      const tomb = { id: id, updatedAt: stampNow(), deletedAt: stampNow() };
      const kind = key.charAt(0);
      if (kind === "n") out.notes.push(tomb);
      else if (kind === "l") out.letters.push(tomb);
      else if (kind === "b") out.books.push(tomb);
      else out.booklists.push(tomb);   /* 签名表里只剩 k: 一种前缀（p 已在上面跳过） */
    }

    /* ⚠️⚠️ #174：**「图不在内存」不等于「用户删了图」**。
       图可能只是还在补水（冷启动时 prefsSig() 先算成空串），也可能本地库那份没了 ——
       两种都不是用户的动作。这种状态**整块 prefs 都不上行**：服务端对 prefs 是
       整篇替换（rt-api index.js：Object.assign + set），少一个字段同样等于把云端
       那份图删了（实测：只「不带 hero 字段」仍会把远端抹掉）。
       宁可这一轮不同步主题这类小偏好，也不能把云端那份（很可能是最后一份）丢掉。
       用户真删图时 heroSig 是 null，走下面那条正常路径，删除照旧能传上去。 */
    if (sigMap.p !== prefsSig() && !(state.heroSig && !state.heroImg)) {
      out.prefs = { theme: state.theme, sound: !!state.sound, haptic: !!state.haptic, miss: state.miss || {}, updatedAt: stampNow() };
      /* 日记封面图随这一份文档走（#161）。**空串 = 用户删掉了图** ——
         必须把「删」这个动作本身送上去（别的设备据此也摘掉），不能不带这个键：
         服务端对 prefs 是整体覆盖，不带就等于"这次同步没说图的事"，
         但也意味着本机删图后别的设备永远留着旧图。 */
      state.heroAt = Date.parse(out.prefs.updatedAt) || Date.now();   /* 存档契约字段 */
      out.prefs.hero = state.heroImg || "";
      /* 书单 id 水位线随 prefs 上行（v1.94）：第二台设备新建书单时 nextListId
         靠它越过云上已有 id —— 不带的话远端书单在本机是 rid 形态 id，
         /^k(\d+)$/ 扫不出历史最大值，新建必得 "k1"，与源设备第一册同 rid，
         云端按 rid 合并时两册不同书单互相覆盖。 */
      out.prefs.listSeq = state.listSeq || 0;
    }
    return out;
  }

  function commitSigs(dirty, staleKeys) {
    /* 顺序要紧：**先**清过期的键，**再**写这一轮的签名。
       反过来的话，一个刚被本机删掉的条目会先在墓碑分支里记成 "tomb"，
       紧接着又被 stale 列表删掉 —— 于是这次上行一旦失败，删除就再也重放不出来，
       那条记录会在别的设备上活过来。 */
    (staleKeys || []).forEach(k => { delete sigMap[k]; });
    (dirty.notes || []).forEach(d => { sigMap["n:" + d.id] = d.deletedAt ? "tomb" : null; });
    (dirty.letters || []).forEach(d => { sigMap["l:" + d.id] = d.deletedAt ? "tomb" : null; });
    (dirty.books || []).forEach(d => { sigMap["b:" + d.id] = d.deletedAt ? "tomb" : null; });
    (dirty.booklists || []).forEach(d => { sigMap["k:" + d.id] = d.deletedAt ? "tomb" : null; });
    (state.notes || []).forEach(n => { sigMap["n:" + ensureNoteRid(n)] = noteSig(n); });
    (state.letters || []).forEach(l => { sigMap["l:" + ensureLetterRid(l)] = letterSig(l); });
    (state.books || []).forEach(b => { sigMap["b:" + ensureBookRid(b)] = bookSig(b); });
    (state.booklists || []).forEach(l => { sigMap["k:" + ensureListRid(l)] = listSig(l); });
    /* prefs 的记账与 collectDirty 的闸门同一把尺子：补水抑制的那一轮**不记账** ——
       记了就等于把没发出的 prefs 说成「已同步」，主题/声音这些本地改动就再也不
       上行了（v1.94 修复；原先这里无条件 sigMap.p = prefsSig()）。 */
    if (!(state.heroSig && !state.heroImg)) sigMap.p = prefsSig();
    persistSigs();
  }

  function dirtyCount() {
    const d = collectDirty();
    return d.notes.length + d.letters.length + d.books.length + d.booklists.length +
           (d.prefs ? 1 : 0) + (profile && profile.dirty ? 1 : 0);
  }

  function setSync(s) {
    syncStatus = s;
    Repo.setStatus(s === "syncing" ? "syncing" : (s === "pending" || s === "error" ? "pending" : "local"));
    renderAccount();
  }

  function scheduleSync(delay) {
    if (!Cloud.signedIn()) return;
    setSync("pending");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncNow(); }, delay == null ? 800 : delay);
  }

  /* 退役演示数据的判定。这批记录**所有设备上都一样**，拿它当冲突依据会让每台新设备
     首登时都被弹一次三选一，而答案永远一样；何况它们已从本机清掉，绝不能让云端那批
     随一次 pull 复活。两张表都等第一次用到时再建，避免启动开销。 */
  let _retiredById = null, _retiredByRid = null;
  function retiredById() {
    if (!_retiredById) {
      _retiredById = {};
      RETIRED_NOTE_IDS.forEach(id => { _retiredById[id] = 1; });
    }
    return _retiredById;
  }
  function retiredByRid() {
    if (!_retiredByRid) {
      _retiredByRid = {};
      RETIRED_NOTE_IDS.forEach(id => { _retiredByRid[uuidFrom("rt.note:" + id)] = 1; });
    }
    return _retiredByRid;
  }
  function isRetiredNote(n) {
    return !!n.seed || !!retiredById()[n.id] || !!retiredByRid()[n.rid];
  }
  function countLocal() {
    return (state.notes || []).filter(n => !isRetiredNote(n)).length +
           (state.letters || []).length + (state.books || []).length +
           (state.booklists || []).length;
  }
  function countRemote(res) {
    const byRid = retiredByRid();
    return (res.notes || []).filter(d => !d.seed && !byRid[d._id] && !d.deletedAt).length +
           (res.letters || []).filter(d => !d.deletedAt).length +
           (res.books || []).filter(d => !d.deletedAt).length +
           (res.booklists || []).filter(d => !d.deletedAt).length;
  }

  function syncNow(manual) {
    if (!Cloud.signedIn()) { setSync("local"); return Promise.resolve(); }
    /* 在途就不重入：手动重试、保存资料 800ms 后的防抖上行、obdFinish 可能同时
       到达 —— 并发起第二条 push/pull 链时 skipPullOnce 这类一次性标志会被另一条
       链误消费，全靠服务端 LWW 兜底是不够的（v1.94 补）。正跑着的这轮结束后，
       状态自然落回 local/pending，用户再点重试照常有效。 */
    if (syncBusy) { setSync("syncing"); return Promise.resolve(); }
    if (pendingRemote) { setSync("pending"); return Promise.resolve(); }   /* 等用户在合并弹层里选 */
    clearTimeout(syncTimer);
    if (manual) retryStep = 0;
    setSync("syncing");
    syncBusy = true;

    /* 首次登录（签名表里还没有 "p"，见 isFirstLogin）必须**先拉后推**。反过来的话，
       本机全部内容都会被当成"新增"推上去，静默盖掉云端 —— 那是数据事故，不是同步。 */
    let p;
    if (isFirstLogin() && !firstProbed) {
      p = Cloud.call({ action: "pull", since: 0 })
        .then(res => { firstProbed = true; return afterProbe(res, manual); })
        .catch(handleSyncError);
    } else {
      p = runSync(manual);
    }
    return p.finally(() => { syncBusy = false; });
  }

  /* 首登前的全量比对有三种结局：两边都有 → 让用户选；只有云端有 → 采纳云端；
     云端空 → 本机全量上行（走常规路径即可，空签名表正好把全部条目判为"脏"）。 */
  function afterProbe(res, manual) {
    const localCount = countLocal();
    const remoteCount = countRemote(res);

    if (remoteCount && localCount) {
      pendingRemote = res;
      setSync("pending");
      askMerge(localCount);
      return Promise.resolve();
    }
    if (remoteCount) {
      Cloud.setLastSync(res.serverTime || Date.now());
      mergeRemote(res);
      sigMap = {};
      commitSigs({ notes: [], letters: [], books: [], booklists: [], prefs: null }, []);
      state.prefsAt = Date.now();
      Repo.write(state);
      setSync("local");
      rerenderAll();
      return Promise.resolve();
    }
    return runSync(manual);
  }

  function runSync(manual) {
    const dirty = collectDirty();
    const stale = [];
    for (const key in sigMap) {
      if (key === "p") continue;
      let found = false;
      const kind = key.charAt(0);
      if (kind === "n") found = (state.notes || []).some(n => "n:" + ensureNoteRid(n) === key);
      else if (kind === "l") found = (state.letters || []).some(l => "l:" + ensureLetterRid(l) === key);
      else if (kind === "b") found = (state.books || []).some(b => "b:" + ensureBookRid(b) === key);
      else found = (state.booklists || []).some(l => "k:" + ensureListRid(l) === key);
      if (!found) stale.push(key);
    }
    const hasDirty = !!(dirty.notes.length || dirty.letters.length || dirty.books.length ||
                        dirty.booklists.length || dirty.prefs);
    let pushAt = 0;

    const first = hasDirty
      ? Cloud.call({ action: "push", notes: dirty.notes, letters: dirty.letters,
                     books: dirty.books, booklists: dirty.booklists, prefs: dirty.prefs })
          .then(r => { pushAt = (r && r.serverTime) || Date.now(); return r; })
      : Promise.resolve(null);

    /* 资料补发（#122）：本机改过还没推上去的 profile，随这一轮同步送一次。
       单独一条 profile action 而不是搭 push 的车 —— pushAll 按 kind 收脏数据，
       资料在 rt_users 上，语义不同。失败不拦同步：dirty 留着，下一轮再投。 */
    const profJob = (profile && profile.dirty && Cloud.signedIn())
      ? Cloud.call({ action: "profile",
                     profile: { signature: profile.signature, avatar: profile.avatar,
                                nickname: profile.nickname || "" },
                     updatedAt: profile.updatedAt })
          .then(() => { markProfileClean(); })
          .catch(() => {})
      : Promise.resolve(null);

    return Promise.all([first, profJob]).then(() => {
      if (hasDirty) {
        commitSigs(dirty, stale);
        /* 记下 prefs 的落库时刻，免得紧接着的 pull 把同值 prefs 当成"远端更新"再刷一遍 */
        if (dirty.prefs) { state.prefsAt = pushAt || Date.now(); Repo.write(state); }
      }
      if (skipPullOnce) {
        /* 刚做过全量比对（或用户选了"以本机为准"），这一次不拉 */
        skipPullOnce = false;
        if (pushAt) Cloud.setLastSync(pushAt);
        retryStep = 0;
        Repo.flush();
        setSync("local");
        return null;
      }
      /* since 取"上次记下的服务端时刻"再往回退 2 分钟：
         拉取筛选用的是客户端写进去的时间戳（客户端钟），而游标是服务端钟，
         两台钟差多少就漏多少条。退 2 分钟把这点偏差吃掉，重复拉到的条目
         因为内容比对相同，不会引发多余重渲染。 */
      return Cloud.call({ action: "pull", since: Math.max(0, (Cloud.lastSync() || 0) - PULL_SLACK) });
    }).then(res => {
      if (!res) return;
      /* 拉之前先记下"哪些信还在等回信"，合并完一比就知道这轮有没有回信到达 */
      const waited = {};
      (state.letters || []).forEach(l => { if (!l.reply) waited[ensureLetterRid(l)] = 1; });
      const changed = mergeRemote(res);
      const arrived = (state.letters || []).filter(l => waited[ensureLetterRid(l)] && l.reply);
      if (arrived.length) {
        toast(arrived.length === 1
          ? (figOf(arrived[0].fid).short + " 回信了")
          : ("收到 " + arrived.length + " 封回信"));
        /* #150：记下是哪几封 —— renderInteract 在互动页上把小家伙的「!」惊醒演一遍 */
        arrived.forEach(l => { freshReplies[ensureLetterRid(l)] = 1; });
      }
      Cloud.setLastSync(res.serverTime || Date.now());
      retryStep = 0;
      Repo.flush();
      setSync("local");
      /* 合并结果**必须落盘**。只重渲染不写盘的话，这一轮拉到的墓碑就丢了：
         下次启动本地还留着那条被删的记录，而增量拉取（since 已经走过墓碑）
         再也不会把它删一次 —— 于是死而复生。 */
      if (changed) {
        commitSigs(dirty, stale);   /* 合并后的状态重新记账：被删掉的条目不该再留着文本签名 */
        Repo.write(state);
        rerenderAll();
      }
      /* 这一轮没拉到回信也要重新排期：否则定时器只会在"内容有变化"时才续上，
         等回信这件事会悄悄断掉（服务端延迟比客户端长时会正好卡在这里）。 */
      scheduleReplyCheck();
    }).catch(handleSyncError);
  }

  function handleSyncError(err) {
    /* 静默重试对用户是对的，对排查是灾难：真机上只看到"待同步"却不知道卡在哪。
       留一行控制台痕迹，不改用户可见行为。 */
    if (window.console && console.warn) {
      console.warn("[readtrace] 同步失败:", (err && (err.stack || err.message)) || String(err));
    }
    if (err && err.code === "unauthorized") {
      /* 只清登录态，**不动签名表** —— 它描述的是"上次成功同步时的样子"，
         重新登录后靠它算增量；清掉会让下一次同步重放全量。 */
      Cloud.saveAuth(null);
      toast("登录状态已失效，请重新登录");
      setSync("local");
      rerenderAll();
      /* #171：会话过期不该是个死胡同 —— 立刻把登录浮层拉起来（它顶上就有一键进入，
         手上没凭据时至少也是密码框）。否则用户得自己跑去设置里找「登录 / 注册」。 */
      if (!byId("authSheet").classList.contains("is-open")) openAuth("login");
      return;
    }
    /* 退避重试：2s → 8s → 30s，三次仍失败就停在"待同步"，下次启动再投。
       耗尽后把步子**归零**：否则下一次本地改动触发的自动同步一旦失败，
       会一个退避都不走直接报错，新改动永远零重试（v1.94 修复）。 */
    if (retryStep < RETRY_MS.length) {
      const wait = RETRY_MS[retryStep++];
      setSync("pending");
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => { syncNow(); }, wait);
    } else {
      retryStep = 0;
      setSync("error");
    }
    Repo.enqueue({ at: Date.now(), pending: dirtyCount() });
  }

  /* 远端 → 本地（LWW：以 updatedAt 较新者为准；墓碑优先） */
  function mergeRemote(res) {
    let changed = false;
    adoptProfile(res && res.profile);   /* 资料随每一轮 pull 收敛（#122），所有拉取路径都过这里 */

    const byRid = {};
    (state.notes || []).forEach(n => { byRid[ensureNoteRid(n)] = n; });
    (res.notes || []).forEach(d => {
      const at = Date.parse(d.updatedAt) || 0;
      const local = byRid[d._id];
      if (d.deletedAt) {
        if (local) { removeNote(local.id); changed = true; }
        return;
      }
      /* 退役的演示数据一律不进列表：别的设备上还装着旧版本，它们仍会把种子
         当用户数据推回云端 —— 少了这道过滤，刚清掉的东西会随下一次 pull 复活。 */
      if (retiredByRid()[d._id]) return;
      if (!local) { state.notes.push(fromRemoteNote(d)); changed = true; }
      else if (at > (local.updatedAt || 0)) {
        const merged = fromRemoteNote(d);
        /* 内容一模一样就只更新时间戳（比如刚推上去又被 since 拉回来的回声），
           不算"变了" —— 否则每写一条随笔都会白重渲染整个书架。 */
        if (noteSig(merged) !== noteSig(local)) {
          merged.id = local.id;                 /* 本地 id 形态保持不变 */
          Object.assign(local, merged);
          changed = true;
        } else {
          local.updatedAt = at;
        }
      }
    });

    const byLrid = {};
    (state.letters || []).forEach(l => { byLrid[ensureLetterRid(l)] = l; });
    (res.letters || []).forEach(d => {
      const at = Date.parse(d.updatedAt) || 0;
      const local = byLrid[d._id];
      if (d.deletedAt) {
        if (local) { state.letters.splice(state.letters.indexOf(local), 1); changed = true; }
        return;
      }
      if (!local) { state.letters.push(fromRemoteLetter(d)); changed = true; }
      else if (at > (local.updatedAt || 0)) {
        const merged = fromRemoteLetter(d);
        if (letterSig(merged) !== letterSig(local)) {
          Object.assign(local, merged);
          changed = true;
        } else {
          local.updatedAt = at;
        }
      }
    });

    const byBrid = {};
    (state.books || []).forEach(b => { byBrid[ensureBookRid(b)] = b; });
    (res.books || []).forEach(d => {
      const at = Date.parse(d.updatedAt) || 0;
      const local = byBrid[d._id];
      if (d.deletedAt) {
        if (local) { removeBook(local.id); changed = true; }
        return;
      }
      if (!local) { state.books.push(fromRemoteBook(d)); changed = true; }
      else if (at > (local.updatedAt || 0)) {
        const merged = fromRemoteBook(d);
        /* 内容一样就只推时间戳（比如刚推上去又被 since 拉回来的回声），不算「变了」 */
        if (bookSig(merged) !== bookSig(local)) {
          merged.id = local.id;                 /* 本地 id 形态保持不变 */
          Object.assign(local, merged);
          changed = true;
        } else {
          local.updatedAt = at;
        }
      }
    });
    /* #199 自愈：拉回合并可能把同 rid 双本并进账 —— 先拆开再重灌工作副本。
       动过就置 changed，调用方随后的 Repo.write 会把新 rid 落盘、下一轮上行
       把拆出来的那本作为独立文档送上去。 */
    if (healBookRids()) changed = true;
    /* 书目有增删就把工作副本 BOOKS 重灌一遍，渲染层立刻能看见 */
    syncBooksFromState();
    /* 拉回来的这几本是刚进内存的，签名账本里还没有它们 —— 不在这儿搬一次，
       封面只会内联进 localStorage（一直占着那 5MB），非要等用户下次触发
       save() 才补搬。 */
    stashCovers();

    /* 书单必须排在书目**之后**合并：listBookIdsFromRids 靠 ensureBookRid 建的
       rid → 本机 id 映射来换算，书目还没进来就换算不出任何一本书。 */
    const byKrid = {};
    (state.booklists || []).forEach(l => { byKrid[ensureListRid(l)] = l; });
    (res.booklists || []).forEach(d => {
      const at = Date.parse(d.updatedAt) || 0;
      const local = byKrid[d._id];
      if (d.deletedAt) {
        if (local) { removeList(local.id); changed = true; }
        return;
      }
      if (!local) { state.booklists.push(fromRemoteList(d)); changed = true; }
      else if (at > (local.updatedAt || 0)) {
        const merged = fromRemoteList(d);
        if (listSig(merged) !== listSig(local)) {
          merged.id = local.id;                 /* 本地 id 形态保持不变 */
          Object.assign(local, merged);
          changed = true;
        } else {
          local.updatedAt = at;
        }
      }
    });

    /* 书单有增删就把工作副本 LISTS 重灌一遍（改已有条目共享引用，不必管）。 */
    syncListsFromState();

    const p = res.prefs;
    if (p && (Date.parse(p.updatedAt) || 0) > (state.prefsAt || 0)) {
      state.prefsAt = Date.parse(p.updatedAt) || 0;
      if (prefsSig(p) !== prefsSig()) {
        if (typeof p.theme === "string" && p.theme !== state.theme) { state.theme = p.theme; setTheme(p.theme); }
        if (typeof p.sound === "boolean") state.sound = p.sound;
        if (typeof p.haptic === "boolean") state.haptic = p.haptic;
        if (p.miss) state.miss = p.miss;
        /* 书单 id 水位线：两边取大 —— 本机可能刚建了书单还没推上去，
           远端的 listSeq 落后于本地，取小了下次新建就会复用旧 id。 */
        if (Number(p.listSeq) > (state.listSeq || 0)) state.listSeq = Number(p.listSeq);
        /* 日记封面图（#161）：服务端对 prefs 是整体覆盖，不需要逐字段合并。
           字符串 = 换上；空串 = 那台设备把图删了。
           ⚠️ #174：本地那份**同步删干净**（库里的行 + 账本哨兵），不然下次启动
           hydrateHero 会把库里的旧图当「签名丢了但图还在」捡回来 —— 用户明明在
           另一台设备上删过，这边又冒出来还推回云端。 */
        if (typeof p.hero === "string") {
          state.heroAt = Date.parse(p.updatedAt) || 0;   /* 存档契约字段 */
          if (p.hero && p.hero !== state.heroImg) {
            state.heroImg = p.hero;
            state.heroSig = coverSig(p.hero);
            renderHero();
          } else if (!p.hero && (state.heroImg || state.heroSig)) {
            state.heroImg = null;
            state.heroSig = null;
            safeCoverSigs.set(HERO_KEY, "gone");
            CoverDB.write([{ k: HERO_KEY, v: null }]);
            renderHero();
          }
        }
        changed = true;
      }
    }
    return changed;
  }

  function removeNote(localId) {
    const i = (state.notes || []).findIndex(n => n.id === localId);
    if (i >= 0) state.notes.splice(i, 1);
  }
  function removeBook(localId) {
    const i = (state.books || []).findIndex(b => b.id === localId);
    if (i >= 0) state.books.splice(i, 1);
    /* 书没了，书单里那条引用跟着悬空 —— 顺手摘掉，别让它留在数据里等下一次上行。 */
    pruneLists();
  }
  function removeList(localId) {
    const i = (state.booklists || []).findIndex(l => l.id === localId);
    if (i >= 0) state.booklists.splice(i, 1);
  }

  function rerenderAll() {
    sortNotes();
    renderShelf();
    renderRecord();
    renderInteract();
    renderLists();
    renderSettings();   /* 设置页有三行随登录态增删，登录/登出后必须重画 */
    renderAccount();
    renderFootprint();  /* 同步合并 / 登录态变化都可能带来计数变化，顺手重画 */
  }

  /* --- 15d. 账号动作 --- */

  function isSignedIn() { return Cloud.signedIn(); }

  /* --- 本机免密（#171）---
     「退出登录之后别再让我输密码」。不存密码：登录成功时服务端另发一枚长期设备凭据，
     存本机；退出登录只清会话，留着它 —— 下次进 App 点一下「一键进入」就回来。
     默认开（用户要的就是这个）；关掉之后退出登录 = 老行为（下次必须输密码）。
     开关的**显示口径就是"本机此刻真有一枚凭据"**，而不是偏好值 —— 凭据被撤销过、
     或换机重装后偏好还在但没凭据，开关就不该显示成"已开"（那会骗人）。 */
  const DEV_OPT_KEY = "readtrace.deviceOpt";
  function deviceOptOn() {
    try { return localStorage.getItem(DEV_OPT_KEY) !== "0"; } catch (e) { return true; }
  }
  function setDeviceOpt(on) {
    try { localStorage.setItem(DEV_OPT_KEY, on ? "1" : "0"); } catch (e) {}
  }
  function hasDevice() { return !!Cloud.deviceToken(); }

  /* 登录成功那一刻：记住本机（偏好开着才记），顺带把邮箱存进凭据记录里 */
  function rememberOnLogin(res) {
    if (res && res.deviceToken && deviceOptOn()) Cloud.saveDevice(res.deviceToken, res.email);
  }

  function doLogin(email, pwd) {
    return Cloud.call({ action: "login", email: email, password: pwd, remember: deviceOptOn() }).then(res => {
      Cloud.saveAuth({ token: res.token, uid: res.uid, email: res.email, nickname: res.nickname });
      rememberOnLogin(res);
      return res;
    });
  }
  function doRegister(email, pwd, invite) {
    return Cloud.call({ action: "register", email: email, password: pwd, inviteCode: invite, remember: deviceOptOn() }).then(res => {
      Cloud.saveAuth({ token: res.token, uid: res.uid, email: res.email, nickname: res.nickname });
      rememberOnLogin(res);
      return res;
    });
  }
  function doRecover(email, rc, newPwd) {
    return Cloud.call({ action: "resetPwd", email: email, recoveryCode: rc, newPassword: newPwd, remember: deviceOptOn() }).then(res => {
      Cloud.saveAuth({ token: res.token, uid: res.uid, email: res.email, nickname: res.nickname });
      rememberOnLogin(res);
      return res;
    });
  }
  /* 一键进入：拿本机凭据换一枚新会话。不是"跳过登录"，真的换了新凭据（用一次换一枚） */
  function doDeviceLogin() {
    return Cloud.call({ action: "deviceLogin", deviceToken: Cloud.deviceToken() }).then(res => {
      Cloud.saveAuth({ token: res.token, uid: res.uid, email: res.email, nickname: res.nickname });
      if (res.deviceToken) Cloud.saveDevice(res.deviceToken, res.email);
      return res;
    });
  }
  /* 设置里「本机免密登录」开关。开：会话还在，请服务端补发一枚；关：先请服务端撤销
     （先撤后删 —— 反过来的话凭据已经不在手上，那一枚就再也撤不掉了），再删本机。 */
  function toggleDevice(on) {
    if (on) {
      return Cloud.call({ action: "makeDevice" }).then(res => {
        if (!res.deviceToken) throw new Error("没能开启，请稍后再试");
        const acc = Cloud.account() || {};
        Cloud.saveDevice(res.deviceToken, acc.email);
        setDeviceOpt(true);
        toast("已开启：下次在这台设备上点一下就能进入");
      }).catch(e => {
        toast((e && e.message) || "没能开启，请稍后再试");
        renderSettings();          /* 开关是乐观翻转的，失败要把它拨回去 */
      });
    }
    const t = Cloud.deviceToken();
    setDeviceOpt(false);
    Cloud.clearDevice();
    return Cloud.call({ action: "revokeDevice", deviceToken: t })
      .catch(() => { /* 网断了也照样关掉本机这一枚；服务端那条留到下次开开关时再撤 */ })
      .then(() => { toast("已关闭：下次登录需要密码"); });
  }

  /* 首次登录（本机从没同步过）。此时若两边都有内容，
     必须让用户选，不能替他决定 —— 静默合并或静默覆盖都是数据事故。 */
  let pendingRemote = null;      /* 已拉下来的云端全量快照，等用户在弹层里裁决 */
  let skipPullOnce = false;      /* 下一次 runSync 跳过增量拉取（刚做过全量比对） */
  let firstProbed = false;       /* 本次会话是否已经探过云端；探过就不再重复弹层 */
  /* 首次登录：本机从没同步过。判据是签名表里没有 "p" —— 每次成功同步
     （commitSigs）都会写上它，所以「有 p」就等于「同步过」。
     别改成 `Object.keys(sigMap).length === 0`：退役墓碑是**进程内新塞进来的**假签名，
     会把一张空表变成非空表，于是首登被误判成「同步过」→ 先推后拉 → 空签名表把
     本机内容当新增推上去，静默盖掉云端。 */
  function isFirstLogin() {
    return !sigMap.p;
  }

  /* 登出：清掉本机缓存，避免游客态与账号态的数据混在一起。
     ⚠️ 本机免密（#171）：**设备凭据不清** —— 留着它，下次在这台设备上点一下就回来。
        想连凭据一起断掉，去设置里关「本机免密登录」，或注销账号。 */
  function askLogout() {
    const n = dirtyCount();
    askConfirm({
      title: "退出登录？",
      body: "退出会清空本机的缓存数据，云端不受影响，下次登录会拉回来。" +
            (hasDevice() ? "\n\n本机免密已开启：下次在这台设备上点一下就能回来，不用再输密码。" : "") +
            (n ? "\n\n⚠️ 还有 " + n + " 条改动没同步上去，退出会丢掉它们。" : ""),
      ok: "退出", danger: true
    }).then(ok => { if (ok) doLogout(); });
  }

  function doLogout() {
    Cloud.saveAuth(null);
    try {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(SIG_KEY);
      localStorage.removeItem("readtrace.syncAt");
      localStorage.removeItem("readtrace.queue");
    } catch (e) {}
    clearProfile();          /* 资料属于账号：退出即清，下次登录随 pull 回来 */
    sigMap = {};
    toast("已退出登录");
    setTimeout(() => { location.reload(); }, 620);
  }

  function doDeleteAccount() {
    return Cloud.call({ action: "deleteAccount" }).then(res => {
      Cloud.saveAuth(null);
      Cloud.clearDevice();     /* 账号没了，本机这枚凭据留着也没用（服务端那条随文档一起删） */
      try {
        localStorage.removeItem(STORE_KEY);
        localStorage.removeItem(SIG_KEY);
        localStorage.removeItem("readtrace.queue");
      } catch (e) {}
      clearProfile();        /* 用户文档连同资料一起在服务端删除了 */
      toast("账号与全部数据已删除");
      setTimeout(() => { location.reload(); }, 900);
      return res;
    });
  }

  /* --- 15e. 账号区渲染 --- */


  /* --- 15f. 个人资料（#122：签名 / 头像） ---------------------------------
     云端挂在 rt_users 文档上（rt-api 的 profile action，LWW 印章 profileAt）；
     本地缓存 readtrace.profile = {signature, avatar, updatedAt, dirty}。
     dirty = 「本机改过还没推上去」：runSync 每一轮随车补发一次 profile action，
     成功即清；失败不拦同步，下一轮再投。拉取方向由 mergeRemote 里的 adoptProfile
     按 updatedAt / profileAt 收敛 —— 印章相等或本机更新就不动，挡掉推上去的回声。
     头像两种形态：dataURL（客户端压成小图 JPEG，边长 AVA_OUT，服务端 ≤20000 字符）或 emoji。 */
  const PROFILE_KEY = "readtrace.profile";
  const PROF_EMOJIS = ["🌙", "📖", "✉️", "🔥", "🍃", "☕", "⭐", "🐟"];
  let profile = null;
  let profDraft = null;       /* 编辑浮层里的半成品 {signature, avatar} */

  function loadProfile() {
    try { profile = JSON.parse(localStorage.getItem(PROFILE_KEY)) || null; } catch (e) { profile = null; }
    if (!profile || typeof profile !== "object") profile = null;
  }
  function persistProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile || {})); } catch (e) {}
  }
  function markProfileClean() {
    if (profile && profile.dirty) { profile.dirty = false; persistProfile(); }
  }
  function clearProfile() {
    profile = null;
    profDraft = null;
    try { localStorage.removeItem(PROFILE_KEY); } catch (e) {}
  }
  function adoptProfile(rp) {
    if (!rp || typeof rp !== "object") return;
    const at = Number(rp.profileAt) || 0;
    if (!at) return;                                        /* 云端从没存过资料 */
    if (profile && (Number(profile.updatedAt) || 0) >= at) return;
    profile = {
      signature: String(rp.signature || ""),
      avatar: String(rp.avatar || ""),
      /* 昵称（#130）随同一条 LWW 印章走：云端没有就沿用本地，都没有则空
         （渲染时落到邮箱前缀）。另一台设备改的昵称从这里回来。 */
      nickname: String(rp.nickname || (profile && profile.nickname) || ""),
      updatedAt: at
    };
    persistProfile();
    /* 拉回来的昵称若与账号缓存不一致（登录后另一端改过），顺手刷掉缓存，
       renderAccount 读的是 acc.nickname */
    const acc = Cloud.account();
    if (acc && profile.nickname && acc.nickname !== profile.nickname) {
      Cloud.saveAuth({ token: acc.token, uid: acc.uid, email: acc.email, nickname: profile.nickname });
    }
    renderAccount();
  }

  /* 头像三形态：照片 dataURL 铺满圆形 / emoji 或短文本 / 昵称首字（未登录=「阅」） */
  function renderAvatarInto(el, acc, av) {
    if (!el) return;
    el.classList.remove("has-photo");
    el.style.backgroundImage = "";
    const a = acc ? String((av && av.avatar) || "") : "";
    if (a.lastIndexOf("data:image/", 0) === 0) {
      el.style.backgroundImage = 'url("' + a + '")';
      el.classList.add("has-photo");
      el.textContent = "";
    } else if (a) {
      el.textContent = a.slice(0, 2);
    } else if (acc) {
      const nick = meNick(acc);
      el.textContent = nick.charAt(0).toUpperCase();
    } else {
      el.textContent = "阅";
    }
  }

  /* #132 名字显示口径：昵称优先；云端注册时默认把昵称写成邮箱前缀（等于没设过），
     识别「昵称 == 邮箱前缀」视为未设置，落「读者」—— 绝不再拿邮箱/手机号前缀顶名字位。
     头像字与昵称两处显示都用它。 */
  function meNick(acc) {
    const p = profile && profile.nickname ? String(profile.nickname) : "";
    if (p) return p;
    const a = acc && acc.nickname ? String(acc.nickname) : "";
    const pre = acc ? String(acc.email || "").split("@")[0] : "";
    if (a && a !== pre) return a;
    return "读者";
  }

  function renderAccount() {
    const box = byId("meIdBlock");
    if (!box) return;
    const name = byId("meName"), sub = byId("meSub"), av = byId("avatar");
    const sig = byId("meSig"), edit = byId("meEdit");
    const acc = Cloud.account();

    if (acc) {
      const nick = meNick(acc);
      box.classList.add("is-in");
      if (name) name.textContent = nick;
      if (edit) edit.hidden = false;
      if (sig) {
        const s = profile ? String(profile.signature || "") : "";
        sig.textContent = s;
        sig.hidden = !s;
      }
      if (sub) {
        /* #132 文案换档次：正常态不报时间；「点这里」改「点按」 */
        if (syncStatus === "syncing") sub.textContent = "同步中…";
        else if (syncStatus === "pending") sub.textContent = "内容待同步 · 点按重试";
        else if (syncStatus === "error") sub.textContent = "同步未完成 · 点按重试";
        else sub.textContent = "云同步已开启";
      }
    } else {
      box.classList.remove("is-in");
      if (name) name.textContent = "未登录";
      if (sig) { sig.textContent = ""; sig.hidden = true; }
      if (edit) edit.hidden = true;
      if (sub) sub.textContent = "点此登录或注册";
    }
    renderAvatarInto(av, acc, profile);
  }

  /* --- 编辑资料浮层（#122）：body 就地生成，scrim 常驻（.plain 无模糊） --- */

  function closeProfSheet() {
    const sh = byId("profSheet");
    if (sh) { sh.classList.remove("is-open"); sh.setAttribute("aria-hidden", "true"); }
    profDraft = null;
  }

  function renderProfPreview() {
    const el = byId("profAv");
    if (!el || !profDraft) return;
    el.classList.remove("has-photo");
    el.style.backgroundImage = "";
    const a = String(profDraft.avatar || "");
    if (a.lastIndexOf("data:image/", 0) === 0) {
      el.style.backgroundImage = 'url("' + a + '")';
      el.classList.add("has-photo");
      el.textContent = "";
    } else if (a) {
      el.textContent = a.slice(0, 2);
    } else {
      const acc = Cloud.account();
      el.textContent = acc ? meNick(acc).charAt(0).toUpperCase() : "阅";
    }
    const clr = byId("profAvClear");
    if (clr) clr.hidden = !a;
  }

  function openProfSheet() {
    if (!Cloud.signedIn()) return;
    const sh = byId("profSheet");
    if (!sh) return;
    const acc = Cloud.account() || {};
    profDraft = {
      nickname: profile ? String(profile.nickname || "") : "",
      signature: profile ? String(profile.signature || "") : "",
      avatar: profile ? String(profile.avatar || "") : ""
    };
    byId("profBody").innerHTML =
      '<div class="sheet-grab"></div>' +
      '<div class="prof-head"><h3>编辑资料</h3></div>' +
      '<button class="sheet-close" id="profClose" type="button" aria-label="关闭">✕</button>' +
      '<div class="prof-avrow">' +
        '<div class="prof-av" id="profAv"></div>' +
        '<div class="prof-avacts">' +
          '<button class="prof-act" id="profAvaSet" type="button">设置头像…</button>' +
          '<button class="prof-act" id="profAvClear" type="button"' + (profDraft.avatar ? "" : " hidden") + '>移除头像</button>' +
        '</div>' +
      '</div>' +
      '<label class="prof-field"><span>昵称</span>' +
        '<input id="profNick" maxlength="12" placeholder="怎么称呼你（12 字以内）" value="' + lbEsc(profDraft.nickname) + '">' +
      '</label>' +
      '<label class="prof-field"><span>签名</span>' +
        '<input id="profSig" maxlength="40" placeholder="一句话介绍自己（40 字以内）" value="' + lbEsc(profDraft.signature) + '">' +
      '</label>' +
      '<div class="prof-field is-ro"><span>邮箱</span><b>' + lbEsc(acc.email || "") + '</b></div>' +
      '<button class="prof-save" id="profSave" type="button">保存</button>';

    byId("profClose").addEventListener("click", closeProfSheet);
    /* 头像选择走共用面板（#130）：Emoji / 拍照 / 相册 / 预设库都从那儿出，
       结果（emoji 或 dataURL）回写进 profDraft，保存时机仍归「保存」键管 */
    byId("profAvaSet").addEventListener("click", () => {
      /* 第二个参数 = 当前头像：面板据此给选中的那格打绿勾（#150） */
      openAvaSheet(v => { profDraft.avatar = v; renderProfPreview(); }, profDraft.avatar);
    });
    byId("profAvClear").addEventListener("click", () => { profDraft.avatar = ""; renderProfPreview(); });
    byId("profSave").addEventListener("click", saveProfileFromSheet);
    renderProfPreview();
    sh.classList.add("is-open");
    sh.setAttribute("aria-hidden", "false");
  }

  /* 拍照 / 相册的共用入口（#130）：读文件 → 裁剪台（1:1 头像模式）→ 回调。
     挪位置、缩放由用户自己来，程序不替他截中间；取消走 reject("已取消") ——
     静默收回，与封面裁剪台同一约定（§1.4）。 */
  function onAvaFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        openCoverCropper(img, "avatar")
          .then(url => { deliverAva(url); })
          .catch(err => { if (!err || err.message !== "已取消") toast("这张图片处理不了"); });
      };
      img.onerror = () => toast("这张图片读不出来");
      img.src = String(rd.result);
    };
    rd.onerror = () => toast("这张图片读不出来");
    rd.readAsDataURL(f);
  }

  function saveProfileFromSheet() {
    if (!profDraft) return;
    const sigEl = byId("profSig"), nickEl = byId("profNick");
    profile = {
      /* #132 起昵称在这里就能改（≤12 字，与云端 rt-api profile 的截断一致） */
      nickname: nickEl ? nickEl.value.trim().slice(0, 12) : ((profile && profile.nickname) || ""),
      signature: sigEl ? sigEl.value.trim().slice(0, 40) : "",
      avatar: profDraft.avatar || "",
      updatedAt: Date.now(),
      dirty: true
    };
    persistProfile();
    /* 昵称改动同步刷账号缓存（renderAccount 读 acc.nickname），与 adoptProfile 同一做法 */
    const acc = Cloud.account();
    if (acc && profile.nickname && acc.nickname !== profile.nickname) {
      Cloud.saveAuth({ token: acc.token, uid: acc.uid, email: acc.email, nickname: profile.nickname });
    }
    profDraft = null;
    renderAccount();
    closeProfSheet();
    toast("资料已保存");
    scheduleSync();          /* 资料随下一轮同步上行（runSync 里的 profJob） */
  }

  /* --- 「我的」页的两个点击目标（#138） ---
     以前整块头部只有一个去处：同步重试。于是同步正常时点头像完全没反应
     （用户报「点击头像查看不了」）。现在劈成两件事：

       · 照片头像（#avatar.has-photo，renderAccount 里 mark 的）→ 弹全屏大图；
         非照片头像（emoji / 昵称首字）没有可看的东西，不拦事件，
         落回头部这一层（= 已登录就开编辑资料）。
       · 头部其余地方 → 登录门 / 同步重试 / 编辑资料，三选一。
     设计稿（方案预览-我的页-功能完善版）里写的「点头像 → 编辑资料」即由此补齐。 */
  function onMeIdTap() {
    if (!Cloud.signedIn()) { openAuth("login"); return; }
    /* 同步没结清时这一下仍是「重试」—— 副标题当下就写着「点按重试」，
       把它改成开浮层等于骗用户。待选的合并弹层也走同一条（syncNow 会原地返回）。 */
    if (syncStatus === "syncing" || syncStatus === "pending" || syncStatus === "error") { syncNow(true); return; }
    openProfSheet();
  }

  function onMeAvaTap(e) {
    const av = byId("avatar");
    if (!av || !av.classList.contains("has-photo")) return;   /* 没图：交给头部那层 */
    e.stopPropagation();
    openAvaView();
  }

  /* 头像大图（#141 改版，样式照用户给的参考图）：黑底整页 + 顶栏（返回 ‹ · 标题「头像」· 「⋯」），
     图片按「层宽与源尺寸取小」铺出来 —— 新头像（≤1280px 源）全宽清晰，老账号小头像仍不超源
     （#140 的规矩没变：没有的细节拉不出来）。点任意处收起；**长按图片**或点「⋯」弹
     「保存到手机」抽屉。 */
  const AVA_HINT_PX = 480;                   /* 源小于它算「存得较小」，大图里给一句重设提示 */
  function openAvaView() {
    const src = profile ? String(profile.avatar || "") : "";
    if (src.lastIndexOf("data:image/", 0) !== 0) return;       /* 只有 emoji / 字：不给空台面 */
    const box = byId("avView"), img = byId("avViewImg");
    if (!box || !img) return;
    box.classList.add("is-open");            /* 先开层再量宽：display:none 时 clientWidth 是 0 */
    box.setAttribute("aria-hidden", "false");
    if (img.getAttribute("src") !== src) {
      img.setAttribute("src", src);
      img.style.width = img.style.height = "";    /* 上一张的行内尺寸别留在这一张上 */
      const fit = () => {
        if (!img.naturalWidth) return;
        const side = Math.min(box.clientWidth, img.naturalWidth);
        if (!side) return;
        img.style.width = side + "px";
        img.style.height = side + "px";
        /* 小图（v1.55 之前存的头像都是 256px 及以下）不放大也还是小 —— 与其让人对着小图猜
           「怎么这么糊」，不如当场给一条重设的路。文案随尺寸切，不占常驻位置；
           #142 起这句提示旁多一颗「重新设置头像」，一键回到头像面板（见 resetAvatarFromView）。 */
        const cap = byId("avViewCap");
        const small = img.naturalWidth < AVA_HINT_PX;
        if (cap) {
          cap.hidden = !small;
          if (small) cap.textContent = "这张头像存得较小，重设一次就会高清";
        }
        const rst = byId("avViewReset");
        if (rst) rst.hidden = !small;
      };
      /* dataURL 一般已经解码好；没好的话等 load 再量一次自然尺寸 */
      if (img.complete && img.naturalWidth) fit();
      else img.addEventListener("load", fit, { once: true });
    }
    avaStatusBar(true);
  }

  function closeAvaView() {
    const box = byId("avView");
    if (!box) return;
    avaLpCancel();                           /* 450ms 长按还在路上就收层：到点不许再弹抽屉（v1.94） */
    closeAvaSave();                          /* 抽屉浮在大图上：收大图必须连它一起收 */
    box.classList.remove("is-open");
    box.setAttribute("aria-hidden", "true");
    const img = byId("avViewImg");
    /* 收层时卸 src（不用 =""：空串会试着去请求页面自身）。下次开再挂回去。 */
    if (img && img.hasAttribute("src")) img.removeAttribute("src");
    avaStatusBar(false);
  }

  /* 大图页是黑的：状态栏跟着切黑底白图标，收层时交回主题（网页版没有 StatusBar，静默放过） */
  function avaStatusBar(on) {
    if (!isNativeShell()) return;
    const P = window.Capacitor && window.Capacitor.Plugins;
    const sb = P && P.StatusBar;
    if (!sb) return;
    try {
      if (on) {
        applyStatusBar("#000000", sb, P);   /* #186：大图页那条也走同一条路（亮度 → 浅色图标） */
      } else {
        syncNativeStatusBar(state.theme);
      }
    } catch (e) { /* 插件未就绪：静默放过 */ }
  }

  /* --- 「保存到手机」抽屉（#141）：长按大图或点「⋯」弹起，白底两行，像系统相册的动作表。
     保存走原生插件 GallerySave（MediaStore，Pictures/ReadTrace）；网页版没有它，退化为
     a[download] 下载。只认照片形态 —— 抽屉只从大图页里打开，那里必然是 dataURL。 --- */
  function openAvaSave() {
    const sh = byId("avaSave");
    if (!sh) return;
    sh.classList.add("is-open");
    sh.setAttribute("aria-hidden", "false");
  }

  function closeAvaSave() {
    const sh = byId("avaSave");
    if (!sh) return;
    sh.classList.remove("is-open");
    sh.setAttribute("aria-hidden", "true");
  }

  async function saveAvatarToPhone() {
    const src = profile ? String(profile.avatar || "") : "";
    if (src.lastIndexOf("data:image/", 0) !== 0) { closeAvaSave(); return; }
    const d = new Date();
    const pad = n => (n < 10 ? "0" + n : "" + n);
    const name = "readtrace-avatar-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
                 "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    const P = window.Capacitor && window.Capacitor.Plugins;
    const G = P && P.GallerySave;
    if (G && G.saveImage) {
      try {
        await G.saveImage({ dataUrl: src, name: name });
        closeAvaSave();
        toast("已保存到相册");
      } catch (e) {
        toast(e && e.message === "no_permission"
          ? "没拿到存储权限，去系统设置里开一下再试"
          : "保存没成功，再试一次");
      }
    } else {
      /* 网页版兜底：浏览器只能「下载」，落不到相册 —— 意思到了，别让它看着没反应。
         扩展名跟着 dataURL 的 MIME 走：预设脸谱是 PNG（toDataURL("image/png")），
         一律写 .jpg 会得到扩展名与内容不符的文件（v1.94 修复）。 */
      const a = document.createElement("a");
      a.href = src;
      a.download = name + (/^data:image\/png/.test(src) ? ".png" : ".jpg");
      document.body.appendChild(a);
      a.click();
      a.remove();
      closeAvaSave();
      toast("已开始下载");
    }
  }

  /* 「重新设置头像」（#142）：源太小（老账号停在 128/256px）时看图页给的一条捷径 ——
     收起大图 → 开共用头像面板（Emoji / 拍照 / 相册 / 预设库）→ 选完当场写进 profile
     并排上同步，再把新图重新铺回大图页（看得见「清晰了」的反馈，不用自己再点一次）。
     走的是与编辑资料里「设置头像…」完全相同的那条管线，只是省掉中间三步。 */
  function resetAvatarFromView() {
    closeAvaView();
    openAvaSheet(v => {
      if (!v) return;
      profile = {
        nickname: (profile && profile.nickname) || "",
        signature: (profile && profile.signature) || "",
        avatar: v,
        updatedAt: Date.now(),
        dirty: true
      };
      persistProfile();
      renderAccount();                 /* 头部那颗圆头像跟着换 */
      scheduleSync();                  /* 资料随下一轮同步上行（runSync 里的 profJob） */
      toast("头像已更新");
      setTimeout(openAvaView, 260);    /* 等面板 / 裁剪台收完，再拿新图重开大图页 */
    }, (profile && profile.avatar) || "");   /* 当前头像 → 面板里给选中那格打勾 */
  }

  /* 长按手势：按住 450ms 弹抽屉。动了算拖不算按；弹过之后那一下 click 要吞掉，
     不然冒泡到大图层的热区上就把整个大图关了（抽屉还开着底下先没了）。 */
  let avaLpTimer = 0, avaLpFired = false, avaLpPt = null;
  function avaLpCancel() { clearTimeout(avaLpTimer); avaLpTimer = 0; }
  function bindAvaView() {
    const img = byId("avViewImg");
    if (!img) return;
    img.addEventListener("contextmenu", e => e.preventDefault());
    img.addEventListener("pointerdown", e => {
      avaLpCancel();
      avaLpFired = false;
      avaLpPt = { x: e.clientX, y: e.clientY };
      avaLpTimer = setTimeout(() => {
        avaLpFired = true;
        avaLpTimer = 0;       /* 同 listLpTimer：已触发就清零（v1.94） */
        openAvaSave();
      }, 450);
    });
    img.addEventListener("pointermove", e => {
      if (avaLpTimer && avaLpPt &&
          (Math.abs(e.clientX - avaLpPt.x) > 10 || Math.abs(e.clientY - avaLpPt.y) > 10)) {
        avaLpCancel();
      }
    });
    img.addEventListener("pointerup", avaLpCancel);
    img.addEventListener("pointercancel", avaLpCancel);
    img.addEventListener("click", e => {
      if (avaLpFired) { e.stopPropagation(); avaLpFired = false; }
    });
  }

  /* --- 快捷动作与两张玻璃浮层（#132） ---
     面板本体走 .pad-sheet（#134 起是实心底 —— 用户嫌半透时底下的字看得见；
     顶缘细线 + 圆角留玻璃的边），scrim 沿用 .plain；
     返回键收层顺序见 closeTopOverlay 的 layers 表。 */

  function closeAboutSheet() {
    const sh = byId("aboutSheet");
    if (sh) { sh.classList.remove("is-open"); sh.setAttribute("aria-hidden", "true"); }
  }

  function closeHelpSheet() {
    const sh = byId("helpSheet");
    if (sh) { sh.classList.remove("is-open"); sh.setAttribute("aria-hidden", "true"); }
  }

  function openAboutSheet() {
    const sh = byId("aboutSheet");
    if (!sh) return;
    const ver = localVer ? "v" + localVer : "网页版";
    byId("aboutBody").innerHTML =
      '<div class="sheet-grab"></div>' +
      '<div class="about-logo">' +
        '<img src="assets/cover.png?v=114" alt="" width="40" height="40" draggable="false">' +
        '<div><h3>阅迹 ReadTrace</h3><p>记录读过的书、写下的随笔、写给书中人的信。</p></div>' +
      '</div>' +
      '<div class="about-ver">' + lbEsc(ver) + '</div>' +
      '<div class="about-rows">' +
        /* 行文案「导出阅读数据」保持不变：verify_books / verify_lists 按它找行 */
        '<div class="set-row" id="aboutExport"><span class="set-ico" style="background:var(--blue)">⇩</span><span class="set-lab">导出阅读数据</span><span class="set-val">JSON</span><span class="set-val is-chev">›</span></div>' +
        '<div class="set-row" id="aboutLegal"><span class="set-ico" style="background:#5e5ce6">◈</span><span class="set-lab">隐私与协议</span><span class="set-val is-chev">›</span></div>' +
      '</div>';
    byId("aboutExport").addEventListener("click", function () { closeAboutSheet(); exportData(); });
    byId("aboutLegal").addEventListener("click", function () { closeAboutSheet(); openLegal("privacy"); });
    sh.classList.add("is-open");
    sh.setAttribute("aria-hidden", "false");
  }

  function openHelpSheet() {
    const sh = byId("helpSheet");
    if (!sh) return;
    byId("helpBody").innerHTML =
      '<div class="sheet-grab"></div>' +
      '<div class="about-logo"><div><h3>帮助与反馈</h3><p>常见问题都在下面，按指引点进去就能处理。</p></div></div>' +
      '<div class="help-qa">' +
        '<p><b>换手机了，数据怎么办？</b>新设备登录同一账号，书、日记、信会自动同步回来。</p>' +
        '<p><b>重要内容怕丢？</b>在「关于阅迹」里可随时导出全部数据为 JSON 备份。</p>' +
        '<p><b>想改名字或头像？</b>回到「我的」页点头像，进「编辑资料」就能改。</p>' +
      '</div>' +
      '<div class="about-rows">' +
        /* 「问题反馈」（#193）排在前面：上面三条解决不了的人才需要它 */
        '<div class="set-row" id="helpFeedback"><span class="set-ico" style="background:var(--blue)">✎</span><span class="set-lab">问题反馈</span><span class="set-val">可以贴图</span><span class="set-val is-chev">›</span></div>' +
        '<div class="set-row" id="helpLegal"><span class="set-ico" style="background:#5e5ce6">◈</span><span class="set-lab">隐私与协议</span><span class="set-val is-chev">›</span></div>' +
      '</div>';
    byId("helpFeedback").addEventListener("click", function () { closeHelpSheet(); openFbSheet(); });
    byId("helpLegal").addEventListener("click", function () { closeHelpSheet(); openLegal("privacy"); });
    sh.classList.add("is-open");
    sh.setAttribute("aria-hidden", "false");
  }

  /* --- 15h. 问题反馈（#193） ---
     用户 2026-10-10 的原话：「软件里那个反馈…允许添加图片和写文字，然后这些反馈，
     他们也要写邮箱，然后反馈到我的邮箱里」。三件事各自的落点：
       · 入口 —— 「帮助与反馈」里多一行「问题反馈」（那三条常见问题解决不了的人才点）；
       · 内容 —— 文字（≤1000 字）+ 最多 3 张图 + 反馈人自己的邮箱；
       · 去向 —— `feedback` 这个 action：先落库 rt_feedback，再由云函数用 SMTP 发到
         开发者邮箱。**发信全在服务端**（密钥不进前端，同回信那条口径 §11.6），
         前端只负责把内容送出去。

     ⚠️ 草稿只挂内存槽 fbDraft，**收起 = 整份取消**：面板 body 是每次开现画的，
        所以下拉 / 点底色走掉之后，下次进来一定是空的 —— 不落盘就没人能把它捡回来
        （#172-#176 那套「下拉取消还是新建成功」的规矩，新建浮层一律照办）。
     ⚠️ 图片在**客户端压完**才上行：网关与云函数都不该收几百 KB 的原图；压到长边
        1080 / q0.72（实测一张截图 100~250 KB），三张合计还有一道字符数闸门。 */
  const FB_PICS = 3;              /* 最多几张图（与云函数的 FB.pics 同值） */
  const FB_MAX = 1080;            /* 长边像素上限：截图里的字要看得清，1080 够 */
  const FB_Q = 0.72;              /* JPEG 质量 */
  const FB_TEXT = 1000;           /* 正文字数上限（textarea 的 maxlength 同源） */
  const FB_CHARS = 1400000;       /* 三张 dataURL 合计字符数上限（云函数是 150 万，留余量） */
  let fbDraft = null;             /* {imgs:[dataURL]} —— 只挂内存，收起即丢 */

  /* 只缩不放：源图本来就比 FB_MAX 小就原样用（硬放大只会更糊更大）。
     canvas 失败（超大图 / 隐私模式）退回原图 —— 宁可大一点，也不能让人选不了图
     （与 heroShrink 同款兜底，参数各管各的）。 */
  function fbShrink(dataUrl) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onerror = function () { resolve(dataUrl); };
      img.onload = function () {
        const scale = Math.min(1, FB_MAX / Math.max(img.width, img.height));
        if (scale >= 1) { resolve(dataUrl); return; }
        try {
          const cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(img.width * scale));
          cv.height = Math.max(1, Math.round(img.height * scale));
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL("image/jpeg", FB_Q));
        } catch (e) { resolve(dataUrl); }
      };
      img.src = dataUrl;
    });
  }

  function fbErr(msg) {
    const e = byId("fbErr");
    if (e) e.textContent = msg || "";
  }

  /* 缩略图那一排：已选的图各带一个「删掉这张」，没满 3 张时末尾多一块虚线「加图片」 */
  function renderFbPics() {
    const box = byId("fbPics");
    if (!box || !fbDraft) return;
    let h = "";
    fbDraft.imgs.forEach(function (src, i) {
      h += '<div class="fb-pic"><img src="' + src + '" alt="" draggable="false">' +
           '<button class="fb-pic-del" type="button" data-i="' + i + '" aria-label="删掉这张图">✕</button></div>';
    });
    if (fbDraft.imgs.length < FB_PICS) {
      h += '<button class="fb-add" id="fbAdd" type="button" aria-label="加图片"><span>＋</span><b>加图片</b></button>';
    }
    box.innerHTML = h;
    const add = byId("fbAdd");
    if (add) add.addEventListener("click", function () { byId("fbPhoto").click(); });
    $$("#fbPics .fb-pic-del").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!fbDraft) return;
        fbDraft.imgs.splice(Number(this.getAttribute("data-i")), 1);
        renderFbPics();
      });
    });
    const c = byId("fbCount");
    if (c) c.textContent = fbDraft.imgs.length + "/" + FB_PICS;
  }

  /* 选图 → 读 → 压 → 进草稿。一张一张来（串行）：几张同时压，低端机上容易把
     主线程占住好几秒，而这里是用户正盯着看的地方。 */
  function fbPick(input) {
    const files = Array.prototype.slice.call(input && input.files ? input.files : []);
    if (input) input.value = "";        /* 清空：同一张图再选一次也要能触发 change */
    if (!files.length || !fbDraft) return;
    const room = FB_PICS - fbDraft.imgs.length;
    if (room <= 0) { toast("最多放 " + FB_PICS + " 张图"); return; }
    if (files.length > room) toast("最多 " + FB_PICS + " 张，多出来的没放进去");
    let chain = Promise.resolve();
    files.slice(0, room).forEach(function (f) {
      chain = chain.then(function () {
        /* ⚠️ loadImageFile 给的是 **Image 对象**（不是 dataURL）—— 直接甩给 fbShrink
           会变成 `src="[object HTMLImageElement]"`：缩略图是破图、上行的是个对象，
           云函数那边一句「有张图读不出来」。取 img.src 才接得上（#193 探针逮到的）。 */
        return loadImageFile(f).then(function (img) { return fbShrink(img.src); })
          .then(function (url) {
            if (!fbDraft) return;
            let total = url.length;
            fbDraft.imgs.forEach(function (x) { total += x.length; });
            if (total > FB_CHARS) { toast("这几张图太大了，换一张小点的"); return; }
            fbDraft.imgs.push(url);
            renderFbPics();
          });
      }).catch(function (e) { toast((e && e.message) || "这张图读不出来"); });
    });
  }

  /* 发出去。判据只有两条（正文写没写、邮箱能不能用）—— 图有没有都行。
     成功与否都只提示一句「已收到」：**发信失败也算收到**（反馈已经落库了），
     不该让用户为"授权码没配"这种事操心；真要失败（两边都没成）才让他重试。 */
  function fbSubmit() {
    if (!fbDraft) return;
    const btn = byId("fbSend");
    const text = String((byId("fbText") && byId("fbText").value) || "").trim();
    const mail = String((byId("fbMail") && byId("fbMail").value) || "").trim();
    if (text.length < 5) { fbErr("先写两句吧，至少 5 个字，我们才知道遇到什么了"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { fbErr("留一个能收到回复的邮箱"); return; }
    fbErr("");
    const imgs = fbDraft.imgs.slice();
    if (btn) { btn.disabled = true; btn.textContent = "发送中…"; }
    Cloud.call({
      action: "feedback", text: text, mail: mail, images: imgs,
      ver: localVer ? "v" + localVer : "网页版",
      platform: (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || "web"
    }).then(function () {
      closeFbSheet();
      toast("反馈已收到，谢谢！");
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = "发送反馈"; }
      fbErr((e && e.message) || "没发出去，检查一下网络再试");
    });
  }

  function closeFbSheet() {
    const sh = byId("fbSheet");
    if (sh) { sh.classList.remove("is-open"); sh.setAttribute("aria-hidden", "true"); }
    fbDraft = null;               /* 收起 = 整份取消（草稿只在内存里，见本节头注） */
  }

  function openFbSheet() {
    const sh = byId("fbSheet");
    if (!sh) return;
    const acc = Cloud.account() || {};
    fbDraft = { imgs: [] };
    byId("fbBody").innerHTML =
      '<div class="sheet-grab"></div>' +
      '<div class="about-logo"><div><h3>问题反馈</h3><p>遇到问题或想要什么功能，写在这里。' +
        '会连着你的版本号一起发到开发者邮箱，留了邮箱就能收到回信。</p></div></div>' +
      '<div class="fb-lab">问题描述</div>' +
      '<textarea class="fb-text" id="fbText" rows="5" maxlength="' + FB_TEXT + '" ' +
        'placeholder="例如：日记页滚到底会卡一下；希望能加个夜间模式开关"></textarea>' +
      '<div class="fb-lab fb-lab-row"><span>截图（选填，最多 ' + FB_PICS + ' 张）</span>' +
        '<span class="fb-count" id="fbCount">0/' + FB_PICS + '</span></div>' +
      '<div class="fb-pics" id="fbPics"></div>' +
      '<div class="fb-lab">你的邮箱</div>' +
      /* 登录了就替他填好（还能改）—— 反馈人大多就是这个账号的邮箱 */
      '<input class="fb-mail" id="fbMail" type="email" inputmode="email" autocomplete="email" ' +
        'maxlength="80" placeholder="方便我们回复你" value="' + lbEsc(acc.email || "") + '">' +
      '<div class="fb-err" id="fbErr"></div>' +
      '<button class="fb-send" id="fbSend" type="button">发送反馈</button>' +
      '<p class="fb-tip">只用在处理这条反馈上，不会拿去做别的。</p>' +
      '<input type="file" id="fbPhoto" accept="image/*" multiple hidden>';
    renderFbPics();
    byId("fbPhoto").addEventListener("change", function () { fbPick(this); });
    byId("fbSend").addEventListener("click", fbSubmit);
    sh.classList.add("is-open");
    sh.setAttribute("aria-hidden", "false");
  }

  /* 推荐给朋友：优先系统分享面板；WebView / 桌面没有就退化为复制链接。
     链接用长域名（短域名发出去打不开，见工作日志 #101 前后的结论）。 */
  function shareApp() {
    const url = ((window.RT_CONFIG || {}).hostingUrl || "PUT_YOUR_HOSTING_URL_HERE");
    const text = "阅迹 ReadTrace —— 记录读过的书、写下的随笔、写给书中人的信：" + url;
    try {
      if (navigator.share) {
        navigator.share({ title: "阅迹 ReadTrace", text: text, url: url }).catch(function () {});
        return;
      }
    } catch (e) { /* 继续走兜底 */ }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { toast("链接已复制，发给朋友就能打开"); },
          function () { toast(text); }
        );
        return;
      }
    } catch (e) { /* 继续走兜底 */ }
    toast(text);
  }

  /* --- 15g. 登录 / 注册 / 找回 / 重签恢复码 浮层 --- */

  let authMode = "login";
  let authSaved = false;     /* 恢复码已展示、点主按钮 = 关面板（rotate 模式用） */
  /* 注册 / 找回成功后那记 2.6s 的自动关。**必须订约**：2.6 秒内关掉再重开登录层
     （比如设置里点「重新生成恢复码」），到点的 closeAuth 会把新开的浮层误关掉
     （v1.94 修复：原先这个 setTimeout 谁都能触发它，不认开门的人）。 */
  let authCloseTimer = 0;

  function openAuth(mode) {
    authMode = mode || "login";
    authSaved = false;
    if (authCloseTimer) { clearTimeout(authCloseTimer); authCloseTimer = 0; }
    const sheet = byId("authSheet");
    if (!sheet) return;
    byId("authEmail").value = "";
    byId("authPwd").value = "";
    byId("authInvite").value = "";
    byId("authRc").value = "";
    byId("authErr").textContent = "";
    byId("authOk").textContent = "";
    byId("authOk").classList.remove("is-on");
    /* 重签恢复码（#171）：身份是老账号，邮箱直接带上，不用再敲一遍 */
    if (authMode === "rotate") {
      const acc = Cloud.account() || {};
      byId("authEmail").value = acc.email || "";
    }
    applyAuthMode();
    sheet.classList.add("is-open");
    /* 等面板升起动画基本走完（.46s spring）再聚焦，否则键盘会跟动画抢拍 */
    setTimeout(() => {
      try { (authMode === "rotate" ? byId("authPwd") : byId("authEmail")).focus(); } catch (e) {}
    }, 430);
  }

  function applyAuthMode() {
    const isLogin = authMode === "login";
    const isReg = authMode === "register";
    const isRec = authMode === "recover";
    const isRot = authMode === "rotate";
    byId("authTitle").textContent = isLogin ? "登录" : (isReg ? "注册" : (isRot ? "重新生成恢复码" : "重置密码"));
    byId("authSub").textContent = isLogin
      ? "邮箱 + 密码。数据跟着账号走，换设备不丢。"
      : (isReg ? "需要邀请码才能注册。注册后会给你一串恢复码，请务必存好。"
               : (isRot ? "输入当前密码确认身份，会给你一串新的恢复码。"
                        : "输入邮箱与恢复码，设置新密码。"));
    byId("authInviteWrap").hidden = !isReg;
    byId("authRcWrap").hidden = !isRec;
    byId("authPwd").placeholder = isRec ? "新密码（至少 6 位）" : (isRot ? "当前密码" : "密码（至少 6 位）");
    byId("authSubmit").textContent = isLogin ? "登录" : (isReg ? "注册并登录" : (isRot ? "生成新恢复码" : "重置并登录"));
    byId("authToRegister").hidden = !isLogin;
    byId("authToRecover").hidden = !isLogin;
    /* 「返回登录」只在注册 / 找回两步出现 —— 重签恢复码（#171）是"就地办完"的一步，
       它既不是登录态也不是注册态，露一个「返回登录」出来是错的（出图核对时逮到的） */
    byId("authToLogin").hidden = isLogin || isRot;
    /* 本机免密（#171）：手上真有凭据时，登录模式多给一条"点一下就进去"的路 */
    const dev = byId("authDevWrap");
    if (dev) {
      dev.hidden = !(isLogin && hasDevice());
      if (!dev.hidden) byId("authDevMail").textContent = Cloud.deviceMail() || "上次登录的账号";
    }
  }

  /* 关闭时顺手收键盘：输入框还聚焦着的话，面板在收、键盘却赖着不走 */
  function closeAuth() {
    authSaved = false;
    const sheet = byId("authSheet");
    if (sheet) sheet.classList.remove("is-open");
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
  }

  /* 一键进入（#171）：面板里那条路与登录门上的是同一件事，收门后照老样子进主界面 */
  function authDeviceLogin() {
    const err = byId("authErr");
    const btn = byId("authSubmit");
    err.textContent = "";
    btn.disabled = true;
    if (hasDevice()) btn.textContent = "处理中…";
    doDeviceLogin().then(() => {
      btn.disabled = false;
      closeAuth();
      toast("已登录 · " + ((Cloud.account() || {}).email || ""));
      syncNow();
      rerenderAll();
    }).catch(e => {
      btn.disabled = false;
      err.textContent = (e && e.message) || "本机免密已失效，请用密码登录";
      applyAuthMode();
    });
  }

  function submitAuth() {
    /* rotate 模式：恢复码已经展示过，这一次点击只是"我已保存，收面板" */
    if (authSaved) { closeAuth(); return; }
    const email = byId("authEmail").value.trim();
    const pwd = byId("authPwd").value;
    const err = byId("authErr"), okEl = byId("authOk");
    err.textContent = "";
    if (!email) { err.textContent = "请填写邮箱"; return; }
    if (!pwd || pwd.length < 6) { err.textContent = "密码至少 6 位"; return; }

    const btn = byId("authSubmit");
    btn.disabled = true;
    btn.textContent = "处理中…";

    const done = () => { btn.disabled = false; applyAuthMode(); };
    const bad = e => { err.textContent = (e && e.message) || "操作失败"; done(); };

    if (authMode === "login") {
      doLogin(email, pwd).then(() => {
        closeAuth();
        toast("已登录 · " + email);
        syncNow();
        rerenderAll();
      }).catch(bad).then(done);
    } else if (authMode === "register") {
      const invite = byId("authInvite").value.trim();
      if (!invite) { err.textContent = "请填写邀请码"; done(); return; }
      doRegister(email, pwd, invite).then(res => {
        const rc = res.recoveryCode || "";
        okEl.innerHTML = "注册成功，这是你的恢复码：<b>" + lbEsc(rc) + "</b><br>请立刻截图或抄写保存。它只显示这一次。";
        okEl.classList.add("is-on");
        toast("已注册 · " + email);
        syncNow();
        /* 成功后**不再激活提交键**（done() 会重新放开）—— 窗口期里再点一下就是
           对同一邮箱重复提交注册；按钮保持禁用直到自动关层（v1.94 修复）。 */
        btn.disabled = true;
        btn.textContent = "已注册";
        authCloseTimer = setTimeout(() => { authCloseTimer = 0; closeAuth(); rerenderAll(); }, 2600);
      }).catch(bad);
    } else if (authMode === "rotate") {
      Cloud.call({ action: "rotateRc", password: pwd }).then(res => {
        const rc = res.recoveryCode || "";
        okEl.innerHTML = "新的恢复码：<b>" + lbEsc(rc) + "</b><br>旧的那串立刻作废，请抄写或截图保存。";
        okEl.classList.add("is-on");
        authSaved = true;
        done();
        btn.textContent = "我已保存";
      }).catch(bad);
    } else {
      const rc = byId("authRc").value.trim();
      if (!rc) { err.textContent = "请填写恢复码"; done(); return; }
      doRecover(email, rc, pwd).then(res => {
        const nrc = res.recoveryCode || "";
        okEl.innerHTML = "密码已重置。新的恢复码：<b>" + lbEsc(nrc) + "</b><br>旧恢复码已作废，请保存新的。";
        okEl.classList.add("is-on");
        btn.disabled = true;          /* 同注册：窗口期里不许重复提交（v1.94） */
        btn.textContent = "已完成";
        authCloseTimer = setTimeout(() => { authCloseTimer = 0; closeAuth(); rerenderAll(); }, 2600);
      }).catch(bad);
    }
  }

  /* --- 15i. 首启引导（#130）：登录门 → 恢复码 → 欢迎 → 称呼 → 头像 → 就绪 ---

   未登录冷启动的必经之门（enterApp 点封面时、或 init 末尾对老用户的钩子拉起）。
   路由规则：
     · 登录成功（老账号）      → 直接进主界面，不打扰；
     · 注册成功（新账号）      → 恢复码 → 欢迎 → 称呼 → 头像 → 就绪 → 主界面；
     · 重置成功                → 恢复码（新码）→ 直接进主界面。
   恢复码从老浮层的「蓝条 2.6s 自动关」升级为独立一步：引导链里不能赌用户
   来得及截图 —— 没点「已保存」不放行。称呼落 rt_users.nickname（随 profile
   同一条 LWW 印章上行），头像复用 #avaWrap 共用面板与裁剪台。 */

  const OBD_ORDER = ["login", "rc", "welcome", "nick", "avatar", "done"];
  let obdStep = "login";
  let obdMode = "login";        /* 登录门表单模式：login | register | recover */
  let obdRcNext = "welcome";    /* 恢复码步的去向：注册→welcome，重置→收门进主界面 */
  let obdAvatar = "";           /* 引导里选中的头像（emoji 或 dataURL），未选为空 */
  let obdOpen = false;

  function obdEl(step) { return document.querySelector('.obd-step[data-step="' + step + '"]'); }

  /* 切步。方向感：前进 = 新步从右滑入、旧步滑向左；返回 = 相反。
     先关 transition 摆位、强制回流、再开闸 —— 否则新步会从当前位置飘过去。 */
  function obdGo(step) {
    const cur = obdEl(obdStep), nxt = obdEl(step);
    if (!nxt || cur === nxt) { obdStep = step; return; }
    const back = OBD_ORDER.indexOf(step) < OBD_ORDER.indexOf(obdStep);
    if (cur) {
      cur.style.transition = "none";
      if (back) cur.classList.remove("off-l");   /* 从在场滑回右侧待场 */
      else cur.classList.add("off-l");           /* 从在场滑向左侧退场 */
    }
    nxt.style.transition = "none";
    nxt.classList.toggle("off-l", back);         /* 返回时新步从左侧候场 */
    void nxt.offsetWidth;
    nxt.style.transition = ""; if (cur) cur.style.transition = "";
    if (cur) cur.classList.remove("is-on");
    nxt.classList.add("is-on");
    obdStep = step;
    /* 每步的聚焦焦点：称呼步自动聚焦并把光标挪到字尾 */
    if (step === "nick") {
      setTimeout(() => {
        const n = byId("obNick");
        try { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } catch (e) {}
      }, 320);
    }
  }

  function obApplyMode() {
    const isLogin = obdMode === "login";
    const isReg = obdMode === "register";
    const isRec = obdMode === "recover";
    byId("obTitle").textContent = isLogin ? "欢迎回来" : (isReg ? "创建账号" : "重置密码");
    byId("obSub").textContent = isLogin
      ? "邮箱 + 密码，数据跟着账号走。"
      : (isReg ? "需要邀请码才能注册。注册后会给你一串恢复码，请务必存好。"
               : "输入邮箱与恢复码，设置新密码。");
    byId("obInviteWrap").hidden = !isReg;
    byId("obRcWrap").hidden = !isRec;
    byId("obPwd").placeholder = isRec ? "新密码（至少 6 位）" : "至少 6 位";
    byId("obGo").textContent = isLogin ? "登录" : (isReg ? "注册并登录" : "重置并登录");
    byId("obToReg").hidden = !isLogin;
    byId("obToRec").hidden = !isLogin;
    byId("obToLogin").hidden = isLogin;
    /* 本机免密（#171）：这台设备还留着凭据 → 登录步顶上多一条「一键进入」，
       邮箱也顺手填好（填的是上次登录的那个号的邮箱）。注册 / 找回两步不显示它。 */
    const dev = byId("obDevWrap");
    if (dev) {
      dev.hidden = !(isLogin && hasDevice());
      if (!dev.hidden) {
        const mail = Cloud.deviceMail();
        byId("obDevMail").textContent = mail || "上次登录的账号";
        if (mail && !byId("obEmail").value) byId("obEmail").value = mail;
      }
      /* 两条主按钮会分不出主次：一键进入是黑底主按钮，密码那条降级成玻璃次要按钮 */
      byId("obGo").classList.toggle("is-alt", !dev.hidden);
    }
  }

  /* 返回键在引导链里的回退：登录门 / 恢复码 / 就绪三步吞掉返回 ——
     门不能关（App 必须登录）、码不能跳过、就绪不能倒退；其余步往回走一步 */
  function obdStepBack() {
    if (!obdOpen) return;
    if (obdStep === "nick") obdGo("welcome");
    else if (obdStep === "avatar") obdGo("nick");
    else if (obdStep === "welcome") obdGo("login");
  }

  function obdOpenGate() {
    if (obdOpen) return;
    obdOpen = true;
    obdMode = "login";
    byId("obEmail").value = "";
    byId("obPwd").value = "";
    byId("obInvite").value = "";
    byId("obRc").value = "";
    byId("obErr").textContent = "";
    obApplyMode();
    /* 直接落在登录步：全部步骤先归零（防外部把别的步留在场上），再亮登录步 */
    $$("#obd .obd-step").forEach(s => s.classList.remove("is-on", "off-l"));
    obdEl("login").classList.add("is-on");
    obdStep = "login";
    byId("obd").classList.add("is-open");
    /* 有一键进入时不抢焦点 —— 键盘弹起来会把那条路顶到屏幕上半截，
       而用户这一刻最可能点的就是它 */
    setTimeout(() => {
      if (!byId("obDevWrap") || byId("obDevWrap").hidden) {
        try { byId("obEmail").focus(); } catch (e) {}
      }
    }, 430);
  }

  function obdCloseGate() {
    if (!obdOpen) return;
    obdOpen = false;
    const sh = byId("obd");
    sh.classList.remove("is-open");
    /* 步骤状态复位留到过渡后：立即清会让淡出后半程露出空层 */
    setTimeout(() => {
      if (obdOpen) return;
      $$("#obd .obd-step").forEach(s => s.classList.remove("is-on", "off-l"));
      obdEl("login").classList.add("is-on");
      obdStep = "login";
    }, 340);
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
  }

  /* 收门进主界面。与老 submitAuth 的登录后链完全一致：toast → 同步 → 全量重画 */
  function obdFinish() {
    const email = (Cloud.account() || {}).email || "";
    obdCloseGate();
    toast("已登录 · " + email);
    syncNow();
    rerenderAll();
  }

  /* 引导链里存称呼：账号缓存与 profile 一起改（渲染读 acc.nickname，
     上行走 profile 的 LWW 印章），随下一轮同步送 rt_users */
  function obSaveNick() {
    const v = byId("obNick").value.trim().slice(0, 12);
    if (!v) return;
    const acc = Cloud.account();
    if (acc) Cloud.saveAuth({ token: acc.token, uid: acc.uid, email: acc.email, nickname: v });
    profile = {
      signature: (profile && profile.signature) || "",
      avatar: (profile && profile.avatar) || "",
      nickname: v,
      updatedAt: Date.now(),
      dirty: true
    };
    persistProfile();
    renderAccount();
    scheduleSync();
    obdGo("avatar");
  }

  function obRenderAva() {
    const el = byId("obAva");
    if (!el) return;
    el.classList.remove("has-photo");
    el.style.backgroundImage = "";
    const a = String(obdAvatar || "");
    if (a.lastIndexOf("data:image/", 0) === 0) {
      el.style.backgroundImage = 'url("' + a + '")';
      el.classList.add("has-photo");
      el.textContent = "";
    } else if (a) {
      el.textContent = a.slice(0, 2);
    } else {
      /* #132 口径统一走 meNick：昵称==邮箱前缀视为未设置 → 「读者」。
         直取 acc.nickname 会把邮箱首字母当名字画进引导头像圈（v1.94 修复）。 */
      el.textContent = meNick(Cloud.account()).charAt(0).toUpperCase();
    }
  }

  function obSubmit() {
    const email = byId("obEmail").value.trim();
    const pwd = byId("obPwd").value;
    const err = byId("obErr");
    err.textContent = "";
    if (!email) { err.textContent = "请填写邮箱"; return; }
    if (!pwd || pwd.length < 6) { err.textContent = "密码至少 6 位"; return; }

    const btn = byId("obGo");
    btn.disabled = true;
    btn.textContent = "处理中…";
    const done = () => { btn.disabled = false; obApplyMode(); };
    const bad = e => { err.textContent = (e && e.message) || "操作失败"; done(); };

    if (obdMode === "login") {
      doLogin(email, pwd).then(() => {
        done();
        obdFinish();
      }).catch(bad);
    } else if (obdMode === "register") {
      const invite = byId("obInvite").value.trim();
      if (!invite) { err.textContent = "请填写邀请码"; done(); return; }
      doRegister(email, pwd, invite).then(res => {
        done();
        byId("obRcCode").textContent = res.recoveryCode || "";
        byId("obRcGo").textContent = "已保存，继续";
        obdRcNext = "welcome";
        toast("已注册 · " + email);
        syncNow();
        obdGo("rc");
      }).catch(bad);
    } else {
      const rc = byId("obRc").value.trim();
      if (!rc) { err.textContent = "请填写恢复码"; done(); return; }
      doRecover(email, rc, pwd).then(res => {
        done();
        byId("obRcCode").textContent = res.recoveryCode || "";
        byId("obRcGo").textContent = "进入阅迹";
        obdRcNext = "finish";
        obdGo("rc");
      }).catch(bad);
    }
  }

  /* 一键进入（#171）：拿本机凭据直接换会话。老账号直接进主界面，不打扰
     （与密码登录走同一条收门链 obdFinish）。失败 = 凭据被撤销 / 换过代 / 过期：
     本机这一枚已经没用了，清掉，退回密码登录。
     ⚠️ 只认服务端明确给的 bad_device 才清凭据 —— 断网 / 超时（err.code 是 network /
        timeout）时凭据本身没坏，清了它「一键进入」就凭空消失，用户只能重输密码
        （v1.94 修复：原先无条件 clearDevice，一次网络抖动就把免密丢了；
        与 authDeviceLogin 失败不清凭据的口径对齐）。 */
  function obDeviceLogin() {
    const btn = byId("obDevGo"), err = byId("obErr");
    err.textContent = "";
    btn.disabled = true;
    btn.textContent = "正在进入…";
    doDeviceLogin().then(() => {
      btn.disabled = false;
      btn.textContent = "一键进入";
      obdFinish();
    }).catch(e => {
      btn.disabled = false;
      btn.textContent = "一键进入";
      if (e && e.code === "bad_device") Cloud.clearDevice();
      obApplyMode();
      err.textContent = (e && e.message) || "本机免密已失效，请用密码登录";
    });
  }

  function setupOnboarding() {
    byId("obToReg").addEventListener("click", () => { obdMode = "register"; byId("obErr").textContent = ""; obApplyMode(); });
    byId("obToRec").addEventListener("click", () => { obdMode = "recover"; byId("obErr").textContent = ""; obApplyMode(); });
    byId("obToLogin").addEventListener("click", () => { obdMode = "login"; byId("obErr").textContent = ""; obApplyMode(); });
    byId("obGo").addEventListener("click", obSubmit);
    byId("obDevGo").addEventListener("click", obDeviceLogin);
    byId("obPrivacy").addEventListener("click", () => openLegal("privacy"));
    byId("obRcGo").addEventListener("click", () => {
      if (obdRcNext === "welcome") obdGo("welcome");
      else obdFinish();
    });
    byId("obWlGo").addEventListener("click", () => obdGo("nick"));
    byId("obNickBack").addEventListener("click", () => obdGo("welcome"));
    byId("obNick").addEventListener("input", () => {
      byId("obNickGo").disabled = !byId("obNick").value.trim();
    });
    byId("obNickGo").addEventListener("click", obSaveNick);
    byId("obAvBack").addEventListener("click", () => obdGo("nick"));
    byId("obAvSkip").addEventListener("click", () => obdGo("done"));
    byId("obAvaPick").addEventListener("click", () => {
      openAvaSheet(v => { obdAvatar = v; obRenderAva(); }, obdAvatar || "");
    });
    byId("obAvGo").addEventListener("click", () => {
      /* 只有真选过东西才落库；空着点「继续」等价于跳过 */
      if (obdAvatar) {
        profile = {
          signature: (profile && profile.signature) || "",
          avatar: obdAvatar,
          nickname: (profile && profile.nickname) || "",
          updatedAt: Date.now(),
          dirty: true
        };
        persistProfile();
        renderAccount();
        scheduleSync();
      }
      obdGo("done");
    });
    byId("obDoneGo").addEventListener("click", obdFinish);
  }

  /* --- 15j. 头像选择面板（#130）：引导与「我的」页共用同一个 ---

   action sheet **两页**：行菜单 / Emoji 格。#205 把「预设头像库」整页撤了 ——
   12 张内联线描脸连同它的取色常量、画法函数、canvas 预热与缓存一起删干净。
   行菜单里的拍照 / 相册汇进裁剪台（z 78，在面板 77 之上），裁完回填、取消原地返回；
   与 Emoji 头像走同一条管线（readtrace.profile.avatar）。 */
  let avaCb = null;          /* 选中回调：cb(emoji 或 dataURL) */
  let avaCur = "";           /* 打开面板那一刻的当前头像 —— 用来给选中的那格打绿勾 */

  function avaPage(name) {
    $$("#avaSheet .ava-page").forEach(p =>
      p.classList.toggle("is-on", p.dataset.avaPage === name));
  }

  function deliverAva(v) {
    const cb = avaCb;
    closeAvaSheet();
    if (cb && v) cb(v);
  }

  function closeAvaSheet() {
    const w = byId("avaWrap");
    if (!w) return;                          /* 同批 close 里唯一没判空的（v1.94 补） */
    if (!w.classList.contains("is-open")) return;
    w.classList.remove("is-open");
    w.setAttribute("aria-hidden", "true");
    avaCb = null;
  }

  /* 给「当前就是这个」的那一格打绿勾（Emoji 格） */
  function markAvaOn() {
    const cur = String(avaCur || "");
    $$("#avaEmoGrid .ava-slot").forEach(sl =>
      sl.classList.toggle("is-on", !!cur && sl.dataset.val === cur));
  }

  function openAvaSheet(cb, cur) {
    avaCb = cb || null;
    avaCur = String(cur || "");
    const emo = byId("avaEmoGrid");
    if (emo && !emo.childElementCount) {
      emo.innerHTML = PROF_EMOJIS.map(e =>
        '<div class="ava-slot" data-val="' + e + '">' +
        '<button class="ava-cell" type="button" data-emo="' + e + '" aria-label="头像 ' + e + '">' + e + '</button></div>').join("");
      emo.addEventListener("click", e => {
        const b = e.target.closest("button[data-emo]");
        if (b) deliverAva(b.dataset.emo);
      });
    }
    markAvaOn();          /* 当前就是这个的那格打绿勾 */
    const w = byId("avaWrap");
    w.setAttribute("aria-hidden", "false");
    w.classList.add("is-open");
    avaPage("rows");
  }

  function setupAvaSheet() {
    $$("#avaSheet [data-ava-act]").forEach(b => {
      b.addEventListener("click", () => {
        const act = b.dataset.avaAct;
        if (act === "emoji") avaPage("emoji");
        else if (act === "camera") byId("avaCam").click();
        else if (act === "album") byId("avaFile").click();
        else closeAvaSheet();
      });
    });
    byId("avaEmoBack").addEventListener("click", () => avaPage("rows"));
    byId("avaDim").addEventListener("click", closeAvaSheet);
    byId("avaCam").addEventListener("change", onAvaFile);
    byId("avaFile").addEventListener("change", onAvaFile);
  }

  /* --- 15k. 合规页（隐私政策 / 用户协议） --- */

  const LEGAL = {
    privacy: {
      title: "隐私政策",
      body: [
        ["我们收集什么", "只收集你自己放进去的东西：注册用的邮箱，你写的随笔、日记与信件，你添加的书目（含你自己上传的封面图），以及你建的书单。不采集设备型号、通讯录、位置、剪贴板，也不接入任何第三方统计或广告 SDK。"],
        ["数据存在哪里", "存在腾讯云开发的云数据库中，仅与你的账号绑定。本机也留一份缓存，用于离线打开与秒开。"],
        ["谁能看到", "只有你自己。没有人人可见的广场，也没有任何形式的公开分享。"],
        ["你的权利", "你可以随时在「关于阅迹」里导出全部数据为 JSON 文件，也可以直接注销账号——注销会同时删除云端与你本机的全部内容，不可恢复。"],
        ["关于密码", "密码以加盐哈希方式存储，我们看不到明文。忘记密码时用恢复码重置；恢复码随时可以在设置里用密码重新生成一串，旧的立刻作废。"]
      ]
    },
    terms: {
      title: "用户协议",
      body: [
        ["这是什么", "阅迹 ReadTrace 是一个私人的阅读记录工具，用于记录读过的书、写下的随笔，以及写给书中人的信。它不提供公开发布、社交互动或内容分发功能。"],
        ["账号", "注册需要邀请码。请勿转让账号，也请勿把邀请码或账号交给他人使用。"],
        ["你的内容", "你在里面写下的一切都归你所有。我们不使用、不分析、不训练、不分享你的内容。"],
        ["使用边界", "请勿用它存放违法内容。由于本应用仅在熟人之间小范围使用，如发现异常使用，管理员会收回邀请权限。"],
        ["服务承诺", "这是一个个人项目，按「现状」提供，不承诺可用性、不承诺数据永不丢失。重要内容请定期用「导出阅读数据」备份。"]
      ]
    }
  };

  /* #62：这两份文档原先在设置页各占一行，合成「隐私与协议」一行后，
     改由页内分段器切换（见 .legal-seg）。两份内容仍各自独立，不混排成一篇。 */
  function setLegalDoc(kind) {
    const k = LEGAL[kind] ? kind : "privacy";
    const page = byId("legalPage");
    if (!page) return;
    byId("legalTitle").textContent = LEGAL[k].title;
    byId("legalBody").innerHTML = LEGAL[k].body.map(sec =>
      '<h3 class="lg-h">' + lbEsc(sec[0]) + '</h3><p class="lg-p">' + lbEsc(sec[1]) + '</p>'
    ).join("");
    $$("#legalSeg [data-legal]").forEach(b =>
      b.classList.toggle("is-on", b.dataset.legal === k));
    /* 切换文档要回到顶部：滚动容器是 .legal-shell（.legal-page 本身不滚），
       不重置的话从「用户协议」切回来会停在上一次的滚动位置。 */
    const shell = page.querySelector(".legal-shell");
    if (shell) shell.scrollTop = 0;
  }

  function openLegal(kind) {
    setLegalDoc(kind);
    const page = byId("legalPage");
    if (!page) return;
    page.classList.add("is-open");
    page.scrollTop = 0;
  }
  function closeLegal() {
    const page = byId("legalPage");
    if (page) page.classList.remove("is-open");
  }

  $$("#legalSeg [data-legal]").forEach(b =>
    b.addEventListener("click", () => setLegalDoc(b.dataset.legal)));

  function confirmDeleteAccount() {
    askConfirm({
      title: "注销账号？",
      body: "注销会永久删除云端与本机的全部数据（随笔、信件、设置），且无法恢复。",
      ok: "注销", danger: true
    }).then(ok => {
      if (!ok) return;
      if (!Cloud.signedIn()) { openAuth("login"); return; }
      doDeleteAccount().catch(e => toast((e && e.message) || "注销失败"));
    });
  }

  /* --- 15l. 启动挂接与性能降级（S4） --- */

  function setupCloud() {
    loadSigs();
    Cloud.loadAuth();
    loadProfile();
    renderAccount();
    /* ⚠️ 这里必须补一次 renderSettings()（#62 探针 verify_confirm 的 C3 抓到的）：
       init() 里 renderSettings() 跑在 setupCloud() **之前**，那时候 loadAuth()
       还没执行、Cloud.signedIn() 恒为 false —— 于是每次冷启动，「我的」页都画成
       未登录态（显示「登录 / 注册」、不显示「退出登录 / 注销账号」）。
       原先只有「同步合并出了变化」才会经 rerenderAll() 顺带重画，而绝大多数
       冷启动都是「没变化」，所以这个错版会一直留在屏幕上。 */
    renderSettings();

    const box = byId("meIdBlock");
    if (box) box.addEventListener("click", onMeIdTap);
    /* 头像自己那一层（#138）：照片形态拦下事件去看大图，其余形态不拦、走上面那层。
       绑在 #avatar 上而不是头部委托 —— 头部只有一个子元素需要分流，直绑更省事；
       #avatar 是常驻节点（renderAccount 只改它的 class / 文本），绑一次就够。 */
    const avEl = byId("avatar");
    if (avEl) avEl.addEventListener("click", onMeAvaTap);

    /* 足迹垫点格子跳对应页（#132，#136 并入四格计数）：委托在 #meFoot 上，重画不掉 */
    const foot = byId("meFoot");
    if (foot) foot.addEventListener("click", e => {
      const fc = e.target.closest(".me-fc");
      if (fc && fc.dataset.tab) switchTab(fc.dataset.tab);
    });

    /* 快捷胶囊（#132）：推荐给朋友 / 帮助与反馈 */
    const pills = byId("mePills");
    if (pills) pills.addEventListener("click", e => {
      const btn = e.target.closest(".pillbtn");
      if (!btn) return;
      if (btn.dataset.act === "share") shareApp();
      else if (btn.dataset.act === "help") openHelpSheet();
    });

    /* #182：这里原先挂着一个滚动监听，按 scrollTop 给本页加 .is-scrolled，去淡入那条
       零高 sticky 的玻璃标题栏「我的」。那条栏与监听一并撤了（用户：「我的那个框就去掉」）——
       本页从此没有吸顶接管层，沉浸头部滚走就是滚走。 */

    const bind = (id, fn) => { const el = byId(id); if (el) el.addEventListener("click", fn); };

    /* 编辑资料（#122）：入口按钮压住头部点击（stopPropagation，点编辑 ≠ 点账号区）；
       scrim 常驻在 index.html 里，绑定一次就够 —— body 每次打开都重画。 */
    const meEdit = byId("meEdit");
    if (meEdit) meEdit.addEventListener("click", e => { e.stopPropagation(); openProfSheet(); });
    /* 头像大图（#138）：整层就是关闭热区（点图、点四周都收），所以绑在容器上。
       顶栏两个按钮和长按手势都要 stopPropagation / 吞 click，免得顺手把大图关了（#141）。 */
    bind("avView", closeAvaView);
    bind("avViewBack", e => { e.stopPropagation(); closeAvaView(); });
    bind("avViewMore", e => { e.stopPropagation(); openAvaSave(); });
    /* #142：小头像时那句提示旁边多一颗「重新设置头像」，它也要 stopPropagation ——
       否则冒泡到 #avView 的关闭热区，面板还没开大图就先收了。 */
    bind("avViewReset", e => { e.stopPropagation(); resetAvatarFromView(); });
    bindAvaView();
    /* 保存头像抽屉（#141）：scrim 和「取消」都是关抽屉，「保存到手机」走真保存 */
    bind("avaSaveMask", closeAvaSave);
    bind("avaSaveCancel", closeAvaSave);
    bind("avaSaveOk", saveAvatarToPhone);
    bind("profMask", closeProfSheet);
    bind("aboutMask", closeAboutSheet);   /* #132 关于阅迹 */
    bind("helpMask", closeHelpSheet);     /* #132 帮助与反馈 */
    bind("fbMask", closeFbSheet);         /* #193 问题反馈（点底色 = 算了，草稿整份丢） */
    bind("authClose", closeAuth);
    bind("authMask", closeAuth);
    bind("authSubmit", submitAuth);
    bind("authDevGo", authDeviceLogin);     /* #171 本机免密：浮层里的「一键进入」 */
    bind("authToRegister", () => { authMode = "register"; applyAuthMode(); });
    bind("authToRecover", () => { authMode = "recover"; applyAuthMode(); });
    bind("authToLogin", () => { authMode = "login"; applyAuthMode(); });
    bind("legalClose", closeLegal);
    bind("legalMask", closeLegal);
    bind("mergeMerge", () => resolveMerge("merge"));
    bind("mergeLocal", () => resolveMerge("local"));
    bind("mergeCloud", () => resolveMerge("cloud"));
    /* 首启引导（#130）与共用头像面板 */
    setupOnboarding();
    setupAvaSheet();

    /* 已登录：不阻塞首屏，让本地数据先渲染出来，再后台拉取合并 */
    if (Cloud.signedIn()) {
      Cloud.setLastSync(Cloud.lastSync());
      /* ⚠️ #174 这里曾挂过一道「等封面补水落定再同步」的闸门
         （`Promise.race([coversSettled, 1200ms])`），已撤掉：本地库打开会挂住的环境里，
         它会把这第一次同步整整拖到兜底那一刻 —— verify_account 的 D/F 两趟当场红。
         真正的保险在 collectDirty 里：「图不在内存」时**整块 prefs 都不上行**，
         那就已经不可能把云端那份抹掉，与补水快慢无关。同步时机与改造前一致。 */
      setTimeout(() => { syncNow(); }, 80);
    } else if (hasEntered()) {
      /* 未登录的老用户（进过一次、退了登录 / 注销后 reload 回来）：
         冷启动直接落在登录门上。第一次安装的用户不走这儿 —— 他们的门
         在 enterApp() 里、封面淡出中途拉起（键盘也不能抢在封面退场前弹起）。 */
      setTimeout(() => { if (!Cloud.signedIn()) obdOpenGate(); }, 0);
    }
  }

  /* 首次登录且本地已有内容：给三选一，否则就是静默覆盖用户的东西 */
  function askMerge(localCount) {
    const m = byId("mergeModal");
    if (!m) return;
    byId("mergeInfo").textContent = "本机有 " + localCount + " 条记录，云端也有数据。要怎么处理？";
    m.classList.add("is-open");
  }

  /* 三个选项的终局都必须是"签名表与云端一致"，否则下一次同步会重放。
     三条路都不 reload：重载会丢掉刚拉下来的快照，还得再拉一遍。 */
  function resolveMerge(how) {
    const m = byId("mergeModal");
    if (m) m.classList.remove("is-open");
    const res = pendingRemote || { notes: [], letters: [], books: [], booklists: [], prefs: null, serverTime: Date.now() };
    pendingRemote = null;

    if (how === "cloud") {
      /* 放弃本机：清空后整份采纳云端，标记为已同步（不上行）。
         书目也一并清空 —— 漏了它，「放弃本机」之后本机那批自建书会被当成
         新增推上云端，跟「整份采纳云端」的语义正好相反。书单同理。 */
      state.notes = [];
      state.letters = [];
      state.books = [];
      state.booklists = [];
      syncBooksFromState();
      syncListsFromState();
      state.prefsAt = 0;
      mergeRemote(res);
      sigMap = {};
      commitSigs({ notes: [], letters: [], books: [], booklists: [], prefs: null }, []);
      state.prefsAt = Date.now();
      Cloud.setLastSync(res.serverTime || Date.now());
      Repo.write(state);
      rerenderAll();
      toast("已改用云端数据");
      return;
    }

    /* 后两条路都要让本机全量上行：清空签名表，下一次 collectDirty 就会把
       每条现存记录都判为"脏"。skipPullOnce 保证不会又把云端拉回来对冲。 */
    sigMap = {};
    persistSigs();
    skipPullOnce = true;

    if (how !== "local") {
      mergeRemote(res);          /* 合并：先把云端并进来，再整体上行 —— 两边都不丢 */
    }
    Repo.write(state);
    rerenderAll();
    syncNow(true);
    toast(how === "local" ? "已用本机内容覆盖云端" : "已合并本机与云端");
  }

  /* 低端设备与低帧率下关掉毛玻璃。只摘 backdrop-filter，
     保留 .pg-head 的底色与其他样式，所以布局与层级完全不变。 */
  function setupPerfGuard() {
    const dm = navigator.deviceMemory;
    if (typeof dm === "number" && dm <= 4) {
      document.documentElement.classList.add("is-lite");
      return;
    }
    let frames = 0;
    const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    const step = function () {
      frames++;
      const now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (now - t0 < 2000) { requestAnimationFrame(step); return; }
      /* 两秒内不足 70 帧（<35fps）说明这机器扛不住 blur */
      if (frames < 70) document.documentElement.classList.add("is-lite");
    };
    requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------
     15. 版本更新
     ---------------------------------------------------------
     只做「发现新版本 + 给出下载入口」，**不碰安装**。理由：Android 不允许
     旁加载应用静默升级，任何方案都得用户点一次系统安装确认。既然那一下
     躲不掉，再写一套「应用内下载 + FileProvider + 拉起安装器」就不划算了
     —— 交给系统浏览器下载、装完覆盖即可（同签名 + versionCode 递增，
     登录后的数据会保留）。

     整节只在原生壳里生效：网页版天然就是最新的，不该发这个请求。
     在网页版点「检查更新」会明确告诉用户这一点，而不是静默无反应。

     两种检查口气不同（#123 按用户反馈改版）：
       · 冷启动的自动检查（manual=false）—— **每次开机必查一次**（原先最多每天一次，
         用户实测「v1.44 上线后卡片迟迟不出现」）；发现新版只铺卡片 + 首次发现时
         toast 提醒一次，之后每次开机卡片都在、toast 不再重复；
       · 用户自己点设置里的「检查更新」（manual=true）—— 发现新版只把卡片铺出来
         （版本号 + 更新说明），下载这一步由用户自己在卡上点「前往下载」再拉起
         系统浏览器。#103 的「手动检查直接开浏览器」已按用户反馈撤销 ——
         「我连这次更新啥都不知道就跳下载了」。
     --------------------------------------------------------- */
  /* 本机版本号直接问原生壳要（App.getInfo → build=versionCode、
     version=versionName），**不在前端写死** —— 写死必然与 build.gradle 漂移。 */
  let localBuild = 0;
  let localVer = "";
  let remoteVer = null;            /* 云端最新版信息；null = 未知或已是最新 */

  const UPD_KEY = "readtrace.upd";       /* 上次查到的云端版本信息 */
  const UPD_AT = "readtrace.updAt";      /* 上次检查时间（仅留痕，节流已废） */
  const UPD_SKIP = "readtrace.updSkip";  /* 用户点过「稍后」的版本号 */

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {}
  }

  function loadRemoteVer() {
    try {
      const r = JSON.parse(lsGet(UPD_KEY) || "null");
      remoteVer = (r && Number(r.versionCode)) ? r : null;
    } catch (e) { remoteVer = null; }
    return remoteVer;
  }

  /* 设置页那一行的右值：有新版优先说新版，否则报本机版本；啥都不知道就留空，
     让行尾那个 › 自己显示（val 为空时不会多渲染一个 span）。 */
  function updRowText() {
    if (remoteVer) return "有 v" + (remoteVer.versionName || remoteVer.versionCode);
    if (localVer) return "v" + localVer;
    return "";
  }

  function readLocalVersion() {
    return new Promise(function (resolve) {
      const P = window.Capacitor && window.Capacitor.Plugins;
      const A = P && P.App;
      if (!A || !A.getInfo) { resolve(false); return; }
      A.getInfo().then(function (i) {
        localBuild = parseInt(i && i.build, 10) || 0;
        localVer = String((i && i.version) || "");
        resolve(true);
      }).catch(function () { resolve(false); });
    });
  }

  /* 用系统浏览器打开外链。Capacitor 只接管「导航」事件：BridgeWebViewClient
     把每次主框架导航交给 Bridge.launchIntent()，而「非同源 URL」在那里会走
     Intent.ACTION_VIEW 交给系统浏览器（已对着 @capacitor/android 6.2.2 的
     Bridge.java 逐行确认）。所以这里造一个真 <a> 并点它。
     ⚠️ 不要改用 window.open(url, "_system")：WebView 走的是多窗口 / onCreateWindow
     另一条路，行为不一致。更新卡里那个 .upd-go 也用同样机制，两处必须一致。 */
  function openExternal(url) {
    if (!url) return false;
    try {
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      /* 导航已被原生拦下，这个锚点没用了 —— 收走，免得用户反复点越积越多 */
      setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 0);
      return true;
    } catch (e) { return false; }
  }

  /* manual=false 时不打扰用户：失败、已是最新都静默 */
  function checkUpdate(manual) {
    if (!isNativeShell()) {
      if (manual) toast("网页版始终是最新的");
      return Promise.resolve(false);
    }
    return readLocalVersion().then(function (got) {
      if (!got) { if (manual) toast("读不到本机版本号"); return false; }
      return Cloud.call({ action: "info" }).then(function (res) {
        lsSet(UPD_AT, String(Date.now()));
        const late = res && res.latest;
        if (late && Number(late.versionCode) > localBuild) {
          const prev = remoteVer;          /* 上次缓存：用来判断「是不是第一次发现这个版本」 */
          remoteVer = {
            versionCode: Number(late.versionCode),
            versionName: String(late.versionName || ""),
            apkUrl: String(late.apkUrl || ""),
            notes: Array.isArray(late.notes) ? late.notes.slice(0, 12) : []
          };
          lsSet(UPD_KEY, JSON.stringify(remoteVer));
          if (manual) {
            /* #123：手动检查不再直接拉浏览器 —— 只把卡片铺出来（版本 + 更新说明），
               下载由用户在卡上点「前往下载」。之前点过「稍后」的这版也重新铺出来。 */
            lsSet(UPD_SKIP, null);
            toast("发现新版本 v" + (remoteVer.versionName || remoteVer.versionCode) + "，更新内容见下方卡片");
          } else if (!prev || Number(prev.versionCode) !== Number(remoteVer.versionCode)) {
            /* 自动检查只在第一次发现这个版本时提醒一声（缓存里已是同一版就不再弹，
               卡片本身每次冷启动都照铺）。 */
            toast("发现新版本 v" + (remoteVer.versionName || remoteVer.versionCode) + "，到「我的」页看更新内容");
          }
        } else {
          remoteVer = null;
          lsSet(UPD_KEY, null);
          if (manual) toast("已是最新版本" + (localVer ? " v" + localVer : ""));
        }
        renderUpdateCard();
        renderSettings();
        return true;
      }).catch(function (e) {
        lsSet(UPD_AT, String(Date.now()));
        if (manual) toast((e && e.message) || "检查更新失败");
        return false;
      });
    });
  }

  function renderUpdateCard() {
    const box = byId("updCard");
    if (!box) return;
    /* 点过「稍后」的这个版本就不再占版面，但设置页那行仍然提示有新版 */
    if (!remoteVer || String(lsGet(UPD_SKIP)) === String(remoteVer.versionCode)) {
      box.innerHTML = "";
      return;
    }
    const notes = (remoteVer.notes || [])
      .map(function (n) { return "<li>" + lbEsc(n) + "</li>"; }).join("");
    box.innerHTML =
      '<div class="card upd-card">' +
        '<div class="upd-head">' +
          '<span class="upd-badge">新版本</span>' +
          '<h3>阅迹 v' + lbEsc(remoteVer.versionName || remoteVer.versionCode) + '</h3>' +
        '</div>' +
        (notes ? '<ul class="upd-notes">' + notes + '</ul>' : "") +
        '<div class="upd-acts">' +
          (remoteVer.apkUrl
            /* 必须是真 <a> 而不是 window.open：Capacitor 只接管「导航」事件，
               非同源链接会走 Bridge.launchIntent → Intent.ACTION_VIEW 交给
               系统浏览器下载。这条路径已对着 Capacitor 源码确认过。 */
            ? '<a class="upd-go" href="' + lbEsc(remoteVer.apkUrl) + '">前往下载</a>'
            : '<span class="upd-go is-off">暂无下载地址</span>') +
          '<button class="upd-later" id="updLater" type="button">稍后</button>' +
        '</div>' +
        '<p class="upd-hint">下载完点安装即可覆盖，登录后的数据会保留。</p>' +
      '</div>';

    const later = byId("updLater");
    if (later) later.addEventListener("click", function () {
      lsSet(UPD_SKIP, String(remoteVer.versionCode));
      renderUpdateCard();
    });
  }

  function setupUpdateCheck() {
    loadRemoteVer();
    if (remoteVer) { renderUpdateCard(); renderSettings(); }  /* 上次的结果先显示出来 */
    if (!isNativeShell()) return;
    /* 升级后首次启动：缓存里的 remoteVer 可能已不高于本机版本（#37 真机回归发现——
       在 v1.2 点过「检查更新」后覆盖装 v1.3，缓存的 v1.3 卡片会错误地继续显示，且因
       updAt 未满一天不会再自动纠正）。读一次本机 build，把过期缓存清掉。 */
    readLocalVersion().then(function () {
      if (remoteVer && Number(remoteVer.versionCode) <= localBuild) {
        remoteVer = null;
        lsSet(UPD_KEY, null);
        renderUpdateCard();
        renderSettings();
      }
    });
    /* #123：自动检查从「最多每天一次」改成**每次冷启动必查一次** —— 24h 节流的
       实际后果是新版本要等到第二天才被看见（用户原话「更新包出现的不及时」）。
       info 是一次极轻的调用，负担可以忽略。让启动动画与首屏渲染先跑完再查。 */
    setTimeout(function () { checkUpdate(false); }, 2500);
  }

  init();
})();
