/**
 * 控制台参数页元数据。键名/默认权威仍是 docs/05-参数配置.md + memory/defaults.js。
 * explain：界面说明；hint：短补充（可选）。
 * 批处理按事件前缀分块：near_digest_* / near_promote_* / ltm_growth_* / ltm_reassess_*。
 * 任务运行态不在此页（见定时任务页 / sched_run_log）。
 */
export const CONFIG_GROUPS = Object.freeze([
  {
    id: 'inject',
    title: '注入 / 上下文',
    desc: '装配进模型的条数、字数、近因窗与注入相关门（相关腿检索见下一块）',
    collapsible: true,
    keys: [
      'inject_max_entries',
      'inject_max_chars',
      'inject_relevance_min_score',
      'inject_resident_min_weight',
      'inject_resident_max_entries',
      'inject_near_fragment_days',
      'inject_near_fragment_fallback_max',
      'inject_near_digest_days',
      'inject_near_digest_fallback_max',
    ],
  },
  {
    id: 'ltm_search',
    title: '长期检索（装配相关腿 / 晋升共用）',
    desc: 'memorySearch：关键词 ∪ 向量。QQ 装配相关腿与晋升对照都读这些键（键名仍 ltm_*）',
    collapsible: true,
    keys: [
      'ltm_keyword_top_k',
      'ltm_embed_top_k',
      'ltm_embed_min_score',
      'ltm_embed_dims',
      'ltm_embed_model_id',
    ],
  },
  {
    id: 'near_digest',
    title: '近因日摘',
    desc: 'near_digest_*：到点收成当日小结，以及纳入几天的相处摘记',
    keys: ['near_digest_time', 'near_digest_lookback_days'],
  },
  {
    id: 'near_promote',
    title: '近因→长期晋升',
    desc: 'near_promote_*：到点把日摘升入长期，以及回看几天的日摘',
    keys: ['near_promote_time', 'near_promote_lookback_days'],
  },
  {
    id: 'ltm_growth',
    title: '增长整理',
    desc: 'ltm_growth_*：检查钟点、统计窗口、触发阈值',
    keys: [
      'ltm_growth_check_time',
      'ltm_growth_window_days',
      'ltm_growth_new_entries_threshold',
    ],
  },
  {
    id: 'ltm_reassess',
    title: '节奏整理',
    desc: 'ltm_reassess_*：检查钟点、间隔、冷却、单轮上限',
    keys: [
      'ltm_reassess_check_time',
      'ltm_reassess_interval_days',
      'ltm_reassess_cooldown_days',
      'ltm_reassess_max_entries_per_run',
    ],
  },
  {
    id: 'advanced',
    title: '长期其它（高级）',
    desc: '权重范围、已淡阈值',
    collapsible: true,
    collapsed: true,
    keys: ['ltm_weight_min', 'ltm_weight_max', 'ltm_fade_weight_max'],
  },
]);

/**
 * @type {Record<string, {
 *   label: string,
 *   type: 'int'|'number'|'time'|'string'|'epoch',
 *   explain: string,
 *   readonly?: boolean,
 *   hint?: string
 * }>}
 */
export const CONFIG_FIELDS = Object.freeze({
  inject_max_entries: {
    label: '普通注入最多条数',
    type: 'int',
    explain: '本轮靠检索带上的长期条上限；不含常驻，也不含近因。',
  },
  inject_max_chars: {
    label: '注入合计字数上限',
    type: 'int',
    explain: '近因 + 常驻 + 普通注入的合计字数软顶；总量主要靠它卡住。',
  },
  inject_relevance_min_score: {
    label: '注入·相关最低分',
    type: 'number',
    explain:
      '装配专用再滤：memorySearch 之后，闲聊相关分低于此且无关键词命中则不注入。与「向量路最低相似度」不是同一道门。',
  },
  inject_resident_min_weight: {
    label: '常驻候选最低权重',
    type: 'int',
    explain: '权重达到此值才可进常驻短名单，优先带上。',
  },
  inject_resident_max_entries: {
    label: '常驻最多条数',
    type: 'int',
    explain: '常驻长期条数上限，与普通注入分计；过大仍受字数上限约束。',
  },
  inject_near_fragment_days: {
    label: '注入·近因片段取材天数',
    type: 'int',
    explain: '回看最近几天的相处摘记；单位是天。今天优先取当日片段。',
  },
  inject_near_fragment_fallback_max: {
    label: '注入·当日无片段时回落条数',
    type: 'int',
    explain: '当天没有相处摘记时，改带该对象最近几条摘记。',
  },
  inject_near_digest_days: {
    label: '注入·近因日摘取材天数',
    type: 'int',
    explain: '回看最近几天的当日小结；单位是天。隔天对话更依赖它。',
  },
  inject_near_digest_fallback_max: {
    label: '注入·窗内无日摘时回落条数',
    type: 'int',
    explain: '取材窗内没有当日小结时，改带该对象最近几条小结。',
  },

  near_digest_time: {
    label: '日摘·定时时刻',
    type: 'time',
    explain: '到点把相处摘记收成当日小结。',
  },
  near_digest_lookback_days: {
    label: '日摘·片段取材天数',
    type: 'int',
    explain: '写日摘时按自然日纳入几天的相处摘记；1=只目标日。',
  },
  near_promote_time: {
    label: '晋升·定时时刻',
    type: 'time',
    explain: '到点把日摘升入长期。宜晚于日摘钟点。',
  },
  near_promote_lookback_days: {
    label: '晋升·日摘取材天数',
    type: 'int',
    explain: '晋升时按自然日回看几天的日摘作原料。',
  },

  ltm_growth_check_time: {
    label: '增长整理·定时检查时刻',
    type: 'time',
    explain: '到点按本块窗口与阈值，检查是否该叫醒再评权。',
  },
  ltm_growth_window_days: {
    label: '增长整理·统计窗口（天）',
    type: 'int',
    explain: '统计最近几天新增长期条。',
  },
  ltm_growth_new_entries_threshold: {
    label: '增长整理·触发阈值（条）',
    type: 'int',
    explain: '窗口内新增达到此条数才叫醒再评权。',
  },

  ltm_reassess_check_time: {
    label: '节奏整理·定时检查时刻',
    type: 'time',
    explain: '到点按本块间隔，检查是否该叫醒再评权。',
  },
  ltm_reassess_interval_days: {
    label: '节奏整理·间隔（天）',
    type: 'int',
    explain: '两次成功节奏整理至少隔几天。',
  },
  ltm_reassess_cooldown_days: {
    label: '节奏整理·单条冷却（天）',
    type: 'int',
    explain: '同一条多久内不再被节奏/增长整理改权重。',
  },
  ltm_reassess_max_entries_per_run: {
    label: '节奏整理·单轮最多条数',
    type: 'int',
    explain: '一轮再评估最多改几条权重；其余留给下轮。',
  },

  ltm_weight_min: {
    label: '权重最小',
    type: 'int',
    explain: '长期记忆权重合法下限；写入/调权不得低于此值。',
  },
  ltm_weight_max: {
    label: '权重最大',
    type: 'int',
    explain: '长期记忆权重合法上限。',
  },
  ltm_fade_weight_max: {
    label: '「已淡」权重上限',
    type: 'int',
    explain: '权重不超过此值可视为已淡；纠错降权与闲聊少想起时作参考。',
  },
  ltm_keyword_top_k: {
    label: '关键词路最多返回条数',
    type: 'int',
    explain:
      '装配相关腿与晋升对照共用：混合检索关键词一路最多几条，再与向量路按 id 去重。',
  },
  ltm_embed_top_k: {
    label: '向量路最多返回条数',
    type: 'int',
    explain: '装配相关腿与晋升对照共用：向量腿最多几条；通常比关键词路更精、更少。',
  },
  ltm_embed_min_score: {
    label: '向量路最低相似度',
    type: 'number',
    explain:
      '装配相关腿与晋升对照共用：库内长期向量余弦门槛；低于此分的向量命中不进检索结果。',
  },
  ltm_embed_dims: {
    label: '向量维度',
    type: 'int',
    explain: '句向量长度，须与模型一致；改模型后通常要整库重新计算。',
  },
  ltm_embed_model_id: {
    label: '句向量模型标识',
    type: 'string',
    explain: '本地句向量用哪套模型；更换后旧向量失效，需要重新计算。',
  },
});

export function listCatalogKeys() {
  return CONFIG_GROUPS.flatMap((g) => g.keys);
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * @param {string} key
 * @param {string} raw
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateConfigValue(key, raw) {
  const meta = CONFIG_FIELDS[key];
  if (!meta) return { ok: false, error: `未知键: ${key}` };
  if (meta.readonly) return { ok: false, error: `${key} 为只读键` };
  const value = raw == null ? '' : String(raw).trim();
  if (value === '') return { ok: false, error: `${key} 不能为空` };

  switch (meta.type) {
    case 'time':
      if (!TIME_RE.test(value)) return { ok: false, error: `${key} 须为 HH:mm` };
      return { ok: true, value };
    case 'int': {
      if (!/^-?\d+$/.test(value)) return { ok: false, error: `${key} 须为整数` };
      const n = Number(value);
      if (key === 'inject_resident_max_entries' && (n < 0 || n > 20)) {
        return { ok: false, error: `${key} 建议在 0～20` };
      }
      if (key === 'inject_max_entries' && (n < 0 || n > 50)) {
        return { ok: false, error: `${key} 建议在 0～50` };
      }
      if (
        (key === 'inject_near_fragment_fallback_max' ||
          key === 'inject_near_digest_fallback_max') &&
        (n < 0 || n > 50)
      ) {
        return { ok: false, error: `${key} 建议在 0～50` };
      }
      return { ok: true, value: String(n) };
    }
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, error: `${key} 须为数字` };
      return { ok: true, value: String(n) };
    }
    case 'string':
      return { ok: true, value };
    default:
      return { ok: false, error: `${key} 类型不可编辑` };
  }
}
