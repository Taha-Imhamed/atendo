import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import { logger } from "../utils/logger";

const SqliteStore = connectSqlite3(session);
const PgStore = connectPgSimple(session);

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required for express-session");
}

function parseBoolean(value: string | undefined) {
  if (value === undefined) return undefined;
  return value === "true" || value === "1";
}

const cookieSecure =
  parseBoolean(process.env.SESSION_COOKIE_SECURE) ??
  process.env.NODE_ENV === "production";

const sameSiteEnv = process.env.SESSION_COOKIE_SAMESITE;
const sameSite: session.CookieOptions["sameSite"] =
  sameSiteEnv === "none" || sameSiteEnv === "lax" || sameSiteEnv === "strict"
    ? sameSiteEnv
    : "lax";

if (sameSite === "none" && !cookieSecure) {
  logger.warn(
    "SESSION_COOKIE_SAMESITE=none requires SESSION_COOKIE_SECURE=true (modern browsers will reject the cookie).",
  );
}

if (process.env.NODE_ENV === "production" && !cookieSecure) {
  logger.warn(
    "SESSION_COOKIE_SECURE is disabled in production. Login will work over HTTP, but cookies are not protected by TLS.",
  );
}

const databaseUrl = process.env.DATABASE_URL;
const isPostgres =
  databaseUrl?.startsWith("postgres://") ||
  databaseUrl?.startsWith("postgresql://");
const pgSslRejectUnauthorized =
  parseBoolean(process.env.PG_SSL_REJECT_UNAUTHORIZED) ?? false;

const sessionStore = isPostgres
  ? (new PgStore({
      pool: new Pool({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: pgSslRejectUnauthorized },
      }),
    }) as unknown as session.Store)
  : (new SqliteStore({
      db: "sessions.sqlite",
      dir: "./",
    }) as unknown as session.Store);

export const sessionMiddleware = session({
  secret: sessionSecret,
  name: "classscan.sid",
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: cookieSecure,
    httpOnly: true,
    sameSite,
    maxAge: 1000 * 60 * 60 * 2,
  },
});

if (process.env.NODE_ENV !== "production") {
  logger.warn(
    isPostgres
      ? "Using Postgres session store."
      : "Using SQLite session store; intended for development only.",
  );
}
