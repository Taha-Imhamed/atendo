ALTER TABLE attendance_rounds
  ADD COLUMN geofence_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance_rounds
  ADD COLUMN geofence_radius_m INTEGER;
ALTER TABLE attendance_rounds
  ADD COLUMN latitude REAL;
ALTER TABLE attendance_rounds
  ADD COLUMN longitude REAL;

CREATE TABLE IF NOT EXISTS excuse_requests (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  round_id TEXT NOT NULL REFERENCES attendance_rounds(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  attachment_path TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  category TEXT NOT NULL DEFAULT 'absence',
  reviewed_at TEXT,
  reviewed_by TEXT,
  resolution_note TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);

CREATE INDEX IF NOT EXISTS excuse_requests_round_student_idx ON excuse_requests(round_id, student_id);
CREATE INDEX IF NOT EXISTS excuse_requests_status_idx ON excuse_requests(status);

-- Recreate attendance_records to allow nullable qr_token_id for manual/approved excuses
CREATE TABLE IF NOT EXISTS attendance_records_new (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  round_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present',
  recorded_at TEXT NOT NULL DEFAULT (now()),
  qr_token_id TEXT,
  FOREIGN KEY (round_id) REFERENCES attendance_rounds(id),
  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (qr_token_id) REFERENCES qr_tokens(id)
);
INSERT INTO attendance_records_new (id, round_id, student_id, status, recorded_at, qr_token_id)
  SELECT id, round_id, student_id, status, recorded_at, qr_token_id FROM attendance_records;
DROP TABLE attendance_records;
ALTER TABLE attendance_records_new RENAME TO attendance_records;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_round_student_unique ON attendance_records(round_id, student_id);
CREATE INDEX IF NOT EXISTS attendance_records_round_idx ON attendance_records(round_id);
CREATE INDEX IF NOT EXISTS attendance_records_student_idx ON attendance_records(student_id);
