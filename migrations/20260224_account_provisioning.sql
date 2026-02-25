ALTER TABLE users ADD COLUMN created_by_professor_id TEXT REFERENCES users(id);
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS professor_profiles (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  department TEXT,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);

CREATE TABLE IF NOT EXISTS student_profiles (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  student_number TEXT,
  created_by_professor_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (now())
);
