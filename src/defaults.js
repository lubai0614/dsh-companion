/** 配置默认 — 权威清单见 docs/05-参数配置.md */
export const CONFIG_DEFAULTS = Object.freeze({
  ltm_weight_min: '1',
  ltm_weight_max: '999',
  ltm_fade_weight_max: '49',
  ltm_embed_model_id: 'Xenova/bge-small-zh-v1.5',
  ltm_embed_dims: '512',
  ltm_embed_top_k: '10',
  ltm_embed_min_score: '0.55',
  ltm_keyword_top_k: '20',
  ltm_growth_check_time: '21:30',
  ltm_growth_window_days: '7',
  ltm_growth_new_entries_threshold: '100',
  ltm_reassess_check_time: '22:30',
  ltm_reassess_interval_days: '3',
  ltm_reassess_cooldown_days: '7',
  ltm_reassess_max_entries_per_run: '50',
  inject_max_entries: '4',
  inject_max_chars: '1200',
  inject_relevance_min_score: '0.35',
  inject_resident_min_weight: '800',
  inject_resident_max_entries: '6',
  inject_near_fragment_days: '1',
  inject_near_fragment_fallback_max: '5',
  inject_near_digest_days: '2',
  inject_near_digest_fallback_max: '2',
  near_digest_time: '18:00',
  near_digest_lookback_days: '1',
  near_promote_time: '19:30',
  near_promote_lookback_days: '1',
});

export const KINDS = Object.freeze(['event', 'fact']);

export const SOURCES = Object.freeze([
  'user_stated',
  'model_inferred',
  'bili_external',
  'role_diary',
  'user_correction',
]);

export const SOURCE_LABEL_ZH = Object.freeze({
  user_stated: '用户明确说过',
  model_inferred: '模型推测',
  bili_external: 'B 站等外部见闻',
  role_diary: '角色感想/自述',
  user_correction: '用户纠正后写入',
});
