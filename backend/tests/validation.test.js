import express from "express";
import request from "supertest";
import app from "../app.js";
import { validate } from "../middlewares/validate.js";
import { errorHandler } from "../middlewares/errorHandler.js";
import { aiSchemas } from "../validation/schemas.js";

describe("backend validation", () => {
  it("returns a consistent 400 payload for invalid forgot-password input", async () => {
    const response = await request(app).post("/api/forgot-password").send({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      message: "Validation failed",
    });
    expect(Array.isArray(response.body.details)).toBe(true);
    expect(response.body.details[0]).toMatchObject({
      path: "email",
    });
  });

  it("returns the same 400 shape for invalid AI payloads", async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.post("/ask", validate(aiSchemas.askAI), (req, res) => {
      res.json({ ok: true });
    });
    testApp.use(errorHandler);

    const response = await request(testApp).post("/ask").send({ question: "" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      message: "Validation failed",
    });
    expect(response.body.details[0]).toMatchObject({
      path: "question",
    });
  });
});
