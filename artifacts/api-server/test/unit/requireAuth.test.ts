import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({ getAuth: vi.fn() }));

vi.mock("@clerk/express", () => ({ getAuth: clerk.getAuth }));

import { requireAuth } from "../../src/middlewares/requireAuth";

function createResponse() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
  };
  return res;
}

describe("requireAuth", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.DEV_AUTH_USER_ID;
    process.env.NODE_ENV = "test";
    clerk.getAuth.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 when no authenticated user is present", () => {
    clerk.getAuth.mockReturnValue(null);
    const req: any = {};
    const res = createResponse();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(req.userId).toBeUndefined();
  });

  it("accepts auth.userId", () => {
    clerk.getAuth.mockReturnValue({ userId: "user_123" });
    const req: any = {};
    const res = createResponse();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(req.userId).toBe("user_123");
    expect(next).toHaveBeenCalledOnce();
  });

  it("prefers sessionClaims.userId over auth.userId", () => {
    clerk.getAuth.mockReturnValue({
      userId: "user_from_session",
      sessionClaims: { userId: "user_from_claims" },
    });
    const req: any = {};

    requireAuth(req, createResponse(), vi.fn());

    expect(req.userId).toBe("user_from_claims");
  });

  it("rejects an empty user id", () => {
    clerk.getAuth.mockReturnValue({ userId: "" });
    const res = createResponse();

    requireAuth({} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("honours the dev bypass outside production", () => {
    process.env.DEV_AUTH_USER_ID = "dev_user";
    const req: any = {};

    requireAuth(req, createResponse(), vi.fn());

    expect(req.userId).toBe("dev_user");
    expect(clerk.getAuth).not.toHaveBeenCalled();
  });

  it("ignores the dev bypass in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DEV_AUTH_USER_ID = "dev_user";
    clerk.getAuth.mockReturnValue(null);
    const res = createResponse();

    requireAuth({} as any, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(clerk.getAuth).toHaveBeenCalled();
  });
});
