package io.creation.studio

import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.provider.DocumentsContract
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * 原生文件系统访问插件（SAF）：选择目录后读写文件，无需危险权限
 */
@CapacitorPlugin(name = "NativeFileAccess")
class FileAccessPlugin : Plugin() {

    @PluginMethod
    fun pickDirectory(call: PluginCall) {
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            startActivityForResult(call, intent, "handleDir")
        } catch (e: Exception) {
            call.reject("打开目录选择失败：" + e.message)
        }
    }

    @ActivityCallback
    private fun handleDir(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val data = result.data
        if (result.resultCode == android.app.Activity.RESULT_OK && data != null && data.data != null) {
            val treeUri: Uri = data.data!!
            try {
                // 持久化访问权限（重启后仍有效）
                val flags = data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                context.contentResolver.takePersistableUriPermission(treeUri, flags)
                val ret = JSObject()
                ret.put("uri", treeUri.toString())
                ret.put("name", queryName(treeUri))
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("保存目录权限失败：" + e.message)
            }
        } else {
            call.reject("已取消选择目录")
        }
    }

    @PluginMethod
    fun writeFile(call: PluginCall) {
        val treeUriStr = call.getString("dirUri") ?: ""
        val filename = call.getString("filename") ?: ""
        val base64 = call.getString("base64") ?: ""
        if (treeUriStr.isEmpty() || filename.isEmpty()) {
            call.reject("dirUri/filename 不能为空")
            return
        }
        try {
            val treeUri = Uri.parse(treeUriStr)
            val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
            // 查找或创建同名文件
            val targetUri = findOrCreateFile(treeUri, filename)
            val data = Base64.decode(base64, Base64.DEFAULT)
            context.contentResolver.openOutputStream(targetUri, "wt")?.use { it.write(data) }
            val ret = JSObject()
            ret.put("uri", targetUri.toString())
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("写入失败：" + e.message)
        }
    }

    @PluginMethod
    fun readFile(call: PluginCall) {
        val treeUriStr = call.getString("dirUri") ?: ""
        val filename = call.getString("filename") ?: ""
        if (treeUriStr.isEmpty() || filename.isEmpty()) {
            call.reject("dirUri/filename 不能为空")
            return
        }
        try {
            val treeUri = Uri.parse(treeUriStr)
            val targetUri = findOrCreateFile(treeUri, filename)
            val bytes = context.contentResolver.openInputStream(targetUri)?.use { it.readBytes() } ?: ByteArray(0)
            val ret = JSObject()
            if (bytes.isEmpty()) {
                ret.put("exists", false)
                ret.put("base64", "")
            } else {
                ret.put("exists", true)
                ret.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            }
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("读取失败：" + e.message)
        }
    }

    @PluginMethod
    fun listFiles(call: PluginCall) {
        val treeUriStr = call.getString("dirUri") ?: ""
        if (treeUriStr.isEmpty()) {
            call.reject("dirUri 不能为空")
            return
        }
        try {
            val treeUri = Uri.parse(treeUriStr)
            val children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
            val array = com.getcapacitor.JSArray()
            context.contentResolver.query(children, null, null, null, null)?.use { cursor ->
                while (cursor.moveToNext()) {
                    val name = cursor.getString(cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME))
                    val mime = cursor.getString(cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE))
                    val docId = cursor.getString(cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID))
                    val obj = JSObject()
                    obj.put("name", name)
                    obj.put("mime", mime)
                    obj.put("isDir", mime == DocumentsContract.Document.MIME_TYPE_DIR)
                    obj.put("uri", DocumentsContract.buildDocumentUriUsingTree(treeUri, docId).toString())
                    array.put(obj)
                }
            }
            val ret = JSObject()
            ret.put("files", array)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("列目录失败：" + e.message)
        }
    }

    private fun findOrCreateFile(treeUri: Uri, filename: String): Uri {
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
        context.contentResolver.query(children, null, null, null, null)?.use { cursor ->
            while (cursor.moveToNext()) {
                val name = cursor.getString(cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME))
                if (name == filename) {
                    val docId = cursor.getString(cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID))
                    return DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
                }
            }
        }
        // 未找到则新建
        val mime = mimeOf(filename)
        val docUri = DocumentsContract.createDocument(context.contentResolver, treeUri, mime, filename)
            ?: throw Exception("无法创建文件")
        return docUri
    }

    private fun mimeOf(name: String): String {
        return when (name.substringAfterLast('.', "").lowercase()) {
            "txt", "md" -> "text/plain"
            "json" -> "application/json"
            "html" -> "text/html"
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "pdf" -> "application/pdf"
            else -> "application/octet-stream"
        }
    }

    private fun queryName(uri: Uri): String {
        return uri.lastPathSegment ?: ""
    }
}
