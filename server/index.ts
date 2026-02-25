import * as dotenvSafe from "dotenv-safe";
dotenvSafe.config();

import express, { type Request, Response, NextFunction } from "express";
import passport from "passport";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { sessionMiddleware } from "./middleware/session";
import "./passport/localStrategy";
import { setupWebSocketServer } from "./websocket/server";
import { initSentry, Sentry } from "./monitoring/sentry";
import { globalRateLimiter } from "./middleware/rateLimit";
import helmet from "helmet";
import { cleanupExpiredTokens } from "./services/qrService";
import { bootstrapUsersFromEnv } from "./services/bootstrapService";

initSentry();
import { logger } from "./utils/logger";

const app = express();
const httpServer = createServer(app);

// Trust the first proxy (e.g., Nginx, Caddy)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use("/api", globalRateLimiter);

if (process.env.NODE_ENV === "production") {
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:", "https:", "http:"],
      },
    }),
  );
}

const SENSITIVE_KEYS = new Set(["token", "password", "rawToken", "qrPayload"]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce(
      (acc, [key, v]) => {
        if (SENSITIVE_KEYS.has(key)) {
          acc[key] = "[redacted]";
        } else {
          acc[key] = redact(v);
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }

  return value;
}

app.use((req, res, next) => {
  const start = Date.now();
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path.startsWith("/api")) {
      logger.info("request completed", {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
        response:
          res.statusCode >= 400 && capturedJsonResponse
            ? redact(capturedJsonResponse)
            : undefined,
      });
    }
  });

  next();
});

// Schedule periodic cleanup of expired QR tokens
setInterval(() => {
  cleanupExpiredTokens().catch((error) => {
    logger.error("Failed to clean up expired QR tokens", { error });
  });
}, 1000 * 60 * 60); // Every hour

async function bootstrap() {
  await bootstrapUsersFromEnv();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const code = err.code;

    if (Sentry.isInitialized()) {
      Sentry.captureException(err);
    }

    res.status(status).json(code ? { message, code } : { message });
    logger.error("request failed", {
      statusCode: status,
      error: err,
    });
  });
  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Setup WebSocket after Vite so Vite's HMR upgrade handler is registered first
  setupWebSocketServer(httpServer);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const listenOptions =
    process.platform === "win32"
      ? { port, host: "0.0.0.0" }
      : { port, host: "0.0.0.0", reusePort: true };

  httpServer.listen(listenOptions, () => {
    logger.info(`serving on port ${port}`);
  });
}

bootstrap();
