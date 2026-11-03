/**
 * 整理侧工具 handler（细节稿 §七）：日摘 / 晋升 / 再评估批与收尾。
 */

import { SOURCE_LABEL_ZH, SOURCES, KINDS } from '../defaults.js';
import { assembleContext } from '../inject.js';
import {
  listDigestJobsForDay,
  listDigestsForPromote,
  listNearFragmentsByPeerDay,
  getNearDigest,
  writeNearDigestIfFragments,
} from '../near.js';
import { promoteRemember } from '../promote.js';
import {
  listReassessCandidates,
  markReassessComplete,
  planScheduledReassess,
} from '../reassess.js';
import { resolveCurrent } from '../resolve.js';
import { completeOrganizeRun } from '../sched/run-log.js';
import { withMemoryDb, withMemoryDbAsync } from '../settings/open-db.js';
import { normalizeQqPeerId } from './peer.js';

function ok(data) {
  return { ok: true, ...data };
}

function fail(message) {
  return { ok: false, error: String(message || 'unknown error') };
}

function assertPeer(peer_id) {
  const id = normalizeQqPeerId(peer_id);
  if (!id) {
    throw new Error('peer_id 须为私聊对方 QQ 号（5～12 位数字）；近端暂不支持群桶');
  }
  return id;
}

function summarizeEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    platform: row.platform,
    peer_id: row.peer_id,
    kind: row.kind,
    source: row.source,
    source_zh: SOURCE_LABEL_ZH[row.source] || row.source,
    weight: row.weight,
    content: row.content,
    supersedes: row.supersedes,
    change_note: row.change_note,
    event_at: row.event_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    weight_updated_at: row.weight_updated_at,
  };
}

function summarizeDigest(row) {
  if (!row) return null;
  return {
    id: row.id,
    platform: row.platform,
    peer_id: row.peer_id,
    day_key: row.day_key,
    source: row.source,
    source_zh: SOURCE_LABEL_ZH[row.source] || row.source,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function packAssemble(db, { peer_id, query, live_context }) {
  const out = await assembleContext(db, {
    platform: 'qq',
    peer_id,
    query: query || '',
    live_context,
    mode: 'chat',
    include_constraints: true,
  });
  return { assemble_text: out.text, assemble_trace: out.trace };
}

/** 某日片段 + 附带装配（query=片段合并）。 */
export async function handleNearFragmentsList(args) {
  try {
    const peer_id = assertPeer(args?.peer_id);
    const day_key = String(args?.day_key ?? '').trim();
    if (!day_key) return fail('day_key 不能为空');

    const packed = await withMemoryDbAsync(async (db) => {
      const fragments = listNearFragmentsByPeerDay(db, 'qq', peer_id, day_key);
      const existing = getNearDigest(db, 'qq', peer_id, day_key);
      const merged = fragments.map((f) => f.content).filter(Boolean).join('\n');
      const assemble = await packAssemble(db, {
        peer_id,
        query: merged,
        live_context: merged,
      });
      return {
        peer_id,
        day_key,
        fragment_count: fragments.length,
        fragments: fragments.map((f) => ({
          id: f.id,
          content: f.content,
          source: f.source,
          source_zh: SOURCE_LABEL_ZH[f.source] || f.source,
          day_key: f.day_key,
          created_at: f.created_at,
        })),
        existing_digest: summarizeDigest(existing),
        ...assemble,
      };
    });
    return ok(packed);
  } catch (err) {
    return fail(err?.message || err);
  }
}

/** 有片段才写日摘。 */
export function handleNearDigestWrite(args) {
  try {
    const peer_id = assertPeer(args?.peer_id);
    const day_key = String(args?.day_key ?? '').trim();
    const content = String(args?.content ?? '').trim();
    if (!day_key) return fail('day_key 不能为空');
    if (!content) return fail('content 不能为空');
    const source =
      args?.source == null || !String(args.source).trim()
        ? 'role_diary'
        : String(args.source).trim();
    if (!SOURCES.includes(source)) return fail(`非法 source: ${source}`);

    const out = withMemoryDb((db) =>
      writeNearDigestIfFragments(db, {
        platform: 'qq',
        peer_id,
        day_key,
        content,
        source,
      }),
    );
    if (out.skipped) {
      return ok({
        skipped: true,
        reason: out.reason,
        peer_id,
        day_key,
      });
    }
    return ok({ skipped: false, digest: summarizeDigest(out.digest) });
  } catch (err) {
    return fail(err?.message || err);
  }
}

export function handleDigestComplete(args = {}) {
  try {
    const day_key =
      args?.day_key == null || !String(args.day_key).trim()
        ? undefined
        : String(args.day_key).trim();
    const summary =
      args?.summary == null || !String(args.summary).trim()
        ? undefined
        : String(args.summary).trim();
    const row = withMemoryDb((db) =>
      completeOrganizeRun(db, 'digest', { day_key, summary }),
    );
    return ok({
      updated: Boolean(row?.updated),
      skipped: Boolean(row?.skipped),
      reason: row?.reason,
      task: 'digest',
      day_key: row?.day_key ?? day_key ?? null,
    });
  } catch (err) {
    return fail(err?.message || err);
  }
}

/** 晋升窗日摘 + 附带装配。 */
export async function handleNearDigestsList(args) {
  try {
    const as_of_day = String(args?.as_of_day ?? '').trim();
    if (!as_of_day) return fail('as_of_day 不能为空');
    const peer_id =
      args?.peer_id == null || !String(args.peer_id).trim()
        ? undefined
        : assertPeer(args.peer_id);
    const lookback_days =
      args?.lookback_days == null ? undefined : Number(args.lookback_days);

    const packed = await withMemoryDbAsync(async (db) => {
      const rows = listDigestsForPromote(db, {
        as_of_day,
        lookback_days,
        platform: 'qq',
        peer_id,
      });
      const digests = [];
      for (const row of rows) {
        const assemble = await packAssemble(db, {
          peer_id: row.peer_id,
          query: row.content,
          live_context: row.content,
        });
        digests.push({ ...summarizeDigest(row), ...assemble });
      }
      return {
        as_of_day,
        peer_id: peer_id || null,
        digest_count: digests.length,
        digests,
      };
    });
    return ok(packed);
  } catch (err) {
    return fail(err?.message || err);
  }
}

export async function handlePromoteRemember(args) {
  try {
    const peer_id = assertPeer(args?.peer_id);
    const content = String(args?.content ?? '').trim();
    const kind = String(args?.kind ?? '').trim();
    const weight = Number(args?.weight);
    if (!content) return fail('content 不能为空');
    if (!KINDS.includes(kind)) return fail(`kind 须为 ${KINDS.join('|')}`);
    if (!Number.isFinite(weight)) return fail('weight 须为数字');
    const source =
      args?.source == null || !String(args.source).trim()
        ? 'role_diary'
        : String(args.source).trim();
    if (!SOURCES.includes(source)) return fail(`非法 source: ${source}`);

    const out = await withMemoryDbAsync(async (db) => {
      const result = await promoteRemember(db, {
        platform: 'qq',
        peer_id,
        content,
        kind,
        weight,
        source,
        event_at: args?.event_at == null ? null : Number(args.event_at),
      });
      return {
        entry: summarizeEntry(result.entry),
        tip: summarizeEntry(resolveCurrent(db, result.entry.id)),
      };
    });
    return ok(out);
  } catch (err) {
    return fail(err?.message || err);
  }
}

export function handlePromoteComplete(args = {}) {
  try {
    const day_key =
      args?.day_key == null || !String(args.day_key).trim()
        ? undefined
        : String(args.day_key).trim();
    const summary =
      args?.summary == null || !String(args.summary).trim()
        ? undefined
        : String(args.summary).trim();
    const row = withMemoryDb((db) =>
      completeOrganizeRun(db, 'promote', { day_key, summary }),
    );
    return ok({
      updated: Boolean(row?.updated),
      skipped: Boolean(row?.skipped),
      reason: row?.reason,
      task: 'promote',
      day_key: row?.day_key ?? day_key ?? null,
    });
  } catch (err) {
    return fail(err?.message || err);
  }
}

export function handleReassessPlan(args = {}) {
  try {
    const trigger = String(args?.trigger || 'manual').trim() || 'manual';
    if (!['growth', 'rhythm', 'manual'].includes(trigger)) {
      return fail('trigger 须为 growth|rhythm|manual');
    }
    const plan = withMemoryDb((db) =>
      planScheduledReassess(db, {
        trigger,
        now: args?.now == null ? undefined : Number(args.now),
      }),
    );
    return ok({
      skipped: plan.skipped,
      reason: plan.reason,
      trigger: plan.trigger,
      task_reason: plan.task_reason,
      want_rhythm: plan.want_rhythm,
      want_growth: plan.want_growth,
      rhythm_due: plan.rhythm_due,
      growth_peer_count: plan.growth_peer_count,
      peers: (plan.peers || []).map((p) => ({
        platform: p.platform,
        peer_id: p.peer_id,
        candidate_count: p.candidate_count,
      })),
    });
  } catch (err) {
    return fail(err?.message || err);
  }
}

export async function handleReassessCandidatesList(args) {
  try {
    const peer_id = assertPeer(args?.peer_id);
    const packed = await withMemoryDbAsync(async (db) => {
      const rows = listReassessCandidates(db, {
        platform: 'qq',
        peer_id,
        now: args?.now == null ? undefined : Number(args.now),
        limit: args?.limit == null ? undefined : Number(args.limit),
      });
      const candidates = [];
      for (const row of rows) {
        const assemble = await packAssemble(db, {
          peer_id,
          query: row.content,
          live_context: row.content,
        });
        candidates.push({ ...summarizeEntry(row), ...assemble });
      }
      return { peer_id, candidate_count: candidates.length, candidates };
    });
    return ok(packed);
  } catch (err) {
    return fail(err?.message || err);
  }
}

export function handleReassessComplete(args = {}) {
  try {
    const kind = String(args?.kind || '').trim();
    const out = withMemoryDb((db) =>
      markReassessComplete(db, kind, args?.now == null ? undefined : Number(args.now)),
    );
    return ok(out);
  } catch (err) {
    return fail(err?.message || err);
  }
}

/** 日摘作业枚举（叫醒侧 / 冒烟用）。 */
export function handleListDigestJobs(day_key) {
  return withMemoryDb((db) => listDigestJobsForDay(db, day_key));
}
