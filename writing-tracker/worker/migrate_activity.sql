CREATE TABLE daily_activity_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  project TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('writing', 'editing', 'planning')),
  UNIQUE(user_id, date, project)
);
INSERT INTO daily_activity_new SELECT * FROM daily_activity;
DROP TABLE daily_activity;
ALTER TABLE daily_activity_new RENAME TO daily_activity;
