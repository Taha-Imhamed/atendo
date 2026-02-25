ALTER TABLE attendance_rounds
  ADD COLUMN is_break_round INTEGER NOT NULL DEFAULT 0;

-- Update status default and allow null qr_token_id already handled in prior migration; here ensure on_time default.
CREATE TABLE IF NOT EXISTS attendance_records_new2 (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  round_id TEXT NOT NULL REFERENCES attendance_rounds(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'on_time',
  recorded_at TEXT NOT NULL DEFAULT (now()),
  qr_token_id TEXT REFERENCES qr_tokens(id)
);

INSERT INTO attendance_records_new2 (id, round_id, student_id, status, recorded_at, qr_token_id)
SELECT id, round_id, student_id,
       CASE status WHEN 'present' THEN 'on_time' ELSE status END,
       recorded_at, qr_token_id
FROM attendance_records;

DROP TABLE attendance_records;
ALTER TABLE attendance_records_new2 RENAME TO attendance_records;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_round_student_unique ON attendance_records(round_id, student_id);
CREATE INDEX IF NOT EXISTS attendance_records_round_idx ON attendance_records(round_id);
CREATE INDEX IF NOT EXISTS attendance_records_student_idx ON attendance_records(student_id);
