package io.creation.studio

import android.content.Intent
import android.net.Uri
import android.util.Base64
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * 原生相册选图插件：调用系统相册，选图后返回 base64 + mime 给前端
 */
@CapacitorPlugin(name = "NativeGallery")
class GalleryPlugin : Plugin() {

    @PluginMethod
    fun pickImage(call: PluginCall) {
        try {
            // 用 ACTION_GET_CONTENT，无需读写权限，兼容性最好
            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                type = "image/*"
                addCategory(Intent.CATEGORY_OPENABLE)
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false)
            }
            startActivityForResult(call, intent, "handlePick")
        } catch (e: Exception) {
            call.reject("打开相册失败：" + e.message)
        }
    }

    @ActivityCallback
    private fun handlePick(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val data = result.data
        if (result.resultCode == android.app.Activity.RESULT_OK && data != null && data.data != null) {
            val uri: Uri = data.data!!
            try {
                val resolver = context.contentResolver
                val mime = resolver.getType(uri) ?: "image/jpeg"
                val bytes = readAll(resolver.openInputStream(uri))
                val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                val ret = JSObject()
                ret.put("base64", b64)
                ret.put("mime", mime)
                ret.put("size", bytes.size)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("读取图片失败：" + e.message)
            }
        } else {
            call.reject("已取消选择")
        }
    }

    private fun readAll(input: java.io.InputStream?): ByteArray {
        if (input == null) return ByteArray(0)
        return input.use { it.readBytes() }
    }
}
