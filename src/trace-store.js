/** 最近一次装配 trace：数据根小文件，覆盖写。 */

import fs from 'node:fs';
import { ensureDataRoot, resolveLastAssembleTracePath } from './paths.js';

/**
 * @param {object} trace assembleContext 的 trace
 */
export function saveLastAssembleTrace(trace) {
  if (!trace || typeof trace !== 'object') return;
  ensureDataRoot();
  const path = resolveLastAssembleTracePath();
  const payload = {
    saved_at: Date.now(),
    trace,
  };
  fs.writeFileSync(path, JSON.stringify(payload), 'utf8');
}

/** @returns {{ saved_at: number, trace: object } | null} */
export function loadLastAssembleTrace() {
  const path = resolveLastAssembleTracePath();
  try {
    const raw = fs.readFileSync(path, 'utf8');
    const data = JSON.parse(raw);
    if (!data?.trace || typeof data.trace !== 'object') return null;
    return {
      saved_at: Number(data.saved_at) || 0,
      trace: data.trace,
    };
  } catch {
    return null;
  }
}
