/** 设置页短事务：开库 → 用完关闭。 */

import { openMemoryDb } from '../db.js';

/**
 * @template T
 * @param {(db: import('../db.js').MemoryDb) => T} fn
 * @param {{ readonly?: boolean, dbPath?: string }} [opts]
 * @returns {T}
 */
export function withMemoryDb(fn, opts = {}) {
  const db = openMemoryDb({
    dbPath: opts.dbPath,
    readonly: Boolean(opts.readonly),
  });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
