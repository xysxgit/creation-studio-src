/**
 * ============ AI 模型选择器 ============
 * 设置页/区域用：端点 + 模型下拉，支持预设端点（OpenAI 兼容/本地）与自定义模型，
 * 选择结果写入 settings.ai.model（详见 aiAgents.ts 的预设表）。
 */
import { useMemo, useState } from 'react';
import { useStudio } from '../store';
import { buildModelGroups, saveCachedModels } from '../aiAgents';
import { toast } from '../util';
import { BrainIcon, ReloadIcon } from './icons';

/** 统一的「当前模型显示 + 点击切换」一体控件（正文创作富文本 AI 与画布智能体 AI 共用） */
export default function AIModelSelect({ className = '' }: { className?: string }) {
  const ai = useStudio((s) => s.settings.ai);
  const updateSettings = useStudio((s) => s.updateSettings);
  const cur = ai.model || '';
  const [ver, setVer] = useState(0);
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => buildModelGroups(cur), [cur, ver]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  /** 请求当前服务端点 /models 拉取完整候选列表，填充下拉（可真正切换） */
  const loadModels = async () => {
    const ep = (ai.endpoint || '').trim();
    if (!ep) { toast('请先到「设置 → AI 助手」填写 API 地址', 'warn'); return; }
    const base = ep.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
    setBusy(true);
    try {
      const r = await fetch(`${base}/models`, { headers: ai.apiKey ? { Authorization: `Bearer ${ai.apiKey}` } : {} });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const list = (j.data || []).map((m: { id: string }) => m.id).filter(Boolean);
      if (list.length) { saveCachedModels(list); setVer((v) => v + 1); toast(`已读取 ${list.length} 个模型，可切换`, 'ok'); }
      else toast('未读取到模型（可检查地址/密钥）', 'warn');
    } catch (e) {
      toast('读取模型失败：' + ((e as Error).message || ''), 'err');
    } finally { setBusy(false); }
  };
  return (
    <div className={`ai-model-row ${className}`}>
      <span className="ai-model-ico" title="当前 AI 模型，点击切换"><BrainIcon size={16} /></span>
      <select
        className="ai-model-select"
        value={cur}
        title="切换模型（可点右侧 🔄 读取当前服务返回的完整模型列表）"
        onChange={(e) => {
          const v = e.target.value;
          if (v && v !== cur) {
            updateSettings({ ai: { ...ai, model: v } });
            toast(`已切换模型：${v}`, 'ok');
          }
        }}
      >
        {!cur && <option value="">（未选择模型，点选或到设置填写）</option>}
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </optgroup>
        ))}
        {total === 0 && <option value="">（暂无候选，请填写 API 地址或点右侧读取）</option>}
      </select>
      <button className="ai-model-refresh" title="读取当前服务端点返回的模型列表" disabled={busy} onClick={loadModels}>
        {busy ? '…' : <ReloadIcon size={15} />}
      </button>
    </div>
  );
}