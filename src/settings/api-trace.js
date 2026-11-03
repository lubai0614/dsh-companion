/** 最近一次召回：读数据根小文件。 */

import { loadLastAssembleTrace } from '../trace-store.js';

export function readLastAssembleTracePayload() {
  const packed = loadLastAssembleTrace();
  if (!packed) {
    return { ok: true, empty: true, saved_at: null, trace: null };
  }
  return {
    ok: true,
    empty: false,
    saved_at: packed.saved_at,
    saved_at_display: packed.saved_at
      ? new Date(packed.saved_at).toLocaleString('zh-CN', { hour12: false })
      : null,
    trace: packed.trace,
  };
}
