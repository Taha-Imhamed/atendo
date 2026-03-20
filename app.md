# App Rebuild Spec

Use this document as the prompt/spec to recreate this project as an app. It describes the product, architecture, UI theme, routes, API surface, environment variables, database model, and the core attendance/security logic.

## Product Summary

This is a class attendance platform with two main portals:

- `Professor portal`: create courses, manage groups, start attendance sessions, show live QR codes, see live attendees, see recent scans, review excuses, manage roster/accounts, export attendance data, delete courses.
- `Student portal`: sign in, select enrolled class/group, scan live QR code, submit excuses, view attendance history.

There is also an `Admin` capability for attendance policy management.

The core attendance model is:

1. A professor owns one or more `courses`.
2. Each course has one or more `groups`.
3. A professor starts a `session` for a group.
4. A session opens one active `attendance_round`.
5. The round has short-lived signed QR tokens.
6. A student scans a valid token once per round.
7. The token is consumed atomically, attendance is saved, and a fresh token is generated.
8. The professor session screen updates live through WebSocket plus polling fallback.

## Tech Stack

### Frontend

- React 19
- TypeScript
- Vite
- Wouter with `useHashLocation`
- TanStack React Query
- Tailwind CSS v4
- Radix UI primitives
- Lucide icons
- `qrcode.react` for professor QR rendering
- `html5-qrcode` for student scanner

### Backend

- Node.js
- Express
- TypeScript via `tsx`
- Passport Local auth
- `express-session`
- WebSocket server via `ws`
- Drizzle ORM
- PostgreSQL in production, SQLite fallback/dev usage in parts of the stack
- Sentry for error monitoring

### Data / Infra

- Main database via `DATABASE_URL`
- Session store:
  - PostgreSQL when `DATABASE_URL` is Postgres
  - SQLite `sessions.sqlite` otherwise
- Static asset serving in production
- Vite middleware in development

## Project Roots

Important roots in the current project:

- `client/`: React frontend
- `server/`: Express server, services, controllers, middleware, websocket
- `shared/`: shared schema/types used by client and server
- `script/`: build/bootstrap/admin scripts
- `uploads/`: student excuse attachments and roster uploads
- `migrations/`: database migration artifacts
- `docs/`: extra docs if needed
- `dist/`: build output

Important entry files:

- `client/src/main.tsx`
- `client/src/App.tsx`
- `client/src/index.css`
- `server/index.ts`
- `server/routes.ts`
- `shared/schema.ts`

## Frontend App Structure

The app is a single-page app using hash routing.

### Frontend Routes

- `/`
  - marketing/home page
- `/login`
  - redirects into professor login behavior
- `/staff-access`
  - alias for professor login
- `/professor/login`
  - professor login page
- `/student/login`
  - student login page
- `/professor/dashboard`
  - professor overview, course cards, attendance log, create course, start session
- `/professor/roster`
  - professor roster/account management
- `/professor/session/:id`
  - live session screen with QR, live attendees, recent scans, excuse queue
- `/professor/stats/:id`
  - professor stats/analytics page
- `/student/scan`
  - student scanner and attendance submission page

### Frontend State Patterns

- React Query for API calls
- `["me"]` query for current authenticated user
- WebSocket for professor live session updates
- Polling fallback for professor session:
  - session detail refresh every 5 seconds while active
  - stats refresh every 3 seconds while active

### UI Theme

Visual direction is soft academic dashboard, not dark-mode-first.

#### Fonts

- Sans: `Inter`
- Heading: `Outfit`

#### Main Colors

- Primary: `#6f8e7b`
- Primary foreground: `#f7fbf6`
- Secondary: `#b9e6cc`
- Accent: `#f9dfb2`
- Destructive: `#de938b`
- Background: `#eef7f0`
- Foreground: `#476457`
- Border/Input: `#d9e8de`

#### Styling Language

- soft pastel green background
- glass-card surfaces
- rounded corners
- blurred panels
- subtle gradients and radial highlights
- animated reveal / float effects
- mobile-safe reduced motion fallbacks

#### Utility Classes / Effects

- `.glass-card`
- `.animate-float`
- `.animate-in-up`
- `.shiny-effect`
- `.magical-card`
- `.magical-button`

## Backend Architecture

Pattern is mostly:

- route file
- controller
- service
- repository/helpers where needed

Core backend folders:

- `server/routes`
- `server/controllers`
- `server/services`
- `server/middleware`
- `server/websocket`
- `server/db`
- `server/repositories`
- `server/utils`

## Auth Model

Authentication is session-cookie based.

- Passport local strategy
- `express-session`
- cookie name: `classscan.sid`
- cookie lifetime: 2 hours
- roles:
  - `professor`
  - `student`
  - `admin`

### Auth Endpoints

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

### Auth Behavior

- user logs in with username + password
- current user is returned with:
  - `id`
  - `email`
  - `username`
  - `display_name`
  - `role`
  - `must_change_password`
- student and professor portals are role-gated
- professor portal should not be advertised from the student login page

## Environment Variables

### Required

- `SESSION_SECRET`
  - required for session signing
- `DATABASE_URL`
  - main database connection
- `PG_SSL_REJECT_UNAUTHORIZED`
  - controls PG TLS validation
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

Note: the current codebase does not actively use the Supabase client in the main runtime path shown here, but these values exist in `.env.example` and should be preserved if rebuilding from the same baseline.

### Optional

- `QR_PAYLOAD_SECRET`
  - fallback is `SESSION_SECRET`
- `QR_OFFLINE_GRACE_SECONDS`
- `QR_TOKEN_TTL_SECONDS`
  - current effective default in code is `5`
- `QR_ROTATION_INTERVAL_SECONDS`
  - current effective default in code is `5`
- `PORT`
  - default `5000`
- `SESSION_COOKIE_SECURE`
- `SESSION_COOKIE_SAMESITE`
- `CORS_ORIGIN`
  - comma-separated allowed origins
- `VITE_API_BASE_URL`
  - frontend API base
- `VITE_WS_URL`
  - frontend websocket base
- `AUTO_BOOTSTRAP_USERS`
- `PROFESSOR_USERNAME`
- `PROFESSOR_EMAIL`
- `PROFESSOR_PASSWORD`
- `PROFESSOR_DISPLAY_NAME`
- `STUDENT_USERNAME`
- `STUDENT_EMAIL`
- `STUDENT_PASSWORD`
- `STUDENT_DISPLAY_NAME`
- `ADMIN_USERNAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_DISPLAY_NAME`
- `SENTRY_DSN`
- `SENTRY_TRACES_SAMPLE_RATE`
- `VITE_HMR_CLIENT_PORT`

## Database Model

This app is strongly relational. The main entities are below.

### Users / Accounts

- `users`
  - base user table
  - role: professor/student/admin
  - login identity
  - password hash
  - `must_change_password`
  - `created_by_professor_id`
  - `last_login_at`

- `professor_profiles`
- `account_credentials`

### Academic Structure

- `courses`
  - owned by professor
  - fields: `code`, `name`, `term`, `description`, `device_binding_enabled`

- `groups`
  - belongs to course
  - fields: `name`, `meeting_schedule`

- `enrollments`
  - student in course/group

### Attendance Runtime

- `sessions`
  - one live class occurrence
  - belongs to course and group
  - fields: `starts_at`, `ends_at`, `is_active`, `status`

- `attendance_rounds`
  - each session can have multiple rounds
  - only one active round at a time
  - fields:
    - `round_number`
    - `starts_at`
    - `ends_at`
    - `is_active`
    - `geofence_enabled`
    - `geofence_radius_m`
    - `latitude`
    - `longitude`
    - `is_break_round`

- `qr_tokens`
  - hashed short-lived tokens per round
  - fields:
    - `token_hash`
    - `expires_at`
    - `consumed`

- `attendance_records`
  - one student can only record once per round
  - fields:
    - `status` (`on_time` or `late`)
    - `recorded_at`
    - `qr_token_id`
    - `device_fingerprint`
    - `recorded_latitude`
    - `recorded_longitude`
    - `client_scan_id`
    - `recorded_at_client`

### Excuses / Policy / Audit / Fraud

- `excuse_requests`
- `audit_logs`
- `fraud_signals`
- `attendance_policies`
- `attendance_policy_history`
- `course_policy_assignments`

## API Surface

### Health

- `GET /api/health`

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

### Professor APIs

- `GET /api/professor/courses`
- `POST /api/professor/courses`
- `DELETE /api/professor/courses/:courseId`
- `POST /api/professor/courses/:courseId/groups`
- `POST /api/professor/groups/:groupId/sessions`
- `POST /api/professor/sessions/:sessionId/rounds`
- `PATCH /api/professor/sessions/:sessionId/rounds/:roundId/end`
- `PATCH /api/professor/sessions/:sessionId/end`
- `GET /api/professor/sessions/:sessionId`
- `GET /api/professor/sessions/:sessionId/stats`
- `GET /api/professor/sessions/:sessionId/export`
- `GET /api/professor/sessions/:sessionId/excuses`
- `PATCH /api/professor/excuses/:excuseId/approve`
- `PATCH /api/professor/excuses/:excuseId/reject`
- `GET /api/professor/excuses/:excuseId/attachment`
- `GET /api/professor/sessions/:sessionId/analytics`
- `GET /api/professor/sessions/:sessionId/analytics/export`
- `GET /api/professor/attendance-log/dates`
- `GET /api/professor/attendance-log`
- `GET /api/professor/attendance-log/export`
- `POST /api/professor/users`
- `GET /api/professor/users`
- `PATCH /api/professor/users/:userId`
- `PATCH /api/professor/users/:studentId/password`
- `GET /api/professor/reports/accounts/export`
- `GET /api/professor/reports/attendance/export`
- `POST /api/professor/roster-files`
- `POST /api/professor/roster-files/import`
- `GET /api/professor/roster-files`
- `GET /api/professor/roster-files/:fileName`

### Student APIs

- `POST /api/rounds/:roundId/scans`
- `GET /api/me/attendance`
- `GET /api/me/attendance/history`
- `GET /api/me/enrollments`
- `POST /api/me/excuses`
- `GET /api/me/excuses`
- `GET /api/me/excuses/:excuseId/attachment`

### Admin APIs

- `GET /api/admin/policies`
- `POST /api/admin/policies`
- `PATCH /api/admin/policies/:policyId`
- `POST /api/admin/policies/:policyId/assign/course/:courseId`

## WebSocket / Live Update Model

WebSockets are professor-session-only.

### Connection

- client connects using `sessionId` query param
- server validates:
  - active session cookie
  - logged-in user
  - user role is professor
  - professor owns that session

### WebSocket Events

- `round:started`
- `round:qr-updated`
- `round:closed`
- `session:refresh`
- `session:ended`

### Important Payloads

- `round:qr-updated`
  - `sessionId`
  - `roundId`
  - `token`
  - `expiresAt`
  - `qrPayload`

- `session:refresh`
  - `reason`:
    - `round_started`
    - `round_closed`
    - `scan_recorded`
    - `excuse_submitted`
    - `excuse_reviewed`
  - may also include:
    - `studentId`
    - `studentName`
    - `status`
    - `recordedAt`

### Fallback Strategy

Because realtime may be unstable in some deployments, the professor session screen also polls:

- session detail every 5 seconds
- stats every 3 seconds

## Attendance Logic

This is the most important business logic in the app.

+--------------------------------------+
|                                      |
|  __  __  ______  __  __   ____       |
| |  \/  ||  ____||  \/  | / __ \      |
| | \  / || |__   | \  / || |  | |     |
| | |\/| ||  __|  | |\/| || |  | |     |
| | |  | || |____ | |  | || |__| |     |
| |_|  |_||______||_|  |_| \____/      |
|                                      |
+--------------------------------------+

▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄ 
 █  █▀▄▀█  █▀▀▀▀  █▀▄▀█  ▄▀▀▄  █
 █  █ █ █  █▀▀▀   █ █ █  █  █  █
 █  █   █  █▄▄▄▄  █   █  ▀▄▄▀  █
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀


 ╔══════════════════════════════════════════╗
║  __  __   ______   __  __    ____        ║
║ |  \/  | |  ____| |  \/  |  / __ \       ║
║ | \  / | | |__    | \  / | | |  | |      ║
║ | |\/| | |  __|   | |\/| | | |  | |      ║
║ | |  | | | |____  | |  | | | |__| |      ║
║ |_|  |_| |______| |_|  |_|  \____/       ║
╚══════════════════════════════════════════╝


__________________________________________________________________________
 /                                                                          \
|   ███╗   ███╗ ███████╗ ███╗   ███╗  ██████╗                                |
|   ████╗ ████║ ██╔════╝ ████╗ ████║ ██╔═══██╗                               |
|   ██╔████╔██║ █████╗   ██╔████╔██║ ██║   ██║                               |
|   ██║╚██╔╝██║ ██╔══╝   ██║╚██╔╝██║ ██║   ██║                               |
|   ██║ ╚═╝ ██║ ███████╗ ██║ ╚═╝ ██║ ╚██████╔╝                               |
|   ╚═╝     ╚═╝ ╚══════╝ ╚═╝     ╚═╝  ╚═════╝                                |
 \__________________________________________________________________________/
    ╚════════════════════════════════════════════════════════════════════╝



╔═══════════════════════════════════════════════════════════════════════════╗
 ║                                                                           ║
 ║   ███╗   ███╗  ███████╗  ███╗   ███╗   ██████╗        _   _   _   _       ║
 ║   ████╗ ████║  ██╔════╝  ████╗ ████║  ██╔═══██╗      / \ / \ / \ / \      ║
 ║   ██╔████╔██║  █████╗    ██╔████╔██║  ██║   ██║     ( M | E | M | O )     ║
 ║   ██║╚██╔╝██║  ██╔══╝    ██║╚██╔╝██║  ██║   ██║      \_/ \_/ \_/ \_/      ║
 ║   ██║ ╚═╝ ██║  ███████╗  ██║ ╚═╝ ██║  ╚██████╔╝                           ║
 ║   ╚═╝     ╚═╝  ╚══════╝  ╚═╝     ╚═╝   ╚═════╝       [ TAHA IMHAMED ]     ║
 ║                                                                           ║
 ╚═══════════════════════════════════════════════════════════════════════════╝
  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░


▟████████████████████████████████████████████████████████████████████████████▙
 █  SYS_LOAD: [■■■■■■■■■□□] 82%  |  NODE: TIRANA_ALB_SRV  |  SEC_LVL: HIGH   █
 █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
 █  ┌─[ ADDRESS ]──┐                                     ┌─[ STACK_INFO ]──┐ █
 █  │  0x7FFD5A1   │  ███╗   ███╗  ███████╗  ███╗   ███╗  │ FULL_STACK: YES │ █
 █  │  0x7FFD5A8   │  ████╗ ████║  ██╔════╝  ████╗ ████║  │ CYBER_SEC: ACT  │ █
 █  │  0x7FFD5B2   │  ██╔████╔██║  █████╗    ██╔████╔██║  │ DB: SUPABASE    │ █
 █  │  0x7FFD5BC   │  ██║╚██╔╝██║  ██╔══╝    ██║╚██╔╝██║  │ LANG: C#/PY/JS  │ █
 █  │  0x7FFD5C0   │  ██║ ╚═╝ ██║  ███████╗  ██║ ╚═╝ ██║  └─────────────────┘ █
 █  └──────────────┘  ╚═╝     ╚═╝  ╚══════╝  ╚═╝     ╚═╝   ██████╗           █
 █                                                        ██╔═══██╗          █
 █   [ IDENTITY ]: < TAHA_IMHAMED />                      ██║   ██║          █
 █   [ STATUS   ]: ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░ 98%        ╚██████╔╝          █
 █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█
 █  PORT_SCAN: [ ACTIVE ]  |  U-PORTAL_DEV: [ ON ]  |  ENC: AES-256-GCM      █
 ▙████████████████████████████████████████████████████████████████████████████▛
   ╚═╦════════════════════════════════════════════════════════════════════╦═╝
     ║  [  M A I N F R A M E  ]            [  E S T . 2 0 2 6  ]          ║
     ╠════════════════════════════════════════════════════════════════════╣
     ║  > sudo access granted...                                          ║
     ║  > kernel initialized...                                           ║
     ╚════════════════════════════════════════════════════════════════════╝


     
### Session and Round Logic

- professor starts a session for a group
- session immediately opens round 1
- starting a new round automatically closes any current active round
- rounds can be normal or `break round`
- professor can manually close round
- professor can end session

### QR Token Logic

- QR token is stored as SHA-256 hash in DB
- raw token is only sent to client
- QR payload is signed with HMAC-SHA256
- signed payload includes:
  - `roundId`
  - `token`
  - `issuedAt`
  - `expiresAt`
  - `signature`

### Current QR Timing

- QR token TTL default: 5 seconds
- QR rotation scheduler default: 5 seconds
- QR also rotates after each successful scan
- expired tokens are cleaned up periodically

### Scan Validation Rules

Student scan flow validates:

- student role
- round exists and is active
- session exists and is active
- student enrolled in target group
- student has not already recorded attendance for that round
- token exists for that round
- token not already consumed
- token not expired
- QR signature matches
- QR timestamps are valid
- optional offline capture time is within allowed skew/grace
- optional geofence passes when enabled

### Atomic / Anti-Reuse Behavior

- successful scan consumes the token
- token cannot be reused
- if already consumed, reject
- after save, generate fresh token and emit live update

### Attendance Status Logic

- compare current time against round start time
- apply active attendance policy
- calculate late threshold
- mark record as:
  - `on_time`
  - `late`

### Fraud / Security Signals

The system emits signals for suspicious behavior such as:

- rapid burst scans
- GPS clustering
- edge-of-threshold scans
- multiple devices for same student when device binding is enabled

## Professor Dashboard Behavior

The dashboard should include:

- course cards
- start session CTA
- live session badge
- create course form
- attendance log by date
- CSV export
- course delete action with confirmation

Each course card should show:

- course code
- course name
- term or meeting schedule
- total student count
- live session state

## Professor Session Screen Behavior

This page is the main live control center.

It should show:

- course/group/session header
- QR code card
- QR expiration countdown
- live attendee count
- progress bar
- recent scans box (`Just Scanned`)
- top or saved scans list
- excuse requests list
- start new round
- close round
- end session
- break round toggle
- security note

The QR code must update automatically every 5 seconds while session is active.

The `Just Scanned` box should show the latest scan entries with:

- student name
- round number
- scan time
- attendance status

## Student Scan Screen Behavior

This page should let the student:

- fetch their enrollments
- choose the class/group
- open mobile/desktop camera scanner
- parse QR payload
- submit attendance scan with optional metadata
- see duplicate/expired/invalid-token errors
- handle forced password change
- redirect to login if session expires

## Professor Roster / Account Management

Professor should be able to:

- create student/professor accounts
- list managed users
- edit managed users
- reset student password
- upload roster files
- import roster accounts from upload
- download uploaded roster files
- export managed student accounts

## Admin Policy Logic

Admin can define attendance policies and assign them to courses.

Policy system supports scoped policy resolution:

- global
- faculty
- course

Policies influence attendance decisions such as:

- grace minutes
- late threshold for first hour
- late threshold for break round

## File Upload Logic

There are two file-upload use cases:

- student excuse attachments
- professor roster spreadsheet uploads

Uploads are stored in local filesystem-backed directories under the project.

## Logging / Error Handling / Security

### Logging

- API requests logged with method, path, status, duration
- sensitive keys redacted:
  - `token`
  - `password`
  - `rawToken`
  - `qrPayload`
  - `qrSignature`

### Security Middleware

- global API rate limiter
- login rate limiter
- scan rate limiter
- role-based route guards
- Helmet in production
- custom CORS with credentials

### Monitoring

- Sentry optional

## Build / Run Commands

- `npm run dev`
  - backend dev server
- `npm run dev:client`
  - standalone Vite client dev
- `npm run build`
- `npm run start`
- `npm run check`
- `npm run test`
- `npm run db:push`
- `npm run bootstrap:admin`
- `npm run user:set-role`

## Rebuild Requirements For Codex

If recreating this as a new app, keep these requirements:

1. Use React + TypeScript frontend and Express + TypeScript backend.
2. Keep session-cookie auth, not token-only auth.
3. Keep professor/student/admin roles.
4. Keep the pastel green academic dashboard theme.
5. Use hash-based client routing unless intentionally migrating.
6. Preserve all professor/student/admin route behavior.
7. Preserve QR signing, hashed token storage, token consumption, and live rotation.
8. Preserve live professor updates via WebSocket with polling fallback.
9. Preserve attendance policy logic and fraud signal generation.
10. Preserve exports, excuses, roster uploads, and account management.
11. Preserve course deletion behavior with proper dependent cleanup order.
12. Preserve the current security posture around:
    - expiring QR tokens
    - one scan per round
    - geofence support
    - device fingerprint checks
    - rate limiting

## Suggested Prompt Seed

Use something close to this when asking Codex to rebuild it:

> Build a full-stack attendance management app for professors and students. Use React + TypeScript + Vite on the frontend and Express + TypeScript + Drizzle ORM on the backend. Use session-cookie authentication with professor, student, and admin roles. Professors must be able to create/delete courses, manage groups and rosters, start live attendance sessions, generate signed QR codes that rotate every 5 seconds, track live attendees and recent scans in real time via WebSockets with polling fallback, review excuses, manage accounts, and export attendance reports. Students must be able to log in, view enrollments, scan a live QR code, submit excuses, and see attendance history. Use a soft pastel green academic dashboard design with glass-card panels, rounded surfaces, and subtle motion. Store QR tokens hashed in the database, verify signed QR payloads, consume tokens atomically, support geofencing, attendance policies, and fraud detection signals. Recreate the API routes, database relationships, and behavior described in app.md.
