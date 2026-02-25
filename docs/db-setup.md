# DB Wiring & Drizzle Migrations

1. **Environment variables** (use `.env` or export):
   ```
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.hreaewzyaotvbuvwrlub.supabase.co:5432/postgres
   SESSION_SECRET=very-secret-string
   PORT=5000
   ```
   Keep `SESSION_SECRET` long and random so `express-session` cookies remain secure.

   Run `set -a && source .env && set +a` (or `source .env` on mac/linux) before running the commands below so `DATABASE_URL` is available to both Drizzle and the server. On Windows PowerShell use `Get-Content .env | Foreach-Object { if ($_ -match "=") { $parts = $_ -split "=",2; Set-Item -Path Env:$($parts[0]) -Value $parts[1] } }`.

2. **Drizzle config** (`drizzle.config.ts` already points to `./shared/schema.ts`, uses `DATABASE_URL`, and stores migrations in `./migrations`. If you need another driver, adjust `dialect` accordingly.)

3. **Generating migrations**:
   - Install `drizzle-kit` (already in devDependencies).
   - From the repo root (and after loading `.env`), run:
     ```
     npx drizzle-kit generate --config ./drizzle.config.ts --name init
     ```
   - Inspect the generated SQL in `migrations/` to verify the tables match `shared/schema.ts`.
   - Apply the migration:
     ```
     npx drizzle-kit push --config ./drizzle.config.ts
     ```
     or `npm run db:push`.

4. **Runtime DB access**:
   - `server/db/index.ts` exports a `drizzle` instance that reuses the database backed by `DATABASE_URL`.
   - If `DATABASE_URL` starts with `postgres://` or `postgresql://`, the server uses Postgres (Supabase-compatible).
   - If `DATABASE_URL` starts with `sqlite:` or `file:`, SQLite is used and hardened with WAL mode and a busy timeout.
   - Import `db` and the shared schema wherever you need to query the database.

5. **Session table**:
   - Postgres uses `connect-pg-simple` and requires the `session` table. Run the SQL at `node_modules/connect-pg-simple/table.sql` against your database if the table is missing.
   - SQLite uses `connect-sqlite3`. Ensure the `sessions.sqlite` file is writable.

6. **Seeding**:
   - Run `npx tsx script/seed.ts` (after loading `.env`) to insert the professor/student/course/group/enrollment combo. The script is idempotent and will output the created IDs.

7. **Verify tables**:
   - Use any SQLite client to ensure `users`, `courses`, `groups`, `enrollments`, `sessions`, `attendance_rounds`, `qr_tokens`, and `attendance_records` tables exist.
