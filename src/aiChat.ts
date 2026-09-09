/**
 * ============ 轻量 AI 调用：Playground 等轻量玩法复用 ============
 * 与 AIAssistant 共用同一套 settings.ai 配置（endpoint/apiKey/model/thinking）。
 * 差异：这里做「一次性拿全文」的非流式便捷调用，返回 Promise<string|null>；
 *       null 表示「未配置 AI 或调用失败」——调用方据此自动落到本地规则引擎，不抛 UI 报错。
 * 全程不碰 AIAssistant.tsx，零回归。
 */
import { useStudio } from './store';
import type { AISettings } from './types';

/** 空行压缩 */
function trimBlank(s: string): string {
  return s
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface AiChatOpts {
  /** 超时（毫秒）：尚未收到首字节则中止，默认 90s */
  timeoutMs?: number;
  /** 思考等级（覆盖 settings 里默认档） */
  thinkLevel?: 'low' | 'medium' | 'high';
}

/**
 * 发一次对话请求，拿全文。成功返回 trimBlank 后的文本；
 * 若 AI 未启用/未填端点/请求失败/超时/返回空 → 一律返回 null（调用方静默降级到本地）。
 */
export async function aiChatOnce(system: string, user: string, opts: AiChatOpts = {}): Promise<string | null> {
  const ai: AISettings = useStudio.getState().settings.ai;
  if (!ai.enabled || !ai.endpoint || !ai.endpoint.trim()) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90_000);
    const endpoint = ai.endpoint.replace(/\/+$/, '');
    const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;
    const thinkingOn = !!ai.thinking;
    const level = opts.thinkLevel || ai.thinkLevel || 'medium';
    const body: Record<string, unknown> = {
      model: ai.model || 'gpt-4o-mini',
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    if (thinkingOn) {
      body.reasoning_effort = level;
      body.thinking = { type: 'enabled', budget_tokens: level === 'high' ? 8192 : level === 'medium' ? 4096 : 2048 };
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ai.apiKey ? { Authorization: `Bearer ${ai.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    let accText = '';
    let accThink = '';
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/event-stream')) {
      const data = await res.json();
      const choice = data?.choices?.[0]?.message || {};
      accText = typeof choice.content === 'string' ? choice.content : '';
      accThink = typeof choice.reasoning_content === 'string' ? choice.reasoning_content : '';
    } else {
      const reader = res.body?.getReader();
      if (!reader) return null;
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl = buf.indexOf('\n');
        while (nl >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          const t = line.trim();
          if (t.startsWith('data:')) {
            const payload = t.slice(5).trim();
            if (payload && payload !== '[DONE]') {
              try {
                const ev = JSON.parse(payload);
                const delta = ev?.choices?.[0]?.delta || ev?.choices?.[0]?.message || {};
                if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) accThink += delta.reasoning_content;
                if (typeof delta.content === 'string' && delta.content) accText += delta.content;
              } catch { /* ignore */ }
            }
          }
          nl = buf.indexOf('\n');
        }
      }
    }
    clearTimeout(timer);
    const text = accText.trim();
    return text ? trimBlank(text) : null;
  } catch {
    return null;
  }
}
