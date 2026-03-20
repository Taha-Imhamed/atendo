# Evaluation Preparation

**Why WebSocket?**
- Because QR rotation must happen immediately after a scan and only the professor’s device can see the QR. WebSocket allows the server to push each new token within milliseconds without polling.

**Why sessions and rounds?**
- Sessions represent entire lectures per group; rounds represent discrete attendance checkpoints within the lecture (before/after labs or breaks). This mirrors real academic needs and lets you compute per-round attendance percentages.

**How is cheating prevented?**
- Each QR token is hashed, expires in 15 seconds, and is marked as consumed on scan. Students never see the QR—only the server and the professor’s authenticated socket do. Replay attempts are rejected via unique indexes and explicit API checks.

**Why session-based auth instead of JWT?**
- Sessions bind to the local network environment and allow reuse of the same cookie over REST and WebSocket upgrades, avoiding token exposure and simplifying cookie-based authentication for the demo.
