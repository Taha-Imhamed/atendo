# Presentation Materials

## Executive Summary (for Academic Panel)

ClassScan Attend replaces paper and Excel-based attendance with a secure, real-time QR workflow that respects local network constraints. Professors host course-specific groups, open sessions, and run multiple attendance rounds during each lecture, while students scan rotating QR tokens that are never exposed to them. The backend validates every scan, prevents replays, and instantly pushes a new QR to the professor’s device so attendance cannot be shared or skipped. Attendance percentages are available to students, and professors see per-round and per-student statistics in real time.

## Excel vs QR Attendance

| Metric | Excel/Manual | ClassScan Attend (QR) |
| --- | --- | --- |
| Time to record attendance | Minutes per lecture (collect sheets, type totals) | Seconds per scan; auto-rotating QR removes manual entry |
| Accuracy | Prone to human typo, proxy sign-ins | Server-validated tokens, one scan per round ensures data integrity |
| Security | Sheets can be copied/forged, shared | Tokens hashed, consumed, expire instantly; only professor socket sees them |

## Project Conclusion (Academic Tone)

ClassScan Attend demonstrates how QR technology, session-aware WebSockets, and Drizzle + PostgreSQL can modernize lecture attendance without forfeiting control or privacy. The architecture enforces academic policies—students belong to one group per course, each round supports only one scan per student, and every token rotation is audited and time-bound. Session-based authentication preserves the simplicity of cookies while enabling real-time updates across the professor’s device, yielding a robust platform ready for demonstration or campus deployment.

## Future Work Suggestions

1. Mobile app for students to scan and view attendance directly, reducing reliance on web browsers.  
2. Facial verification or liveness checks before allowing a scan, adding biometric proof of physical presence.  
3. LMS integration (Canvas/Blackboard) to automatically sync courses, enrollments, and attendance grades.

## Grading Rubric Mapping

| Feature | Learning Outcome |
| --- | --- |
| QR rotation per scan + WebSocket broadcasting | Real-time systems and replay-resistant protocols |
| Drizzle ORM schema with relational constraints | Data modeling and integrity enforcement |
| Session-based auth + role guards | Secure authentication/authorization flows |
| Stats endpoints + demo script | API design and measurable outcomes |
| Deployment/migration docs + seed script | Reproducible environment setup and testing |
