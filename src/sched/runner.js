/**
 * 到点 tick：日摘 / 晋升 / 增长 / 节奏。
 * 真叫醒经 hooks.wake*；无钩子则记已跳过（宿主挂点后步补）。
 */

import { localDayKey, shiftDayKey } from '../near.js';
import { isAtScheduledMinute, localHhMmKey, parseHhMm } from './clock.js';
import { withSchedLock } from './lock.js';
import { recordSchedRun } from './record.js';
import { listOpenOrganizeRuns } from './run-log.js';

/**
 * @param {import('../db.js').MemoryDb} db
 * @param {object} [hooks]
 * @param {(ctx: { day_key: string }) => Promise<object>} [hooks.wakeDigest]
 * @param {(ctx: { as_of_day: string }) => Promise<object>} [hooks.wakePromote]
 * @param {(ctx: { trigger: string, now?: number }) => Promise<object>} [hooks.wakeReassess]
 */
export function createSchedRunner(db, hooks = {}) {
  /** @type {Map<string, string>} */
  const lastFired = new Map();

  function configTime(key, fallback) {
    const v = db.getConfig(key);
    return v && String(v).trim() ? String(v).trim() : fallback;
  }

  function markKey(taskId, now) {
    const day = localDayKey(now);
    return `${taskId}|${day}|${localHhMmKey(now)}`;
  }

  function shouldFire(taskId, hhmm, now) {
    if (!isAtScheduledMinute(hhmm, now)) return false;
    const k = markKey(taskId, now);
    if (lastFired.get(taskId) === k) return false;
    lastFired.set(taskId, k);
    return true;
  }

  function yesterdayKey(now = new Date()) {
    return shiftDayKey(localDayKey(now), -1);
  }

  function rejectIfOrganizeOpen() {
    const open = listOpenOrganizeRuns(db);
    if (!open.length) return null;
    return {
      status: 'busy',
      woken: false,
      error: 'organize_open',
      running: { task: open[0].task },
      open_count: open.length,
    };
  }

  async function runDigestWake(day_key) {
    const blocked = rejectIfOrganizeOpen();
    if (blocked) {
      recordSchedRun(db, { task: 'digest', out: blocked, day_key, started_at: Date.now() });
      return blocked;
    }
    const started_at = Date.now();
    const out = await withSchedLock('digest', async () => {
      if (typeof hooks.wakeDigest === 'function') {
        return hooks.wakeDigest({ day_key });
      }
      return {
        status: 'skipped_no_hook',
        woken: false,
        error: '未接线叫醒钩子',
      };
    });
    if (out?.status === 'busy') {
      recordSchedRun(db, { task: 'digest', out, day_key, started_at });
      return out;
    }
    recordSchedRun(db, { task: 'digest', out, day_key, started_at });
    return out;
  }

  async function runPromoteWake(as_of_day) {
    const blocked = rejectIfOrganizeOpen();
    if (blocked) {
      recordSchedRun(db, {
        task: 'promote',
        out: blocked,
        day_key: as_of_day,
        started_at: Date.now(),
      });
      return blocked;
    }
    const started_at = Date.now();
    const out = await withSchedLock('promote', async () => {
      if (typeof hooks.wakePromote === 'function') {
        return hooks.wakePromote({ as_of_day });
      }
      return {
        status: 'skipped_no_hook',
        woken: false,
        error: '未接线叫醒钩子',
      };
    });
    if (out?.status === 'busy') {
      recordSchedRun(db, { task: 'promote', out, day_key: as_of_day, started_at });
      return out;
    }
    recordSchedRun(db, { task: 'promote', out, day_key: as_of_day, started_at });
    return out;
  }

  async function runReassessWake(trigger, nowMs) {
    const taskId = trigger === 'growth' ? 'growth' : 'rhythm';
    const blocked = rejectIfOrganizeOpen();
    if (blocked) {
      recordSchedRun(db, { task: taskId, out: blocked, started_at: Date.now() });
      return blocked;
    }
    const started_at = Date.now();
    const out = await withSchedLock(taskId, async () => {
      if (typeof hooks.wakeReassess === 'function') {
        return hooks.wakeReassess({ trigger, now: nowMs });
      }
      return {
        status: 'skipped_no_hook',
        woken: false,
        error: '未接线叫醒钩子',
      };
    });
    if (out?.status === 'busy') {
      recordSchedRun(db, { task: taskId, out, started_at });
      return out;
    }
    recordSchedRun(db, { task: taskId, out, started_at });
    return out;
  }

  function eventStatus(out) {
    if (out.status === 'busy') return 'busy';
    if (out.status === 'skipped_not_due' || out.skipped) return 'skipped_not_due';
    if (out.status === 'no_jobs' || (out.job_count != null && Number(out.job_count) === 0)) {
      return 'empty';
    }
    if (out.digest_count != null && Number(out.digest_count) === 0) return 'empty';
    if (out.woken === false && out.ok === false) return 'failed';
    if (out.woken) return 'woken';
    return 'ran';
  }

  async function tick(now = new Date()) {
    const digestAt = configTime('near_digest_time', '18:00');
    const promoteAt = configTime('near_promote_time', '19:30');
    const growthAt = configTime('ltm_growth_check_time', '21:30');
    const rhythmAt = configTime('ltm_reassess_check_time', '22:30');
    parseHhMm(digestAt);
    parseHhMm(promoteAt);
    parseHhMm(growthAt);
    parseHhMm(rhythmAt);

    /** @type {object[]} */
    const events = [];
    const nowMs = now.getTime();

    if (shouldFire('digest', digestAt, now)) {
      try {
        const day_key = yesterdayKey(now);
        const out = await runDigestWake(day_key);
        events.push({ task: 'digest', status: eventStatus(out), at: localHhMmKey(now), ...out });
      } catch (err) {
        events.push({
          task: 'digest',
          status: 'failed',
          at: localHhMmKey(now),
          error: String(err?.message || err),
        });
      }
    }

    if (shouldFire('promote', promoteAt, now)) {
      try {
        const as_of_day = yesterdayKey(now);
        const out = await runPromoteWake(as_of_day);
        events.push({
          task: 'promote',
          status: eventStatus(out),
          at: localHhMmKey(now),
          ...out,
        });
      } catch (err) {
        events.push({
          task: 'promote',
          status: 'failed',
          at: localHhMmKey(now),
          error: String(err?.message || err),
        });
      }
    }

    if (shouldFire('growth', growthAt, now)) {
      try {
        const out = await runReassessWake('growth', nowMs);
        events.push({ task: 'growth', status: eventStatus(out), at: localHhMmKey(now), ...out });
      } catch (err) {
        events.push({
          task: 'growth',
          status: 'failed',
          at: localHhMmKey(now),
          error: String(err?.message || err),
        });
      }
    }

    if (shouldFire('rhythm', rhythmAt, now)) {
      try {
        const out = await runReassessWake('rhythm', nowMs);
        events.push({ task: 'rhythm', status: eventStatus(out), at: localHhMmKey(now), ...out });
      } catch (err) {
        events.push({
          task: 'rhythm',
          status: 'failed',
          at: localHhMmKey(now),
          error: String(err?.message || err),
        });
      }
    }

    return { at: localHhMmKey(now), events };
  }

  return {
    tick,
    yesterdayKey,
    runDigestWake,
    runPromoteWake,
    runReassessWake,
    runDigestOrganizeNow: (day_key) => runDigestWake(day_key || yesterdayKey()),
    runPromoteOrganizeNow: (as_of_day) =>
      runPromoteWake(as_of_day || yesterdayKey()),
    runReassessOrganizeNow: (trigger = 'growth', nowMs) =>
      runReassessWake(trigger === 'rhythm' ? 'rhythm' : 'growth', nowMs),
  };
}
