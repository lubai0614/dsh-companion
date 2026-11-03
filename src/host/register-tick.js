/**
 * 宿主进程内调度 tick + 接线真叫醒（步 8B）。
 */

import { openMemoryDb } from '../db.js';
import { resolveDefaultDbPath, resolveOrganizeCwd } from '../paths.js';
import { createSchedRunner } from '../sched/runner.js';
import {
  runDigestOrganizeWake,
  runPromoteOrganizeWake,
  runReassessOrganizeWake,
} from '../sched/organize-wake.js';
import { installWakeHooks } from '../sched/wake-hooks.js';
import { setPluginTickActive } from '../settings/api-sched.js';

const TICK_MS = 30_000;

/**
 * @param {*} ctx
 * @returns {Array<() => void>}
 */
export function registerSchedTick(ctx) {
  const logger = ctx?.logger;
  /** @type {Array<() => void>} */
  const disposers = [];

  const sessionController =
    typeof ctx?.get === 'function' ? ctx.get('sessionController') : ctx?.sessionController;

  function logInfo(m) {
    if (logger?.info) logger.info(m);
    else console.info(m);
  }
  function logWarn(m) {
    if (logger?.warn) logger.warn(m);
    else console.warn(m);
  }

  if (!sessionController || typeof sessionController.create !== 'function') {
    logWarn('[dsh-companion] sessionController 不可用：到点不会真叫醒；手动/假钩子仍可测跑表');
  }

  const hooks = {
    async wakeDigest({ day_key }) {
      if (!sessionController?.create) {
        return { status: 'skipped_no_hook', skipped: true, woken: false };
      }
      const db = openMemoryDb({ dbPath: resolveDefaultDbPath() });
      try {
        return await runDigestOrganizeWake(db, {
          day_key,
          sessionController,
          cwd: resolveOrganizeCwd(),
        });
      } finally {
        db.close();
      }
    },
    async wakePromote({ as_of_day }) {
      if (!sessionController?.create) {
        return { status: 'skipped_no_hook', skipped: true, woken: false };
      }
      const db = openMemoryDb({ dbPath: resolveDefaultDbPath() });
      try {
        return await runPromoteOrganizeWake(db, {
          as_of_day,
          sessionController,
          cwd: resolveOrganizeCwd(),
        });
      } finally {
        db.close();
      }
    },
    async wakeReassess({ trigger, now }) {
      if (!sessionController?.create) {
        return { status: 'skipped_no_hook', skipped: true, woken: false };
      }
      const db = openMemoryDb({ dbPath: resolveDefaultDbPath() });
      try {
        return await runReassessOrganizeWake(db, {
          trigger,
          now,
          sessionController,
          cwd: resolveOrganizeCwd(),
        });
      } finally {
        db.close();
      }
    },
  };

  installWakeHooks(hooks);

  const intervalFn =
    typeof ctx?.interval === 'function'
      ? ctx.interval.bind(ctx)
      : typeof ctx?.setInterval === 'function'
        ? ctx.setInterval.bind(ctx)
        : null;

  if (!intervalFn) {
    logWarn('[dsh-companion] 无 ctx.interval：插件 tick 未挂上');
    setPluginTickActive(false);
    return disposers;
  }

  const off = intervalFn(() => {
    const db = openMemoryDb({ dbPath: resolveDefaultDbPath() });
    try {
      const runner = createSchedRunner(db, hooks);
      Promise.resolve(runner.tick(new Date())).catch((err) => {
        logWarn(`[dsh-companion][sched] tick failed: ${err?.message || err}`);
      });
    } catch (err) {
      logWarn(`[dsh-companion][sched] tick open failed: ${err?.message || err}`);
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }, TICK_MS);

  if (typeof off === 'function') disposers.push(off);
  setPluginTickActive(true);
  logInfo(`[dsh-companion] 已挂调度 tick（每 ${TICK_MS / 1000}s）`);
  disposers.push(() => {
    setPluginTickActive(false);
    installWakeHooks(null);
  });
  return disposers;
}
