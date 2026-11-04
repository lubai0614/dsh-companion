/**
 * 宿主进程内调度 tick + 接线真叫醒（步 8B）。
 * 会话控制器在叫醒时再取：apply 瞬间 fiber 可能尚未 active。
 */

import { openMemoryDb } from '../db.js';
import { resolveDefaultDbPath, resolveConsoleCwd } from '../paths.js';
import { createSchedRunner } from '../sched/runner.js';
import {
  runDigestConsoleWake,
  runPromoteConsoleWake,
  runReassessConsoleWake,
} from '../sched/console-wake.js';
import { installWakeHooks } from '../sched/wake-hooks.js';
import { setPluginTickActive } from '../settings/api-sched.js';

const TICK_MS = 30_000;

/**
 * @param {*} ctx
 * @param {string} name
 * @param {string} method
 * @returns {*}
 */
function resolveCtxService(ctx, name, method) {
  if (!ctx) return null;
  if (ctx[name] && typeof ctx[name][method] === 'function') {
    return ctx[name];
  }
  if (typeof ctx.get !== 'function') return null;
  // 非严格：服务已注册但 fiber 尚未完全 active 时也可取到
  let svc = ctx.get(name, false);
  if (!svc || typeof svc[method] !== 'function') {
    svc = ctx.get(name);
  }
  if (svc && typeof svc[method] === 'function') return svc;
  return null;
}

/**
 * @param {*} ctx
 * @returns {*}
 */
export function resolveSessionController(ctx) {
  return resolveCtxService(ctx, 'sessionController', 'create');
}

/**
 * @param {*} ctx
 * @returns {*}
 */
export function resolveWorkspaceController(ctx) {
  return resolveCtxService(ctx, 'workspaceController', 'create');
}

/**
 * @param {*} ctx
 * @returns {*}
 */
export function resolvePermissionPresets(ctx) {
  return resolveCtxService(ctx, 'permissionPresets', 'set');
}

/**
 * @param {*} ctx
 * @returns {{ get?: function } | null}
 */
export function resolveSessions(ctx) {
  if (!ctx) return null;
  if (ctx.sessions && typeof ctx.sessions.get === 'function') return ctx.sessions;
  if (typeof ctx.get !== 'function') return null;
  let svc = ctx.get('sessions', false);
  if (!svc || typeof svc.get !== 'function') {
    svc = ctx.get('sessions');
  }
  if (svc && typeof svc.get === 'function') return svc;
  return null;
}

/**
 * 叫醒所需宿主面；缺任一则返回 error 文案。
 * @param {*} ctx
 * @returns {{ ok: true, sessionController: *, workspaceController: *, permissionPresets: *, sessions: * } | { ok: false, error: string }}
 */
export function resolveConsoleWakeDeps(ctx) {
  const sessionController = resolveSessionController(ctx);
  if (!sessionController) {
    return { ok: false, error: '宿主会话服务未就绪，未能叫醒' };
  }
  const workspaceController = resolveWorkspaceController(ctx);
  if (!workspaceController) {
    return { ok: false, error: '宿主工作区服务未就绪，未能叫醒' };
  }
  const permissionPresets = resolvePermissionPresets(ctx);
  if (!permissionPresets) {
    return { ok: false, error: '宿主权限服务未就绪，未能叫醒' };
  }
  const sessions = resolveSessions(ctx);
  if (!sessions) {
    return { ok: false, error: '宿主会话表未就绪，未能设权限' };
  }
  return {
    ok: true,
    sessionController,
    workspaceController,
    permissionPresets,
    sessions,
  };
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
      const deps = resolveConsoleWakeDeps(ctx);
      if (!deps.ok) {
        return {
          status: 'skipped_no_hook',
          woken: false,
          error: deps.error,
        };
      }
      const db = openMemoryDb({ dbPath: resolveDefaultDbPath() });
      try {
        return await runDigestConsoleWake(db, {
          day_key,
          sessionController: deps.sessionController,
          workspaceController: deps.workspaceController,
          permissionPresets: deps.permissionPresets,
          sessions: deps.sessions,
          cwd: resolveConsoleCwd(),
        });
      } finally {
        db.close();
      }
    },
    async wakePromote({ as_of_day }) {
      const deps = resolveConsoleWakeDeps(ctx);
      if (!deps.ok) {
        return {
          status: 'skipped_no_hook',
          woken: false,
          error: deps.error,
        };
      }
      const db = openMemoryDb({ dbPath: resolveDefaultDbPath() });
      try {
        return await runPromoteConsoleWake(db, {
          as_of_day,
          sessionController: deps.sessionController,
          workspaceController: deps.workspaceController,
          permissionPresets: deps.permissionPresets,
          sessions: deps.sessions,
          cwd: resolveConsoleCwd(),
        });
      } finally {
        db.close();
      }
    },
    async wakeReassess({ trigger, now }) {
      const deps = resolveConsoleWakeDeps(ctx);
      if (!deps.ok) {
        return {
          status: 'skipped_no_hook',
          woken: false,
          error: deps.error,
        };
      }
      const db = openMemoryDb({ dbPath: resolveDefaultDbPath() });
      try {
        return await runReassessConsoleWake(db, {
          trigger,
          now,
          sessionController: deps.sessionController,
          workspaceController: deps.workspaceController,
          permissionPresets: deps.permissionPresets,
          sessions: deps.sessions,
          cwd: resolveConsoleCwd(),
        });
      } finally {
        db.close();
      }
    },
  };

  installWakeHooks(hooks);

  const early = resolveConsoleWakeDeps(ctx);
  if (!early.ok) {
    logWarn(
      `[dsh-companion] 此刻叫醒依赖未齐（${early.error}）；将在每次叫醒时重试（勿当作永久失败）`,
    );
  } else {
    logInfo('[dsh-companion] 叫醒依赖已可见（会话 / 工作区 / 权限）');
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
