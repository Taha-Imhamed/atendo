type LogLevel = "info" | "warn" | "error" | "debug";

interface LogContext {
  userId?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  error?: unknown;
  [key: string]: unknown;
}

function formatContext(context: LogContext = {}) {
  const entries = Object.entries(context).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return "";
  }

  return entries
    .map(([key, value]) => {
      if (value instanceof Error) {
        return `${key}=${value.message}`;
      }
      if (typeof value === "object") {
        try {
          return `${key}=${JSON.stringify(value)}`;
        } catch {
          return `${key}=[unserializable]`;
        }
      }
      return `${key}=${String(value)}`;
    })
    .join(" ");
}

function log(level: LogLevel, message: string, context: LogContext = {}) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  const ctx = formatContext(context);
  if (ctx) {
    console.log(`${line} :: ${ctx}`);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext) => log("warn", message, context),
  error: (message: string, context?: LogContext) => log("error", message, context),
  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV === "development") {
      log("debug", message, context);
    }
  },
};
