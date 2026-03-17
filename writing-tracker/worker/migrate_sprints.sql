CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  project TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  goal_duration_minutes INTEGER NOT NULL,
  goal_words INTEGER NOT NULL,
  words_written INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  completed INTEGER NOT NULL DEFAULT 0
);
