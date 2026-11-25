import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dbHolder = vi.hoisted(() => ({ mock: null as any }));
const auth = vi.hoisted(() => ({ userId: "user-a" as string | null }));

vi.mock("@workspace/db", async () => {
  const { createWorkspaceDbMock } = await import("../helpers/workspaceDbMock");
  const mock = createWorkspaceDbMock();
  dbHolder.mock = mock;
  return mock;
});

vi.mock("drizzle-orm", async () => await import("../helpers/drizzleMock"));

vi.mock("@clerk/express", () => ({
  getAuth: () => (auth.userId ? { userId: auth.userId } : null),
}));

import router from "../../src/routes/observability";

const fake = () => dbHolder.mock.db.__fake;

function seedProfile(userId: string, role: string) {
  return fake().seed("clinicianProfiles", {
    id: `profile-${userId}`,
    userId,
    role,
    fullName: `User ${userId}`,
    isActive: true,
  })[0];
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  delete process.env.DEV_AUTH_USER_ID;
  delete process.env.ADMIN_TOKEN;
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

beforeEach(() => {
  fake().clear();
  auth.userId = "user-a";
});

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // leave as text
  }
  return { status: res.status, text, body };
}

describe("observability aggregate authorization", () => {
  it("rejects global analytics stats for a non-admin", async () => {
    const res = await request("/observability/analytics/stats?global=true");

    expect(res.status).toBe(403);
  });

  it("scopes non-global analytics stats to the requesting user", async () => {
    fake().seed("consultationAnalytics", {
      userId: "user-a",
      conversationId: "conv-a",
      tokensUsed: 10,
    });
    fake().seed("consultationAnalytics", {
      userId: "user-b",
      conversationId: "conv-b",
      tokensUsed: 99,
    });

    const res = await request("/observability/analytics/stats");

    expect(res.status).toBe(200);
    expect(res.body.totalConsultations).toBe(1);
  });

  it("allows an admin to request global analytics stats", async () => {
    seedProfile("admin-user", "admin");
    auth.userId = "admin-user";
    fake().seed("consultationAnalytics", { userId: "user-a", conversationId: "conv-a" });
    fake().seed("consultationAnalytics", { userId: "user-b", conversationId: "conv-b" });

    const res = await request("/observability/analytics/stats?global=true");

    expect(res.status).toBe(200);
    expect(res.body.totalConsultations).toBe(2);
  });

  it("requires admin for global usage trends", async () => {
    const denied = await request("/observability/analytics/trends");
    expect(denied.status).toBe(403);

    seedProfile("admin-user", "admin");
    auth.userId = "admin-user";
    const allowed = await request("/observability/analytics/trends");
    expect(allowed.status).toBe(200);
  });

  it("requires admin for global feedback summaries", async () => {
    const denied = await request("/observability/feedback/summary");
    expect(denied.status).toBe(403);

    seedProfile("admin-user", "admin");
    auth.userId = "admin-user";
    const allowed = await request("/observability/feedback/summary");
    expect(allowed.status).toBe(200);
  });
});

describe("observability consultation ownership", () => {
  it("hides another user's consultation analytics", async () => {
    fake().seed("consultationAnalytics", {
      userId: "user-b",
      conversationId: "conv-b",
      tokensUsed: 5,
    });

    const res = await request("/observability/analytics/consultations/conv-b");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("returns the owner's consultation analytics", async () => {
    fake().seed("consultationAnalytics", {
      userId: "user-a",
      conversationId: "conv-a",
      tokensUsed: 5,
    });

    const res = await request("/observability/analytics/consultations/conv-a");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: "user-a", conversationId: "conv-a" });
  });

  it("allows an admin to inspect any consultation", async () => {
    seedProfile("admin-user", "admin");
    auth.userId = "admin-user";
    fake().seed("consultationAnalytics", {
      userId: "user-b",
      conversationId: "conv-b",
    });

    const res = await request("/observability/analytics/consultations/conv-b");

    expect(res.status).toBe(200);
  });
});

describe("feedback resolution ownership", () => {
  it("does not resolve another user's feedback", async () => {
    fake().seed("userFeedback", {
      id: "feedback-b",
      userId: "user-b",
      conversationId: "conv-b",
      rating: "helpful",
      isResolved: false,
    });

    const res = await request("/observability/feedback/feedback-b/resolve", {
      method: "PUT",
    });

    expect(res.status).toBe(404);
    expect(fake().getRows("userFeedback")[0].isResolved).toBe(false);
  });

  it("resolves the requesting user's own feedback", async () => {
    fake().seed("userFeedback", {
      id: "feedback-a",
      userId: "user-a",
      conversationId: "conv-a",
      rating: "helpful",
      isResolved: false,
    });

    const res = await request("/observability/feedback/feedback-a/resolve", {
      method: "PUT",
    });

    expect(res.status).toBe(200);
    expect(fake().getRows("userFeedback")[0].isResolved).toBe(true);
  });
});
