/** 注册控制台侧专用 dc_*（步 8B）。共用工具沿用私聊册 shared 注册。 */

import {
  handleDigestComplete,
  handleNearDigestWrite,
  handleNearDigestsList,
  handleNearFragmentsList,
  handlePromoteComplete,
  handlePromoteRemember,
  handleReassessCandidatesList,
  handleReassessComplete,
  handleReassessPlan,
} from './handlers-console.js';
import { jsonOutput, withBooklet } from './tool-util.js';

/**
 * @param {*} ctx
 * @param {{ defineTool: Function }} deps
 * @returns {Array<() => void>}
 */
export function registerConsoleTools(ctx, deps) {
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
  const consoleOnly = (handler) => withBooklet('console', handler);

  reg(
    defineTool({
      name: 'dc_near_fragments_list',
      description:
        '整理·某日片段列表，并附带按片段合并作 query 的装配文本。有片段才宜写日摘。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          peer_id: { type: 'string' },
          day_key: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['peer_id', 'day_key'],
      },
      output: jsonOutput(),
      execute: consoleOnly(handleNearFragmentsList),
    }),
  );

  reg(
    defineTool({
      name: 'dc_near_digest_write',
      description:
        '整理·写/覆盖当日小结；无片段则 skipped，不建空行。中途写不推进跑表。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          peer_id: { type: 'string' },
          day_key: { type: 'string' },
          content: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['peer_id', 'day_key', 'content'],
      },
      output: jsonOutput(),
      execute: consoleOnly(handleNearDigestWrite),
    }),
  );

  reg(
    defineTool({
      name: 'dc_digest_complete',
      description:
        '整理·日摘收尾：就地改写「整理中」跑表为已完成并推进。无开档不插行。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          day_key: { type: 'string' },
          summary: { type: 'string' },
        },
      },
      output: jsonOutput(),
      execute: consoleOnly(handleDigestComplete),
    }),
  );

  reg(
    defineTool({
      name: 'dc_near_digests_list',
      description: '整理·晋升窗内日摘列表，每条附带装配文本。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          as_of_day: { type: 'string' },
          peer_id: { type: 'string' },
          lookback_days: { type: 'number' },
        },
        required: ['as_of_day'],
      },
      output: jsonOutput(),
      execute: consoleOnly(handleNearDigestsList),
    }),
  );

  reg(
    defineTool({
      name: 'dc_promote_remember',
      description:
        '整理·晋升记入新长期。私聊勿用本工具代替片段追加。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          peer_id: { type: 'string' },
          content: { type: 'string' },
          kind: { type: 'string' },
          weight: { type: 'number' },
          source: { type: 'string' },
          event_at: { type: 'number' },
        },
        required: ['peer_id', 'content', 'kind', 'weight'],
      },
      output: jsonOutput(),
      execute: consoleOnly(handlePromoteRemember),
    }),
  );

  reg(
    defineTool({
      name: 'dc_promote_complete',
      description: '整理·晋升收尾跑表。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          day_key: { type: 'string' },
          summary: { type: 'string' },
        },
      },
      output: jsonOutput(),
      execute: consoleOnly(handlePromoteComplete),
    }),
  );

  reg(
    defineTool({
      name: 'dc_reassess_plan',
      description: '整理·只读：增长/节奏是否 due 与目标 peer 摘要。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          trigger: { type: 'string', description: 'growth|rhythm|manual' },
          now: { type: 'number' },
        },
      },
      output: jsonOutput(),
      execute: consoleOnly(handleReassessPlan),
    }),
  );

  reg(
    defineTool({
      name: 'dc_reassess_candidates_list',
      description: '整理·冷却候选列表，每条附带装配文本。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          peer_id: { type: 'string' },
          now: { type: 'number' },
          limit: { type: 'number' },
        },
        required: ['peer_id'],
      },
      output: jsonOutput(),
      execute: consoleOnly(handleReassessCandidatesList),
    }),
  );

  reg(
    defineTool({
      name: 'dc_reassess_complete',
      description: '整理·再评估收尾；kind 仅 growth|rhythm。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string' },
          now: { type: 'number' },
        },
        required: ['kind'],
      },
      output: jsonOutput(),
      execute: consoleOnly(handleReassessComplete),
    }),
  );

  return offs;
}
