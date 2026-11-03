/** 正式记入 / 纠错（02 · 细节稿 §一）。无改正文接口。 */

import { resolveCurrent } from './resolve.js';

function assertPeerBucket(platform, peer_id) {
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
 */
export function remember(db, input) {
  assertPeerBucket(input.platform, input.peer_id);

  if (input.source === 'user_correction') {
    throw new Error('use correct() for user_correction');
  }
  if (input.supersedes != null && String(input.supersedes).trim()) {
    throw new Error('regular remember must not set supersedes; use correct()');
  }
  if (input.change_note != null && String(input.change_note).trim()) {
    throw new Error('regular remember must not set change_note; use correct()');
  }

  return db.addEntry({
    ...input,
    supersedes: null,
    change_note: null,
  });
}

/**
 * 新条取代链尖，旧条只降权；同事务。
 * @param {import('./db.js').MemoryDb} db
 * @param {object} input
 */
export function correct(db, input) {
  assertPeerBucket(input.platform, input.peer_id);

  if (!input.supersedes || !String(input.supersedes).trim()) {
    throw new Error('correct requires supersedes');
  }
  if (!input.change_note || !String(input.change_note).trim()) {
    throw new Error('correct requires change_note');
  }

  const oldId = String(input.supersedes).trim();
  const platform = String(input.platform).trim();
  const peerId = String(input.peer_id).trim();

  return db.runInTransaction(() => {
    const old = db.getEntry(oldId);
    if (!old) throw new Error(`entry not found: ${oldId}`);
    if (old.platform !== platform || old.peer_id !== peerId) {
      throw new Error('cannot correct across peer buckets');
    }

    const tip = resolveCurrent(db, oldId);
    if (!tip) throw new Error(`entry not found: ${oldId}`);
    if (tip.id !== oldId) {
      throw new Error(
        `supersedes must be current tip (${tip.id}); refused mid-chain id ${oldId}`,
      );
    }

    const fadeMax = db.getConfigNumber('ltm_fade_weight_max') ?? 49;
    const weightMin = db.getConfigNumber('ltm_weight_min') ?? 1;
    let demoteTo;
    if (input.demote_to == null) {
      demoteTo = Math.min(old.weight, fadeMax);
      if (demoteTo < weightMin) demoteTo = weightMin;
    } else {
      demoteTo = Number(input.demote_to);
    }

    const entry = db.addEntry({
      id: input.id,
      platform,
      peer_id: peerId,
      content: input.content,
      kind: input.kind,
      source: 'user_correction',
      weight: input.weight,
      event_at: input.event_at == null ? null : input.event_at,
      supersedes: oldId,
      change_note: String(input.change_note),
    });

    const demoted = db.updateWeight(oldId, demoteTo);
    return { entry, demoted };
  });
}
