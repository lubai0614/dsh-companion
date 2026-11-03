/** 定时任务页：四卡近态、跑表列表、手动启 / 解除卡住。 */

import { openMemoryDb } from '../db.js';
import { localDayKey, shiftDayKey } from '../near.js';
import {
  abandonOpenOrganizeRuns,
  createSchedRunner,
  getLatestClosedSchedRun,
  getSchedLockStatus,
  listOpenOrganizeRuns,
  listSchedRunsPage,
  recordSchedRun,
} from '../sched/index.js';
import { getWakeHooks } from '../sched/wake-hooks.js';
import { withMemoryDb } from './open-db.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const TASKS = Object.freeze([
  {
    id: 'digest',
    title: '日摘',
    timeKey: 'near_digest_time',
    logTask: 'digest',
    note: '漏跑可指定自然日补。',
    needsDay: true,
  },
  {
    id: 'promote',
    title: '晋升',
    timeKey: 'near_promote_time',
    logTask: 'promote',
    note: '漏跑可指定自然日补。',
    needsDay: true,
  },
  {
    id: 'growth',
    title: '增长',
    timeKey: 'ltm_growth_check_time',
    logTask: 'growth',
    note: '未达阈值则跳过；整理收尾成功才记已完成。',
    needsDay: false,
  },
  {
    id: 'reassess',
    title: '节奏',
    timeKey: 'ltm_reassess_check_time',
    logTask: 'rhythm',
    note: '未到间隔则跳过；整理收尾成功才记已完成。',
    needsDay: false,
  },
]);

/** @type {boolean} */
let pluginTickActive = false;

export function setPluginTickActive(on) {
  pluginTickActive = Boolean(on);
}

export function getPluginTickActive() {
  return pluginTickActive;
}

function formatEpoch(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return { display: '尚未记录', ms: 0 };
  }
  return {
    display: new Date(n).toLocaleString('zh-CN', { hour12: false }),
    ms: n,
  };
}

function lockTaskName(taskId) {
  if (taskId === 'reassess') return 'rhythm';
  return taskId;
}

function defaultYesterday() {
  return shiftDayKey(localDayKey(), -1);
}

function resultKindFromSummary(summary) {
  const s = String(summary || '');
  if (s.startsWith('已完成') || s.startsWith('成功')) return 'ok';
  if (s.startsWith('整理中') || s.startsWith('已叫醒')) return 'woken';
  if (s.startsWith('失败')) return 'failed';
  if (s.startsWith('已跳过') || s.startsWith('未到期') || s.startsWith('未执行')) return 'skipped';
  if (s.startsWith('空转')) return 'empty';
  if (s.startsWith('已拒启') || s.startsWith('忙碌')) return 'busy';
  return summary ? 'other' : 'none';
}

function lifecycleStatusZh(status, advances, summary) {
  const s = String(status || '').trim();
  const sum = String(summary || '');
  if (s === 'woken') return '整理中';
  if (s === 'empty' || s === 'no_jobs') return '空转';
  if (s === 'busy') return '已拒启';
  if (s === 'failed') return '失败';
  if (s === 'skipped_not_due' || s === 'skipped_no_hook') return '已跳过';
  if (s === 'ran') {
    if (advances) return '已完成';
    if (sum.startsWith('整理中') || sum.startsWith('已叫醒')) return '整理中';
    return '已完成';
  }
  if (sum.startsWith('整理中') || sum.startsWith('已叫醒')) return '整理中';
  if (sum.startsWith('已完成') || sum.startsWith('成功')) return '已完成';
  return s || '—';
}

function writeTaskFailureResult(taskId, message, opts = {}) {
  const meta = TASKS.find((t) => t.id === taskId);
  if (!meta) return;
  withMemoryDb(
    (db) => {
      recordSchedRun(db, {
        task: meta.logTask,
        status: 'failed',
        summary: `失败：${message}`,
        advances_progress: false,
      });
    },
    { dbPath: opts.dbPath },
  );
}

async function executeTask(taskId, opts = {}) {
  const db = openMemoryDb({ dbPath: opts.dbPath });
  try {
    const runner = createSchedRunner(db, getWakeHooks() || {});
    if (taskId === 'digest') {
      const day_key = opts.day_key || runner.yesterdayKey();
      return await runner.runDigestOrganizeNow(day_key);
    }
    if (taskId === 'promote') {
      const as_of_day = opts.day_key || runner.yesterdayKey();
      return await runner.runPromoteOrganizeNow(as_of_day);
    }
    if (taskId === 'growth') {
      return await runner.runReassessOrganizeNow('growth');
    }
    if (taskId === 'reassess') {
      return await runner.runReassessOrganizeNow('rhythm');
    }
    return { status: 'failed', error: `未知任务: ${taskId}` };
  } finally {
    db.close();
  }
}

export function readSchedStatusPayload(opts = {}) {
  return withMemoryDb(
    (db) => {
      const lock = getSchedLockStatus();
      const runningTask = lock.busy ? lock.running?.task || null : null;
      const startedAt = lock.busy ? Number(lock.running?.started_at) || 0 : 0;
      const startedFmt = startedAt > 0 ? formatEpoch(startedAt) : null;
      const yesterday = defaultYesterday();

      const openOrganizes = listOpenOrganizeRuns(db);
      const activeOrganize = openOrganizes[0] || null;
      const activeOrganizeLogTask = activeOrganize?.task || null;
      const organizeBusy = openOrganizes.length > 0;

      const tasks = TASKS.map((t) => {
        const time = db.getConfig(t.timeKey) || '—';
        const closed = getLatestClosedSchedRun(db, t.logTask);
        const closedSummary = closed?.summary ? String(closed.summary).trim() : '';
        const closedAt = formatEpoch(closed?.finished_at);
        const runningHere = Boolean(runningTask && runningTask === lockTaskName(t.id));
        const organizing =
          !runningHere && Boolean(activeOrganizeLogTask && activeOrganizeLogTask === t.logTask);
        const orgStart =
          organizing && activeOrganize?.row
            ? formatEpoch(activeOrganize.row.started_at)
            : null;
        let status = 'idle';
        if (runningHere) status = 'running';
        else if (organizing) status = 'organizing';
        return {
          id: t.id,
          title: t.title,
          timeKey: t.timeKey,
          time,
          needsDay: Boolean(t.needsDay),
          defaultDay: t.needsDay ? yesterday : null,
          note: t.note,
          status,
          status_zh:
            status === 'running'
              ? '进行中'
              : status === 'organizing'
                ? '整理中'
                : '空闲',
          started_at: runningHere
            ? startedFmt?.ms || null
            : organizing
              ? orgStart?.ms || null
              : null,
          started_at_display: runningHere
            ? startedFmt?.display || null
            : organizing
              ? orgStart?.display || null
              : null,
          last_result_at: {
            ...closedAt,
            ms: closedAt.ms,
          },
          last_result: {
            summary: closedSummary || null,
            display: closedSummary || '尚未跑过',
            kind: resultKindFromSummary(closedSummary),
            status_zh: closed
              ? lifecycleStatusZh(
                  closed.status,
                  Number(closed.advances_progress) === 1,
                  closedSummary,
                )
              : null,
          },
        };
      });

      const activeMeta = activeOrganize
        ? TASKS.find((t) => t.logTask === activeOrganize.task)
        : null;

      const tickOn = getPluginTickActive();

      return {
        ok: true,
        dbPath: db.dbPath,
        defaultDay: yesterday,
        plugin_tick: {
          running: tickOn,
          hint: tickOn
            ? '插件内调度随宿主在跑；到点会自动触发'
            : '插件内调度未挂上宿主 tick：到点不会自动触发；手动启动仍可用',
        },
        lock: lock.busy
          ? {
              busy: true,
              task: runningTask,
              pid: lock.running?.pid || null,
              started_at: startedAt || null,
              started_at_display: startedFmt?.display || null,
            }
          : { busy: false },
        organize_busy: organizeBusy
          ? {
              busy: true,
              task: activeMeta?.id || activeOrganize.task,
              title: activeMeta?.title || activeOrganize.task,
              open_count: openOrganizes.length,
            }
          : { busy: false },
        tasks,
      };
    },
    { readonly: true, dbPath: opts.dbPath },
  );
}

export function abandonSchedOrganizePayload(opts = {}) {
  return withMemoryDb(
    (db) => {
      const out = abandonOpenOrganizeRuns(db, '整理会话未收尾，已人工解除');
      return {
        ok: true,
        closed_count: out.closed_count,
        message:
          out.closed_count > 0
            ? `已解除 ${out.closed_count} 条未收尾整理`
            : '当前没有卡住的整理',
      };
    },
    { dbPath: opts.dbPath },
  );
}

/**
 * @param {{ task: string, day_key?: string }} body
 */
export function startSchedTaskPayload(body, opts = {}) {
  const task = String(body?.task || '').trim();
  const meta = TASKS.find((t) => t.id === task);
  if (!meta) return { ok: false, error: `未知任务: ${task || '(空)'}` };

  let day_key = body?.day_key == null ? '' : String(body.day_key).trim();
  if (meta.needsDay) {
    if (!day_key) day_key = defaultYesterday();
    if (!DAY_RE.test(day_key)) {
      return { ok: false, error: 'day_key 须为 YYYY-MM-DD' };
    }
  } else {
    day_key = '';
  }

  const lock = getSchedLockStatus();
  if (lock.busy) {
    return {
      ok: false,
      error: 'busy',
      message: `已有任务在跑：${lock.running?.task || '未知'}`,
      lock: {
        busy: true,
        task: lock.running?.task || null,
        started_at: lock.running?.started_at || null,
      },
    };
  }

  const organizeBlock = withMemoryDb(
    (db) => {
      const openOrganizes = listOpenOrganizeRuns(db);
      if (!openOrganizes.length) return null;
      const active = openOrganizes[0];
      const activeMeta = TASKS.find((t) => t.logTask === active.task);
      const title = activeMeta?.title || active.task;
      return {
        ok: false,
        error: 'busy',
        message: `已有整理未收尾：${title}（须等已完成后再启其它任务）`,
        organize_busy: {
          busy: true,
          task: activeMeta?.id || active.task,
          title,
          open_count: openOrganizes.length,
        },
      };
    },
    { readonly: true, dbPath: opts.dbPath },
  );
  if (organizeBlock) return organizeBlock;

  setImmediate(() => {
    executeTask(task, { day_key: day_key || undefined, dbPath: opts.dbPath }).catch((err) => {
      const msg = String(err?.message || err);
      console.error('[dsh-companion][sched] background run failed', task, err);
      try {
        writeTaskFailureResult(task, msg, { dbPath: opts.dbPath });
      } catch (e) {
        console.error('[dsh-companion][sched] write failure result failed', e);
      }
    });
  });

  return {
    ok: true,
    accepted: true,
    task,
    day_key: meta.needsDay ? day_key : null,
    message: '已接受，正在启动',
  };
}

function dayBoundMs(dayKey, edge) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  if (edge === 'start') return new Date(y, mo - 1, d, 0, 0, 0, 0).getTime();
  return new Date(y, mo - 1, d, 23, 59, 59, 999).getTime();
}

/** query: task, from?, to?, page?, pageSize? */
export function readSchedRunsPayload(query = {}, opts = {}) {
  const rawTask = String(query.task || 'digest').trim() || 'digest';
  const meta = TASKS.find((t) => t.id === rawTask || t.logTask === rawTask);
  if (!meta) return { ok: false, error: `未知任务: ${rawTask}` };

  const fromDay = String(query.from || '').trim();
  const toDay = String(query.to || '').trim();
  if (fromDay && !DAY_RE.test(fromDay)) {
    return { ok: false, error: 'from 须为 YYYY-MM-DD' };
  }
  if (toDay && !DAY_RE.test(toDay)) {
    return { ok: false, error: 'to 须为 YYYY-MM-DD' };
  }
  if (fromDay && toDay && fromDay > toDay) {
    return { ok: false, error: '开始日期不能晚于结束日期' };
  }

  const from_ms = fromDay ? dayBoundMs(fromDay, 'start') : null;
  const to_ms = toDay ? dayBoundMs(toDay, 'end') : null;
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 10;

  return withMemoryDb(
    (db) => {
      const packed = listSchedRunsPage(db, meta.logTask, {
        page,
        pageSize,
        from_ms,
        to_ms,
      });
      return {
        ok: true,
        task: meta.id,
        logTask: meta.logTask,
        title: meta.title,
        from: fromDay || '',
        to: toDay || '',
        page: packed.page,
        pageSize: packed.pageSize,
        total: packed.total,
        pages: packed.pages,
        filters: TASKS.map((t) => ({
          id: t.id,
          title: t.title,
          needsDay: Boolean(t.needsDay),
        })),
        rows: packed.rows.map((row) => {
          const fin = formatEpoch(row.finished_at);
          const start = formatEpoch(row.started_at);
          const advances = Number(row.advances_progress) === 1;
          const status_zh = lifecycleStatusZh(row.status, advances, row.summary);
          const rowMeta =
            TASKS.find((t) => t.logTask === row.task || t.id === row.task) || meta;
          return {
            id: row.id,
            task_id: rowMeta.id,
            task_title: rowMeta.title,
            status: row.status,
            status_zh,
            summary: row.summary,
            kind: resultKindFromSummary(row.summary),
            day_key: row.day_key,
            advances_progress: advances,
            started_at: start.ms,
            started_at_display: start.display,
            finished_at: fin.ms,
            finished_at_display: fin.display,
          };
        }),
      };
    },
    { readonly: true, dbPath: opts.dbPath },
  );
}

export { TASKS as SETTINGS_SCHED_TASKS };
