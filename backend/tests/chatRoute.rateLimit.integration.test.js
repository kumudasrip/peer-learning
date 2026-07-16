import crypto from "crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for #1528: POST /api/chat previously had no
// integration test proving the rate limiter actually caps a single user's
// throughput on the real route. rateLimiter is already unit-tested in
// isolation (rateLimiter.test.js), but nothing exercised the real Express
// app to confirm chatRoutes.js wires it in correctly ahead of the
// OpenRouter call.

const JWT_SECRET = "chat-ratelimit-route-test-secret";

const base64UrlEncode = (value) =>
  Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

const createLocalJwt = (payload, secret = JWT_SECRET) => {
  const header = base64UrlEncode({ alg: "HS256", typ: "JWT" });
  const body = base64UrlEncode(payload);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${header}.${body}.${signature}`;
};

let mockCreateCompletion;

vi.mock("openai", () => ({
  default: class {
    constructor() {
      this.chat = {
        completions: {
          create: (...args) => mockCreateCompletion(...args),
        },
      };
    }
  },
}));

describe("POST /api/chat — per-user rate limiting is enforced (#1528)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_JWT_SECRET", JWT_SECRET);
    mockCreateCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "mock reply" } }],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throttles a single user after 20 requests/minute and never contacts OpenRouter for the excess", async () => {
    const { default: app } = await import("../app.js");
    const token = createLocalJwt({
      sub: "chat-ratelimit-user-1",
      email: "burst@example.com",
      exp: Math.floor(Date.now() / 1000) + 60,
      role: "authenticated",
    });

    const send = () =>
      request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${token}`)
        .send({ messages: [{ role: "user", content: "hello" }] });

    const responses = [];
    for (let i = 0; i < 25; i += 1) {
      // Sequential on purpose: the rate limiter's in-memory counter must see
      // every request in order to enforce the cap deterministically.
      responses.push(await send());
    }

    const statuses = responses.map((r) => r.status);
    const okCount = statuses.filter((s) => s === 200).length;
    const throttledCount = statuses.filter((s) => s === 429).length;

    expect(okCount).toBe(20);
    expect(throttledCount).toBe(5);
    // Only the 20 permitted requests should have reached OpenRouter.
    expect(mockCreateCompletion).toHaveBeenCalledTimes(20);
  });

  it("returns a clear error message and standard rate-limit headers once throttled", async () => {
    const { default: app } = await import("../app.js");
    const token = createLocalJwt({
      sub: "chat-ratelimit-user-2",
      email: "burst2@example.com",
      exp: Math.floor(Date.now() / 1000) + 60,
      role: "authenticated",
    });

    const send = () =>
      request(app)
        .post("/api/chat")
        .set("Authorization", `Bearer ${token}`)
        .send({ messages: [{ role: "user", content: "hello" }] });

    let last;
    for (let i = 0; i < 21; i += 1) {
      last = await send();
    }

    expect(last.status).toBe(429);
    expect(last.body).toMatchObject({
      error: expect.stringContaining("Too many requests"),
    });
    expect(last.headers["x-ratelimit-limit"]).toBeDefined();
    expect(last.headers["x-ratelimit-remaining"]).toBe("0");
  });

  it("does not let a second user's requests count against the first user's quota", async () => {
    const { default: app } = await import("../app.js");
    const tokenA = createLocalJwt({
      sub: "chat-ratelimit-user-3a",
      email: "a@example.com",
      exp: Math.floor(Date.now() / 1000) + 60,
      role: "authenticated",
    });
    const tokenB = createLocalJwt({
      sub: "chat-ratelimit-user-3b",
      email: "b@example.com",
      exp: Math.floor(Date.now() / 1000) + 60,
      role: "authenticated",
    });

    const responseA = await request(app)
      .post("/api/chat")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ messages: [{ role: "user", content: "hi" }] });
    const responseB = await request(app)
      .post("/api/chat")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ messages: [{ role: "user", content: "hi" }] });

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
  });
});
