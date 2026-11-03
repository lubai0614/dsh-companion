/**
 * 私聊侧工具 handler（细节稿 §七）：一套实现；platform 近端固定 qq。
 * 对模型返回 JSON；失败 ok:false + error，禁止空 catch 当成功。
 */

import { SOURCE_LABEL_ZH, SOURCES, KINDS } from '../defaults.js';
import { assembleContext } from '../inject.js';
import { addNearFragment } from '../near.js';
import { listCurrentByPeer } from '../resolve.js';
import { memorySearch } from '../search.js';
import { withMemoryDb, withMemoryDbAsync } from '../settings/open-db.js';
import { adjustWeight } from '../weight.js';
import { correctWithEmbed } from '../write-embed.js';
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
  };
}

export function handleNearFragmentAdd(args) {
  try {
    const peer_id = assertPeer(args?.peer_id);
    const content = String(args?.content ?? '').trim();
    if (!content) return fail('content 不能为空');
    const source =
      args?.source == null || !String(args.source).trim()
        ? 'role_diary'
        : String(args.source).trim();
    if (!SOURCES.includes(source)) return fail(`非法 source: ${source}`);

    const row = withMemoryDb((db) =>
      addNearFragment(db, {
        platform: 'qq',
        peer_id,
        content,
        source,
        day_key: args?.day_key,
      }),
    );
    return ok({
      fragment: {
        id: row.id,
        peer_id: row.peer_id,
        day_key: row.day_key,
        source: row.source,
        source_zh: SOURCE_LABEL_ZH[row.source] || row.source,
        content: row.content,
      },
    });
  } catch (err) {
    return fail(err?.message || err);
  }
}

export async function handleCorrect(args) {
  try {
    const peer_id = assertPeer(args?.peer_id);
    const content = String(args?.content ?? '').trim();
    const supersedes = String(args?.supersedes ?? '').trim();
    const change_note = String(args?.change_note ?? '').trim();
    const kind = String(args?.kind ?? '').trim();
    const weight = Number(args?.weight);
    if (!content) return fail('content 不能为空');
    if (!supersedes) return fail('supersedes 不能为空');
    if (!change_note) return fail('change_note 不能为空');
    if (!KINDS.includes(kind)) return fail(`kind 须为 ${KINDS.join('|')}`);
    if (!Number.isFinite(weight)) return fail('weight 须为数字');

    const result = await withMemoryDbAsync((db) =>
      correctWithEmbed(db, {
        platform: 'qq',
        peer_id,
        content,
        kind,
        weight,
        source: 'user_correction',
        supersedes,
        change_note,
        event_at: args?.event_at,
        demote_to: args?.demote_to,
      }),
    );
    return ok({
      entry: summarizeEntry(result.entry),
      demoted: summarizeEntry(result.demoted),
    });
  } catch (err) {
    return fail(err?.message || err);
  }
}

export function handleListCurrent(args) {
  try {
    const peer_id = assertPeer(args?.peer_id);
    const limit = args?.limit == null ? 20 : Number(args.limit);
    const rows = withMemoryDb((db) =>
      listCurrentByPeer(db, 'qq', peer_id, {
        limit: Number.isFinite(limit) ? limit : 20,
      }),
    );
    return ok({ entries: rows.map(summarizeEntry) });
  } catch (err) {
    return fail(err?.message || err);
  }
}

export async function handleMemorySearch(args) {
  try {
    const peer_id = assertPeer(args?.peer_id);
    const query = String(args?.query ?? '').trim();
    if (!query) return fail('query 不能为空');
    const search = await withMemoryDbAsync((db) =>
      memorySearch(db, { platform: 'qq', peer_id, query }),
    );
    return ok({
      results: (search.results || []).map((r) => ({
        ...summarizeEntry(r.entry),
        score: r.score ?? null,
        via: r.via,
      })),
    });
  } catch (err) {
    return fail(err?.message || err);
  }
}

export async function handleAssembleContext(args) {
  try {
    const peer_id = assertPeer(args?.peer_id);
    const query = args?.query == null ? '' : String(args.query);
    const mode = args?.mode === 'mention' ? 'mention' : 'chat';
    const live_context =
      args?.live_context == null || !String(args.live_context).trim()
        ? undefined
        : String(args.live_context);

    const out = await withMemoryDbAsync((db) =>
      assembleContext(db, {
        platform: 'qq',
        peer_id,
        query,
        live_context,
        mode,
        include_constraints: true,
      }),
    );
    return ok({
      text: out.text,
      trace: out.trace,
      query: query.trim() ? query.trim() : null,
    });
  } catch (err) {
    return fail(err?.message || err);
  }
}

export function handleAdjustWeight(args) {
  try {
    const peer_id = assertPeer(args?.peer_id);
    const id = String(args?.id ?? '').trim();
    const weight = Number(args?.weight);
    if (!id) return fail('id 不能为空');
    if (!Number.isFinite(weight)) return fail('weight 须为数字');

    const tip = withMemoryDb((db) =>
      adjustWeight(db, {
        id,
        weight,
        platform: 'qq',
        peer_id,
      }),
    );

    return ok({
      entry: summarizeEntry(tip.entry),
      is_current_tip: Boolean(tip.adjusted_is_tip),
      tip_hint: tip.adjusted_is_tip
        ? '已调权；是否仍为当前说法：是'
        : '已调权；是否仍为当前说法：否（该条已被后继取代，仅权重变更）',
    });
  } catch (err) {
    return fail(err?.message || err);
  }
}
