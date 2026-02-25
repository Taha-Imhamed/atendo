process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file::memory:?cache=shared";
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret";
