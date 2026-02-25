import dotenv from "dotenv";
dotenv.config();

import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { Pool } from "pg";

const databaseUrl =
  process.env.NODE_ENV === "test"
    ? "file::memory:?cache=shared"
    : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to connect to the database");
}

const isPostgres =
  databaseUrl.startsWith("postgres://") ||
  databaseUrl.startsWith("postgresql://");

function parseBoolean(value: string | undefined) {
  if (value === undefined) return undefined;
  return value === "true" || value === "1";
}

const pgSslRejectUnauthorized =
  parseBoolean(process.env.PG_SSL_REJECT_UNAUTHORIZED) ?? false;

let db: ReturnType<typeof drizzleSqlite> | ReturnType<typeof drizzlePg>;

if (isPostgres) {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: pgSslRejectUnauthorized },
  });
  db = drizzlePg(pool);
} else {
  let dbFile = databaseUrl;

  const isMemoryDb =
    dbFile.includes("memory") || dbFile === ":memory:" || dbFile === "file::memory:";

  if (dbFile.startsWith("file:") && !isMemoryDb) {
    dbFile = dbFile.replace(/^file:/, "");
  } else if (dbFile.startsWith("sqlite://")) {
    dbFile = dbFile.replace(/^sqlite:\/\//, "");
  } else if (dbFile.startsWith("sqlite:")) {
    dbFile = dbFile.replace(/^sqlite:/, "");
  }

  if (!isMemoryDb && !path.isAbsolute(dbFile)) {
    dbFile = path.resolve(process.cwd(), dbFile);
  }

  if (!isMemoryDb) {
    const dir = path.dirname(dbFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(isMemoryDb ? ":memory:" : dbFile);
  if (process.env.NODE_ENV === "test") {
    sqlite.pragma("foreign_keys = OFF");
  } else {
    sqlite.pragma("foreign_keys = ON");
  }
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.function("gen_random_uuid", () => randomUUID());
  sqlite.function("now", () => new Date().toISOString());

// Bootstrap schema for SQLite so login works without migrations
  sqlite.exec(`
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

  CREATE TABLE IF NOT EXISTS account_credentials (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    student_id TEXT NOT NULL REFERENCES users(id),
    created_by_professor_id TEXT NOT NULL REFERENCES users(id),
    plain_password TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual_create',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (now())
  );
  CREATE INDEX IF NOT EXISTS account_credentials_student_idx ON account_credentials(student_id);
  CREATE INDEX IF NOT EXISTS account_credentials_professor_idx ON account_credentials(created_by_professor_id);
  CREATE INDEX IF NOT EXISTS account_credentials_active_idx ON account_credentials(student_id, is_active);

  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    professor_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    term TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (now()),
    device_binding_enabled INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (professor_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    course_id TEXT NOT NULL,
    name TEXT NOT NULL,
    meeting_schedule TEXT,
    created_at TEXT NOT NULL DEFAULT (now()),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    student_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    enrolled_at TEXT NOT NULL DEFAULT (now()),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (group_id) REFERENCES groups(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS enrollments_student_course_unique ON enrollments(student_id, course_id);

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    group_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    professor_id TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TEXT NOT NULL DEFAULT (now()),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (professor_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS attendance_rounds (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    session_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    starts_at TEXT NOT NULL DEFAULT (now()),
    ends_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    geofence_enabled INTEGER NOT NULL DEFAULT 0,
    geofence_radius_m INTEGER,
    latitude REAL,
    longitude REAL,
    is_break_round INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (now()),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS attendance_rounds_session_round_unique ON attendance_rounds(session_id, round_number);

  CREATE TABLE IF NOT EXISTS qr_tokens (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    round_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (now()),
    FOREIGN KEY (round_id) REFERENCES attendance_rounds(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS qr_tokens_round_hash_unique ON qr_tokens(round_id, token_hash);

  CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    round_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'on_time',
    recorded_at TEXT NOT NULL DEFAULT (now()),
    qr_token_id TEXT,
    device_fingerprint TEXT,
    recorded_latitude REAL,
    recorded_longitude REAL,
    client_scan_id TEXT,
    recorded_at_client TEXT,
    FOREIGN KEY (round_id) REFERENCES attendance_rounds(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (qr_token_id) REFERENCES qr_tokens(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_round_student_unique ON attendance_records(round_id, student_id);
  CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_round_student_client_unique ON attendance_records(round_id, student_id, client_scan_id);

  CREATE TABLE IF NOT EXISTS excuse_requests (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    round_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    attachment_path TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    category TEXT NOT NULL DEFAULT 'absence',
    reviewed_at TEXT,
    reviewed_by TEXT,
    resolution_note TEXT,
    created_at TEXT NOT NULL DEFAULT (now()),
    FOREIGN KEY (round_id) REFERENCES attendance_rounds(id),
    FOREIGN KEY (student_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS excuse_requests_round_student_idx ON excuse_requests(round_id, student_id);
  CREATE INDEX IF NOT EXISTS excuse_requests_status_idx ON excuse_requests(status);

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
`);

  const hasColumn = (tableName: string, columnName: string) => {
    const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name: string;
    }>;
    return rows.some((row) => row.name === columnName);
  };

  if (!hasColumn("users", "created_by_professor_id")) {
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN created_by_professor_id TEXT REFERENCES users(id);",
    );
  }

  if (!hasColumn("users", "must_change_password")) {
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;",
    );
  }

  db = drizzleSqlite(sqlite);
}

export { db };
