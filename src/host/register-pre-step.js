/**
 * 相处每轮自动装配：agent/pre-step → assembleContext → 带来源标注的 UserMessage。
 * 对齐宿主 time-context：先 next()，再追加；仅 turn 的 step===1。
 */

import { assembleContext } from '../inject.js';
import { withMemoryDbAsync } from '../settings/open-db.js';
import { resolveChatPeerBucket } from './peer.js';
import { INJECT_SOURCE_KIND, extractUserQuery } from './query.js';

/**
 * @param {*} ctx
 * @param {{ createUserMessage: Function, logger?: { info?: Function, warn?: Function } }} deps
 * @returns {() => void}
 */
export function registerPreStepAssemble(ctx, deps) {
  const { createUserMessage, logger } = deps;
  if (typeof ctx?.on !== 'function') {
    throw new Error('ctx.on 不可用，无法挂 agent/pre-step');
  }

  /** @type {WeakSet<object>} */
  const warnedNoPeer = typeof WeakSet === 'function' ? new WeakSet() : null;

  const off = ctx.on(
    'agent/pre-step',
    async ({ agent, messages, turn, step, signal }, next) => {
      const decision = await next();
      if (!decision || decision.kind === 'reject' || signal?.aborted) return decision;
      if (step !== 1) return decision;

      const bucket = resolveChatPeerBucket(agent);
      if (!bucket) {
        const sess = agent?.session;
        if (sess && warnedNoPeer && !warnedNoPeer.has(sess)) {
          warnedNoPeer.add(sess);
          const m =
            '[dsh-companion] 本会话未能解析对方 QQ（peer），跳过自动装配；可用 dc_assemble_context 并显式传 peer_id';
          if (logger?.warn) logger.warn(m);
          else console.warn(m);
        }
        return decision;
      }

      const incoming = Array.isArray(messages) ? messages : [];
      const decided = Array.isArray(decision.messages) ? decision.messages : [];
      const query = extractUserQuery([...incoming, ...decided]);
      if (!query) return decision;

      try {
        const assembled = await withMemoryDbAsync((db) =>
          assembleContext(db, {
            platform: bucket.platform,
            peer_id: bucket.peer_id,
            query,
            live_context: query,
            mode: 'chat',
            include_constraints: true,
          }),
        );
        const text = String(assembled?.text || '').trim();
        if (!text) return decision;

        const injected = createUserMessage({
          content: [{ type: 'text', text }],
          source: {
            kind: INJECT_SOURCE_KIND,
            form: 'snapshot',
            sections: [{ name: INJECT_SOURCE_KIND, text }],
          },
        });

        return {
          ...decision,
          messages: [...decided, injected],
        };
      } catch (err) {
        const m = `[dsh-companion] 自动装配失败：${err?.message || err}`;
        if (logger?.warn) logger.warn(m);
        else console.warn(m);
        return decision;
      }
    },
    { prepend: true },
  );

  return typeof off === 'function' ? off : () => {};
}
