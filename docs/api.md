# API Reference (January 2026)

All routes are prefixed with `/api`. Requests and responses use JSON unless otherwise noted. Authentication uses `express-session` cookies; include `credentials: "include"` on fetches.

## Auth
- `POST /auth/login` – `{ username, password }` → user profile.
- `POST /auth/logout`
- `GET /auth/me` – returns current session user or `401`.

## Student
- `GET /me/enrollments` – courses/groups the student belongs to, plus active session/round hints.
- `GET /me/attendance` – aggregated attendance stats per course.
- `GET /me/attendance/history` – latest attendance records with course/group/round metadata.
- `POST /rounds/:roundId/scans` – body `{ token, latitude?, longitude?, deviceFingerprint? }`; records attendance, rotates QR. **Rate limit:** 20 requests per minute per user/IP. Returns `{ roundId, recordedAt, status }`. Geofenced rounds require location within configured radius. **Lateness:** first-hour (default) rounds mark `late` only after 20 minutes; break rounds mark `late` only after 10 minutes; scans exactly at the threshold stay `on_time`. Rounds without `isBreakRound` are treated as first-hour for backward compatibility. `deviceFingerprint` is optional and used only for fraud signaling when courses opt into device binding.
- `POST /me/excuses` (multipart/form-data) – fields: `attendanceRoundId`, `reason`, optional `category` (`absence|late`), optional `attachment` (pdf/png/jpg/webp). Creates a PENDING excuse.
- `GET /me/excuses` – list submitted excuses and their statuses.
- `GET /me/excuses/:excuseId/attachment` – download own attachment.

## Professor
- `GET /professor/courses` – courses + groups + enrollment counts.
- `POST /professor/courses` – create course.
- `POST /professor/courses/:courseId/groups` – create group.
- `POST /professor/users` – create a user account (student/professor).
- `GET /professor/groups/:groupId/enrollments` – list enrolled students for a group.
- `POST /professor/groups/:groupId/enrollments` – enroll or move a student. Body: `{ studentId }` or `{ username }` or `{ email }`.
- `DELETE /professor/enrollments/:enrollmentId` – remove a student enrollment.
- `POST /professor/groups/:groupId/sessions` – start a session (opens round 1 + QR). Optional body `{ geofenceEnabled, latitude, longitude, geofenceRadiusM, isBreakRound }`. `isBreakRound` defaults to `false` (first-hour lateness threshold = 20 minutes).
- `POST /professor/sessions/:sessionId/rounds` – start a new round (closes previous). Optional geofence fields as above plus `isBreakRound` to mark break rounds (lateness threshold = 10 minutes).
- `PATCH /professor/sessions/:sessionId/rounds/:roundId/end` – close the active round without starting a new one.
- `PATCH /professor/sessions/:sessionId/end` – end the session and close all rounds.
- `GET /professor/sessions/:sessionId` – session detail + active round (rotates QR).
- `GET /professor/sessions/:sessionId/stats` – per-round and per-student aggregates.
- `GET /professor/sessions/:sessionId/export` – CSV with `round_number,round_id,student_username,student_name,status,recorded_at`.
- `GET /professor/sessions/:sessionId/analytics` – attendance analytics (per-student percent, on-time/late/excused counts, per-round absent trends).
- `GET /professor/sessions/:sessionId/analytics/export` – CSV export of analytics data.
- `GET /professor/sessions/:sessionId/excuses` – list excuses for the session.
- `PATCH /professor/excuses/:excuseId/approve|reject` – review an excuse (body `note` optional).
- `GET /professor/excuses/:excuseId/attachment` – download supporting file.

## Admin
- `GET /admin/policies` – list attendance policies (all scopes and versions).
- `POST /admin/policies` – create a policy. Body: `{ scopeType: "global"|"faculty"|"course", scopeId?, name?, effectiveFrom?, rules: { lateAfterMinutes: { first_hour, break }, graceMinutes?, maxAbsences? } }`. Version auto-increments per scope; defaults keep 20/10 thresholds and zero grace.
- `PATCH /admin/policies/:policyId` – toggle `isActive` for an existing policy.
- `POST /admin/policies/:policyId/assign/course/:courseId` – assign a policy to a course (overrides faculty/global fallback for that course).
- Audit/fraud are server-side only; audit logs are written for policy changes, sessions/rounds lifecycle, and excuse reviews. Fraud signals are recorded (no blocking) for rapid bursts, GPS clusters, edge scans, and multiple-device usage when applicable.

## Errors
Errors are returned as `{ "message": string }` with appropriate HTTP status. Validation/authorization failures use 400/401/403, duplicates return 409, and unexpected failures return 500.

## Monitoring
Set `SENTRY_DSN` (and optional `SENTRY_TRACES_SAMPLE_RATE`) to enable server-side error capture.

## Health
- `GET /health` – basic service health check (DB reachable).
