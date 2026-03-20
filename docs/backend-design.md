# Backend Design for Academic Attendance

## Database schema (Drizzle definitions)

- `users`: professors and students, each with `id`, `role`, `email`, `username`, `display_name`, password hash, `created_at`, and optional `last_login_at`.
- `courses`: owned by a professor and contains metadata (`code`, `name`, `term`, `description`).
- `groups`: sections per course (`group_id`, `course_id`, `name`, optional `meeting_schedule`).
- `enrollments`: each student ↔ course + group relation; unique constraints enforce “one student per course per group”.
- `sessions`: tied to a group/course/professor, tracks lifecycle (`starts_at`, `ends_at`, `is_active`, `status`).
- `attendance_rounds`: multiple rounds per session, one `round_number` per session, `is_active`, timestamps.
- `qr_tokens`: per-round tokens with `token_hash`, `expires_at`, `consumed` flag; indexes support fast validation.
- `attendance_records`: one record per (round, student); stores attendance status and references the QR that authorized it.

Each table uses UUID primary keys (via `gen_random_uuid()`), timestamp defaults, and indexes/unique constraints to keep integrity. See `shared/schema.ts` for the full Drizzle schema.

## Backend flows

1. **Professor creates a course group**
   - Auth middleware confirms professor role.
   - `POST /api/courses` creates course row attached to current professor.
   - `POST /api/courses/:courseId/groups` adds a group for the course, storing schedule metadata and exposing the new `group_id`.

2. **Professor starts a session for a group**
   - `POST /api/groups/:groupId/sessions` verifies professor owns the course, resolves enrolled students, and flags the session `is_active`.
   - Inserts `sessions` row with `starts_at = now()` and `status = "active"`.
   - Immediately creates the first attendance round in the session and its first QR token (short TTL, hashed in DB; raw token sent over WebSocket).
   - Emits `round:started` and initial `round:qr-updated` events to the professor’s WebSocket channel, supplying `sessionId`, `roundId`, and plain token data for QR rendering.

3. **Professor runs multiple attendance rounds**
   - `POST /api/sessions/:sessionId/rounds` increments `round_number`.
   - Creates a new `attendance_rounds` entry, generates initial QR via QR service (hashed token stored, TTL tracked), and emits `round:started`.
   - Rounds toggle `is_active`/`ends_at` in previous round on creation.

4. **Student scans QR per round**
   - POST scan to `POST /api/sessions/:sessionId/rounds/:roundId/scan` (or consolidated endpoint).
   - Middleware ensures student role, enrollment matches session’s group, and session/round are active.
   - Server hashes submitted token, queries `qr_tokens` by round + hash, ensures `consumed` = false, `expires_at` > now.
   - Inserts attendance record (or updates if late), marks token `consumed = true`, records `recorded_at`.
   - Triggers QR rotation before responding: new token creation, new `qr_tokens` row, `round:qr-updated` emit to professor socket (payload includes `token`, `expiresAt`), ensuring students never see code.

5. **Session lifecycle**
   - `PATCH /api/sessions/:sessionId/end` ends session: `is_active = false`, `ends_at = now()`, all rounds closed (`is_active = false`), emits `session:ended`.
   - Attendance stats computed via aggregate queries (student view uses enrollments + attendance_records; professor view aggregates per group/session/course).

## WebSocket event contract

1. `round:started`
   - Sent when a round begins.
   - Payload: `{ sessionId, roundId, roundNumber, startsAt }`.
   - Professor client opens QR panel and prepares to show tokens.

2. `round:qr-updated`
   - Sent each time a token is freshly minted (start of round + every successful scan).
   - Payload: `{ sessionId, roundId, token, expiresAt }`.
   - Professor UI renders QR image from `token`; server never broadcasts raw token elsewhere.

3. `session:ended`
   - Sent when the professor explicitly closes a session.
   - Payload: `{ sessionId, endedAt, summary: { totalRounds, attendanceCount } }`.
   - Clients can display summaries and clean up listeners.

Socket connections should be authenticated (reuse express-session) and attached to a `sessionId` + `role` context so only the professor receives QR updates.

## Abuse prevention & data integrity

- `enrollments` enforces unique `(student_id, course_id)` to ensure one group per course.
- `attendance_records` enforces unique `(round_id, student_id)` so each student can only scan once per attendance round.
- `qr_tokens` includes `expires_at` + `consumed` booleans; validation rejects reused/expired tokens.
- Tokens only live on professor WebSocket; use hashed storage (`token_hash`) so stolen DB snapshots can’t reveal valid values.
- Round state flags (`is_active`) keep scans tied to the correct lifecycle stage.
- All sensitive endpoints guard by session/role middleware (professor vs student).

## Backend architecture guidance

1. **Routes**
   - `routes/auth.ts`: login/logout via `passport-local`.
   - `routes/courses.ts`: CRUD for courses/groups (professor).
   - `routes/sessions.ts`: start/end sessions, create rounds.
   - `routes/attendance.ts`: scan endpoint, student stats, professor reports.
   - `routes/ws.ts`: initial handshake for WebSocket upgrade, pipe session info.
   - `routes/professor.ts`: exposes `GET /api/professor/sessions/:sessionId/stats` for per-round and per-student summaries plus the existing session actions.

2. **Controllers**
   - Thin layers handling request validation, calling services, serializing responses, catching errors.
   - Example: `SessionsController.startSession(req, res)` calls `sessionService.startSession`.

3. **Services**
   - `sessionService`: orchestrates session lifecycle, ensures group ownership, toggles rounds.
   - `qrService`: generates/rotates tokens, hashes values, enforces TTL, emits WebSocket events.
   - `attendanceService`: validates scans, inserts attendance records, aggregates stats.
   - `enrollmentService`/`courseService`: manage enrollments and group assignments.

4. **Repositories**
   - Drizzle-based data access layers under `repositories/` or `storage/` (e.g., `sessionsRepo.create`, `qrTokensRepo.markConsumed`).
   - Keep raw SQL/ORM queries centralized for easier testing/mocking.

5. **WebSocket manager**
   - Maintains map `sessionId → professorSocket`.
   - Validates each upgrade by checking the `sessionId` query parameter, the Express session cookie, and the owner of the session (professor only).
   - Provides helpers `sendRoundQrUpdate(sessionId, payload)` and `notifySessionEnd(sessionId, payload)`.
   - Hooks into services so QR rotation emits events immediately after the token is persisted.

Services should be composed by dependency injection (e.g., pass `repositories`, `websocketManager`) so unit tests can mock behaviors and enforce constraints cleanly.
