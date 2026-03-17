DROP TABLE IF EXISTS monthly_goals;
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  target INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, period_type, period_key)
);
