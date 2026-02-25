-- Users/professors/students account tables for Attendo
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  role TEXT NOT NULL DEFAULT 'student',
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password TEXT NOT NULL,
  created_by_professor_id TEXT REFERENCES users(id),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (now()),
  last_login_at TEXT
);

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
