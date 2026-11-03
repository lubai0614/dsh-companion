/** 晋升记入（03 · 细节稿 §一）：对话纠错优先；已非链尖则跳过不抛；落库后维护向量。 */

import { findSuccessor, resolveCurrent } from './resolve.js';
import { correctWithEmbed, rememberWithEmbed } from './write-embed.js';

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {object} input
 */
export async function promoteRemember(db, input) {
  const entry = await rememberWithEmbed(db, input);
  return { skipped: false, entry };
}

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {object} input
 * @returns {Promise<{ skipped: true, reason: string, current_tip?: string } | { skipped: false, entry: object, demoted: object }>}
 */
export async function promoteCorrect(db, input) {
  const oldId = String(input.supersedes || '').trim();
  if (!oldId) {
    return { skipped: true, reason: 'missing_supersedes' };
  }

  const old = db.getEntry(oldId);
  if (!old) {
    return { skipped: true, reason: 'entry_gone' };
  }

  const platform = String(input.platform).trim();
  const peerId = String(input.peer_id).trim();
  if (old.platform !== platform || old.peer_id !== peerId) {
    return { skipped: true, reason: 'peer_mismatch' };
  }

  const tip = resolveCurrent(db, oldId);
  if (!tip) {
    return { skipped: true, reason: 'entry_gone' };
  }
  if (tip.id !== oldId) {
    return { skipped: true, reason: 'tip_superseded', current_tip: tip.id };
  }

  const succ = findSuccessor(db, oldId);
  if (succ) {
    return { skipped: true, reason: 'tip_superseded', current_tip: succ.id };
  }

  const result = await correctWithEmbed(db, input);
  return { skipped: false, entry: result.entry, demoted: result.demoted };
}
