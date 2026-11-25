import { describe, expect, it, vi } from "vitest";
import { validateBody, validateQuery } from "../../src/middlewares/validate";

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

function schema(result: any) {
  return { safeParse: vi.fn(() => result) };
}

describe("validateBody", () => {
  it("accepts a valid body and exposes the parsed value", () => {
    const req: any = { body: { content: "I have a headache" } };
    const res = createResponse();
    const next = vi.fn();

    validateBody(schema({ success: true, data: { content: "parsed" } }))(req, res, next);

    expect(req.validatedBody).toEqual({ content: "parsed" });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies with structured field errors", () => {
    const req: any = { body: { content: 42 } };
    const res = createResponse();
    const next = vi.fn();

    validateBody(
      schema({
        success: false,
        error: {
          issues: [
            { path: ["content"], message: "Expected string, received number" },
            { path: ["content"], message: "String must contain at least 1 character" },
          ],
        },
      }),
    )(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({
      error: "Validation failed",
      details: {
        content: [
          "Expected string, received number",
          "String must contain at least 1 character",
        ],
      },
    });
  });

  it("uses _root for issues without a path", () => {
    const req: any = { body: null };
    const res = createResponse();

    validateBody(
      schema({
        success: false,
        error: { issues: [{ path: [], message: "Expected object, received null" }] },
      }),
    )(req, res, vi.fn());

    expect(res.body.details).toEqual({ _root: ["Expected object, received null"] });
  });

  it("passes the raw body to safeParse (including null)", () => {
    const req: any = { body: null };
    const parsed = schema({ success: true, data: {} });

    validateBody(parsed)(req, createResponse(), vi.fn());

    expect(parsed.safeParse).toHaveBeenCalledWith(null);
  });
});

describe("validateQuery", () => {
  it("accepts valid query params", () => {
    const req: any = { query: { limit: "10" } };
    const res = createResponse();
    const next = vi.fn();

    validateQuery(schema({ success: true, data: { limit: 10 } }))(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects invalid query params", () => {
    const req: any = { query: { limit: "not-a-number" } };
    const res = createResponse();

    validateQuery(
      schema({
        success: false,
        error: { issues: [{ path: ["limit"], message: "Expected number" }] },
      }),
    )(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({
      error: "Validation failed",
      details: { limit: ["Expected number"] },
    });
  });
});
