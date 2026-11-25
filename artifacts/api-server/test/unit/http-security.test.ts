import { describe, expect, it, vi } from "vitest";
import {
  createRateLimiter,
  isOriginAllowed,
  parseAllowedOrigins,
  securityHeaders,
} from "../../src/middlewares/httpSecurity";

function mockResponse() {
  const headers: Record<string, string> = {};
  const res: any = {
    headers,
    statusCode: 200,
    body: undefined,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

describe("CORS origin allowlist", () => {
  it("allows same-origin requests with no Origin header", () => {
    expect(isOriginAllowed(undefined, [], "production")).toBe(true);
  });

  it("allows explicitly configured origins in production", () => {
    expect(isOriginAllowed("https://app.example.com", ["https://app.example.com"], "production")).toBe(true);
    expect(isOriginAllowed("https://evil.example.com", ["https://app.example.com"], "production")).toBe(false);
  });

  it("allows loopback origins only outside production", () => {
    expect(isOriginAllowed("http://localhost:5173", [], "development")).toBe(true);
    expect(isOriginAllowed("http://localhost:5173", [], "production")).toBe(false);
  });

  it("parses a comma-separated allowlist and drops empty entries", () => {
    expect(parseAllowedOrigins(" https://a.example , ,https://b.example ")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });
});

describe("rate limiter", () => {
  it("rejects requests above the configured window limit", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const req: any = { ip: "203.0.113.10", socket: { remoteAddress: "203.0.113.10" } };

    const first = mockResponse();
    const firstNext = vi.fn();
    limiter(req, first, firstNext);

    const second = mockResponse();
    const secondNext = vi.fn();
    limiter(req, second, secondNext);

    expect(firstNext).toHaveBeenCalledOnce();
    expect(first.statusCode).toBe(200);
    expect(secondNext).not.toHaveBeenCalled();
    expect(second.statusCode).toBe(429);
    expect(second.body).toEqual({ error: "Too many requests" });
    expect(second.headers["retry-after"]).toBeDefined();
  });

  it("tracks separate clients independently", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    const a = mockResponse();
    const aNext = vi.fn();
    limiter({ ip: "198.51.100.1", socket: {} } as any, a, aNext);

    const b = mockResponse();
    const bNext = vi.fn();
    limiter({ ip: "198.51.100.2", socket: {} } as any, b, bNext);

    expect(aNext).toHaveBeenCalledOnce();
    expect(bNext).toHaveBeenCalledOnce();
    expect(b.statusCode).toBe(200);
  });
});

describe("security headers", () => {
  it("sets baseline browser hardening headers", () => {
    const res = mockResponse();
    const next = vi.fn();

    securityHeaders({} as any, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers["permissions-policy"]).toContain("camera=()");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
});
