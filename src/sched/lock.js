/** 进程内投递短锁（长占用认跑表「整理中」）。禁止跨进程锁文件作主路径。 */

/** @type {{ task: string, started_at: number } | null} */
let held = null;

/** @returns {{ busy: false } | { busy: true, running: object }} */
export function getSchedLockStatus() {
  if (!held) return { busy: false };
  return { busy: true, running: { ...held } };
}

/**
 * @param {string} taskId
 * @returns {{ ok: true, lock: object } | { ok: false, busy: object }}
 */
export function acquireSchedLock(taskId) {
  if (held) return { ok: false, busy: { ...held } };
  held = { task: String(taskId), started_at: Date.now() };
  return { ok: true, lock: { ...held } };
}

/** @param {object} [expected] */
export function releaseSchedLock(expected) {
  if (!held) return;
  if (expected?.task != null && held.task !== expected.task) return;
  held = null;
}

/**
 * @template T
 * @param {string} taskId
 * @param {() => Promise<T>} fn
 */
export async function withSchedLock(taskId, fn) {
  const acq = acquireSchedLock(taskId);
  if (!acq.ok) {
    return {
      status: 'busy',
      woken: false,
      task: String(taskId),
      running: acq.busy,
    };
  }
  try {
    return await fn();
  } finally {
    releaseSchedLock(acq.lock);
  }
}

/** 仅 tests 用：强制清短锁。 */
export function resetSchedLockForTests() {
  held = null;
}
