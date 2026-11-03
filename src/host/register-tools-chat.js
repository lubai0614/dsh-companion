/** 注册私聊侧 dc_*（步 8A）；片段追加仅私聊，其余 shared 整理也可用。 */

import {
  handleAdjustWeight,
  handleAssembleContext,
  handleCorrect,
  handleListCurrent,
  handleMemorySearch,
  handleNearFragmentAdd,
} from './handlers-chat.js';
import { jsonOutput, withBooklet } from './tool-util.js';

/**
 * @param {*} ctx
 * @param {{ defineTool: Function }} deps
 * @returns {Array<() => void>}
 */
export function registerChatTools(ctx, deps) {
  const { defineTool } = deps;
  if (!ctx?.tools || typeof ctx.tools.register !== 'function') {
    throw new Error('ctx.tools.register 不可用');
  }

  /** @type {Array<() => void>} */
  const offs = [];
  const reg = (def) => {
    const off = ctx.tools.register(def);
    if (typeof off === 'function') offs.push(off);
  };
  const chatOnly = (handler) => withBooklet('chat', handler);
  const shared = (handler) => withBooklet('shared', handler);

  reg(
    defineTool({
      name: 'dc_near_fragment_add',
      description:
        '写入一条相处浓缩摘记（只追加、不改正文；不是正式长期）。有稳定新事实时宜调用；纯闲聊可不写。source 默认 role_diary。对用户只自然应答，勿讲解摘记/升正式流程。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          peer_id: { type: 'string', description: '私聊对方 QQ 号（uin）' },
          content: { type: 'string', description: '浓缩要点正文' },
          source: {
            type: 'string',
            description: '来源；缺省 role_diary',
          },
          day_key: {
            type: 'string',
            description: '归属自然日 YYYY-MM-DD；缺省本机今日',
          },
        },
        required: ['peer_id', 'content'],
      },
      output: jsonOutput(),
      execute: chatOnly(handleNearFragmentAdd),
    }),
  );

  reg(
    defineTool({
      name: 'dc_correct',
      description:
        '长期纠错：新条取代旧 tip（supersedes）+ 旧条降权；不改旧正文。source 固定 user_correction。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          peer_id: { type: 'string', description: '私聊对方 QQ 号' },
          content: { type: 'string', description: '纠正后的当前表述' },
          kind: { type: 'string', description: 'event 或 fact' },
          weight: { type: 'number', description: '新条重要度' },
          supersedes: { type: 'string', description: '被取代的旧记忆 id（须为链尖）' },
          change_note: { type: 'string', description: '变更情况说明' },
          event_at: { type: 'number' },
          demote_to: { type: 'number', description: '旧条降权目标（可选）' },
        },
        required: ['peer_id', 'content', 'kind', 'weight', 'supersedes', 'change_note'],
      },
      output: jsonOutput(),
      execute: shared(handleCorrect),
    }),
  );

  reg(
    defineTool({
      name: 'dc_list_current',
      description: '列出某私聊对象当前有效记忆（链尖）。用于核对是否已记住。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          peer_id: { type: 'string', description: '私聊对方 QQ 号' },
          limit: { type: 'number', description: '最多条数，默认 20' },
        },
        required: ['peer_id'],
      },
      output: jsonOutput(),
      execute: shared(handleListCurrent),
    }),
  );

  reg(
    defineTool({
      name: 'dc_memory_search',
      description: '混合检索同 peer 链尖（关键词 ∪ 向量）。点名想起或核对用；不自动写入。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          peer_id: { type: 'string', description: '私聊对方 QQ 号' },
          query: { type: 'string', description: '检索要点 / 问句' },
        },
        required: ['peer_id', 'query'],
      },
      output: jsonOutput(),
      execute: shared(handleMemorySearch),
    }),
  );

  reg(
    defineTool({
      name: 'dc_assemble_context',
      description:
        '显式装配本轮可见材料：短约束 + 可选当场 + 近因 + 长期。返回 text 与 trace。装配≠落库。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          peer_id: { type: 'string', description: '私聊对方 QQ 号' },
          query: {
            type: 'string',
            description: '长期相关检索种子；空则只带常驻+近因+当场',
          },
          mode: {
            type: 'string',
            description: 'chat=闲聊注入；mention=用户点名旧事',
          },
          live_context: {
            type: 'string',
            description: '当场材料；不落库',
          },
        },
        required: ['peer_id'],
      },
      output: jsonOutput(),
      execute: shared(handleAssembleContext),
    }),
  );

  reg(
    defineTool({
      name: 'dc_adjust_weight',
      description: '只改 weight，绝不改正文。peer_id 须与条目同一人。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          peer_id: { type: 'string', description: '私聊对方 QQ 号' },
          id: { type: 'string', description: '记忆条目 id' },
          weight: { type: 'number', description: '新权重' },
        },
        required: ['peer_id', 'id', 'weight'],
      },
      output: jsonOutput(),
      execute: shared(handleAdjustWeight),
    }),
  );

  return offs;
}
