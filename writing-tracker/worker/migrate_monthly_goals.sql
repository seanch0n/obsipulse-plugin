CREATE TABLE monthly_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  monthly_target INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, year_month)
);
