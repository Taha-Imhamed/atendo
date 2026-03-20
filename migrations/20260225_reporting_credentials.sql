CREATE TABLE IF NOT EXISTS account_credentials (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  student_id TEXT NOT NULL REFERENCES users(id),
  created_by_professor_id TEXT NOT NULL REFERENCES users(id),
  plain_password TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual_create',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (now())
);

CREATE INDEX IF NOT EXISTS account_credentials_student_idx
  ON account_credentials(student_id);
CREATE INDEX IF NOT EXISTS account_credentials_professor_idx
  ON account_credentials(created_by_professor_id);
CREATE INDEX IF NOT EXISTS account_credentials_active_idx
  ON account_credentials(student_id, is_active);
