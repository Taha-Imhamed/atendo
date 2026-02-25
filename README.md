# ClassScan Attend

## Problem
Universities still rely on manual or paper-based attendance, which is error-prone, time-consuming, and vulnerable to proxy attendance. This system needs a secure, real-time attendance capture mechanism that fits within a local network and enforces academic integrity.

## Solution
A QR-based attendance suite where professors host per-group sessions, opens multiple attendance rounds during each lecture, and broadcasts a single-use QR code to their own device. Students scan with their devices—never seeing the QR—and their presence is logged only after the server validates the token and rotates the QR instantly. Professors and students can monitor attendance progress without sharing sensitive codes.

## Architecture
- **Stack**: Node.js + Express + TypeScript on the backend, Drizzle ORM + PostgreSQL, `ws` for real-time, `express-session` + `passport-local` for authentication.
- **Schema**: Tables for users, courses, groups, enrollments, sessions, attendance rounds, QR tokens, and attendance records enforce one student per course group and one scan per round.
- **Flow**:
  1. Professor creates course/group and starts a session.
  2. Each session spawns one or more attendance rounds, each with its own QR lifecycle.
  3. Students scan tokens; the backend validates, stores attendance, consumes the token, and emits a fresh QR to the professor socket.
  4. Professors get stats via `GET /api/professor/sessions/:sessionId/stats`; students call `GET /api/me/attendance` for their standings.

## Security
- QR tokens are hashed with SHA-256 before storage, expire within seconds, and are consumed immediately after validation.
- WebSocket events broadcast QR data only to the owning professor’s authenticated socket.
- Express-session enforces role-specific guards (`requireRole`), so students cannot start sessions or listen for QR updates.
- Replay prevention is handled through unique constraints plus API checks before inserting attendance records.

## Technical Report
- **Drizzle & Postgres**: Migrations generated via `drizzle-kit` reflect the shared `schema.ts`. A dedicated connection pool (`server/db/index.ts`) feeds both migrations and runtime queries.
- **Auth**: `passport-local` validates credentials hashed via `scrypt`, stores minimal user info in the session, and guards routes via `requireAuth` + `requireRole`.
- **QR Lifecycle**:
  * `qrService.generateToken` issues secure random tokens (only raw token sent through WebSocket) and stores their SHA-256 hashes with TTL and `consumed` flag.
  * `qrService.validateToken` rejects missing/expired/consumed tokens with `ApiError`s, ensuring students cannot reuse tokens.
  * After a successful scan, `attendanceService` records the attendance, consumes the token, and asks `qrService` for a new QR which is emitted via `round:qr-updated`.
- **WebSocket Manager**: Maintains `sessionId → sockets`, validates upgrades with Express sessions, and exposes helpers `emitRoundStarted`, `emitRoundQrUpdated`, and `emitSessionEnded`.
- **Stats**: `sessionService.getSessionStats` aggregates per-round and per-student data (counts + totals), while students hit `attendanceService.getMyAttendance`.

## Running
See `docs/deployment.md` for the exact sequence: load `.env`, run Drizzle migrations (`npx drizzle-kit generate` + `npx drizzle-kit push`), seed (`npx tsx script/seed.ts`), start the server (`npm run dev`), and run the frontend (`npm run dev:client`), ensuring cookies/WS use `credentials: "include"` and `ws://localhost:5000/?sessionId=...`.

## Recent improvements (Jan 2026)
- QR token validation/consumption is now atomic with a single update guard, and scan endpoints are rate limited (20 req/min per user/IP).
- Students can view personal attendance history at `GET /api/me/attendance/history`; professors can close rounds and export CSVs for sessions.
- Consistent structured logging plus optional Sentry reporting (`SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`).
- UI updates: clearer scanner states, mobile-friendly cards, toasts on scan success/failure, and download controls on professor analytics.
- Tests added for QR/token and attendance flows (`npm test` via Vitest on an in-memory SQLite DB).
- Excuse requests: students submit absence/late excuses with optional attachments; professors approve/reject, automatically marking records excused.
- Geo-fenced attendance: optional per-round radius with server-side validation; scans outside the area are rejected and logged.
- Analytics dashboard: per-student attendance %, on-time vs late vs excused counts, per-round absence trends, CSV export via `/api/professor/sessions/:sessionId/analytics/export`.
- Lateness rules: first-hour rounds allow 20 minutes before marking `late`; break rounds allow 10 minutes; legacy rounds without a type flag default to the 20-minute window for backward compatibility.
- Policy engine (Phase 1): attendance policies are stored/versioned in the database (`attendance_policies`), fallback order course → faculty → global default. Default global policy v1 preserves 20/10 thresholds with zero grace. Admin endpoints under `/api/admin/policies` manage policies and course assignment.

## Security & Integrity
- **Audit trail**: immutable `audit_logs` captures policy changes, excuse reviews, session start/end, and round open/close (server-side only).
- **Device binding (opt-in per course)**: when `device_binding_enabled` is true, scans may include `deviceFingerprint`; multiple fingerprints for the same student in a session emit a non-blocking `multiple_device` fraud signal.
- **Fraud signals** (no auto-block): rapid scan bursts (>3 in 60s per student/session), GPS clusters (same coords, short window), edge scans near the late threshold, and device fingerprint anomalies are recorded in `fraud_signals` and logged for review.

## API quick reference
See `docs/api.md` for endpoint shapes, rate limits, and expected responses for students and professors.

## Implementation notes
- Policy lookup is deterministic and cached per (courseId, facultyId) for 60 seconds; caches are invalidated on policy create/update/assignment.
- If no policy is found for a course or faculty, the seeded global default (20-minute first hour, 10-minute break, 0 grace) is used.
- Rounds without `isBreakRound` are treated as `first_hour` for policy evaluation.
