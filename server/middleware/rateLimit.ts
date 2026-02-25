import rateLimit from "express-rate-limit";

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId ?? req.ip ?? "anonymous";
  },
  handler: (_req, res) => {
    res.status(429).json({ message: "Too many requests. Please try again later." });
  },
});

export const loginRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const username =
      typeof req.body?.username === "string" ? req.body.username : "unknown";
    return `${req.ip ?? "unknown"}:${username}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      message: "Too many login attempts. Please wait a bit and try again.",
    });
  },
});

export const scanRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.id;
    return userId ?? req.ip ?? "anonymous";
  },
  handler: (_req, res) => {
    res
      .status(429)
      .json({ message: "Too many scans detected. Please try again in a minute." });
  },
});
