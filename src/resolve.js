/**
 * supersedes 链（02 · 细节稿 §一）：当前说法 = 链尖；被取代行只作历史。
 */

/**
 * 同桶内直接后继（supersedes = id）。多条异常时取 created_at 最早。
 * @param {import('./db.js').MemoryDb} db
 * @param {string} id
 */
export function findSuccessor(db, id) {
  const row = db.getEntry(id);
  if (!row) return null;
  return (
    db.db
      .prepare(
        `
      SELECT * FROM memory_entry
      WHERE platform = ? AND peer_id = ? AND supersedes = ?
      ORDER BY created_at ASC
      LIMIT 1
    `,
      )
      .get(row.platform, row.peer_id, id) || null
  );
}

/**
 * 沿后继走到链尖。
 * @param {import('./db.js').MemoryDb} db
 * @param {string} id
 * @param {number} [maxHops]
 */
export function resolveCurrent(db, id, maxHops = 64) {
  let cur = db.getEntry(id);
  if (!cur) return null;
  let hops = 0;
  while (hops < maxHops) {
    const next = findSuccessor(db, cur.id);
    if (!next) return cur;
    cur = next;
    hops += 1;
  }
  throw new Error(`supersedes chain too long starting at ${id}`);
}

/**
 * 同桶链尖列表（不被任何行 supersedes 指向）。
 * @param {import('./db.js').MemoryDb} db
 * @param {string} platform
 * @param {string} peer_id
 * @param {object} [opts]
 * @param {number} [opts.limit]
 */
export function listCurrentByPeer(db, platform, peer_id, opts = {}) {
  const limit = opts.limit == null ? 100 : Number(opts.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
    throw new Error('limit must be integer 1..5000');
  }
  return db.db
    .prepare(
      `
    SELECT e.* FROM memory_entry e
    WHERE e.platform = ? AND e.peer_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM memory_entry s
        WHERE s.platform = e.platform
          AND s.peer_id = e.peer_id
          AND s.supersedes = e.id
      )
    ORDER BY e.created_at DESC
    LIMIT ?
  `,
    )
    .all(String(platform).trim(), String(peer_id).trim(), limit);
}
