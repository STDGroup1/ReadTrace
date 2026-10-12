package com.example.readtrace;

import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * #141：「保存到手机」—— 把头像（或以后任何 dataURL 图片）写进系统相册。
 *
 * 为什么自己写而不用 @capacitor-community/media：只为一个动作引一个 npm 插件不值当
 * （ThemeStorePlugin #69 同款理由），而且 MediaStore 这条路三十行就够了。
 *
 * API 29+：MediaStore.Images + RELATIVE_PATH Pictures/ReadTrace + IS_PENDING 两段式，
 *   **不需要任何存储权限**（向 MediaStore 贡献自己产生的媒体是豁免的）。
 * API 26-28：老路径写公共 Pictures 目录，需要 WRITE_EXTERNAL_STORAGE（manifest 里
 *   maxSdkVersion=28 只影响声明，运行时授权依旧要用户点头）—— 没授权就 reject
 *   "no_permission"，前端 toast 引导去系统设置。targetSdk 34 的今天，26-28 的机器
 *   占比趋近于零，这条路只是「不崩」的兜底。
 *
 * 前端调用（saveAvatarToPhone）：saveImage({ dataUrl, name })，dataUrl 必须是
 * data:image/*;base64, 开头；文件名原生侧补时间戳与 .jpg 后缀。
 */
@CapacitorPlugin(name = "GallerySave")
public class GallerySavePlugin extends Plugin {

    @PluginMethod
    public void saveImage(PluginCall call) {
        String dataUrl = call.getString("dataUrl", "");
        String name = call.getString("name", "readtrace-image");
        int comma = dataUrl.indexOf(',');
        if (!dataUrl.startsWith("data:image/") || comma < 0) {
            call.reject("bad_data_url");
            return;
        }
        byte[] bytes;
        try {
            bytes = android.util.Base64.decode(dataUrl.substring(comma + 1), android.util.Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("bad_data_url");
            return;
        }
        /* 文件名清洗：name 来自 JS（可被手搓请求伪造），路径分隔符与 .. 一律替掉，
           别让兜底路径把文件写出 Pictures/ReadTrace 之外（MediaStore 路径不受影响） */
        name = name.replaceAll("[/\\\\]", "_").replaceAll("\\.\\.", "_").trim();
        if (name.isEmpty()) name = "readtrace-image";
        String fileName = name + "-" + System.currentTimeMillis() + ".jpg";
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                cv.put(MediaStore.Images.Media.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/ReadTrace");
                cv.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri uri = getContext().getContentResolver()
                        .insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) {
                    call.reject("insert_failed");
                    return;
                }
                OutputStream os = getContext().getContentResolver().openOutputStream(uri);
                if (os == null) {
                    call.reject("insert_failed");
                    return;
                }
                try {
                    os.write(bytes);
                } finally {
                    os.close();
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.Images.Media.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, done, null, null);
                JSObject r = new JSObject();
                r.put("saved", true);
                r.put("uri", uri.toString());
                call.resolve(r);
            } else {
                if (androidx.core.content.ContextCompat.checkSelfPermission(
                        getContext(), android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    call.reject("no_permission");
                    return;
                }
                File dir = new File(Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_PICTURES), "ReadTrace");
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, fileName);
                FileOutputStream fo = new FileOutputStream(f);
                try {
                    fo.write(bytes);
                } finally {
                    fo.close();
                }
                /* 老系统不会自己扫文件，不扫的话图库里看不到 */
                MediaScannerConnection.scanFile(getContext(),
                        new String[]{f.getAbsolutePath()}, new String[]{"image/jpeg"}, null);
                JSObject r = new JSObject();
                r.put("saved", true);
                call.resolve(r);
            }
        } catch (Exception e) {
            call.reject("save_failed", e.getMessage());
        }
    }
}
