/** 把叫醒结果写入跑表。 */

import { shouldAdvanceOnWake, summarizeSchedOutcome } from './outcome.js';
import { insertSchedRun, normalizeSchedTask } from './run-log.js';

/**
 * @param {import('../db.js').MemoryDb} db
 * @param {object} opts
 */
export function recordSchedRun(db, opts) {
  const task = normalizeSchedTask(opts.task);
  let status = opts.status;
  let summary = opts.summary;
  if (opts.out != null) {
    const packed = summarizeSchedOutcome(opts.out);
    status = packed.status;
    summary = packed.summary;
  }

  let advances = opts.advances_progress;
  if (advances == null) {
    if (task === 'digest' || task === 'promote') {
      advances = opts.out != null ? shouldAdvanceOnWake(opts.out) : status === 'empty';
    } else {
      advances = false;
    }
  }

  return insertSchedRun(db, {
    task,
    status: status || 'unknown',
    summary: summary || String(status || 'unknown'),
    day_key: opts.day_key,
    started_at: opts.started_at,
    finished_at: opts.finished_at,
    advances_progress: Boolean(advances),
  });
}
