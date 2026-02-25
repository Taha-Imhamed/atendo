CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL DEFAULT 'student',
  email text NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES users(id),
  code text NOT NULL,
  name text NOT NULL,
  term text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  device_binding_enabled boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS courses_code_prof_unique ON courses(code, professor_id);

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  name text NOT NULL,
  meeting_schedule text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id),
  course_id uuid NOT NULL REFERENCES courses(id),
  group_id uuid NOT NULL REFERENCES groups(id),
  enrolled_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_student_course_unique ON enrollments(student_id, course_id);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id),
  course_id uuid NOT NULL REFERENCES courses(id),
  professor_id uuid NOT NULL REFERENCES users(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id),
  round_number integer NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  geofence_enabled boolean NOT NULL DEFAULT false,
  geofence_radius_m integer,
  latitude double precision,
  longitude double precision,
  is_break_round boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_rounds_session_round_unique ON attendance_rounds(session_id, round_number);

CREATE TABLE IF NOT EXISTS qr_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES attendance_rounds(id),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS qr_tokens_round_hash_unique ON qr_tokens(round_id, token_hash);
CREATE INDEX IF NOT EXISTS qr_tokens_round_idx ON qr_tokens(round_id);

CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES attendance_rounds(id),
  student_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'on_time',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  qr_token_id uuid REFERENCES qr_tokens(id),
  device_fingerprint text,
  recorded_latitude double precision,
  recorded_longitude double precision,
  client_scan_id text,
  recorded_at_client timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_round_student_unique ON attendance_records(round_id, student_id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_round_student_client_unique ON attendance_records(round_id, student_id, client_scan_id);
CREATE INDEX IF NOT EXISTS attendance_records_round_idx ON attendance_records(round_id);
CREATE INDEX IF NOT EXISTS attendance_records_student_idx ON attendance_records(student_id);

CREATE TABLE IF NOT EXISTS excuse_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES attendance_rounds(id),
  student_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  attachment_path text,
  status text NOT NULL DEFAULT 'PENDING',
  category text NOT NULL DEFAULT 'absence',
  reviewed_at timestamptz,
  reviewed_by uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS excuse_requests_round_student_idx ON excuse_requests(round_id, student_id);
CREATE INDEX IF NOT EXISTS excuse_requests_status_idx ON excuse_requests(status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_json text,
  after_json text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS fraud_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  severity text NOT NULL,
  session_id uuid REFERENCES sessions(id),
  round_id uuid REFERENCES attendance_rounds(id),
  student_id uuid REFERENCES users(id),
  details_json text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fraud_signals_session_idx ON fraud_signals(session_id);
CREATE INDEX IF NOT EXISTS fraud_signals_student_idx ON fraud_signals(student_id);

CREATE TABLE IF NOT EXISTS attendance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  scope_type text NOT NULL,
  scope_id text,
  version integer NOT NULL DEFAULT 1,
  rules_json text NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS policies_scope_idx ON attendance_policies(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS policies_scope_active_idx ON attendance_policies(scope_type, scope_id, is_active);

CREATE TABLE IF NOT EXISTS attendance_policy_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES attendance_policies(id),
  name text,
  scope_type text NOT NULL,
  scope_id text,
  version integer NOT NULL,
  rules_json text NOT NULL,
  effective_from timestamptz NOT NULL,
  is_active boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_history_policy_idx ON attendance_policy_history(policy_id);

CREATE TABLE IF NOT EXISTS course_policy_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  policy_id uuid NOT NULL REFERENCES attendance_policies(id),
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS course_policy_unique ON course_policy_assignments(course_id);
CREATE INDEX IF NOT EXISTS course_policy_policy_idx ON course_policy_assignments(policy_id);

INSERT INTO attendance_policies (
  id,
  name,
  scope_type,
  scope_id,
  version,
  rules_json,
  effective_from,
  is_active,
  created_at
)
SELECT
  gen_random_uuid(),
  'Global Default v1',
  'global',
  NULL,
  1,
  '{"lateAfterMinutes":{"first_hour":20,"break":10},"graceMinutes":0,"maxAbsences":null}',
  now(),
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM attendance_policies WHERE scope_type = 'global' AND is_active = true
);

INSERT INTO attendance_policy_history (
  id,
  policy_id,
  name,
  scope_type,
  scope_id,
  version,
  rules_json,
  effective_from,
  is_active,
  recorded_at
)
SELECT
  gen_random_uuid(),
  p.id,
  p.name,
  p.scope_type,
  p.scope_id,
  p.version,
  p.rules_json,
  p.effective_from,
  p.is_active,
  now()
FROM attendance_policies p
WHERE p.scope_type = 'global' AND p.version = 1
  AND NOT EXISTS (SELECT 1 FROM attendance_policy_history h WHERE h.policy_id = p.id);

-- connect-pg-simple session table
CREATE TABLE IF NOT EXISTS "session" (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);
ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY (sid);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" (expire);
