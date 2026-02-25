ALTER TABLE courses ADD COLUMN IF NOT EXISTS device_binding_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS recorded_latitude REAL;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS recorded_longitude REAL;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS client_scan_id TEXT;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS recorded_at_client TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_round_student_client_unique ON attendance_records(round_id, student_id, client_scan_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS fraud_signals (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  session_id TEXT REFERENCES sessions(id),
  round_id TEXT REFERENCES attendance_rounds(id),
  student_id TEXT REFERENCES users(id),
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS fraud_signals_session_idx ON fraud_signals(session_id);
CREATE INDEX IF NOT EXISTS fraud_signals_student_idx ON fraud_signals(student_id);
