# 5–7 Minute Academic Demo Script

1. **Intro (30s)**
   - “This is ClassScan Attend, a local QR-based attendance system.”
   - Mention professors and students run on the same LAN; no public internet.

2. **Professor login (30s)**
   - Call `POST /api/auth/login` with the seeded professor credentials.
   - Point out the session cookie enables both REST and WebSocket flows without JWT overhead.

3. **Start session + rounds (1 min)**
   - `POST /api/groups/<groupId>/sessions` begins the lecture for Group A.
   - Open `ws://localhost:5000/?sessionId=<sessionId>`; explain this WebSocket is auth-guarded and only the professor receives `round:started` and `round:qr-updated`.
   - `POST /api/sessions/<sessionId>/rounds` triggers round 1; show `round:qr-updated` with token and explain QR rotates every scan to prevent sharing.

4. **Student scan (1 min)**
   - Separate tab: `POST /api/auth/login` with student credentials.
   - Use the token from the last `round:qr-updated` event and `POST /api/rounds/<roundId>/scans`.
   - Watch the professor WebSocket immediately emit another `round:qr-updated`; emphasize the QR is never shown to students, only scanned data is sent.

5. **Explain rounds & groups (1 min)**
   - Highlight that each session can have multiple rounds (e.g., before/after breaks), and each round generates its own QR lifecycle.
   - Mention that students are enrolled in a specific group per course, so you only scan students registered in this group.

6. **Stats (45s)**
   - Hit `GET /api/professor/sessions/<sessionId>/stats` to show per-round attendance counts, student totals, and aggregated numbers.
   - Show `GET /api/me/attendance` as a student to demonstrate personal percentage.

7. **End session (30s)**
   - `PATCH /api/sessions/<sessionId>/end` closes the session, `session:ended` event fires, and further rounds or scans are rejected.
   - Recap: QR rotation, per-round/round-level stats, and student-specific views.
