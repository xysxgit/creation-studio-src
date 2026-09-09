package io.creation.studio

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "NativeCore")
class NativeCorePlugin : Plugin() {

    @PluginMethod
    fun getAppInfo(call: PluginCall) {
        val ret = JSObject()
        ret.put("name", "创作助手")
        ret.put("versionName", try { context.packageManager.getPackageInfo(context.packageName, 0).versionName } catch (e: Exception) { "unknown" })
        ret.put("versionCode", try { context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode } catch (e: Exception) { 0L })
        ret.put("platform", "android")
        ret.put("isNative", true)
        call.resolve(ret)
    }
}
