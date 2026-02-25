# Hybrid Deployment Plan

## 1. Local deployment (classroom)

1. **Install & run Postgres locally**
   - Install PostgreSQL via your platform package manager (Homebrew, apt, Chocolatey).
   - Create database `classscan` and user matching `.env.local`.
   - Example commands:
     ```sh
     createdb classscan
     createuser classscan_user --pwprompt
     psql -c "GRANT ALL PRIVILEGES ON DATABASE classscan TO classscan_user;"
     ```

2. **`.env.local`**
   ```env
   DATABASE_URL=postgres://classscan_user:password@0.0.0.0:5432/classscan
   SESSION_SECRET=local-secret-very-long
   PORT=5000
   FRONTEND_URL=http://192.168.1.100:5173
   WS_URL=ws://192.168.1.100:5000
   ```
   - Use the host machine’s LAN IP (`ifconfig`/`ipconfig`) instead of `localhost` so phones can reach it.

3. **Migrations & verification**
   ```sh
   set -a && source .env.local && set +a
   npx drizzle-kit generate --config ./drizzle.config.ts --name init
   npx drizzle-kit push --config ./drizzle.config.ts
   psql "$DATABASE_URL" -c '\dt'
   ```
   - Confirm tables listed: `users`, `courses`, `groups`, `enrollments`, `sessions`, `attendance_rounds`, `qr_tokens`, `attendance_records`, `session`.
   - If `connect-pg-simple` session table missing, run `psql "$DATABASE_URL" -f node_modules/connect-pg-simple/table.sql`.

4. **Seed data**
   ```sh
   npx tsx script/seed.ts
   ```
   - Console output:
     ```
     seed complete:
     professorId: <uuid>
     studentId: <uuid>
     courseId: <uuid>
     groupId: <uuid>
     enrollmentId: <uuid>
     ```

5. **Run backend + frontend**
   ```sh
   npm run dev          # backend (port 5000)
   npm run dev:client   # frontend (port 5173)
   ```
   - Ensure frontend uses `http://192.168.1.100:5000/api` and `ws://192.168.1.100:5000/?sessionId=...` with `credentials: "include"`.
   - Students connect to `http://192.168.1.100:5173` from their devices on the Wi-Fi network.
   - For cookies, `SESSION_SECRET` ensures signed cookies; HTTP-only and `SameSite=Lax` is fine for local demo.

6. **Troubleshooting**
   - `psql` connection fails: ensure Postgres listening on `0.0.0.0` and firewall allows port 5432.
   - Clients cannot reach server: double-check IP, firewall, and use `curl http://192.168.1.100:5000/api/auth/me`.
   - WebSocket rejects: confirm professor logged in first so session cookie is set; ensure WS URL matches host/IP.

## 2. Cloud demo (Railway backend + managed Postgres, Vercel frontend)

1. **Backend deployment**
   - Push repo to GitHub. On Railway, create new project > “Deploy from GitHub” and link repo.
   - Set environment vars in Railway (Settings):
     ```
     DATABASE_URL=postgresql://railway:<password>@containers.<id>.railway.app:<port>/railway
     SESSION_SECRET=<very-long-secret>
     PORT=5000
     FRONTEND_URL=https://your-vercel-app.vercel.app
     WS_URL=wss://your-railway-domain
     ```
   - Railway auto-provisions Postgres; copy the connection string to `DATABASE_URL`.
   - Use Railway migrations console: `npx drizzle-kit push --config ./drizzle.config.ts` (Railway runs commands during deployment; add `drizzle-kit push` to `scripts.postdeploy` or run via Railway Shell).
   - Create session table: `psql "$DATABASE_URL" -f node_modules/connect-pg-simple/table.sql` via Railway Shell if needed.
   - Seed: run `npx tsx script/seed.ts` in Railway Shell (ensuring env vars loaded).

2. **Cookie & CORS settings**
   - Enable HTTPS: Railway provides TLS. Set cookies with `secure: true` in production (already configured via `sessionMiddleware` using `process.env.NODE_ENV === "production"`).
   - In frontend requests, `credentials: "include"`, and backend should set `res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL)` before `app.use` or via `cors` middleware.
   - Set `SameSite=None` for cookies in production if calling from different domain.

3. **WebSocket setup**
   - Use Railway domain: `wss://<project>.up.railway.app/?sessionId=...`.
   - If Railway puts WebSocket behind a proxy, ensure `ws` server is bound to the same port (5000) and Railway health check allows upgrade.
   - Frontend (Vercel) connects to that `wss://` URL using the same session cookie (requires `credentials: "include"` on initial login call so browser stores the cookie on the Railway domain via `Set-Cookie` with `Domain=<railway-domain>`).

4. **Frontend deployment**
   - Deploy Vite app to Vercel. Set `VERCEL_ENV=production` and an env var `VITE_API_BASE_URL=https://<railway-domain>/api`.
   - Ensure all fetches use `import.meta.env.VITE_API_BASE_URL` and `credentials: "include"`.
   - For WebSocket, derive endpoint from a new env var `VITE_WS_URL=wss://<railway-domain>` and append `?sessionId=...`.

5. **CORS + security**
   - Railway backend should either use `cors` middleware whitelist or manually set `Access-Control-Allow-Origin` to the frontend URL.
   - Cookies must include `SameSite=None; Secure; HttpOnly`.

## 3. Hybrid architecture (text diagram)

```
                                  +---------------------+
            +-------------+       |  Cloud Postgres     |
            | Frontend on |<----->|  (Railway managed)  |
            | Vercel      |       +---------------------+
                 ^                 ^
                 |                 |
 (HTTPS + cookies|)             (HTTPS + secure cookies)
                 |                 |
         +--------------------------+
         | Railway backend           |
         | (Express + ws + Drizzle)  |
         +--------------------------+
                ^               ^
                |               |
    Local Wi-Fi |               | Local (LAN IP)
                v               |
         +--------------------------+
         | Local deployment          |
         | Postgres + Express + Vite |
         +--------------------------+
               ^
               |
          Students on Wi-Fi
```

## 4. Demo-day checklist

1. Load `.env.local`, run migrations/seeds, start backend + frontend.
   ```sh
   set -a && source .env.local && set +a
   npx drizzle-kit generate --config ./drizzle.config.ts --name init
   npx drizzle-kit push --config ./drizzle.config.ts
   psql "$DATABASE_URL" -c '\dt'
   npx tsx script/seed.ts
   npm run dev
   npm run dev:client
   ```
2. Confirm frontend reachable at `http://<host-ip>:5173` and API at `http://<host-ip>:5000/api`.
3. Open console: login as professor, start session/round, connect WebSocket to `ws://<host-ip>:5000/?sessionId=...`.
4. Student login on phone, scan token; expect `round:qr-updated` and stats endpoint responses.
5. Troubleshoot quickly:
   - `curl http://<host-ip>:5000/api/auth/me` to verify backend reachable.
   - If QR does not rotate, check backend logs for token errors.
   - If cookies missing, inspect browser dev tools to ensure `Set-Cookie` response and `credentials: include`.

## 5. Deployment summary paragraph

ClassScan Attend supports a hybrid rollout: for real classrooms, a professor runs the backend+frontend locally on a laptop with Postgres while students connect over the campus LAN, ensuring QR workflows remain entirely on-premise. For academic demos, the same codebase deploys to Railway (backend + managed Postgres) and Vercel (frontend), where HTTPS, secure cookies, and WebSocket upgrades propagate rotated QR tokens to the professor’s device while students consume REST endpoints. Both environments reuse the Drizzle schema, session-based auth, and QR rotation services—only the `.env` files (`.env.local` vs. `.env.demo`) and base URLs differ.
