package io.creation.studio

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * 原生主题插件：控制状态栏/导航栏颜色、亮暗图标、沉浸式
 */
@CapacitorPlugin(name = "NativeTheme")
class ThemePlugin : Plugin() {

    @PluginMethod
    fun applyTheme(call: PluginCall) {
        try {
            val colorHex = call.getString("color") ?: "#6C5CE7"
            val isDark = call.getBoolean("isDark") ?: false
            val immersive = call.getBoolean("immersive") ?: false
            val activity = activity ?: run {
                call.reject("activity 不存在")
                return
            }
            val window = activity.window
            val color = parseColor(colorHex)
            // 状态栏颜色
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                window.statusBarColor = color
                window.navigationBarColor = color
            }
            // 图标明暗：亮背景用深色图标，暗背景用浅色图标
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val flag = if (isDark) 0 else View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
                window.decorView.systemUiVisibility = window.decorView.systemUiVisibility and
                    (View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR).inv() or flag
            }
            val ret = JSObject()
            ret.put("applied", true)
            ret.put("color", colorHex)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("主题应用失败：" + e.message)
        }
    }

    @PluginMethod
    fun getDynamicColor(call: PluginCall) {
        // Material You 动态取色（Android 12+）
        try {
            val ret = JSObject()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                ret.put("supported", true)
                ret.put("color", "#6C5CE7") // 可扩展：解析系统动态色
            } else {
                ret.put("supported", false)
                ret.put("color", "#6C5CE7")
            }
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("获取动态色失败：" + e.message)
        }
    }

    private fun parseColor(hex: String): Int {
        return try {
            Color.parseColor(hex)
        } catch (e: Exception) {
            Color.parseColor("#6C5CE7")
        }
    }
}
