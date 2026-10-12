package com.example.readtrace;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * #69：把 App 内「深色模式」的开关值落到 SharedPreferences，
 * 供下次冷启动时 MainActivity 在 super.onCreate 之前读取、决定用深色还是浅色的开屏主题。
 *
 * 为什么不用 @capacitor/preferences：只为这一个键引入一个新插件不值当，
 * 而且我们需要**约定一个固定的、原生侧也知道怎么读的存储位置** —— 这里就是
 * getSharedPreferences("readtrace") 里的字符串 "theme"（"light" / "dark"）。
 * 读写两端必须用同一文件名与键名，改一处就要改另一处。
 */
@CapacitorPlugin(name = "ThemeStore")
public class ThemeStorePlugin extends Plugin {

    private static final String PREFS = "readtrace";
    private static final String KEY = "theme";

    /** 供 MainActivity 在插件未就绪时直接读（静态工具，同一个文件同一个键）。 */
    public static String readTheme(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "");
    }

    @PluginMethod
    public void set(PluginCall call) {
        String t = call.getString("theme", "light");
        if (!"dark".equals(t) && !"light".equals(t)) {
            call.reject("theme must be light or dark");
            return;
        }
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY, t).apply();
        call.resolve();
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject r = new JSObject();
        r.put("theme", readTheme(getContext()));
        call.resolve(r);
    }
}
