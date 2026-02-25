# Optional Polish Notes

1. **Logging**
   - A request logger is already in place, but consider adding structured logs (JSON) for `round:qr-updated` events so you can trace QR rotation timing.
   - Capture warning logs when a scan is rejected (invalid/expired/duplicate tokens) to monitor potential abuse.

2. **Environment separation**
   - Use `.env.development` and `.env.demo` files with `dotenv` and switch via `NODE_ENV` to keep dev/demos isolated, especially for database URLs.
   - Consider a `server/config.ts` that picks connection settings per environment and fails fast if required vars are missing.

3. **UX notes**
   - Show a “Generating new QR…” indicator on the professor dashboard after every scan so the trainer knows the backend is working.
   - Add a disabled state for the scan button until the token is confirmed valid to avoid duplicate submissions.
