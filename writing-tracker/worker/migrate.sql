CREATE TABLE daily_stats_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  project TEXT NOT NULL DEFAULT 'default',
  device TEXT NOT NULL DEFAULT 'default',
  word_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date, project, device)
);
INSERT INTO daily_stats_v2 (id, user_id, date, project, word_count)
  SELECT id, user_id, date, project, word_count FROM daily_stats;
DROP TABLE daily_stats;
ALTER TABLE daily_stats_v2 RENAME TO daily_stats;
