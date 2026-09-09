const fs = require('fs');
const p = '/root/创作助手/src/components/Modals.tsx';
let s = fs.readFileSync(p, 'utf8');

const hero = [
  'function DesktopSyncHero() {',
  '  const [info, setInfo] = useState<{ urls: string[]; wsUrls: string[]; local: string } | null>(null);',
  '  const updateSettings = useStudio((s) => s.updateSettings);',
  '  useEffect(() => {',
  '    const d = (window as any).creationDesktop;',
  '    if (!d || !d.isDesktop) return;',
  '    d.getLanInfo().then(setInfo).catch(() => {});',
  '  }, []);',
  '  if (!info) return null;',
  '  const host = info.urls[0] || info.local;',
  '  const qrTarget = host;',
  '  return (',
  '    <div className="modal-sec desktop-sync">',
  '      <h4>🖥️ 本机 = 协同主控端</h4>',
  '      <p className="hint">桌面版已内置协同服务器，打开即作为主控。其他设备（手机/平板）连下方地址即可加入协同。</p>',
  '      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0" }}>',
  '        {info.urls.map((u, i) => (<div key={i}><code style={{ wordBreak: "break-all" }}>{u}</code></div>))}',
  '      </div>',
  '      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>',
  '        <img src={`${host}/apk/qr.svg?url=${encodeURIComponent(qrTarget)}`} alt="协同二维码" width={140} height={140} style={{ borderRadius: 8, border: "1px solid var(--border)" }} />',
  '        <div className="hint" style={{ maxWidth: 260 }}>手机/平板扫描二维码进入本机协同页，即可与电脑进入同一项目、实时协同。</div>',
  '      </div>',
  '      <button style={{ marginTop: 10 }} onClick={() => { updateSettings({ serverUrl: info.local }); }}>🖥️ 本机直接使用内置协同（{info.local}）</button>',
  '    </div>',
  '  );',
  '}',
  '',
].join('\n');

// 1) 组件定义插到 NewProjectModal 前
const anchor1 = 'function NewProjectModal({ onClose }: { onClose: () => void }) {';
if (!s.includes(anchor1)) throw new Error('anchor1 未找到');
s = s.replace(anchor1, hero + anchor1);

// 2) 在「局域网协同」面板前渲染
const anchor2 = '      <div className="modal-sec">\n        <h4>🌐 局域网协同</h4>';
if (!s.includes(anchor2)) throw new Error('anchor2 未找到');
s = s.replace(anchor2, '      <DesktopSyncHero />\n      <div className="modal-sec">\n        <h4>🌐 局域网协同</h4>');

fs.writeFileSync(p, s);
console.log('OK Modals.tsx 已插入桌面协同主控面板');