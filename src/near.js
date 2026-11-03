/** 近因：片段只追加；日摘同行键可覆盖（保留 id）；无片段不建日摘。 */

import crypto from 'node:crypto';
import { SOURCES } from './defaults.js';

function assertNonEmptyString(name, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

/** 本机本地日历日 YYYY-MM-DD */
export function localDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDayKey(day_key) {
  assertNonEmptyString('day_key', day_key);
  if (!DAY_KEY_RE.test(day_key.trim())) {
    throw new Error('day_key must be YYYY-MM-DD');
  }
  return day_key.trim();
}

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {object} input
 */
export function addNearFragment(db, input) {
  assertNonEmptyString('platform', input.platform);
  assertNonEmptyString('peer_id', input.peer_id);
  assertNonEmptyString('content', input.content);

  const source =
    input.source == null || !String(input.source).trim()
      ? 'role_diary'
      : String(input.source).trim();
  if (!SOURCES.includes(source)) {
    throw new Error(`invalid source: ${source}`);
  }

  const day_key =
    input.day_key == null || !String(input.day_key).trim()
      ? localDayKey()
      : assertDayKey(input.day_key);

  const id = input.id && String(input.id).trim() ? String(input.id).trim() : crypto.randomUUID();
  const t = Date.now();
  const platform = String(input.platform).trim();
  const peer_id = String(input.peer_id).trim();
  const content = String(input.content).trim();
  if (!content) throw new Error('content must be a non-empty string');

  db.db
    .prepare(
      `
    INSERT INTO near_fragment (id, platform, peer_id, content, source, day_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(id, platform, peer_id, content, source, day_key, t);

  return getNearFragment(db, id);
}

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {string} id
 */
export function getNearFragment(db, id) {
  assertNonEmptyString('id', id);
  return db.db.prepare('SELECT * FROM near_fragment WHERE id = ?').get(id) || null;
}

/**
 * @param {import('./db.js').MemoryDb} db
 */
export function listNearFragmentsByPeerDay(db, platform, peer_id, day_key) {
  assertNonEmptyString('platform', platform);
  assertNonEmptyString('peer_id', peer_id);
  const dk = assertDayKey(day_key);
  return db.db
    .prepare(
      `
    SELECT * FROM near_fragment
    WHERE platform = ? AND peer_id = ? AND day_key = ?
    ORDER BY created_at ASC
  `,
    )
    .all(platform.trim(), peer_id.trim(), dk);
}

/**
 * 该 peer 最近 N 条片段（新→旧）；装配空窗回落用。
 * @param {import('./db.js').MemoryDb} db
 * @param {number} limit
 */
export function listRecentNearFragmentsByPeer(db, platform, peer_id, limit) {
  assertNonEmptyString('platform', platform);
  assertNonEmptyString('peer_id', peer_id);
  const n = Math.max(0, Math.floor(Number(limit) || 0));
  if (n < 1) return [];
  return db.db
    .prepare(
      `
    SELECT * FROM near_fragment
    WHERE platform = ? AND peer_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `,
    )
    .all(platform.trim(), peer_id.trim(), n);
}

/**
 * @param {import('./db.js').MemoryDb} db
 */
export function countNearFragmentsByPeerDay(db, platform, peer_id, day_key) {
  assertNonEmptyString('platform', platform);
  assertNonEmptyString('peer_id', peer_id);
  const dk = assertDayKey(day_key);
  const row = db.db
    .prepare(
      `
    SELECT COUNT(*) AS n FROM near_fragment
    WHERE platform = ? AND peer_id = ? AND day_key = ?
  `,
    )
    .get(platform.trim(), peer_id.trim(), dk);
  return Number(row?.n ?? 0);
}

/**
 * @param {import('./db.js').MemoryDb} db
 */
export function getNearDigest(db, platform, peer_id, day_key) {
  assertNonEmptyString('platform', platform);
  assertNonEmptyString('peer_id', peer_id);
  const dk = assertDayKey(day_key);
  return (
    db.db
      .prepare(
        `
    SELECT * FROM near_digest
    WHERE platform = ? AND peer_id = ? AND day_key = ?
  `,
      )
      .get(platform.trim(), peer_id.trim(), dk) || null
  );
}

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {number} limit
 */
export function listRecentNearDigestsByPeer(db, platform, peer_id, limit) {
  assertNonEmptyString('platform', platform);
  assertNonEmptyString('peer_id', peer_id);
  const n = Math.max(0, Math.floor(Number(limit) || 0));
  if (n < 1) return [];
  return db.db
    .prepare(
      `
    SELECT * FROM near_digest
    WHERE platform = ? AND peer_id = ?
    ORDER BY day_key DESC, created_at DESC
    LIMIT ?
  `,
    )
    .all(platform.trim(), peer_id.trim(), n);
}

/**
 * 覆盖写日摘：同行键已有则保留 id。
 * @param {import('./db.js').MemoryDb} db
 * @param {object} input
 */
export function upsertNearDigest(db, input) {
  assertNonEmptyString('platform', input.platform);
  assertNonEmptyString('peer_id', input.peer_id);
  assertNonEmptyString('content', input.content);
  const day_key = assertDayKey(input.day_key);

  const source =
    input.source == null || !String(input.source).trim()
      ? 'role_diary'
      : String(input.source).trim();
  if (!SOURCES.includes(source)) {
    throw new Error(`invalid source: ${source}`);
  }

  const platform = String(input.platform).trim();
  const peer_id = String(input.peer_id).trim();
  const content = String(input.content).trim();
  if (!content) throw new Error('content must be a non-empty string');

  const t = Date.now();
  const existing = getNearDigest(db, platform, peer_id, day_key);

  if (existing) {
    db.db
      .prepare(
        `
      UPDATE near_digest
      SET content = ?, source = ?, updated_at = ?
      WHERE id = ?
    `,
      )
      .run(content, source, t, existing.id);
    return getNearDigest(db, platform, peer_id, day_key);
  }

  const id = input.id && String(input.id).trim() ? String(input.id).trim() : crypto.randomUUID();
  db.db
    .prepare(
      `
    INSERT INTO near_digest (
      id, platform, peer_id, day_key, content, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(id, platform, peer_id, day_key, content, source, t, t);

  return getNearDigest(db, platform, peer_id, day_key);
}

/**
 * 有片段才写日摘；无片段 → skipped: no_fragments，不建空行。
 * @param {import('./db.js').MemoryDb} db
 * @param {object} input
 */
export function writeNearDigestIfFragments(db, input) {
  const platform = String(input.platform).trim();
  const peer_id = String(input.peer_id).trim();
  const day_key = assertDayKey(input.day_key);
  const n = countNearFragmentsByPeerDay(db, platform, peer_id, day_key);
  if (n === 0) {
    return { skipped: true, reason: 'no_fragments' };
  }
  const digest = upsertNearDigest(db, input);
  return { skipped: false, digest };
}

/**
 * @param {string} day_key
 * @param {number} delta
 */
export function shiftDayKey(day_key, delta) {
  const dk = assertDayKey(day_key);
  const [y, m, d] = dk.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Number(delta));
  return localDayKey(dt);
}

/**
 * lookbackDays=1 → 仅 asOfDay；=2 → [asOf-1, asOf]。
 * @param {string} asOfDay
 * @param {number} lookbackDays
 */
export function dayKeysInLookback(asOfDay, lookbackDays) {
  const asOf = assertDayKey(asOfDay);
  const n = Number(lookbackDays);
  if (!Number.isInteger(n) || n < 1 || n > 366) {
    throw new Error('lookbackDays must be integer 1..366');
  }
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    keys.push(shiftDayKey(asOf, -i));
  }
  return keys;
}

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {string} day_key
 */
export function listPeersWithFragmentsOnDay(db, day_key) {
  const dk = assertDayKey(day_key);
  return db.db
    .prepare(
      `
    SELECT platform, peer_id, COUNT(*) AS fragment_count
    FROM near_fragment
    WHERE day_key = ?
    GROUP BY platform, peer_id
    ORDER BY platform, peer_id
  `,
    )
    .all(dk)
    .map((r) => ({
      platform: r.platform,
      peer_id: r.peer_id,
      fragment_count: Number(r.fragment_count),
    }));
}

/**
 * 日摘批原料：有片段的桶 + 当日片段 + 已有日摘。
 * @param {import('./db.js').MemoryDb} db
 * @param {string} day_key
 */
export function listDigestJobsForDay(db, day_key) {
  const dk = assertDayKey(day_key);
  return listPeersWithFragmentsOnDay(db, dk).map((peer) => ({
    ...peer,
    day_key: dk,
    fragments: listNearFragmentsByPeerDay(db, peer.platform, peer.peer_id, dk),
    existing_digest: getNearDigest(db, peer.platform, peer.peer_id, dk),
  }));
}

/**
 * 晋升取材：窗内日摘（无日摘不进列表）。
 * @param {import('./db.js').MemoryDb} db
 * @param {object} [opts]
 */
export function listDigestsForPromote(db, opts = {}) {
  const asOf =
    opts.as_of_day == null || !String(opts.as_of_day).trim()
      ? localDayKey()
      : assertDayKey(opts.as_of_day);
  const lookback =
    opts.lookback_days != null
      ? Number(opts.lookback_days)
      : db.getConfigNumber('near_promote_lookback_days') ?? 1;
  const keys = dayKeysInLookback(asOf, lookback);
  const placeholders = keys.map(() => '?').join(', ');
  const params = [...keys];
  let sql = `
    SELECT * FROM near_digest
    WHERE day_key IN (${placeholders})
  `;
  if (opts.platform != null && String(opts.platform).trim()) {
    sql += ' AND platform = ?';
    params.push(String(opts.platform).trim());
  }
  if (opts.peer_id != null && String(opts.peer_id).trim()) {
    sql += ' AND peer_id = ?';
    params.push(String(opts.peer_id).trim());
  }
  sql += ' ORDER BY day_key ASC, platform ASC, peer_id ASC';
  return db.db.prepare(sql).all(...params);
}
