import { Component, type ReactNode } from 'react';
import { WandIcon } from './icons';
import { logError } from '../util';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * 全局错误边界：任何渲染错误不再白屏，显示友好界面 + 错误摘要 + 重试。
 * 错误信息同时写入 localStorage（cs.lastError），便于排查。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    try {
      localStorage.setItem(
        'cs.lastError',
        JSON.stringify({
          msg: String(error?.message || error),
          stack: info?.componentStack || '',
          at: Date.now(),
        })
      );
    } catch {
      /* ignore */
    }
    // 崩溃监控：纳入持久化崩溃日志队列，便于导出排查
    try {
      logError('ui', 'ErrorBoundary', error);
    } catch { /* ignore */ }
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            background: 'var(--panel, #f5f8fd)',
            color: 'var(--text, #2d3436)',
            padding: 24,
            textAlign: 'center',
            zIndex: 2147483640,
          }}
        >
          <div style={{ fontSize: 44, display: 'flex' }}><WandIcon size={44} /></div>
          <h2 style={{ margin: 0, fontSize: 18 }}>界面遇到了一点问题</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted, #68738f)', maxWidth: 420, wordBreak: 'break-all' }}>
            {msg}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                padding: '9px 18px',
                borderRadius: 10,
                border: '1px solid var(--border, #e6ebf5)',
                background: 'var(--panel2, #eef2fb)',
                color: 'var(--text, #2d3436)',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              尝试恢复
            </button>
            <button
              onClick={() => location.reload()}
              style={{
                padding: '9px 18px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--accent, #6a5cf5)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              重新加载
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted, #68738f)' }}>
            数据已本地保存，重新加载不会丢失
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}