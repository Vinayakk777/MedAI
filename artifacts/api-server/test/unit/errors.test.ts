import { describe, expect, it, vi } from "vitest";
import { sendError } from "../../src/lib/errors";

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

describe("sendError", () => {
  it("sends a consistent error payload and status", () => {
    const res = createResponse();

    sendError(res, 404, "Conversation not found");

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Conversation not found" });
    expect(res.statusCode).toBe(404);
  });

  it("logs internal errors without leaking them to the client", () => {
    const res = createResponse();
    const logger = { error: vi.fn() };
    const internal = new Error("database password leaked in stack");

    sendError(res, 500, "Failed to send message", internal, logger);

    expect(logger.error).toHaveBeenCalledWith({ err: internal }, "Failed to send message");
    expect(res.body).toEqual({ error: "Failed to send message" });
    expect(JSON.stringify(res.body)).not.toContain("password");
  });

  it("does not call the logger when no internal error is supplied", () => {
    const res = createResponse();
    const logger = { error: vi.fn() };

    sendError(res, 401, "Unauthorized", undefined, logger);

    expect(logger.error).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("works without a logger", () => {
    const res = createResponse();
    expect(() => sendError(res, 400, "Bad request")).not.toThrow();
    expect(res.body).toEqual({ error: "Bad request" });
  });
});
