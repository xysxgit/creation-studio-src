package io.creation.studio

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * 应用内版本检测 + APK 更新下载插件
 */
@CapacitorPlugin(name = "NativeUpdate")
class UpdatePlugin : Plugin() {

    @PluginMethod
    fun checkUpdate(call: PluginCall) {
        val currentVersion = call.getString("version") ?: ""
        // 前端通过 latestVersion 传入远端最新版本号（由官网下载页提供）
        val latestVersion = call.getString("latestVersion") ?: ""
        val ret = JSObject()
        val hasNew = !latestVersion.isEmpty() && !currentVersion.isEmpty() && compareVersions(latestVersion, currentVersion) > 0
        ret.put("hasUpdate", hasNew)
        ret.put("currentVersion", currentVersion)
        ret.put("latestVersion", latestVersion)
        call.resolve(ret)
    }

    @PluginMethod
    fun downloadApk(call: PluginCall) {
        val url = call.getString("url") ?: ""
        val filename = call.getString("filename") ?: "creation-studio.apk"
        if (url.isEmpty()) {
            call.reject("url 不能为空")
            return
        }
        try {
            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle("创作助手 新版本下载")
                .setDescription(filename)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
            val id = dm.enqueue(request)
            val ret = JSObject()
            ret.put("downloadId", id)
            ret.put("message", "已开始下载到 Download 目录")
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("下载失败：" + e.message)
        }
    }

    private fun compareVersions(a: String, b: String): Int {
        try {
            val pa = a.trim().removePrefix("v").split(".").map { it.toIntOrNull() ?: 0 }
            val pb = b.trim().removePrefix("v").split(".").map { it.toIntOrNull() ?: 0 }
            for (i in 0 until maxOf(pa.size, pb.size)) {
                val va = pa.getOrElse(i) { 0 }
                val vb = pb.getOrElse(i) { 0 }
                if (va != vb) return va - vb
            }
            return 0
        } catch (e: Exception) {
            return 0
        }
    }
}
