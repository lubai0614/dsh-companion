/** 步 8：私聊 pre-step + dc_*；整理分册 + tick（8B）。 */

import { loadHostDeps } from './deps.js';
import { registerPreStepAssemble } from './register-pre-step.js';
import { registerChatTools } from './register-tools-chat.js';
import { registerOrganizeTools } from './register-tools-organize.js';
import { registerSchedTick } from './register-tick.js';

export { loadHostDeps } from './deps.js';
export { resolveChatPeerBucket, normalizeQqPeerId } from './peer.js';
export { extractUserQuery, INJECT_SOURCE_KIND } from './query.js';
export * from './handlers-chat.js';
export * from './handlers-organize.js';
export {
  markOrganizeSession,
  clearOrganizeSessionsForTests,
  isOrganizeSession,
  assertBooklet,
} from './session-kind.js';
export { resolveSessionController, registerSchedTick } from './register-tick.js';

/**
 * @param {*} ctx
 * @returns {Promise<Array<() => void>>}
 */
export async function registerHostChatSurface(ctx) {
  const deps = await loadHostDeps();
  const logger = ctx?.logger;
  for (const n of deps.notes) {
    if (logger?.info) logger.info(`[dsh-companion][host] ${n}`);
    else console.info(`[dsh-companion][host] ${n}`);
  }

  /** @type {Array<() => void>} */
  const disposers = [];

  try {
    disposers.push(
      registerPreStepAssemble(ctx, {
        createUserMessage: deps.createUserMessage,
        logger,
      }),
    );
    if (logger?.info) logger.info('[dsh-companion] 已挂 agent/pre-step 自动装配');
    else console.info('[dsh-companion] 已挂 agent/pre-step 自动装配');
  } catch (err) {
    const m = `[dsh-companion] pre-step 未挂上：${err?.message || err}`;
    if (logger?.warn) logger.warn(m);
    else console.warn(m);
  }

  try {
    const offs = registerChatTools(ctx, { defineTool: deps.defineTool });
    disposers.push(...offs);
    if (logger?.info) logger.info('[dsh-companion] 已注册私聊工具 dc_*');
    else console.info('[dsh-companion] 已注册私聊工具 dc_*');
  } catch (err) {
    const m = `[dsh-companion] 私聊工具未挂上：${err?.message || err}`;
    if (logger?.warn) logger.warn(m);
    else console.warn(m);
  }

  try {
    const offs = registerOrganizeTools(ctx, { defineTool: deps.defineTool });
    disposers.push(...offs);
    if (logger?.info) logger.info('[dsh-companion] 已注册整理工具 dc_*');
    else console.info('[dsh-companion] 已注册整理工具 dc_*');
  } catch (err) {
    const m = `[dsh-companion] 整理工具未挂上：${err?.message || err}`;
    if (logger?.warn) logger.warn(m);
    else console.warn(m);
  }

  try {
    const offs = registerSchedTick(ctx);
    disposers.push(...offs);
  } catch (err) {
    const m = `[dsh-companion] 调度 tick 未挂上：${err?.message || err}`;
    if (logger?.warn) logger.warn(m);
    else console.warn(m);
  }

  return disposers;
}
