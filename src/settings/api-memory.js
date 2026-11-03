/** 记忆查询页：长期 / 近因列表 + 例外调权。 */

import { KINDS, SOURCE_LABEL_ZH, SOURCES } from '../defaults.js';
import { adjustWeight } from '../weight.js';
import { withMemoryDb } from './open-db.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const KIND_LABEL_ZH = Object.freeze({
  fact: '事实',
  event: '事件',
});

function formatEpoch(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return { display: '—', ms: null };
  }
  return {
    display: new Date(n).toLocaleString('zh-CN', { hour12: false }),
    ms: n,
  };
}

function clampPage(n, fallback = 1) {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1) return fallback;
  return v;
}

function clampPageSize(n, fallback = 10) {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1) return fallback;
  return Math.min(v, 50);
}

function likeEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function listPeers(db) {
  const rows = db.db
    .prepare(
      `
    SELECT platform, peer_id FROM memory_entry
    UNION
    SELECT platform, peer_id FROM near_fragment
    UNION
    SELECT platform, peer_id FROM near_digest
    ORDER BY platform, peer_id
  `,
    )
    .all();
  return rows.map((r) => ({
    platform: r.platform,
    peer_id: r.peer_id,
    label: `${r.platform} / ${r.peer_id}`,
  }));
}

function metaPayload(db) {
  return {
    peers: listPeers(db),
    kinds: KINDS.map((id) => ({ id, title: KIND_LABEL_ZH[id] || id })),
    sources: SOURCES.map((id) => ({
      id,
      title: SOURCE_LABEL_ZH[id] || id,
    })),
    platforms: ['qq'],
    fade_weight_max: db.getConfigNumber('ltm_fade_weight_max') ?? 49,
    weight_min: db.getConfigNumber('ltm_weight_min') ?? 1,
    weight_max: db.getConfigNumber('ltm_weight_max') ?? 999,
  };
}

export function readMemoryMetaPayload(opts = {}) {
  return withMemoryDb(
    (db) => ({ ok: true, ...metaPayload(db) }),
    { readonly: true, dbPath: opts.dbPath },
  );
}

/** query: platform?, peer_id?, kind?, source?, q?, page?, pageSize? */
export function readLtmListPayload(query = {}, opts = {}) {
  return withMemoryDb(
    (db) => {
      const platform = String(query.platform || '').trim();
      const peer_id = String(query.peer_id || '').trim();
      const kind = String(query.kind || '').trim();
      const source = String(query.source || '').trim();
      const q = String(query.q || '').trim();
      const page = clampPage(query.page, 1);
      const pageSize = clampPageSize(query.pageSize, 10);

      if (kind && !KINDS.includes(kind)) {
        return { ok: false, error: 'kind 须为 fact 或 event' };
      }
      if (source && !SOURCES.includes(source)) {
        return { ok: false, error: 'source 不在允许枚举内' };
      }

      const where = [];
      const params = [];
      if (platform) {
        where.push('platform = ?');
        params.push(platform);
      }
      if (peer_id) {
        where.push('peer_id = ?');
        params.push(peer_id);
      }
      if (kind) {
        where.push('kind = ?');
        params.push(kind);
      }
      if (source) {
        where.push('source = ?');
        params.push(source);
      }
      if (q) {
        where.push("content LIKE ? ESCAPE '\\'");
        params.push(`%${likeEscape(q)}%`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const total = Number(
        db.db.prepare(`SELECT COUNT(*) AS n FROM memory_entry ${whereSql}`).get(...params)
          ?.n || 0,
      );
      const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
      const safePage = Math.min(page, pages);
      const offset = (safePage - 1) * pageSize;

      const rows = db.db
        .prepare(
          `
      SELECT * FROM memory_entry
      ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `,
        )
        .all(...params, pageSize, offset);

      const fadeMax = db.getConfigNumber('ltm_fade_weight_max') ?? 49;
      const mapped = rows.map((row) => {
        const eventAt = formatEpoch(row.event_at);
        const createdAt = formatEpoch(row.created_at);
        const weight = Number(row.weight);
        return {
          id: row.id,
          platform: row.platform,
          peer_id: row.peer_id,
          peer_label: `${row.platform} / ${row.peer_id}`,
          kind: row.kind,
          kind_zh: KIND_LABEL_ZH[row.kind] || row.kind,
          source: row.source,
          source_zh: SOURCE_LABEL_ZH[row.source] || row.source,
          event_at: eventAt.ms,
          event_at_display: eventAt.display,
          created_at: createdAt.ms,
          created_at_display: createdAt.display,
          weight,
          faded: weight <= fadeMax,
          content: row.content,
          change_note: row.change_note || '',
          supersedes: row.supersedes || '',
        };
      });

      return {
        ok: true,
        ...metaPayload(db),
        filters: { platform, peer_id, kind, source, q },
        page: safePage,
        pageSize,
        pages,
        total,
        rows: mapped,
      };
    },
    { readonly: true, dbPath: opts.dbPath },
  );
}

/**
 * query: near_kind=fragment|digest, platform?, peer_id?, source?, q?,
 *        from?, to? (YYYY-MM-DD), page?, pageSize?
 */
export function readNearListPayload(query = {}, opts = {}) {
  return withMemoryDb(
    (db) => {
      const nearKind = String(query.near_kind || 'fragment').trim() || 'fragment';
      if (nearKind !== 'fragment' && nearKind !== 'digest') {
        return { ok: false, error: 'near_kind 须为 fragment 或 digest' };
      }
      const platform = String(query.platform || '').trim();
      const peer_id = String(query.peer_id || '').trim();
      const source = String(query.source || '').trim();
      const q = String(query.q || '').trim();
      const from = String(query.from || '').trim();
      const to = String(query.to || '').trim();
      const page = clampPage(query.page, 1);
      const pageSize = clampPageSize(query.pageSize, 10);

      if (source && !SOURCES.includes(source)) {
        return { ok: false, error: 'source 不在允许枚举内' };
      }
      if (from && !DAY_RE.test(from)) {
        return { ok: false, error: 'from 须为 YYYY-MM-DD' };
      }
      if (to && !DAY_RE.test(to)) {
        return { ok: false, error: 'to 须为 YYYY-MM-DD' };
      }
      if (from && to && from > to) {
        return { ok: false, error: '开始日期不能晚于结束日期' };
      }

      const table = nearKind === 'fragment' ? 'near_fragment' : 'near_digest';
      const where = [];
      const params = [];
      if (platform) {
        where.push('platform = ?');
        params.push(platform);
      }
      if (peer_id) {
        where.push('peer_id = ?');
        params.push(peer_id);
      }
      if (source) {
        where.push('source = ?');
        params.push(source);
      }
      if (q) {
        where.push("content LIKE ? ESCAPE '\\'");
        params.push(`%${likeEscape(q)}%`);
      }
      if (from) {
        where.push('day_key >= ?');
        params.push(from);
      }
      if (to) {
        where.push('day_key <= ?');
        params.push(to);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const orderSql =
        nearKind === 'fragment'
          ? 'ORDER BY created_at DESC, id DESC'
          : 'ORDER BY day_key DESC, updated_at DESC, id DESC';

      const total = Number(
        db.db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${whereSql}`).get(...params)?.n ||
          0,
      );
      const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
      const safePage = Math.min(page, pages);
      const offset = (safePage - 1) * pageSize;

      const rows = db.db
        .prepare(
          `
      SELECT * FROM ${table}
      ${whereSql}
      ${orderSql}
      LIMIT ? OFFSET ?
    `,
        )
        .all(...params, pageSize, offset);

      const mapped = rows.map((row) => {
        const createdAt = formatEpoch(row.created_at);
        const updatedAt = formatEpoch(row.updated_at);
        return {
          id: row.id,
          platform: row.platform,
          peer_id: row.peer_id,
          peer_label: `${row.platform} / ${row.peer_id}`,
          source: row.source,
          source_zh: SOURCE_LABEL_ZH[row.source] || row.source,
          day_key: row.day_key || '',
          created_at: createdAt.ms,
          created_at_display: createdAt.display,
          updated_at: updatedAt.ms,
          updated_at_display: nearKind === 'digest' ? updatedAt.display : null,
          content: row.content,
        };
      });

      return {
        ok: true,
        ...metaPayload(db),
        near_kind: nearKind,
        filters: { platform, peer_id, source, q, from, to },
        page: safePage,
        pageSize,
        pages,
        total,
        rows: mapped,
      };
    },
    { readonly: true, dbPath: opts.dbPath },
  );
}

/** body: { id, weight } */
export function adjustMemoryWeightPayload(body = {}, opts = {}) {
  const id = String(body.id || '').trim();
  const weight = body.weight;
  if (!id) return { ok: false, error: 'id 必填' };
  if (weight == null || weight === '') return { ok: false, error: 'weight 必填' };

  try {
    return withMemoryDb(
      (db) => {
        const out = adjustWeight(db, { id, weight: Number(weight) });
        const fadeMax = db.getConfigNumber('ltm_fade_weight_max') ?? 49;
        const entry = out.entry;
        const tipYes = out.adjusted_is_tip ? '是' : '否';
        return {
          ok: true,
          tip_id: out.tip_id,
          adjusted_is_tip: out.adjusted_is_tip,
          entry: {
            id: entry.id,
            weight: entry.weight,
            faded: Number(entry.weight) <= fadeMax,
            weight_updated_at: entry.weight_updated_at,
          },
          message: `已调权；是否仍为当前说法：${tipYes}`,
        };
      },
      { dbPath: opts.dbPath },
    );
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
