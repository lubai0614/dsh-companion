/** sched_run_log：一趟一条；互斥认「整理中」；收尾就地改写。 */

export const TASKS = Object.freeze(['digest', 'promote', 'growth', 'rhythm']);

/**
 * @param {string} task
 * @returns {'digest'|'promote'|'growth'|'rhythm'}
 */
export function normalizeSchedTask(task) {
  const t = String(task || '').trim();
  if (t === 'reassess') return 'rhythm';
  if (!TASKS.includes(t)) throw new Error(`unknown sched task: ${task}`);
  return /** @type {'digest'|'promote'|'growth'|'rhythm'} */ (t);
}

/**
 * @param {import('../db.js').MemoryDb} db
 * @param {object} opts
 */
export function insertSchedRun(db, opts) {
  const task = normalizeSchedTask(opts.task);
  const finished_at = opts.finished_at == null ? Date.now() : Number(opts.finished_at);
  const started_at = opts.started_at == null ? finished_at : Number(opts.started_at);
  const day_key =
    opts.day_key == null || opts.day_key === '' ? null : String(opts.day_key);
  const status = String(opts.status || 'unknown');
  const summary = String(opts.summary || status);
  const advances = opts.advances_progress ? 1 : 0;

  const info = db.db
    .prepare(
      `
    INSERT INTO sched_run_log
      (task, started_at, finished_at, status, summary, day_key, advances_progress, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(task, started_at, finished_at, status, summary, day_key, advances, finished_at);

  return {
    id: Number(info.lastInsertRowid),
    task,
    started_at,
    finished_at,
    status,
    summary,
    day_key,
    advances_progress: advances === 1,
  };
}

function schedRunTimeWhere(range = {}) {
  /** @type {string[]} */
  const parts = [];
  /** @type {number[]} */
  const params = [];
  const from = Number(range.from_ms);
  const to = Number(range.to_ms);
  if (Number.isFinite(from) && from > 0) {
    parts.push('finished_at >= ?');
    params.push(from);
  }
  if (Number.isFinite(to) && to > 0) {
    parts.push('finished_at <= ?');
    params.push(to);
  }
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params };
}

/**
 * @param {import('../db.js').MemoryDb} db
 */
export function listSchedRuns(db, task, limit = 20, offset = 0, range = {}) {
  const t = normalizeSchedTask(task);
  const n = Math.max(1, Math.min(100, Number(limit) || 20));
  const off = Math.max(0, Number(offset) || 0);
  const tw = schedRunTimeWhere(range);
  return db.db
    .prepare(
      `
    SELECT id, task, started_at, finished_at, status, summary, day_key,
           advances_progress, created_at
    FROM sched_run_log
    WHERE task = ?${tw.sql}
    ORDER BY finished_at DESC, id DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(t, ...tw.params, n, off);
}

/**
 * @param {import('../db.js').MemoryDb} db
 */
export function countSchedRuns(db, task, range = {}) {
  const t = normalizeSchedTask(task);
  const tw = schedRunTimeWhere(range);
  const row = db.db
    .prepare(`SELECT COUNT(*) AS n FROM sched_run_log WHERE task = ?${tw.sql}`)
    .get(t, ...tw.params);
  return Number(row?.n || 0);
}

/**
 * @param {import('../db.js').MemoryDb} db
 */
export function listSchedRunsPage(db, task, opts = {}) {
  const pageSize = Math.max(1, Math.min(50, Number(opts.pageSize) || 10));
  const page = Math.max(1, Number(opts.page) || 1);
  const range = { from_ms: opts.from_ms, to_ms: opts.to_ms };
  const total = countSchedRuns(db, task, range);
  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, pages);
  const offset = (safePage - 1) * pageSize;
  const rows = listSchedRuns(db, task, pageSize, offset, range);
  return { task: normalizeSchedTask(task), page: safePage, pageSize, total, pages, rows };
}

/**
 * @param {import('../db.js').MemoryDb} db
 */
export function getLatestSchedRun(db, task) {
  const rows = listSchedRuns(db, task, 1);
  return rows[0] || null;
}

/**
 * 最近已收尾（跳过「整理中」）。
 * @param {import('../db.js').MemoryDb} db
 */
export function getLatestClosedSchedRun(db, task) {
  const t = normalizeSchedTask(task);
  const rows = db.db
    .prepare(
      `
    SELECT id, task, started_at, finished_at, status, summary, day_key,
           advances_progress, created_at
    FROM sched_run_log
    WHERE task = ?
    ORDER BY finished_at DESC, id DESC
    LIMIT 30
  `,
    )
    .all(t);
  for (const row of rows) {
    if (!isOpenSchedRun(row)) return row;
  }
  return null;
}

/**
 * @param {import('../db.js').MemoryDb} db
 */
export function getLatestProgressAt(db, task) {
  const t = normalizeSchedTask(task);
  const row = db.db
    .prepare(
      `
    SELECT finished_at FROM sched_run_log
    WHERE task = ? AND advances_progress = 1
    ORDER BY finished_at DESC, id DESC
    LIMIT 1
  `,
    )
    .get(t);
  const n = Number(row?.finished_at || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isOpenSchedRun(row) {
  if (!row) return false;
  if (Number(row.advances_progress) === 1) return false;
  const summary = String(row.summary || '');
  return (
    row.status === 'woken' ||
    summary.startsWith('整理中') ||
    summary.startsWith('已叫醒')
  );
}

/**
 * @param {import('../db.js').MemoryDb} db
 */
export function listOpenSchedRuns(db) {
  /** @type {{ task: string, row: object, at: number }[]} */
  const out = [];
  for (const task of TASKS) {
    const latest = getLatestSchedRun(db, task);
    if (!isOpenSchedRun(latest)) continue;
    out.push({
      task,
      row: latest,
      at: Number(latest.started_at || latest.finished_at || 0),
    });
  }
  out.sort(
    (a, b) => b.at - a.at || Number(b.row.id || 0) - Number(a.row.id || 0),
  );
  return out;
}

/**
 * @param {import('../db.js').MemoryDb} db
 */
export function getActiveSchedTask(db) {
  return listOpenSchedRuns(db)[0] || null;
}

/**
 * 收尾：有「整理中」则就地改写；否则不插行。
 * @param {import('../db.js').MemoryDb} db
 */
export function finalizeSchedRun(db, opts) {
  const task = normalizeSchedTask(opts.task);
  const latest = getLatestSchedRun(db, task);
  const finished_at =
    opts.finished_at == null ? Date.now() : Number(opts.finished_at);
  const status = String(opts.status || 'ran');
  const summary = String(opts.summary || status);
  const advances = opts.advances_progress ? 1 : 0;
  const day_key =
    opts.day_key == null || opts.day_key === ''
      ? latest?.day_key ?? null
      : String(opts.day_key);

  if (isOpenSchedRun(latest)) {
    const id = Number(latest.id);
    db.db
      .prepare(
        `
      UPDATE sched_run_log
      SET status = ?,
          summary = ?,
          finished_at = ?,
          day_key = COALESCE(?, day_key),
          advances_progress = ?
      WHERE id = ?
    `,
      )
      .run(status, summary, finished_at, day_key, advances, id);
    return {
      id,
      task,
      started_at: latest.started_at,
      finished_at,
      status,
      summary,
      day_key: day_key ?? latest.day_key ?? null,
      advances_progress: advances === 1,
      updated: true,
      skipped: false,
    };
  }

  console.warn('[dsh-companion][sched] finalize skipped (no open 整理中); will not insert', {
    task,
    wanted_status: status,
    summary,
    latest_id: latest?.id ?? null,
    latest_status: latest?.status ?? null,
    at: finished_at,
  });
  return {
    id: latest?.id != null ? Number(latest.id) : null,
    task,
    started_at: latest?.started_at ?? null,
    finished_at: latest?.finished_at ?? null,
    status: latest?.status ?? null,
    summary: latest?.summary ?? null,
    day_key: latest?.day_key ?? day_key,
    advances_progress: Boolean(latest?.advances_progress),
    updated: false,
    skipped: true,
    reason: 'no_open_run',
  };
}

/**
 * 解除卡住：就地改写 → 失败；不推进。
 * @param {import('../db.js').MemoryDb} db
 */
export function abandonOpenSchedRuns(db, reason) {
  const detail = String(reason || '控制台任务未收尾，已人工解除').trim();
  const open = listOpenSchedRuns(db);
  /** @type {object[]} */
  const closed = [];
  for (const item of open) {
    closed.push(
      finalizeSchedRun(db, {
        task: item.task,
        status: 'failed',
        summary: `失败：${detail}`,
        day_key: item.row?.day_key ?? null,
        advances_progress: false,
      }),
    );
  }
  return { closed_count: closed.length, closed };
}

/**
 * 日摘 / 晋升 / 再评估显式收尾。
 * @param {import('../db.js').MemoryDb} db
 * @param {'digest'|'promote'|'growth'|'rhythm'} task
 */
export function completeSchedRun(db, task, opts = {}) {
  const t = normalizeSchedTask(task);
  const defaults = {
    digest: '已完成：日摘整理收尾',
    promote: '已完成：晋升整理收尾',
    growth: '已完成：增长整理收尾',
    rhythm: '已完成：节奏整理收尾',
  };
  const note = String(opts.summary || '').trim();
  return finalizeSchedRun(db, {
    task: t,
    status: 'ran',
    summary: note || defaults[t] || '已完成',
    day_key: opts.day_key,
    advances_progress: true,
  });
}
