/**
 * 每轮自动装配：agent/pre-step → assembleContext → 带来源标注的 UserMessage。
 * 私聊：解析 QQ peer；控制台：从任务文案取 peer_id，否则只注入短约束。
 */

import { assembleContext } from '../inject.js';
import { SHORT_CONSTRAINTS_TEXT } from '../short-constraints.js';
import { withMemoryDbAsync } from '../settings/open-db.js';
import { resolveConsoleCwd } from '../paths.js';
import { resolveChatPeerBucket } from './peer.js';
import { INJECT_SOURCE_KIND, extractUserQuery } from './query.js';
import { isConsoleSession } from './session-kind.js';

/**
 * @param {string} text
 * @returns {{ platform: string, peer_id: string }|null}
 */
function peerFromConsolePrompt(text) {
  const m = String(text || '').match(/peer_id\s*=\s*([^\s）\],，；;]+)/i);
  if (!m) return null;
  const peer_id = String(m[1] || '').trim();
  if (!peer_id) return null;
  return { platform: 'qq', peer_id };
}

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

      const incoming = Array.isArray(messages) ? messages : [];
      const decided = Array.isArray(decision.messages) ? decision.messages : [];
      const query = extractUserQuery([...incoming, ...decided]);
      if (!query) return decision;

      const sess = agent?.session;
      const consoleSession = isConsoleSession(sess, resolveConsoleCwd());
      let bucket = resolveChatPeerBucket(agent);
      if (!bucket && consoleSession) {
        bucket = peerFromConsolePrompt(query);
      }

      if (!bucket) {
        if (consoleSession) {
          // 控制台无 peer 时仍注入短约束，保证同一个人底板
          const injected = createUserMessage({
            content: [{ type: 'text', text: SHORT_CONSTRAINTS_TEXT }],
            source: {
              kind: INJECT_SOURCE_KIND,
              form: 'snapshot',
              sections: [{ name: INJECT_SOURCE_KIND, text: SHORT_CONSTRAINTS_TEXT }],
            },
          });
          return { ...decision, messages: [...decided, injected] };
        }
        if (sess && warnedNoPeer && !warnedNoPeer.has(sess)) {
          warnedNoPeer.add(sess);
          const m =
            '[dsh-companion] 本会话未能解析对方 QQ（peer），跳过自动装配；可用 dc_assemble_context 并显式传 peer_id';
          if (logger?.warn) logger.warn(m);
          else console.warn(m);
        }
        return decision;
      }

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
