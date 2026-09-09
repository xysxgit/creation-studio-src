package io.creation.studio

import android.content.Intent
import android.net.Uri
import android.util.Base64
import androidx.core.content.FileProvider
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/**
 * 原生分享插件：文本 / 文件（base64）分享到系统（微信/QQ/其他）
 */
@CapacitorPlugin(name = "NativeShare")
class SharePlugin : Plugin() {

    @PluginMethod
    fun shareText(call: PluginCall) {
        val text = call.getString("text") ?: ""
        val title = call.getString("title") ?: "分享"
        if (text.isBlank()) {
            call.reject("text 不能为空")
            return
        }
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        startShare(intent, title, call)
    }

    @PluginMethod
    fun shareFile(call: PluginCall) {
        val filename = call.getString("filename") ?: ""
        val base64 = call.getString("base64") ?: ""
        val mime = call.getString("mime") ?: "application/octet-stream"
        val title = call.getString("title") ?: "分享文件"
        if (filename.isBlank() || base64.isBlank()) {
            call.reject("filename/base64 不能为空")
            return
        }
        try {
            val data = Base64.decode(base64, Base64.DEFAULT)
            // 写入应用缓存目录，再通过 FileProvider 分享
            val cacheDir = File(context.cacheDir, "share")
            cacheDir.mkdirs()
            val file = File(cacheDir, filename)
            file.writeBytes(data)
            val uri: Uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startShare(intent, title, call)
        } catch (e: Exception) {
            call.reject("分享失败：" + e.message)
        }
    }

    private fun startShare(intent: Intent, title: String, call: PluginCall) {
        try {
            val chooser = Intent.createChooser(intent, title)
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(chooser)
            call.resolve()
        } catch (e: Exception) {
            call.reject("无可用分享应用：" + e.message)
        }
    }
}
