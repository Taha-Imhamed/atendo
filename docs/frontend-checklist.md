## Frontend integration checklist

1. **API base URL**
   - Point every request to `http://localhost:5000/api` (or the hostname matching your server).
   - Example: `fetch(`${API_BASE_URL}/auth/login`, {...})`.

2. **Include cookies**
   - All `fetch`/`axios` calls must use `credentials: "include"` (or `withCredentials` with Axios) to forward the `express-session` cookie.
   - This applies to login/logout, course/session management, scan submission, and stats retrieval.

3. **WebSocket connection**
   - Establish a `ws://localhost:5000/?sessionId=<SESSION_ID>` connection from the professor UI once a session is active.
   - The server expects the same session cookie used for authenticated REST calls, so establish the socket after login.
   - Subscribe to events: `round:started`, `round:qr-updated`, and `session:ended`, and render the QR from the `token` field inside `round:qr-updated`.

No UI rewrites are required—only update the URLs/credentials handling so the frontend consumes the new backend surface.
