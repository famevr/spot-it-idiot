-- Spot It, Idiot! leaderboard
-- One row per player (per browser): their best score and fastest time.
CREATE TABLE IF NOT EXISTS scores (
  player_id  TEXT PRIMARY KEY,
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  fastest    REAL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, fastest ASC);

-- Last submit time per (hashed) IP address, for a simple rate limit.
CREATE TABLE IF NOT EXISTS submit_log (
  ip_hash TEXT PRIMARY KEY,
  last_at INTEGER NOT NULL
);

-- Holds the key that signs game tokens (created automatically by the Worker if missing).
CREATE TABLE IF NOT EXISTS config (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
