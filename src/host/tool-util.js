/** 工具注册共用：JSON 输出 + 分册守卫。 */

import { resolveOrganizeCwd } from '../paths.js';
import { assertBooklet } from './session-kind.js';

export function jsonOutput() {
  return {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

/**
 * @param {'chat'|'organize'|'shared'} booklet
 * @param {(args: object, exec?: object) => any} handler
 */
export function withBooklet(booklet, handler) {
  return async (args, exec) => {
    try {
      assertBooklet(booklet, exec, resolveOrganizeCwd());
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
    return handler(args, exec);
  };
}
