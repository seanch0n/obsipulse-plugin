CREATE TABLE daily_activity_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  project TEXT NOT NULL,
  writing INTEGER NOT NULL DEFAULT 0,
  editing INTEGER NOT NULL DEFAULT 0,
  planning INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date, project)
);
INSERT INTO daily_activity_new (id, user_id, date, project, writing, editing, planning)
SELECT
  id, user_id, date, project,
  CASE WHEN mode = 'writing' THEN 1 ELSE 0 END,
  CASE WHEN mode = 'editing' THEN 1 ELSE 0 END,
  CASE WHEN mode = 'planning' THEN 1 ELSE 0 END
FROM daily_activity;
DROP TABLE daily_activity;
ALTER TABLE daily_activity_new RENAME TO daily_activity;
