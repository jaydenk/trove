import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { createTestDb } from "../../db/connection";
import {
  createUserWithPassword,
  findByToken,
  verifyPassword,
} from "../../db/queries/users";
import { authMiddleware, type AppVariables } from "../../middleware/auth";
import { TroveError } from "../../lib/errors";
import user from "../user";

describe("user routes (auth features)", () => {
  let db: Database;
  let userToken: string;

  beforeEach(async () => {
    db = createTestDb();

    // Mock getDb to return the test database
    mock.module("../../db/connection", () => ({
      getDb: () => db,
      createTestDb,
    }));

    const testUser = await createUserWithPassword(db, {
      name: "TestUser",
      username: "testuser",
      password: "original-password",
      email: "test@example.com",
    });
    userToken = testUser.api_token;
  });

  afterEach(() => {
    db.close();
  });

  function createApp() {
    const app = new Hono<{ Variables: AppVariables }>();

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

    app.use("/*", authMiddleware(db));
    app.route("/", user);

    return app;
  }

  describe("GET /api/me", () => {
    test("includes username in response", async () => {
      const app = createApp();

      const res = await app.request("/api/me", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe("testuser");
      expect(body.name).toBe("TestUser");
      expect(body.email).toBe("test@example.com");
    });
  });

  describe("PATCH /api/me", () => {
    test("changes password", async () => {
      const app = createApp();

      const res = await app.request("/api/me", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: "new-password" }),
      });

      expect(res.status).toBe(200);

      // Verify old password no longer works
      const oldResult = await verifyPassword(db, "testuser", "original-password");
      expect(oldResult).toBeNull();

      // Verify new password works
      const newResult = await verifyPassword(db, "testuser", "new-password");
      expect(newResult).not.toBeNull();
    });

    test("changes username", async () => {
      const app = createApp();

      const res = await app.request("/api/me", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: "newusername" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe("newusername");
    });

    test("rejects duplicate username", async () => {
      // Create another user with a taken username
      await createUserWithPassword(db, {
        name: "Other",
        username: "taken",
        password: "pass",
      });

      const app = createApp();

      const res = await app.request("/api/me", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: "taken" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("already taken");
    });

    test("allows setting own username to same value", async () => {
      const app = createApp();

      const res = await app.request("/api/me", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: "testuser" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe("testuser");
    });
  });

  describe("POST /api/me/regenerate-token", () => {
    test("returns a new token", async () => {
      const app = createApp();

      const res = await app.request("/api/me/regenerate-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.token.length).toBe(32);
      expect(body.token).not.toBe(userToken);
    });

    test("old token no longer works after regeneration", async () => {
      const app = createApp();

      // Regenerate
      const res = await app.request("/api/me/regenerate-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });
      const body = await res.json();

      // Old token should fail
      const oldRes = await app.request("/api/me", {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(oldRes.status).toBe(401);

      // New token should work
      const newRes = await app.request("/api/me", {
        headers: { Authorization: `Bearer ${body.token}` },
      });
      expect(newRes.status).toBe(200);
    });
  });
});
