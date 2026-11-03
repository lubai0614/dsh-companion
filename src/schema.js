/** 表结构对齐 docs/02 · docs/03 · docs/08 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memory_entry (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  peer_id TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  event_at INTEGER,
  created_at INTEGER NOT NULL,
  weight INTEGER NOT NULL,
  weight_updated_at INTEGER NOT NULL,
  supersedes TEXT,
  change_note TEXT,
  CHECK (kind IN ('event', 'fact')),
  CHECK (weight >= 1 AND weight <= 999)
);

CREATE INDEX IF NOT EXISTS idx_memory_peer
  ON memory_entry (platform, peer_id);

CREATE INDEX IF NOT EXISTS idx_memory_kind_weight
  ON memory_entry (kind, weight);

CREATE INDEX IF NOT EXISTS idx_memory_created
  ON memory_entry (created_at);

CREATE INDEX IF NOT EXISTS idx_memory_supersedes
  ON memory_entry (supersedes);

CREATE TABLE IF NOT EXISTS memory_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS near_fragment (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  peer_id TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  day_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_near_fragment_peer_day
  ON near_fragment (platform, peer_id, day_key);

CREATE INDEX IF NOT EXISTS idx_near_fragment_created
  ON near_fragment (created_at);

CREATE TABLE IF NOT EXISTS near_digest (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  peer_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (platform, peer_id, day_key)
);

CREATE INDEX IF NOT EXISTS idx_near_digest_peer_day
  ON near_digest (platform, peer_id, day_key);

CREATE TABLE IF NOT EXISTS memory_embedding (
  entry_id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  dims INTEGER NOT NULL,
  vector BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_embedding_model
  ON memory_embedding (model_id);

CREATE TABLE IF NOT EXISTS sched_run_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  day_key TEXT,
  advances_progress INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  CHECK (task IN ('digest', 'promote', 'growth', 'rhythm')),
  CHECK (advances_progress IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_sched_run_log_task_finished
  ON sched_run_log (task, finished_at DESC);

CREATE INDEX IF NOT EXISTS idx_sched_run_log_task_progress
  ON sched_run_log (task, advances_progress, finished_at DESC);
`;
