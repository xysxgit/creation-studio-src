package io.creation.studio

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.PermissionCallback
import com.getcapacitor.annotation.Permission

/**
 * 原生通知/创作提醒插件
 */
@CapacitorPlugin(
    name = "NativeNotification",
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "postNotifications")
    ]
)
class NotificationPlugin : Plugin() {

    private val CHANNEL_ID = "creation_notify"

    @PluginMethod
    fun show(call: PluginCall) {
        val title = call.getString("title") ?: "提醒"
        val body = call.getString("body") ?: ""
        val id = call.getInt("id") ?: System.currentTimeMillis().toInt()

        // Android 13+ 需要 POST_NOTIFICATIONS 权限
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAliases(arrayOf("postNotifications"), call, "permCallback")
            return
        }
        doShow(call, title, body, id)
    }

    @PermissionCallback
    private fun permCallback(call: PluginCall) {
        if (getPermissionState("postNotifications") == com.getcapacitor.PermissionState.GRANTED) {
            val title = call.getString("title") ?: "提醒"
            val body = call.getString("body") ?: ""
            val id = call.getInt("id") ?: System.currentTimeMillis().toInt()
            doShow(call, title, body, id)
        } else {
            call.reject("通知权限被拒绝")
        }
    }

    private fun doShow(call: PluginCall, title: String, body: String, id: Int) {
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) {
                val channel = NotificationChannel(CHANNEL_ID, "创作提醒", NotificationManager.IMPORTANCE_DEFAULT)
                channel.description = "剧本创作提醒通知"
                nm.createNotificationChannel(channel)
            }
            val intent = Intent(context, MainActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            val pi = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notif = NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build()
            nm.notify(id, notif)
            val ret = JSObject()
            ret.put("id", id)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("通知失败：" + e.message)
        }
    }
}
