/**
 * 固定控制台会话 id：缺则创建、有则复用（细案 03 §三）。
 */

import fs from 'node:fs';
import { resolveConsoleSessionStatePath, ensureDataRoot } from '../paths.js';

/** @type {string|null} */
let memorySessionId = null;
/** 冒烟：只走内存，不读写真机落盘 */
let diskEnabled = true;

export function getStoredConsoleSessionId() {
  if (memorySessionId) return memorySessionId;
  if (!diskEnabled) return null;
  try {
    const raw = fs.readFileSync(resolveConsoleSessionStatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const id = String(parsed?.sessionId || '').trim();
    if (id) {
      memorySessionId = id;
      return id;
    }
  } catch {
    /* 无文件或坏文件 → 当作未存 */
  }
  return null;
}

/** @param {string} sessionId */
export function storeConsoleSessionId(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return;
  memorySessionId = id;
  if (!diskEnabled) return;
  ensureDataRoot();
  fs.writeFileSync(
    resolveConsoleSessionStatePath(),
    `${JSON.stringify({ sessionId: id, updated_at: Date.now() }, null, 2)}\n`,
    'utf8',
  );
}

/** 冒烟用：内存态 + 禁止碰真机 console-session.json */
export function useConsoleSessionMemoryOnlyForTests() {
  memorySessionId = null;
  diskEnabled = false;
}

export function resetConsoleSessionStateForTests() {
  memorySessionId = null;
  diskEnabled = true;
}
