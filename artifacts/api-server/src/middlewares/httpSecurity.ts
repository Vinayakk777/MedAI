import type { NextFunction, Request, Response } from "express";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface HitWindow {
  count: number;
  resetAt: number;
}

/**
 * Small dependency-free fixed-window rate limiter. State is per process and is
 * swept lazily so an attacker cannot grow the map without bound.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, HitWindow>();
  let requestsSinceSweep = 0;

  const sweep = (now: number) => {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + options.windowMs };
      hits.set(key, entry);
    }
    entry.count++;

    if (++requestsSinceSweep >= 1000) {
      requestsSinceSweep = 0;
      sweep(now);
    }

    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, options.max - entry.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > options.max) {
      res.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))),
      );
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    next();
  };
}

/**
 * CORS is opt-in. Same-origin requests (no Origin header) and explicitly
 * configured origins are allowed; in non-production, loopback origins are
 * permitted for local development.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
  nodeEnv = process.env.NODE_ENV,
): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (nodeEnv !== "production") {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }
  return false;
}

export function parseAllowedOrigins(value = process.env.CORS_ALLOWED_ORIGINS): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
}
