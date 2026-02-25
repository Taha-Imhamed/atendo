CREATE TABLE IF NOT EXISTS attendance_policies (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  name TEXT,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  rules_json TEXT NOT NULL,
  effective_from TEXT NOT NULL DEFAULT (now()),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (now()),
  created_by TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS policies_scope_idx ON attendance_policies(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS policies_scope_active_idx ON attendance_policies(scope_type, scope_id, is_active);

CREATE TABLE IF NOT EXISTS attendance_policy_history (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  policy_id TEXT NOT NULL REFERENCES attendance_policies(id),
  name TEXT,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  version INTEGER NOT NULL,
  rules_json TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  is_active INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS policy_history_policy_idx ON attendance_policy_history(policy_id);

CREATE TABLE IF NOT EXISTS course_policy_assignments (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  course_id TEXT NOT NULL REFERENCES courses(id),
  policy_id TEXT NOT NULL REFERENCES attendance_policies(id),
  assigned_at TEXT NOT NULL DEFAULT (now())
);
CREATE UNIQUE INDEX IF NOT EXISTS course_policy_unique ON course_policy_assignments(course_id);
CREATE INDEX IF NOT EXISTS course_policy_policy_idx ON course_policy_assignments(policy_id);

-- Seed default global policy v1 (20/10 late thresholds, zero grace)
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
  1,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM attendance_policies WHERE scope_type = 'global' AND is_active = 1
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
