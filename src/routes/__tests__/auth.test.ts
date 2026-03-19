import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { createTestDb } from "../../db/connection";
import { createUserWithPassword } from "../../db/queries/users";
import { TroveError } from "../../lib/errors";
import auth, { resetLoginRateLimitStore } from "../auth";

describe("POST /api/auth/login", () => {
  let db: Database;

  beforeEach(async () => {
    db = createTestDb();
    resetLoginRateLimitStore();

    // Mock getDb to return the test database
    mock.module("../../db/connection", () => ({
      getDb: () => db,
      createTestDb,
    }));

    // Create a test user with username + password
    await createUserWithPassword(db, {
      name: "TestUser",
      username: "testuser",
      password: "correct-password",
      email: "test@example.com",
    });
  });

  afterEach(() => {
    db.close();
  });

  function createApp() {
    const app = new Hono();

    app.onError((err, c) => {
      if (err instanceof TroveError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          err.status as 400
        );
      }
      return c.json(
        { error: { code: "INTERNAL", message: "Unexpected error" } },
        500
      );
    });

    app.route("/", auth);

    return app;
  }

  test("returns token and user info on valid credentials", async () => {
    const app = createApp();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "testuser",
        password: "correct-password",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
    expect(body.token.length).toBe(32);
    expect(body.user.id).toBeDefined();
    expect(body.user.name).toBe("TestUser");
    expect(body.user.username).toBe("testuser");
    expect(body.user.email).toBe("test@example.com");
    expect(typeof body.user.isAdmin).toBe("boolean");
  });

  test("returns 401 on wrong password", async () => {
    const app = createApp();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "testuser",
        password: "wrong-password",
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("returns 401 for non-existent username", async () => {
    const app = createApp();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "nonexistent",
        password: "any-password",
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("returns 400 when username is missing", async () => {
    const app = createApp();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "some-password" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("returns 400 when password is missing", async () => {
    const app = createApp();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("rate limits after 10 rapid attempts", async () => {
    const app = createApp();

    // Make 10 requests (all should succeed or return 401, but not 429)
    for (let i = 0; i < 10; i++) {
      const res = await app.request("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "1.2.3.4",
        },
        body: JSON.stringify({
          username: "testuser",
          password: "wrong-password",
        }),
      });
      expect(res.status).not.toBe(429);
    }

    // 11th request should be rate limited
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "1.2.3.4",
      },
      body: JSON.stringify({
        username: "testuser",
        password: "wrong-password",
      }),
    });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  test("does not require Bearer token (public endpoint)", async () => {
    const app = createApp();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "testuser",
        password: "correct-password",
      }),
    });

    // No Authorization header — should still work
    expect(res.status).toBe(200);
  });
});
