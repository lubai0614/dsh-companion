/** 参数配置页：读/写 memory_config。 */

import { CONFIG_DEFAULTS } from '../defaults.js';
import {
  CONFIG_FIELDS,
  CONFIG_GROUPS,
  listCatalogKeys,
  validateConfigValue,
} from './config-catalog.js';
import { withMemoryDb } from './open-db.js';

function formatEpoch(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { display: '尚未记录', ms: 0 };
  return {
    display: new Date(n).toLocaleString('zh-CN', { hour12: false }),
    ms: n,
  };
}

export function readConfigPayload(opts = {}) {
  return withMemoryDb(
    (db) => {
      const rows = db.listConfig();
      const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
      const items = listCatalogKeys().map((key) => {
        const meta = CONFIG_FIELDS[key];
        const def = CONFIG_DEFAULTS[key] ?? '';
        const row = byKey[key];
        const value = row?.value ?? def;
        const item = {
          key,
          label: meta.label,
          explain: meta.explain || '',
          type: meta.type,
          readonly: Boolean(meta.readonly),
          hint: meta.hint || null,
          value: String(value),
          default: String(def),
          updated_at: row?.updated_at ?? null,
        };
        if (meta.type === 'epoch') {
          const fmt = formatEpoch(value);
          item.display = fmt.display;
          item.ms = fmt.ms;
        }
        return item;
      });
      return {
        ok: true,
        dbPath: db.dbPath,
        groups: CONFIG_GROUPS.map((g) => ({
          id: g.id,
          title: g.title,
          desc: g.desc,
          collapsed: Boolean(g.collapsed),
          collapsible: Boolean(g.collapsible),
          keys: g.keys,
        })),
        items,
      };
    },
    { readonly: true, dbPath: opts.dbPath },
  );
}

/**
 * @param {Record<string, string>} patch
 */
export function patchConfigPayload(patch, opts = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, error: 'body 须为 { key: value, ... }' };
  }
  const entries = Object.entries(patch);
  if (!entries.length) return { ok: false, error: '没有要保存的项' };

  const normalized = [];
  for (const [key, raw] of entries) {
    const checked = validateConfigValue(key, raw);
    if (!checked.ok) return { ok: false, error: checked.error };
    normalized.push([key, checked.value]);
  }

  return withMemoryDb(
    (db) => {
      const changed = [];
      for (const [key, value] of normalized) {
        const prev = db.getConfig(key);
        if (String(prev) === value) continue;
        db.setConfig(key, value);
        changed.push({ key, from: prev, to: value });
      }
      return { ok: true, changed, count: changed.length, message: '已保存' };
    },
    { dbPath: opts.dbPath },
  );
}
