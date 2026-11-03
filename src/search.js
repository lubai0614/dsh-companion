/** 混合检索：同桶链尖上关键词 ∪ 向量，按 id 去重。 */

import { cosineSimilarity, embedText } from './embed.js';
import { loadTipEmbeddings } from './embedding-store.js';
import { listCurrentByPeer } from './resolve.js';

function keywordTokens(query) {
  const t = String(query ?? '').trim();
  if (!t) return [];
  const parts = t.split(/[\s,，。、；;！？!?\n\r]+/).filter(Boolean);
  const out = new Set();
  for (const p of parts) {
    if (p.length >= 2) out.add(p);
  }
  if (!/\s/.test(t) && t.length >= 2 && t.length <= 40) {
    for (let i = 0; i < t.length - 1 && out.size < 24; i++) {
      out.add(t.slice(i, i + 2));
    }
  }
  if (t.length >= 2) out.add(t);
  return [...out];
}

/**
 * @param {object[]} tips
 * @param {string} query
 * @param {number} topK
 */
export function keywordSearchTips(tips, query, topK) {
  const tokens = keywordTokens(query);
  if (!tokens.length || !tips.length) return [];
  const scored = [];
  for (const e of tips) {
    const c = String(e.content ?? '');
    let hits = 0;
    for (const tok of tokens) {
      if (c.includes(tok)) hits += 1;
    }
    if (hits > 0) scored.push({ entry: e, score: hits, via: 'keyword' });
  }
  scored.sort((a, b) => b.score - a.score || b.entry.weight - a.entry.weight);
  return scored.slice(0, topK);
}

/**
 * @param {object[]} tipEmbRows
 * @param {Float32Array} queryVec
 * @param {number} topK
 * @param {number} minScore
 */
export function vectorSearchTips(tipEmbRows, queryVec, topK, minScore) {
  const scored = [];
  for (const row of tipEmbRows) {
    if (row.vector.length !== queryVec.length) continue;
    const score = cosineSimilarity(queryVec, row.vector);
    if (score >= minScore) {
      scored.push({ entry: row.entry, score, via: 'vector' });
    }
  }
  scored.sort((a, b) => b.score - a.score || b.entry.weight - a.entry.weight);
  return scored.slice(0, topK);
}

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {object} input
 * @param {string} input.platform
 * @param {string} input.peer_id
 * @param {string} input.query
 */
export async function memorySearch(db, input) {
  const platform = String(input.platform).trim();
  const peer_id = String(input.peer_id).trim();
  const query = String(input.query ?? '').trim();
  if (!platform || !peer_id) throw new Error('platform and peer_id required');
  if (!query) throw new Error('query required');

  const kwTop = Number(db.getConfig('ltm_keyword_top_k') ?? 20);
  const vecTop = Number(db.getConfig('ltm_embed_top_k') ?? 10);
  const minScore = Number(db.getConfig('ltm_embed_min_score') ?? 0.55);
  const modelId = db.getConfig('ltm_embed_model_id') || 'Xenova/bge-small-zh-v1.5';

  const tips = listCurrentByPeer(db, platform, peer_id, { limit: 500 });
  const kwHits = keywordSearchTips(tips, query, kwTop);

  /** @type {ReturnType<typeof vectorSearchTips>} */
  let vecHits = [];
  /** @type {string | null} */
  let vector_error = null;
  try {
    const queryVec = await embedText(query, { modelId });
    const tipEmb = loadTipEmbeddings(db, tips);
    vecHits = vectorSearchTips(tipEmb, queryVec, vecTop, minScore);
  } catch (err) {
    vector_error = String(err?.message ?? err);
    vecHits = [];
    console.warn('[dsh-companion][embed] vector path failed; keyword continues', {
      platform,
      peer_id,
      reason: vector_error,
    });
  }

  /** @type {Map<string, { entry: object, score: number, via: string[] }>} */
  const merged = new Map();
  for (const h of [...kwHits, ...vecHits]) {
    const id = h.entry.id;
    const prev = merged.get(id);
    if (!prev) {
      merged.set(id, {
        entry: h.entry,
        score: h.score,
        via: [h.via],
      });
    } else {
      prev.via = [...new Set([...prev.via, h.via])];
      prev.score = Math.max(prev.score, h.score);
    }
  }

  const results = [...merged.values()].sort(
    (a, b) => b.score - a.score || b.entry.weight - a.entry.weight,
  );

  return {
    query,
    platform,
    peer_id,
    tips_scanned: tips.length,
    keyword_hits: kwHits.length,
    vector_hits: vecHits.length,
    vector_error,
    results,
  };
}
