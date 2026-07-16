import crypto from "crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for #1526: POST /api/chat previously had no
// integration test proving requireAuth actually gates the route before a
// request reaches OpenRouter. requireAuth itself is already unit-tested in
// isolation (requireAuth.test.js), but nothing exercised the real Express
// app to confirm chatRoutes.js wires it in correctly.

const JWT_SECRET = "chat-auth-route-test-secret";

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

describe("POST /api/chat — authentication is enforced (#1526)", () => {
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

  it("rejects unauthenticated requests before reaching OpenRouter", async () => {
    const { default: app } = await import("../app.js");

    const response = await request(app)
      .post("/api/chat")
      .send({ messages: [{ role: "user", content: "hello" }] });

    expect(response.status).toBe(401);
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });

  it("rejects requests with an invalid or forged token", async () => {
    const { default: app } = await import("../app.js");

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", "Bearer not-a-real-jwt")
      .send({ messages: [{ role: "user", content: "hello" }] });

    expect(response.status).toBe(401);
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });

  it("rejects a token signed with the wrong secret", async () => {
    const { default: app } = await import("../app.js");
    const token = createLocalJwt(
      {
        sub: "chat-auth-user-1",
        email: "attacker@example.com",
        exp: Math.floor(Date.now() / 1000) + 60,
        role: "authenticated",
      },
      "wrong-secret",
    );

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ messages: [{ role: "user", content: "hello" }] });

    expect(response.status).toBe(401);
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });

  it("serves an authenticated request with a validly signed token", async () => {
    const { default: app } = await import("../app.js");
    const token = createLocalJwt({
      sub: "chat-auth-user-2",
      email: "learner@example.com",
      exp: Math.floor(Date.now() / 1000) + 60,
      role: "authenticated",
    });

    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ messages: [{ role: "user", content: "hello" }] });

    expect(response.status).toBe(200);
    expect(response.body.reply).toBe("mock reply");
    expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
  });
});
