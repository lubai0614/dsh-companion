/**
 * 宿主进程内调度 tick + 接线真叫醒（步 8B）。
 * 会话控制器在叫醒时再取：apply 瞬间 fiber 可能尚未 active。
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
 * @returns {*}
 */
export function resolveSessionController(ctx) {
  if (!ctx) return null;
  if (ctx.sessionController && typeof ctx.sessionController.create === 'function') {
    return ctx.sessionController;
  }
  if (typeof ctx.get !== 'function') return null;
  // 非严格：服务已注册但 fiber 尚未完全 active 时也可取到
  let svc = ctx.get('sessionController', false);
  if (!svc || typeof svc.create !== 'function') {
    svc = ctx.get('sessionController');
  }
  if (svc && typeof svc.create === 'function') return svc;
  return null;
}

/**
 * @param {*} ctx
 * @returns {Array<() => void>}
 */
export function registerSchedTick(ctx) {
  const logger = ctx?.logger;
  /** @type {Array<() => void>} */
  const disposers = [];

  function logInfo(m) {
    if (logger?.info) logger.info(m);
    else console.info(m);
  }
  function logWarn(m) {
    if (logger?.warn) logger.warn(m);
    else console.warn(m);
  }

  const hooks = {
    async wakeDigest({ day_key }) {
      const sessionController = resolveSessionController(ctx);
      if (!sessionController) {
        return {
          status: 'skipped_no_hook',
          woken: false,
          error: '宿主会话服务未就绪，未能叫醒',
        };
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
      const sessionController = resolveSessionController(ctx);
      if (!sessionController) {
        return {
          status: 'skipped_no_hook',
          woken: false,
          error: '宿主会话服务未就绪，未能叫醒',
        };
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
      const sessionController = resolveSessionController(ctx);
      if (!sessionController) {
        return {
          status: 'skipped_no_hook',
          woken: false,
          error: '宿主会话服务未就绪，未能叫醒',
        };
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

  const early = resolveSessionController(ctx);
  if (!early) {
    logWarn(
      '[dsh-companion] 此刻尚无 sessionController；将在每次叫醒时重试（勿当作永久失败）',
    );
  } else {
    logInfo('[dsh-companion] sessionController 已可见，叫醒可建整理会话');
  }

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
