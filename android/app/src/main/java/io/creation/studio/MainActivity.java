package io.creation.studio;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import java.io.OutputStream;

/**
 * 创作助手 - Capacitor 宿主
 * 注入 OperitAndroid 原生桥：
 *   saveBase64(filename, base64, mime) → 弹出系统「选择保存位置」对话框（ACTION_CREATE_DOCUMENT）
 *
 * 重要：getBridge().getWebView() 在 onCreate 时 WebView 可能尚未创建完成，
 * 因此用 post 延迟多次重试注入，确保页面加载后桥一定存在。
 */
public class MainActivity extends BridgeActivity {

  /** 静态字段：保存对话框期间 Activity 可能因旋转/配置变化重建，静态可跨实例保留待写数据 */
  private static byte[] sPendingData;
  private static final int SAVE_REQ = 2001;
  private boolean sInjected = false;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // 注册 Kotlin 原生增强插件（必须在 super.onCreate 之前，因 bridge 在 onCreate 中创建）
    // 注册 Kotlin 原生增强插件（必须在 super.onCreate 之前，因 bridge 在 onCreate 中创建）
    registerPlugin(NativeCorePlugin.class);
    registerPlugin(SharePlugin.class);
    registerPlugin(GalleryPlugin.class);
    registerPlugin(NotificationPlugin.class);
    registerPlugin(FileAccessPlugin.class);
    registerPlugin(UpdatePlugin.class);
    registerPlugin(ThemePlugin.class);
    super.onCreate(savedInstanceState);
    tryInjectBridge();
    // 多次延迟重试：WebView 在 BridgeActivity 初始化之后才就绪
    getWindow().getDecorView().postDelayed(this::tryInjectBridge, 150);
    getWindow().getDecorView().postDelayed(this::tryInjectBridge, 500);
    getWindow().getDecorView().postDelayed(this::tryInjectBridge, 1200);
  }

  /** 注入原生桥（幂等：已注入则跳过） */
  private void tryInjectBridge() {
    if (sInjected) return;
    try {
      WebView wv = getBridge().getWebView();
      if (wv != null) {
        wv.addJavascriptInterface(new SaveBridge(), "OperitAndroid");
        sInjected = true;
      }
    } catch (Exception ignored) {
    }
  }

  /** JS → 原生：保存 base64 文件（系统对话框选位置） */
  public class SaveBridge {
    @JavascriptInterface
    public void saveBase64(String filename, String base64, String mime) {
      runOnUiThread(() -> {
        try {
          byte[] data = Base64.decode(base64, Base64.DEFAULT);
          if (data.length > 60 * 1024 * 1024) {
            Toast.makeText(MainActivity.this, "文件过大（>60MB）", Toast.LENGTH_SHORT).show();
            return;
          }
          sPendingData = data;
          Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
          intent.addCategory(Intent.CATEGORY_OPENABLE);
          intent.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
          intent.putExtra(Intent.EXTRA_TITLE, filename);
          startActivityForResult(intent, SAVE_REQ);
        } catch (Exception e) {
          Toast.makeText(MainActivity.this, "导出失败：" + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
      });
    }
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    if (requestCode == SAVE_REQ) {
      if (resultCode == RESULT_OK) {
        Uri uri = data != null ? data.getData() : null;
        if (uri != null && sPendingData != null) {
          try {
            OutputStream os = getContentResolver().openOutputStream(uri);
            if (os != null) {
              os.write(sPendingData);
              os.flush();
              os.close();
            }
            Toast.makeText(this, "已保存 ✓", Toast.LENGTH_SHORT).show();
          } catch (Exception e) {
            Toast.makeText(this, "保存失败：" + e.getMessage(), Toast.LENGTH_SHORT).show();
          }
        } else if (uri != null) {
          // 数据因重建丢失等极端情况：避免误报“已取消”
          Toast.makeText(this, "保存位置已变化，请重新导出", Toast.LENGTH_SHORT).show();
        } else {
          Toast.makeText(this, "已取消保存", Toast.LENGTH_SHORT).show();
        }
      } else {
        Toast.makeText(this, "已取消保存", Toast.LENGTH_SHORT).show();
      }
      sPendingData = null;
      return;
    }
    super.onActivityResult(requestCode, resultCode, data);
  }

  /**
   * 原生返回拦截：WebView 内部可后退（页面跳转）时后退；
   * 否则交给 Capacitor/前端已注册的 backButton 监听处理（关层/屏蔽退出）。
   */
  @Override
  public void onBackPressed() {
    try {
      WebView wv = getBridge().getWebView();
      if (wv != null && wv.canGoBack()) {
        wv.goBack();
        return;
      }
    } catch (Exception e) {
      // 忽略
    }
    super.onBackPressed();
  }
}