/**
 * ============ 协同操作流（op） ============
 * 从 store.ts 抽取，负责与 WebSocket 协同层对接：
 *  · bindOpSink：绑定 op 上报回调（ws 客户端连接时注入）
 *  · emitOps：广播本地变更 op；rememberOp / seenOps：接收端去重（幂等）
 *  · getClientId：本机协同身份（随机持久化）
 */
import type { Op } from '../types';
import { uid } from '../util';

type OpSink = (ops: Op[]) => void;
let opSink: OpSink | null = null;
export function bindOpSink(fn: OpSink | null) {
  opSink = fn;
}

let getCurrentPageId: () => string = () => '';
export function setOpPageGetter(fn: () => string) {
  getCurrentPageId = fn;
}

export function emitOps(ops: Op[]) {
  if (opSink && ops.length) {
    // 注入当前页面 id：卡片/连线 op 仅作用于所属页面（协同按页面隔离）
    const page = getCurrentPageId();
    const tagged = ops.map((op) =>
      (op.type === 'card.upsert' || op.type === 'card.remove' || op.type === 'edge.upsert' || op.type === 'edge.remove') && page
        ? { ...op, payload: { ...op.payload, page } }
        : op
    );
    opSink(tagged);
  }
}

let clientId = '';
export function getClientId(): string {
  if (!clientId) clientId = uid('c').replace(/[^a-z0-9]/g, '').slice(0, 10);
  return clientId;
}

// 最近收到的 op id（去重）
export const seenOps = new Set<string>();
export function rememberOp(id: string) {
  seenOps.add(id);
  if (seenOps.size > 500) {
    const it = seenOps.values().next().value;
    seenOps.delete(it);
  }
}
