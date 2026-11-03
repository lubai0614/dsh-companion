import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { CONFIG_DEFAULTS, KINDS, SOURCES } from './defaults.js';
import { ensureParentDir, resolveDefaultDbPath } from './paths.js';
import { SCHEMA_SQL } from './schema.js';

function nowMs() {
  return Date.now();
}

function assertNonEmptyString(name, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

/** 同库 SQLite：长期条目底读写 + memory_config。正文无 UPDATE。 */
export class MemoryDb {
  /** @type {number} */
  #txDepth = 0;

  /**
   * @param {object} [opts]
   * @param {string} [opts.dbPath]
   * @param {boolean} [opts.readonly]
   */
  constructor(opts = {}) {
    const dbPath = opts.dbPath || resolveDefaultDbPath();
    if (!opts.readonly) ensureParentDir(dbPath);
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath, { readOnly: Boolean(opts.readonly) });
    this.#txDepth = 0;
    if (!opts.readonly) {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec(SCHEMA_SQL);
      this.#seedConfig();
    }
  }

  close() {
    this.db.close();
  }

  /**
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  runInTransaction(fn) {
    if (this.#txDepth > 0) {
      return fn();
    }
    this.db.exec('BEGIN IMMEDIATE');
    this.#txDepth += 1;
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      this.#txDepth = 0;
    }
  }

  #seedConfig() {
    const upsert = this.db.prepare(`
      INSERT INTO memory_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO NOTHING
    `);
    const t = nowMs();
    this.db.exec('BEGIN');
    try {
      for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
        upsert.run(key, value, t);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  getConfig(key) {
    assertNonEmptyString('key', key);
    const row = this.db.prepare('SELECT value FROM memory_config WHERE key = ?').get(key);
    if (row) return row.value;
    if (Object.prototype.hasOwnProperty.call(CONFIG_DEFAULTS, key)) {
      return CONFIG_DEFAULTS[key];
    }
    return null;
  }

  getConfigNumber(key) {
    const raw = this.getConfig(key);
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new Error(`memory_config.${key} is not a number: ${raw}`);
    }
    return n;
  }

  setConfig(key, value) {
    assertNonEmptyString('key', key);
    const v = value == null ? '' : String(value);
    this.db
      .prepare(
        `
      INSERT INTO memory_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
      )
      .run(key, v, nowMs());
  }

  listConfig() {
    return this.db
      .prepare('SELECT key, value, updated_at FROM memory_config ORDER BY key')
      .all();
  }

  /**
   * @param {object} input
   */
  addEntry(input) {
    assertNonEmptyString('platform', input.platform);
    assertNonEmptyString('peer_id', input.peer_id);
    assertNonEmptyString('content', input.content);

    if (!KINDS.includes(input.kind)) {
      throw new Error(`kind must be event|fact, got: ${input.kind}`);
    }
    if (!SOURCES.includes(input.source)) {
      throw new Error(`invalid source: ${input.source}`);
    }

    const weightMin = this.getConfigNumber('ltm_weight_min') ?? 1;
    const weightMax = this.getConfigNumber('ltm_weight_max') ?? 999;
    const weight = Number(input.weight);
    if (!Number.isInteger(weight) || weight < weightMin || weight > weightMax) {
      throw new Error(`weight must be integer in [${weightMin}, ${weightMax}]`);
    }

    if (input.source === 'user_correction') {
      if (!input.supersedes || !String(input.supersedes).trim()) {
        throw new Error('user_correction requires supersedes');
      }
      if (!input.change_note || !String(input.change_note).trim()) {
        throw new Error('user_correction requires change_note');
      }
    }

    if (input.event_at != null && !Number.isInteger(input.event_at)) {
      throw new Error('event_at must be integer ms or null');
    }

    const t = nowMs();
    const id = input.id && String(input.id).trim() ? String(input.id).trim() : crypto.randomUUID();
    const platform = String(input.platform).trim();
    const peerId = String(input.peer_id).trim();
    const content = String(input.content);
    const eventAt = input.event_at == null ? null : input.event_at;
    const supersedes = input.supersedes ? String(input.supersedes).trim() : null;
    const changeNote = input.change_note ? String(input.change_note) : null;

    this.db
      .prepare(
        `
      INSERT INTO memory_entry (
        id, platform, peer_id, content, kind, source,
        event_at, created_at, weight, weight_updated_at,
        supersedes, change_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        id,
        platform,
        peerId,
        content,
        input.kind,
        input.source,
        eventAt,
        t,
        weight,
        t,
        supersedes,
        changeNote,
      );

    return this.getEntry(id);
  }

  getEntry(id) {
    assertNonEmptyString('id', id);
    return this.db.prepare('SELECT * FROM memory_entry WHERE id = ?').get(id) || null;
  }

  /**
   * @param {string} platform
   * @param {string} peer_id
   * @param {object} [opts]
   * @param {number} [opts.limit]
   */
  listByPeer(platform, peer_id, opts = {}) {
    assertNonEmptyString('platform', platform);
    assertNonEmptyString('peer_id', peer_id);
    const limit = opts.limit == null ? 100 : Number(opts.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
      throw new Error('limit must be integer 1..5000');
    }
    return this.db
      .prepare(
        `
      SELECT * FROM memory_entry
      WHERE platform = ? AND peer_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
      )
      .all(platform.trim(), peer_id.trim(), limit);
  }

  /**
   * 只改权，绝不改正文。
   * @param {string} id
   * @param {number} weight
   */
  updateWeight(id, weight) {
    assertNonEmptyString('id', id);
    const weightMin = this.getConfigNumber('ltm_weight_min') ?? 1;
    const weightMax = this.getConfigNumber('ltm_weight_max') ?? 999;
    const w = Number(weight);
    if (!Number.isInteger(w) || w < weightMin || w > weightMax) {
      throw new Error(`weight must be integer in [${weightMin}, ${weightMax}]`);
    }

    const existing = this.getEntry(id);
    if (!existing) throw new Error(`entry not found: ${id}`);

    const t = nowMs();
    this.db
      .prepare(
        `
      UPDATE memory_entry
      SET weight = ?,
          weight_updated_at = ?
      WHERE id = ?
    `,
      )
      .run(w, t, id);

    return this.getEntry(id);
  }
}

export function openMemoryDb(opts) {
  return new MemoryDb(opts);
}
