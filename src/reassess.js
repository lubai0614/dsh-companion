/**
 * 增长 / 节奏 due 与候选（02 · 细节稿 §5.5）：只改权规划；禁止合并推进。
 */

import { localDayKey } from './near.js';
import { listCurrentByPeer } from './resolve.js';
import {
  completeSchedRun,
  getLatestProgressAt,
  getLatestSchedRun,
  isOpenSchedRun,
} from './sched/run-log.js';

const DAY_MS = 86_400_000;

function assertPeer(platform, peer_id) {
  if (typeof platform !== 'string' || !platform.trim()) {
    throw new Error('platform must be a non-empty string');
  }
  if (typeof peer_id !== 'string' || !peer_id.trim()) {
    throw new Error('peer_id must be a non-empty string');
  }
}

/** 自然日差（b - a），按 YYYY-MM-DD。 */
export function naturalDaysBetween(dayA, dayB) {
  const pa = String(dayA).split('-').map(Number);
  const pb = String(dayB).split('-').map(Number);
  const t1 = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const t2 = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((t2 - t1) / DAY_MS);
}

/**
 * @param {import('./db.js').MemoryDb} db
 */
export function listPeersWithEntries(db) {
  return db.db
    .prepare(
      `
    SELECT DISTINCT platform, peer_id FROM memory_entry
    ORDER BY platform, peer_id
  `,
    )
    .all();
}

/**
 * 链尖且过冷却的候选。
 * @param {import('./db.js').MemoryDb} db
 */
export function listReassessCandidates(db, opts) {
  assertPeer(opts.platform, opts.peer_id);
  const now = opts.now == null ? Date.now() : Number(opts.now);
  const cooldownDays = db.getConfigNumber('ltm_reassess_cooldown_days') ?? 7;
  const maxRun = db.getConfigNumber('ltm_reassess_max_entries_per_run') ?? 50;
  const limit = opts.limit == null ? maxRun : Math.min(Number(opts.limit), maxRun);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('limit must be positive integer');
  }

  const cutoff = now - cooldownDays * DAY_MS;
  const tips = listCurrentByPeer(db, opts.platform, opts.peer_id, { limit: 5000 });
  const cooled = tips.filter((e) => Number(e.weight_updated_at) <= cutoff);
  cooled.sort(
    (a, b) =>
      Number(a.weight_updated_at) - Number(b.weight_updated_at) ||
      Number(b.weight) - Number(a.weight),
  );
  return cooled.slice(0, limit);
}

/**
 * @param {import('./db.js').MemoryDb} db
 */
export function isRhythmDue(db, now = Date.now()) {
  const interval = db.getConfigNumber('ltm_reassess_interval_days') ?? 3;
  const last = getLatestProgressAt(db, 'rhythm');
  if (!last) return true;
  const gap = naturalDaysBetween(localDayKey(new Date(last)), localDayKey(new Date(now)));
  return gap >= interval;
}

/**
 * @param {import('./db.js').MemoryDb} db
 */
export function isGrowthDue(db, opts) {
  assertPeer(opts.platform, opts.peer_id);
  const now = opts.now == null ? Date.now() : Number(opts.now);
  const windowDays = db.getConfigNumber('ltm_growth_window_days') ?? 7;
  const threshold = db.getConfigNumber('ltm_growth_new_entries_threshold') ?? 100;
  const lastProcessed = getLatestProgressAt(db, 'growth');
  const windowStart = now - windowDays * DAY_MS;
  const since = Math.max(windowStart, lastProcessed);

  const row = db.db
    .prepare(
      `
    SELECT COUNT(*) AS n FROM memory_entry
    WHERE platform = ? AND peer_id = ?
      AND created_at > ?
      AND created_at >= ?
      AND created_at <= ?
  `,
    )
    .get(
      String(opts.platform).trim(),
      String(opts.peer_id).trim(),
      since,
      windowStart,
      now + 1000,
    );

  const n = Number(row?.n ?? 0);
  return {
    due: n >= threshold,
    new_count: n,
    since,
    threshold,
    window_start: windowStart,
  };
}

/**
 * 只读规划：是否 due、目标 peer、各 peer 冷却候选（不调权）。
 * @param {import('./db.js').MemoryDb} db
 */
export function planScheduledReassess(db, opts = {}) {
  const now = opts.now == null ? Date.now() : Number(opts.now);
  const trigger = opts.trigger || 'manual';
  const rhythmDue = isRhythmDue(db, now);
  const peers = opts.peers || listPeersWithEntries(db);

  const growthPeers = [];
  for (const p of peers) {
    const g = isGrowthDue(db, { platform: p.platform, peer_id: p.peer_id, now });
    if (g.due) growthPeers.push({ ...p, growth: g });
  }

  let wantRhythm = false;
  let wantGrowth = false;
  if (trigger === 'growth') {
    wantGrowth = growthPeers.length > 0;
  } else if (trigger === 'rhythm') {
    wantRhythm = rhythmDue;
  } else if (growthPeers.length > 0) {
    wantGrowth = true;
  } else if (rhythmDue) {
    wantRhythm = true;
  }

  if (!wantRhythm && !wantGrowth) {
    return {
      ok: true,
      skipped: true,
      reason: 'not_due',
      trigger,
      now,
      rhythm_due: rhythmDue,
      growth_peer_count: growthPeers.length,
      want_rhythm: false,
      want_growth: false,
      task_reason: null,
      target_peers: [],
      peers: [],
    };
  }

  const reason = wantGrowth ? 'growth' : 'rhythm';
  const targetPeers = wantGrowth
    ? growthPeers.map((p) => ({ platform: p.platform, peer_id: p.peer_id }))
    : peers.map((p) => ({ platform: p.platform, peer_id: p.peer_id }));

  const peerPlans = targetPeers.map((p) => {
    const cands = listReassessCandidates(db, {
      platform: p.platform,
      peer_id: p.peer_id,
      now,
    });
    return {
      platform: p.platform,
      peer_id: p.peer_id,
      candidate_count: cands.length,
      candidates: cands,
    };
  });

  return {
    ok: true,
    skipped: false,
    reason: null,
    trigger,
    now,
    rhythm_due: rhythmDue,
    growth_peer_count: growthPeers.length,
    want_rhythm: wantRhythm,
    want_growth: wantGrowth,
    task_reason: reason,
    target_peers: targetPeers,
    peers: peerPlans,
  };
}

/**
 * 再评估收尾：kind 仅 growth|rhythm（禁止 merged）。
 * @param {import('./db.js').MemoryDb} db
 * @param {'growth'|'rhythm'} kind
 */
export function markReassessComplete(db, kind, now = Date.now()) {
  const k = String(kind || '').trim();
  if (k !== 'growth' && k !== 'rhythm') {
    throw new Error('kind 仅允许 growth|rhythm（禁止 merged）');
  }
  const at = Number(now);
  const open = isOpenSchedRun(getLatestSchedRun(db, k));
  if (!open) {
    console.warn('[dsh-companion][sched] reassess complete with no open 整理中; will not insert', {
      kind: k,
      at,
    });
    return {
      kind: k,
      advanced_rhythm: false,
      advanced_growth: false,
      at,
      updated: false,
    };
  }
  const row = completeSchedRun(db, k, {
    summary: '已完成：整理回合已完成',
  });
  return {
    kind: k,
    advanced_rhythm: k === 'rhythm' && Boolean(row?.updated),
    advanced_growth: k === 'growth' && Boolean(row?.updated),
    at,
    updated: Boolean(row?.updated),
  };
}
