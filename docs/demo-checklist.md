# Professor demo checklist

1. **Login as professor**
   - `POST /api/auth/login` with `{ username: "professor", password: "Prof#1234" }`.
   - Keep the returned user and session cookie for all following requests.
2. **Start a group session**
   - `POST /api/groups/<groupId>/sessions` to create the session; capture the `sessionId`.
   - Open a WebSocket to `ws://localhost:5000/?sessionId=<sessionId>` to receive round updates.
3. **Start a new attendance round**
   - `POST /api/sessions/<sessionId>/rounds`; WebSocket should emit `round:started` and `round:qr-updated`.
4. **Student scan**
   - Student logs in via `POST /api/auth/login` with the seeded credentials.
   - Student POSTs `{ token: "<current QR token>" }` to `/api/rounds/<roundId>/scans`.
   - Professor WebSocket immediately receives another `round:qr-updated` with a fresh token.
5. **Check attendance stats**
   - Professor GETs `/api/professor/sessions/<sessionId>/stats` to see per-round counts, student totals, and aggregate numbers.
   - Student GETs `/api/me/attendance` to verify their percentage.
6. **End the session**
   - `PATCH /api/sessions/<sessionId>/end`; WebSocket emits `session:ended`.
   - Confirm no further rounds/QRs can be started (the endpoint will reject them).
