package com.example.readtrace;

import android.app.ActivityManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * 原生壳：禁掉 WebView 的手势缩放。
 *
 * Capacitor 只设了 setBuiltInZoomControls(false) 与 setDisplayZoomControls(false)
 * —— 那两个只管「缩放手势/按钮」，而 setSupportZoom 仍是 WebView 默认的 true，
 * 于是两指捏合照样把整个界面放大，观感「跟网页一样」。
 * 官方文档口径：setSupportZoom 同时管「缩放控件」与「手势」，这里补上。
 * 网页版不受影响（这条是原生侧）。
 *
 * #69：深色主题的开屏根治。App 内「深色模式」是 WebView 里的开关，系统开屏发生在
 * WebView 首帧之前 —— 原生侧必须自己知道主题。做法：
 *   ① ThemeStorePlugin 在用户切主题时把 "light"/"dark" 写进 SharedPreferences；
 *   ② 这里在 super.onCreate 之前读它，dark 就把 Activity 主题换成深色开屏变体
 *      （AppTheme.NoActionBarLaunchDark，见 values/styles.xml）。
 * 时序要点：Activity 主题必须在 super.onCreate 之前 setTheme —— BridgeActivity
 * 会在 onCreate 里强制设回 AppTheme_NoActionBar（那只影响内容期，不影响开屏）。
 * 没有存储值（首次安装）时跟随系统深色模式：values-night/splash.xml 已提供深色底。
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        String saved = ThemeStorePlugin.readTheme(this);
        boolean dark = "dark".equals(saved) ||
            (saved.isEmpty() &&
             (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                 == Configuration.UI_MODE_NIGHT_YES);
        if (dark) {
            setTheme(R.style.AppTheme_NoActionBarLaunchDark);
        }
        /* ⚠️ registerPlugin 必须排在 super.onCreate() **之前**（#186 逮到的老 bug）：
           （StatusStripPlugin 那个「自画色条」在 #188 贴边后已删 —— 网页自己画到屏顶了。）
           BridgeActivity.onCreate 末尾的 this.load() 在 super 里就把桥建好了
           （`bridgeBuilder.addPlugins(...).create()`），之后再 registerPlugin 只是往
           builder 里塞、桥已经不看它了 —— 于是这三个插件**一直没接上**：
           `window.Capacitor.Plugins` 里只有七个内置的（真机诊断屏实测），
           ThemeStore 存主题（#69 的深色开屏）与 GallerySave 存相册（#141）都是静默失效，
           表现是「点了没反应」，谁也没报。注册在前，三者一起活过来。 */
        registerPlugin(ThemeStorePlugin.class);
        registerPlugin(GallerySavePlugin.class);   /* #141：长按头像「保存到手机」写相册 */
        super.onCreate(savedInstanceState);
        /* #102：后台卡片顶部那条异色带来自身为 task 描述的主色，须在窗口就绪后补一刀。 */
        applyRecentsColors(dark);
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        WebSettings s = webView.getSettings();
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        /* #188：**贴边**（edge-to-edge）——网页铺满整屏、自己画到屏顶与屏底，那条「状态栏色带」
           就不存在了。⚠️ 不能用 Capacitor 的 `setOverlaysWebView(true)`：它内部是已废弃的
           `View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN`，Android 15 上同样被忽略（实测 WebView 仍停在
           [0,128][1080,2274]）。这里直接调现代 API；安全区交给下面的 injectInsets() 注入的
           --safe-top / --safe-bottom，由网页自己让开（`app/styles.css` 里 `.page`／各页头／各浮层）。 */
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        injectInsets(webView);
    }

    /**
     * 把真实安全区写进网页（#187）。
     *
     * 网页那边早就留好了口子 —— `app.js` 的 `readSafeInsets()` 先读 `window.ReadTraceNative.insets`
     * （注释里写着「由 Capacitor 侧写入」），没有才回落到 `env(safe-area-inset-*)`；而 Android WebView
     * 上 env() 常年给 0。以前不需要它，是因为壳把 WebView 摆在状态栏**下面**（排版天然让开了）；
     * #188 起改成贴边（`setDecorFitsSystemWindows(false)`，网页铺到屏顶），于是非得有个真值
     * 不可 —— 这里就是那段「Capacitor 侧写入」。
     *
     * 单位是 **CSS px**（网页那边直接当 px 用），所以要除以屏幕密度。
     * 写完补发一个 resize：`applyShellInsets()` 正是挂在 resize / orientationchange 上的，
     * 于是旋转、折叠屏展开、手势条切换都会跟着重量一次 —— 不必再开一条 JS 通道。
     *
     * 两条通道缺一不可：**安全区变化时发**（下面那个 setOnApplyWindowInsetsListener）＋
     * **整页加载完补发**（#189 加的 addWebViewListener，理由见方法里的注释）。
     */
    private void injectInsets(WebView webView) {
        final int[] last = { Integer.MIN_VALUE, Integer.MIN_VALUE, Integer.MIN_VALUE };
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            /* 软键盘那一段（#204）。取值用 **ime()**，别用 Keyboard 插件那套
               getWindowVisibleDisplayFrame() —— 理由见 applyImeHeight 的注释。 */
            int imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            boolean barsSame = (bars.top == last[0] && bars.bottom == last[1]);
            boolean imeSame = (imeBottom == last[2]);
            /* ⚠️ 值没变就别再动（#187 模拟器上抓到 ANR）：这条通道会来回 ——
               注入 → 网页 applyShellInsets 改 --safe-top → 重新布局 → 又派发 insets
               → 再注入…… 没有这道闸就是个死循环，UI 线程直接卡住（「阅迹 isn't responding」）。
               ⚠️ imeBottom 必须一起进这道闸：键盘起落时 systemBars 一个字节都不变，
               只看 top/bottom 的话「撑开内容」那一刀永远轮不到执行。 */
            if (barsSame && imeSame) {
                return insets;
            }
            last[0] = bars.top;
            last[1] = bars.bottom;
            last[2] = imeBottom;
            applyImeHeight(webView, imeBottom);
            if (!barsSame) {
                pushInsets(webView, bars);
            }
            return insets;
        });
        /* ⚠️ #189：只有上面那个监听**不够** —— 它只在「安全区变了」时发，而它第一次触发
           （下面 requestApplyInsets 引起的这次）常常赶在网页自己的文档建好之前：那句
           evaluateJavascript 落进的是 about:blank 的 context，等 index.html 一提交就随旧文档
           一起没了；「值没变就不发」那道闸（防 ANR 的，不能撤）又正好挡住后续补发 ——
           于是 window.ReadTraceNative 从来不存在、--safe-top / --safe-bottom 停在 0
           （Android WebView 的 env(safe-area-inset-*) 常年给 0，兜不住）。
           真机表现：**每一页的标题都压在状态栏里**（用户 2026-10-10 连报两次——
           「顶部遮挡了！！」「全部都是，全遮挡了。其他几个页面也是」；把用户截图与
           「--safe-top 为 0」时的渲染图逐列比对，锚点全对上，差的就是这一发没到）。
           解法：再挂一条「整页加载完」的钩子（Capacitor 在 progress == 100 时回调）——
           那一刻网页的 context 一定在，补发一次即可；安全区真值当场现取。 */
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView v) {
                WindowInsetsCompat wi = ViewCompat.getRootWindowInsets(v);
                if (wi == null) {
                    return;
                }
                pushInsets(v, wi.getInsets(WindowInsetsCompat.Type.systemBars()));
            }
        });
        webView.requestApplyInsets();
    }

    /** 把安全区（原生 px → CSS px）写进网页，并让 applyShellInsets() 跟着重跑一次。 */
    private void pushInsets(WebView webView, Insets bars) {
        final float density = getResources().getDisplayMetrics().density;
        String js = "window.ReadTraceNative={insets:{top:" + (bars.top / density)
                + ",bottom:" + (bars.bottom / density) + "}};"
                + "window.dispatchEvent(new Event('resize'));";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    /**
     * 软键盘：把内容视图的高度收到**键盘顶**（#204）。
     *
     * 用户 2026-10-12 两张截图（编辑资料面板 / 写日记抽屉，键盘都开着）：
     * 键盘正上方多出一条 121 native px（dpr 2.75 ≈ 44 CSS px）的暖灰色带 —— 色值
     * 与 `appWindowBackground`（#f7f6f3）一致，而网页自己的页面底色是 #f1f3f7（冷）、
     * 面板底是 #fff，都对不上：说明那条带子**根本不在 WebView 里**，是被 WebView 让出来的
     * 窗口背景。
     *
     * 让出它的是 Capacitor 的 Keyboard 插件（`capacitor.config.json` 里
     * `resizeOnFullScreen: true` → Keyboard.possiblyResizeChildOfContent()）：
     * 它在键盘动画开始时把内容视图的高度塞成 `getWindowVisibleDisplayFrame().bottom`。
     * 那个 frame 是「可见显示区」——**贴边之后（#188）它连导航条一起排除了**，
     * 于是 r.bottom = 2400 − 966(键盘) − 121(导航条) = 1313，比键盘顶（1434）矮一整条导航条。
     * 网页的布局视口（`html{height:100%}` / `.screen{inset:0}` / 各面板的 `bottom:0`）
     * 全长在这个 1313 上 —— 一切「贴屏底」的东西都停在键盘上方 44px，中间那条缝露出窗口背景。
     * （同一条推理还有个旁证：`.tlc-panel` 的 `top:calc(--safe-top + 7%)`，
     *  用视口 1313 → 7% = 33.4 + 安全区 44 = 77.4 CSS px = 213 native，与截图里
     *  面板顶边逐像素对上；若视口是全屏 2400 那 7% 会算成 61，对不上。）
     *
     * 改法：**别再用那个 frame**。插件的 resize 已关（`resizeOnFullScreen: false`），
     * 这一刀改由我们自己打，高度直接取 `窗口高 − ime().bottom` —— ime() 的量法正是
     * 「从窗口下沿往上的键盘覆盖高度」，1434 就是键盘顶，一格不差。
     * 键盘收起时还回 MATCH_PARENT（插件当年也是用 −1 表示这个意思）。
     *
     * 为什么不是「调到跟导航条一样高就完事」：键盘高度随输入法、随横竖屏都变，
     * 唯一稳的量法是窗口高 − 键盘 inset；导航条那 44px 只是这台机器上的巧合。
     *
     * ⚠️ 时序与插件一致：insets 监听与插件原来的 WindowInsetsAnimation 回调都在动画**开始**
     * 那一刻拿到终值 —— 观感（面板与键盘一起抬起来）不变，别去引 WindowInsetsAnimation
     * 那套逐帧动画，反而会对不齐。
     */
    private void applyImeHeight(WebView webView, int imeBottom) {
        View parent = (View) webView.getParent();   /* bridge_layout_main 的 CoordinatorLayout */
        if (parent == null || parent.getLayoutParams() == null) {
            return;
        }
        ViewGroup.LayoutParams lp = parent.getLayoutParams();
        int want = ViewGroup.LayoutParams.MATCH_PARENT;
        if (imeBottom > 0) {
            int windowHeight = windowHeightPx();
            if (windowHeight <= 0) {
                return;   /* 还没量到窗口高度（首帧前）：等下一发 insets，别把内容压成 0 */
            }
            want = Math.max(0, windowHeight - imeBottom);
        }
        if (lp.height == want) {
            return;
        }
        lp.height = want;
        parent.setLayoutParams(lp);
    }

    /** 窗口当前高度（px，含系统栏 —— 贴边之后窗口就是整屏）。 */
    private int windowHeightPx() {
        WindowManager wm = getWindowManager();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            /* API 30+：窗口度量。⚠️ 用 current 而不是 maximum —— 分屏 / 自由窗口下
               窗口比屏小，insets 也是相对窗口报的，两者必须同一把尺子。 */
            return wm.getCurrentWindowMetrics().getBounds().height();
        }
        DisplayMetrics dm = new DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(dm);
        return dm.heightPixels;
    }

    /**
     * #102：把「最近任务（recents）卡片顶部的底色」对齐到主界面底色。
     *
     * 系统在后台卡片里，用 task 描述（TaskDescription）的主色绘制「应用图标 / 名称」
     * 所在的那一段。本 App 从未设过它，于是系统自行动态取色 —— 浅色下取到的是启动
     * 开屏的暖米色（windowSplashScreenBackground = #e9dec6），与主界面米白 #f7f6f3
     * 不一致，观感就是「界面顶上多了一条棕色带」。
     *
     * 这里按 App 内主题显式选色：浅 #f7f6f3 / 深 #0e0e10（取色来源见
     * res/values/splash.xml 的两个 color，与前端 syncNativeStatusBar() 同源）。
     *
     * 兼容性：TaskDescription.Builder 是 API 33 才有的；pre-33 走旧的构造函数，
     * icon 传 null 表示沿用系统已捕获的图标。
     */
    private void applyRecentsColors(boolean dark) {
        int color = getColor(dark ? R.color.appWindowBackgroundDark : R.color.appWindowBackground);
        String label = getString(R.string.title_activity_main);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            setTaskDescription(new ActivityManager.TaskDescription.Builder()
                    .setLabel(label)
                    .setPrimaryColor(color)
                    .build());
        } else {
            setTaskDescription(new ActivityManager.TaskDescription(label, null, color));
        }
    }
}
