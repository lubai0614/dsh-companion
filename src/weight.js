/**
 * 只调权（02 · 细节稿 §一）：绝不改正文；不把已取代条变回链尖。
 */

import { resolveCurrent } from './resolve.js';

function assertPeer(platform, peer_id) {
  if (typeof platform !== 'string' || !platform.trim()) {
    throw new Error('platform must be a non-empty string');
  }
  if (typeof peer_id !== 'string' || !peer_id.trim()) {
    throw new Error('peer_id must be a non-empty string');
  }
}

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {object} input
 * @param {string} input.id
 * @param {number} input.weight
 * @param {string} [input.platform] 若给则须与条目同桶
 * @param {string} [input.peer_id]
 */
export function adjustWeight(db, input) {
  const id = String(input.id || '').trim();
  if (!id) throw new Error('id required');

  const existing = db.getEntry(id);
  if (!existing) throw new Error(`entry not found: ${id}`);

  if (input.platform != null || input.peer_id != null) {
    assertPeer(input.platform, input.peer_id);
    if (
      existing.platform !== String(input.platform).trim() ||
      existing.peer_id !== String(input.peer_id).trim()
    ) {
      throw new Error('cannot adjust weight across peer buckets');
    }
  }

  const tip = resolveCurrent(db, id);
  const entry = db.updateWeight(id, input.weight);
  return {
    entry,
    tip_id: tip?.id ?? null,
    adjusted_is_tip: tip?.id === id,
  };
}
