import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  real,
} from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const uuidDefault = sql`(gen_random_uuid())`;
const nowDefault = sql`(now())`;

export type UserRole = "professor" | "student" | "admin";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    role: text("role").notNull().default("student"),
    email: text("email").notNull(),
    username: text("username").notNull(),
    display_name: text("display_name").notNull(),
    password: text("password").notNull(),
    created_by_professor_id: text("created_by_professor_id"),
    must_change_password: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(false),
    created_at: text("created_at").notNull().default(nowDefault),
    last_login_at: text("last_login_at"),
  },
  (table) => ({
    users_email_unique: uniqueIndex("users_email_unique").on(table.email),
    users_username_unique: uniqueIndex("users_username_unique").on(
      table.username,
    ),
  }),
);

export const professor_profiles = sqliteTable(
  "professor_profiles",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    department: text("department"),
    title: text("title"),
    created_at: text("created_at").notNull().default(nowDefault),
  },
  (table) => ({
    professor_profiles_user_unique: uniqueIndex(
      "professor_profiles_user_unique",
    ).on(table.user_id),
  }),
);

export const student_profiles = sqliteTable(
  "student_profiles",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    student_number: text("student_number"),
    created_by_professor_id: text("created_by_professor_id").references(
      () => users.id,
    ),
    created_at: text("created_at").notNull().default(nowDefault),
  },
  (table) => ({
    student_profiles_user_unique: uniqueIndex("student_profiles_user_unique").on(
      table.user_id,
    ),
  }),
);

export const account_credentials = sqliteTable(
  "account_credentials",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    student_id: text("student_id")
      .notNull()
      .references(() => users.id),
    created_by_professor_id: text("created_by_professor_id")
      .notNull()
      .references(() => users.id),
    plain_password: text("plain_password").notNull(),
    source: text("source").notNull().default("manual_create"),
    is_active: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    created_at: text("created_at").notNull().default(nowDefault),
  },
  (table) => ({
    account_credentials_student_idx: index("account_credentials_student_idx").on(
      table.student_id,
    ),
    account_credentials_professor_idx: index(
      "account_credentials_professor_idx",
    ).on(table.created_by_professor_id),
    account_credentials_active_idx: index("account_credentials_active_idx").on(
      table.student_id,
      table.is_active,
    ),
  }),
);

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  username: true,
  display_name: true,
  password: true,
});

export const courses = sqliteTable(
  "courses",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    professor_id: text("professor_id")
      .notNull()
      .references(() => users.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    term: text("term").notNull(),
    created_at: text("created_at").notNull().default(nowDefault),
    description: text("description"),
    device_binding_enabled: integer("device_binding_enabled", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
  },
  (table) => ({
    courses_code_prof_unique: uniqueIndex("courses_code_prof_unique").on(
      table.code,
      table.professor_id,
    ),
  }),
);

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey().notNull().default(uuidDefault),
  course_id: text("course_id").notNull().references(() => courses.id),
  name: text("name").notNull(),
  meeting_schedule: text("meeting_schedule"),
  created_at: text("created_at").notNull().default(nowDefault),
});

export const enrollments = sqliteTable(
  "enrollments",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    student_id: text("student_id").notNull().references(() => users.id),
    course_id: text("course_id").notNull().references(() => courses.id),
    group_id: text("group_id").notNull().references(() => groups.id),
    enrolled_at: text("enrolled_at").notNull().default(nowDefault),
  },
  (table) => ({
    enrollments_student_course_unique: uniqueIndex(
      "enrollments_student_course_unique",
    ).on(table.student_id, table.course_id),
  }),
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey().notNull().default(uuidDefault),
  group_id: text("group_id").notNull().references(() => groups.id),
  course_id: text("course_id").notNull().references(() => courses.id),
  professor_id: text("professor_id").notNull().references(() => users.id),
  starts_at: text("starts_at").notNull(),
  ends_at: text("ends_at"),
  is_active: integer("is_active", { mode: "boolean" })
    .notNull()
    .default(false),
  status: text("status").notNull().default("scheduled"),
  created_at: text("created_at").notNull().default(nowDefault),
});

export const attendance_rounds = sqliteTable(
  "attendance_rounds",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    session_id: text("session_id")
      .notNull()
      .references(() => sessions.id),
    round_number: integer("round_number").notNull(),
    starts_at: text("starts_at").notNull().default(nowDefault),
    ends_at: text("ends_at"),
    is_active: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    geofence_enabled: integer("geofence_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    geofence_radius_m: integer("geofence_radius_m"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    is_break_round: integer("is_break_round", { mode: "boolean" })
      .notNull()
      .default(false),
    created_at: text("created_at").notNull().default(nowDefault),
  },
  (table) => ({
    attendance_rounds_session_round_unique: uniqueIndex(
      "attendance_rounds_session_round_unique",
    ).on(table.session_id, table.round_number),
  }),
);

export const qr_tokens = sqliteTable(
  "qr_tokens",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    round_id: text("round_id")
      .notNull()
      .references(() => attendance_rounds.id),
    token_hash: text("token_hash").notNull(),
    expires_at: text("expires_at").notNull(),
    consumed: integer("consumed", { mode: "boolean" })
      .notNull()
      .default(false),
    created_at: text("created_at").notNull().default(nowDefault),
  },
  (table) => ({
    qr_tokens_round_hash_unique: uniqueIndex(
      "qr_tokens_round_hash_unique",
    ).on(table.round_id, table.token_hash),
    qr_tokens_round_idx: index("qr_tokens_round_idx").on(table.round_id),
  }),
);

export const attendance_records = sqliteTable(
  "attendance_records",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    round_id: text("round_id")
      .notNull()
      .references(() => attendance_rounds.id),
    student_id: text("student_id").notNull().references(() => users.id),
    status: text("status").notNull().default("on_time"),
    recorded_at: text("recorded_at").notNull().default(nowDefault),
    qr_token_id: text("qr_token_id").references(() => qr_tokens.id),
    device_fingerprint: text("device_fingerprint"),
    recorded_latitude: real("recorded_latitude"),
    recorded_longitude: real("recorded_longitude"),
    client_scan_id: text("client_scan_id"),
    recorded_at_client: text("recorded_at_client"),
  },
  (table) => ({
    attendance_records_round_student_unique: uniqueIndex(
      "attendance_records_round_student_unique",
    ).on(table.round_id, table.student_id),
    attendance_records_round_student_client_unique: uniqueIndex(
      "attendance_records_round_student_client_unique",
    ).on(table.round_id, table.student_id, table.client_scan_id),
    attendance_records_round_idx: index(
      "attendance_records_round_idx",
    ).on(table.round_id),
    attendance_records_student_idx: index(
      "attendance_records_student_idx",
    ).on(table.student_id),
  }),
);

export const excuse_requests = sqliteTable(
  "excuse_requests",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    round_id: text("round_id")
      .notNull()
      .references(() => attendance_rounds.id),
    student_id: text("student_id").notNull().references(() => users.id),
    reason: text("reason").notNull(),
    attachment_path: text("attachment_path"),
    status: text("status").notNull().default("PENDING"),
    category: text("category").notNull().default("absence"),
    reviewed_at: text("reviewed_at"),
    reviewed_by: text("reviewed_by"),
    resolution_note: text("resolution_note"),
    created_at: text("created_at").notNull().default(nowDefault),
  },
  (table) => ({
    excuse_requests_round_student_idx: index(
      "excuse_requests_round_student_idx",
    ).on(table.round_id, table.student_id),
    excuse_requests_status_idx: index("excuse_requests_status_idx").on(
      table.status,
    ),
  }),
);

export const audit_logs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    actor_id: text("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id"),
    before_json: text("before_json"),
    after_json: text("after_json"),
    reason: text("reason"),
    created_at: text("created_at").notNull().default(nowDefault),
  },
  (table) => ({
    audit_logs_actor_idx: index("audit_logs_actor_idx").on(table.actor_id),
    audit_logs_entity_idx: index("audit_logs_entity_idx").on(
      table.entity_type,
      table.entity_id,
    ),
  }),
);

export const fraud_signals = sqliteTable(
  "fraud_signals",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    session_id: text("session_id").references(() => sessions.id),
    round_id: text("round_id").references(() => attendance_rounds.id),
    student_id: text("student_id").references(() => users.id),
    details_json: text("details_json"),
    created_at: text("created_at").notNull().default(nowDefault),
  },
  (table) => ({
    fraud_signals_session_idx: index("fraud_signals_session_idx").on(
      table.session_id,
    ),
    fraud_signals_student_idx: index("fraud_signals_student_idx").on(
      table.student_id,
    ),
  }),
);

export type PolicyScopeType = "global" | "faculty" | "course";

export const attendance_policies = sqliteTable(
  "attendance_policies",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    name: text("name"),
    scope_type: text("scope_type").notNull(),
    scope_id: text("scope_id"),
    version: integer("version").notNull().default(1),
    rules_json: text("rules_json").notNull(),
    effective_from: text("effective_from").notNull().default(nowDefault),
    is_active: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    created_at: text("created_at").notNull().default(nowDefault),
    created_by: text("created_by").references(() => users.id),
  },
  (table) => ({
    policies_scope_idx: index("policies_scope_idx").on(
      table.scope_type,
      table.scope_id,
    ),
    policies_scope_active_idx: index("policies_scope_active_idx").on(
      table.scope_type,
      table.scope_id,
      table.is_active,
    ),
  }),
);

export const attendance_policy_history = sqliteTable(
  "attendance_policy_history",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    policy_id: text("policy_id")
      .notNull()
      .references(() => attendance_policies.id),
    name: text("name"),
    scope_type: text("scope_type").notNull(),
    scope_id: text("scope_id"),
    version: integer("version").notNull(),
    rules_json: text("rules_json").notNull(),
    effective_from: text("effective_from").notNull(),
    is_active: integer("is_active", { mode: "boolean" }).notNull(),
    recorded_at: text("recorded_at").notNull().default(nowDefault),
  },
  (table) => ({
    policy_history_policy_idx: index("policy_history_policy_idx").on(
      table.policy_id,
    ),
  }),
);

export const course_policy_assignments = sqliteTable(
  "course_policy_assignments",
  {
    id: text("id").primaryKey().notNull().default(uuidDefault),
    course_id: text("course_id")
      .notNull()
      .references(() => courses.id),
    policy_id: text("policy_id")
      .notNull()
      .references(() => attendance_policies.id),
    assigned_at: text("assigned_at").notNull().default(nowDefault),
  },
  (table) => ({
    course_policy_unique: uniqueIndex("course_policy_unique").on(table.course_id),
    course_policy_policy_idx: index("course_policy_policy_idx").on(table.policy_id),
  }),
);

export type User = typeof users.$inferSelect;
export type ProfessorProfile = typeof professor_profiles.$inferSelect;
export type StudentProfile = typeof student_profiles.$inferSelect;
export type AccountCredential = typeof account_credentials.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AttendanceRound = typeof attendance_rounds.$inferSelect;
export type AttendanceRecord = typeof attendance_records.$inferSelect;
export type QrToken = typeof qr_tokens.$inferSelect;
export type ExcuseRequest = typeof excuse_requests.$inferSelect;
export type AttendancePolicy = typeof attendance_policies.$inferSelect;
export type AttendancePolicyHistory = typeof attendance_policy_history.$inferSelect;
export type CoursePolicyAssignment = typeof course_policy_assignments.$inferSelect;
export type AuditLog = typeof audit_logs.$inferSelect;
export type FraudSignal = typeof fraud_signals.$inferSelect;
