/** 记入/纠错后维护旁表：新条 upsert；旧 tip 删向量（正文仍留条目表）。 */

import { deleteEmbedding, upsertEmbeddingForEntry } from './embedding-store.js';
import { correct, remember } from './write.js';

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {object} input
 */
export async function rememberWithEmbed(db, input) {
  const entry = remember(db, input);
  await upsertEmbeddingForEntry(db, entry);
  return entry;
}

/**
 * @param {import('./db.js').MemoryDb} db
 * @param {object} input
 */
export async function correctWithEmbed(db, input) {
  const result = correct(db, input);
  await upsertEmbeddingForEntry(db, result.entry);
  try {
    deleteEmbedding(db, result.demoted.id);
  } catch (err) {
    console.warn('[dsh-companion][embed] delete old tip vector failed', {
      entry_id: result.demoted.id,
      reason: String(err?.message ?? err),
    });
  }
  return result;
}
