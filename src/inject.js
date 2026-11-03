/** 本轮装配（04 · 细节稿 §四）：短约束 → 当场 → 近因 → 长期常驻/相关。 */

import { SHORT_CONSTRAINTS_TEXT } from './short-constraints.js';
import {
  dayKeysInLookback,
  getNearDigest,
  listNearFragmentsByPeerDay,
  listRecentNearDigestsByPeer,
  listRecentNearFragmentsByPeer,
  localDayKey,
} from './near.js';
import { listCurrentByPeer } from './resolve.js';
import { memorySearch } from './search.js';
import { saveLastAssembleTrace } from './trace-store.js';

function takeByChars(items, maxChars, getText) {
  const out = [];
  let used = 0;
  for (const it of items) {
    const t = getText(it);
    const len = t.length;
    if (out.length > 0 && used + len > maxChars) {
      break;
    }
    out.push(it);
    used += len;
  }
  return { items: out, chars: used };
}

/**
 * 今天偏片段；隔天偏日摘（无日摘回落片段）。
 * @param {import('./db.js').MemoryDb} db
 */
export function selectNearForInject(db, platform, peer_id, opts = {}) {
  const today = opts.as_of_day ? String(opts.as_of_day).trim() : localDayKey();
  const fragDays = opts.fragment_days ?? db.getConfigNumber('inject_near_fragment_days') ?? 1;
  const digDays = opts.digest_days ?? db.getConfigNumber('inject_near_digest_days') ?? 2;
  const fragFallbackMax =
    opts.fragment_fallback_max ?? db.getConfigNumber('inject_near_fragment_fallback_max') ?? 5;
  const digFallbackMax =
    opts.digest_fallback_max ?? db.getConfigNumber('inject_near_digest_fallback_max') ?? 2;

  /** @type {object[]} */
  const selected = [];
  /** @type {object[]} */
  const rejected = [];

  const fragKeys = new Set(dayKeysInLookback(today, fragDays));
  let todayFragmentCount = 0;
  for (const dk of fragKeys) {
    const frags = listNearFragmentsByPeerDay(db, platform, peer_id, dk);
    for (const f of frags) {
      if (dk === today) todayFragmentCount += 1;
      selected.push({
        layer: 'near_fragment',
        id: f.id,
        day_key: f.day_key,
        content: f.content,
        source: f.source,
        reason: dk === today ? 'today_fragments' : 'fragment_window',
      });
    }
  }

  if (todayFragmentCount === 0 && fragFallbackMax > 0) {
    const have = new Set(selected.filter((x) => x.layer === 'near_fragment').map((x) => x.id));
    for (const f of listRecentNearFragmentsByPeer(db, platform, peer_id, fragFallbackMax)) {
      if (have.has(f.id)) continue;
      selected.push({
        layer: 'near_fragment',
        id: f.id,
        day_key: f.day_key,
        content: f.content,
        source: f.source,
        reason: 'fragment_recent_fallback',
      });
      have.add(f.id);
    }
  }

  let digestInWindow = 0;
  for (const dk of dayKeysInLookback(today, digDays)) {
    if (dk === today) continue;
    const dig = getNearDigest(db, platform, peer_id, dk);
    if (dig) {
      digestInWindow += 1;
      selected.push({
        layer: 'near_digest',
        id: dig.id,
        day_key: dig.day_key,
        content: dig.content,
        source: dig.source,
        reason: 'prior_day_digest',
      });
    } else {
      const frags = listNearFragmentsByPeerDay(db, platform, peer_id, dk);
      if (frags.length === 0) {
        rejected.push({ day_key: dk, reason: 'no_digest_no_fragments' });
        continue;
      }
      for (const f of frags) {
        if (fragKeys.has(dk)) {
          rejected.push({ id: f.id, reason: 'already_in_fragment_window' });
          continue;
        }
        selected.push({
          layer: 'near_fragment',
          id: f.id,
          day_key: f.day_key,
          content: f.content,
          source: f.source,
          reason: 'digest_fallback_fragments',
        });
      }
    }
  }

  if (digestInWindow === 0 && digFallbackMax > 0) {
    const have = new Set(selected.filter((x) => x.layer === 'near_digest').map((x) => x.id));
    for (const dig of listRecentNearDigestsByPeer(db, platform, peer_id, digFallbackMax)) {
      if (have.has(dig.id)) continue;
      selected.push({
        layer: 'near_digest',
        id: dig.id,
        day_key: dig.day_key,
        content: dig.content,
        source: dig.source,
        reason: 'digest_recent_fallback',
      });
      have.add(dig.id);
    }
  }

  return { selected, rejected };
}

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {object} input
 * @param {string} input.platform
 * @param {string} input.peer_id
 * @param {string} [input.query]
 * @param {'chat'|'mention'} [input.mode]
 * @param {string} [input.live_context]
 * @param {boolean} [input.include_constraints=true]
 */
export async function assembleContext(db, input) {
  const platform = String(input.platform || '').trim();
  const peer_id = String(input.peer_id || '').trim();
  if (!platform || !peer_id) throw new Error('platform and peer_id required');

  const mode = input.mode === 'mention' ? 'mention' : 'chat';
  const query = input.query == null ? '' : String(input.query).trim();
  const maxEntries = db.getConfigNumber('inject_max_entries') ?? 4;
  const maxChars = db.getConfigNumber('inject_max_chars') ?? 1200;
  const relMin = db.getConfigNumber('inject_relevance_min_score') ?? 0.35;
  const resMinW = db.getConfigNumber('inject_resident_min_weight') ?? 800;
  const resMax = db.getConfigNumber('inject_resident_max_entries') ?? 6;

  const live =
    input.live_context == null || !String(input.live_context).trim()
      ? null
      : {
          layer: 'live',
          content: String(input.live_context).trim(),
          reason: 'channel_runtime',
        };

  const near = selectNearForInject(db, platform, peer_id);

  /** @type {Map<string, object>} */
  const ltmById = new Map();
  /** @type {object[]} */
  const ltmRejected = [];

  const tips = listCurrentByPeer(db, platform, peer_id, { limit: 500 });
  // 常驻不进 model_inferred（02 / 细节稿 §四）
  const residents = tips
    .filter((e) => e.source !== 'model_inferred' && Number(e.weight) >= resMinW)
    .sort((a, b) => b.weight - a.weight || b.created_at - a.created_at)
    .slice(0, resMax);

  for (const e of residents) {
    ltmById.set(e.id, {
      layer: 'ltm',
      id: e.id,
      content: e.content,
      kind: e.kind,
      source: e.source,
      weight: e.weight,
      score: null,
      via: ['resident'],
      reason: 'resident_high_weight',
    });
  }

  if (query) {
    const search = await memorySearch(db, { platform, peer_id, query });
    for (const r of search.results) {
      const e = r.entry;
      const score = r.score == null ? (r.via.includes('keyword') ? 0.6 : 0) : Number(r.score);
      if (mode === 'chat' && score < relMin && !r.via.includes('keyword')) {
        if (!ltmById.has(e.id)) {
          ltmRejected.push({
            id: e.id,
            reason: 'below_relevance',
            score,
          });
        }
        continue;
      }
      if (
        mode === 'chat' &&
        score < relMin &&
        Number(e.weight) < resMinW &&
        !r.via.includes('keyword')
      ) {
        ltmRejected.push({ id: e.id, reason: 'weak_and_low_weight', score, weight: e.weight });
        continue;
      }

      const prev = ltmById.get(e.id);
      if (prev) {
        prev.via = [...new Set([...(prev.via || []), ...r.via])];
        prev.score = Math.max(prev.score ?? 0, score);
        prev.reason = `${prev.reason}+search`;
      } else {
        ltmById.set(e.id, {
          layer: 'ltm',
          id: e.id,
          content: e.content,
          kind: e.kind,
          source: e.source,
          weight: e.weight,
          score,
          via: [...r.via],
          reason: mode === 'mention' ? 'user_mention_search' : 'chat_search',
        });
      }
    }
  }

  let ltmList = [...ltmById.values()];
  ltmList.sort((a, b) => {
    const sa = a.score == null ? (a.via?.includes('resident') ? 0.5 : 0) : a.score;
    const sb = b.score == null ? (b.via?.includes('resident') ? 0.5 : 0) : b.score;
    if (sb !== sa) return sb - sa;
    return b.weight - a.weight;
  });

  const residentIds = new Set(residents.map((e) => e.id));
  const residentKept = ltmList.filter((x) => residentIds.has(x.id));
  const ordinaryAll = ltmList.filter((x) => !residentIds.has(x.id));
  if (ordinaryAll.length > maxEntries) {
    for (const drop of ordinaryAll.slice(maxEntries)) {
      ltmRejected.push({ id: drop.id, reason: 'over_max_entries' });
    }
  }
  const ordinaryKept = ordinaryAll.slice(0, maxEntries);
  ltmList = [...residentKept, ...ordinaryKept];
  ltmList.sort((a, b) => {
    const sa = a.score == null ? (a.via?.includes('resident') ? 0.5 : 0) : a.score;
    const sb = b.score == null ? (b.via?.includes('resident') ? 0.5 : 0) : b.score;
    if (sb !== sa) return sb - sa;
    return b.weight - a.weight;
  });

  const ltmCapped = takeByChars(ltmList, maxChars, (x) => x.content);
  for (const drop of ltmList.slice(ltmCapped.items.length)) {
    ltmRejected.push({ id: drop.id, reason: 'over_max_chars' });
    console.warn('[dsh-companion][assemble] drop ltm over_max_chars', {
      id: drop.id,
      weight: drop.weight ?? null,
      score: drop.score ?? null,
      chars: String(drop.content || '').length,
      max_chars: maxChars,
      kept_chars: ltmCapped.chars,
      peer_id,
      platform,
    });
  }

  const constraints =
    input.include_constraints === false
      ? null
      : { layer: 'constraints', content: SHORT_CONSTRAINTS_TEXT, reason: 'always' };

  const blocks = [];
  if (constraints) blocks.push(constraints);
  if (live) blocks.push(live);
  blocks.push(...near.selected);
  blocks.push(...ltmCapped.items);

  const trace = {
    platform,
    peer_id,
    mode,
    query: query || null,
    included: blocks.map((b) => ({
      layer: b.layer,
      id: b.id || null,
      reason: b.reason,
      score: b.score ?? null,
      weight: b.weight ?? null,
    })),
    rejected: {
      near: near.rejected,
      ltm: ltmRejected,
    },
    quotas: {
      inject_max_entries: maxEntries,
      inject_max_chars: maxChars,
      inject_relevance_min_score: relMin,
      chars_ltm: ltmCapped.chars,
    },
    at: Date.now(),
  };

  try {
    saveLastAssembleTrace(trace);
  } catch (err) {
    console.warn('[dsh-companion][assemble] save last trace failed', {
      reason: String(err?.message ?? err),
    });
  }

  return {
    blocks,
    trace,
    text: formatAssembleText(blocks),
  };
}

export function formatAssembleText(blocks) {
  const lines = [];
  for (const b of blocks) {
    if (b.layer === 'constraints') {
      lines.push(b.content);
      continue;
    }
    if (b.layer === 'live') {
      lines.push(`【眼下】\n${b.content}`);
      continue;
    }
    if (b.layer === 'near_fragment') {
      lines.push(`【近日记下 · ${b.day_key}】\n${b.content}`);
      continue;
    }
    if (b.layer === 'near_digest') {
      lines.push(`【那天小结 · ${b.day_key}】\n${b.content}`);
      continue;
    }
    if (b.layer === 'ltm') {
      lines.push(`【还记得】\n${b.content}`);
      continue;
    }
    lines.push(String(b.content || ''));
  }
  return lines.join('\n\n');
}
