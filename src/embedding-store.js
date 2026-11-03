/** memory_embedding 旁表：upsert / 删 / 链尖加载 / 补嵌。 */

import { blobToVector, embedText, vectorToBlob } from './embed.js';

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {{ id: string, content: string }} entry
 */
export async function upsertEmbeddingForEntry(db, entry) {
  const modelId = db.getConfig('ltm_embed_model_id') || 'Xenova/bge-small-zh-v1.5';
  const expectDims = Number(db.getConfig('ltm_embed_dims') || 512);
  const vec = await embedText(entry.content, { modelId });
  if (vec.length !== expectDims) {
    throw new Error(`embed dims ${vec.length} != config ltm_embed_dims ${expectDims}`);
  }
  const t = Date.now();
  db.db
    .prepare(
      `
    INSERT INTO memory_embedding (entry_id, model_id, dims, vector, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(entry_id) DO UPDATE SET
      model_id = excluded.model_id,
      dims = excluded.dims,
      vector = excluded.vector,
      updated_at = excluded.updated_at
  `,
    )
    .run(entry.id, modelId, vec.length, vectorToBlob(vec), t);
}

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {string} entryId
 */
export function deleteEmbedding(db, entryId) {
  db.db.prepare('DELETE FROM memory_embedding WHERE entry_id = ?').run(entryId);
}

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {string} entryId
 */
export function getEmbedding(db, entryId) {
  const row = db.db
    .prepare('SELECT * FROM memory_embedding WHERE entry_id = ?')
    .get(entryId);
  if (!row) return null;
  return {
    ...row,
    vector: blobToVector(row.vector),
  };
}

/**
 * 同桶链尖里已有旁表且 model_id 匹配配置的行；无向量 tip 不进列表。
 * @param {import('./db.js').MemoryDb} db
 * @param {object[]} tipEntries
 */
export function loadTipEmbeddings(db, tipEntries) {
  if (!tipEntries.length) return [];
  const modelId = db.getConfig('ltm_embed_model_id') || 'Xenova/bge-small-zh-v1.5';
  const out = [];
  const stmt = db.db.prepare(
    'SELECT * FROM memory_embedding WHERE entry_id = ? AND model_id = ?',
  );
  for (const e of tipEntries) {
    const row = stmt.get(e.id, modelId);
    if (!row) continue;
    out.push({
      entry: e,
      model_id: row.model_id,
      dims: row.dims,
      vector: blobToVector(row.vector),
    });
  }
  return out;
}

/**
 * 缺向量或 model 不符时补嵌；不改正文。失败进 errors + 排查日志。
 * @param {import('./db.js').MemoryDb} db
 * @param {object} [opts]
 * @param {boolean} [opts.tips_only=true]
 * @param {boolean} [opts.force=false]
 */
export async function backfillEmbeddings(db, opts = {}) {
  const tipsOnly = opts.tips_only !== false;
  const force = opts.force === true;
  const modelId = db.getConfig('ltm_embed_model_id') || 'Xenova/bge-small-zh-v1.5';

  let entries;
  if (tipsOnly) {
    entries = db.db
      .prepare(
        `
      SELECT e.* FROM memory_entry e
      WHERE NOT EXISTS (
        SELECT 1 FROM memory_entry s
        WHERE s.platform = e.platform AND s.peer_id = e.peer_id AND s.supersedes = e.id
      )
      ORDER BY e.created_at ASC
    `,
      )
      .all();
  } else {
    entries = db.db.prepare(`SELECT * FROM memory_entry ORDER BY created_at ASC`).all();
  }

  let written = 0;
  let skipped = 0;
  const errors = [];
  const getEmb = db.db.prepare(
    `SELECT entry_id, model_id FROM memory_embedding WHERE entry_id = ?`,
  );

  for (const entry of entries) {
    const existing = getEmb.get(entry.id);
    if (!force && existing && existing.model_id === modelId) {
      skipped += 1;
      continue;
    }
    try {
      await upsertEmbeddingForEntry(db, entry);
      written += 1;
    } catch (err) {
      const reason = String(err?.message ?? err);
      errors.push({ id: entry.id, error: reason });
      console.warn('[dsh-companion][embed] backfill failed', {
        entry_id: entry.id,
        reason,
      });
    }
  }

  return { scanned: entries.length, written, skipped, errors };
}
