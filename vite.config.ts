import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 注入脚本指纹：构建时为 public 下的注入资源自动追加「内容哈希」版本参数。
 * 解决 WebView/浏览器缓存旧注入脚本导致「改了不生效」的问题 —— 文件一变，URL 即变。
 * 新增注入文件时只需把文件名加进 INJECT_ASSETS 数组。
 */
const INJECT_ASSETS = ['theme-overrides.css', 'theme-overrides.js', 'select-inline.js'];

function injectAssetVersion(): Plugin {
  return {
    name: 'inject-asset-version',
    transformIndexHtml(html) {
      let out = html;
      for (const f of INJECT_ASSETS) {
        const full = resolve(process.cwd(), 'public', f);
        if (!existsSync(full)) continue;
        const hash = createHash('md5').update(readFileSync(full)).digest('hex').slice(0, 8);
        const safe = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(`(src|href)="/${safe}\\?v=[^"]*"`), `$1="/${f}?v=${hash}"`);
      }
      return out;
    },
  };
}

export default defineConfig({
  plugins: [react(), injectAssetVersion()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // 代码分割：编辑器（tiptap/prosemirror 体积最大）、React、其余第三方分离，
        // 主包只保留业务代码 → 启动解析更快、增量更新字节更小
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor';
          if (id.includes('/react/') || id.includes('react-dom') || id.includes('react/jsx') || id.includes('scheduler')) return 'react';
          return 'vendor';
        },
      },
    },
  },
});