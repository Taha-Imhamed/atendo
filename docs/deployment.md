# Local Deployment & Run Checklist

1. **Prerequisites**
   - Ensure PostgreSQL is running locally and you can connect with the credentials in `.env`. Example `.env`:
     ```
     DATABASE_URL=postgres://username:password@localhost:5432/classscan
     SESSION_SECRET=very-secret
     PORT=5000
     ```
   - Load it into the shell before running the following steps:
     ```bash
     set -a && source .env && set +a   # mac/linux
     # or manually export each variable on Windows
     ```

2. **Migrate**
   - Generate the initial migration (reflects `shared/schema.ts`):
     ```bash
     npx drizzle-kit generate --config ./drizzle.config.ts --name init
     ```
   - Apply the migration to Postgres:
     ```bash
     npx drizzle-kit push --config ./drizzle.config.ts
     ```

3. **Session table**
   - If `connect-pg-simple` complains about a missing `session` table, run:
     ```bash
     psql "$DATABASE_URL" -f node_modules/connect-pg-simple/table.sql
     ```

4. **Seed**
   - Run the idempotent seed script to create a professor, student, course, group, and enrollment:
     ```bash
     npx tsx script/seed.ts
     ```
   - The script logs IDs you can reuse in the UI (e.g., `groupId`, `sessionId`).

5. **Server**
   - Start Express + WebSocket: `npm run dev`
   - Confirm it logs `serving on port 5000`.

6. **Frontend**
   - Spin up the client: `npm run dev:client`
   - Update API base URL to `http://localhost:5000/api`, enable `credentials: "include"`, and connect to `ws://localhost:5000/?sessionId=<sessionId>`.

7. **Common failure points**
   - **Migrations fail**: check that `DATABASE_URL` is exported and the Postgres user can create tables.
   - **Session table missing**: forgot to load `connect-pg-simple` SQL.
   - **Seed errors**: run inside the same env as migrations so the hashed passwords match (seed reuses existing email entries).
   - **WebSocket rejects**: ensure the professor socket attaches to the same Express session cookie and `sessionId` matches an active session owned by that professor.
   - **Frontend can’t auth**: frontend must send `credentials: "include"` so cookies persist.
