import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { createTestDb } from "../../db/connection";
import { createUserWithPassword } from "../../db/queries/users";
import { authMiddleware, type AppVariables } from "../../middleware/auth";
import { TroveError } from "../../lib/errors";
import user from "../user";

describe("preferences routes", () => {
  let db: Database;
  let userToken: string;

  beforeEach(async () => {
    db = createTestDb();

    mock.module("../../db/connection", () => ({
      getDb: () => db,
      createTestDb,
    }));

    const testUser = await createUserWithPassword(db, {
      name: "TestUser",
      username: "testuser",
      password: "test-password",
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
          err.status as 400,
        );
      }
      return c.json(
        { error: { code: "INTERNAL", message: "Unexpected error" } },
        500,
      );
    });

    app.use("/*", authMiddleware(db));
    app.route("/", user);

    return app;
  }

  describe("GET /api/me/preferences", () => {
    test("returns empty object when no preferences set", async () => {
      const app = createApp();

      const res = await app.request("/api/me/preferences", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({});
    });

    test("returns saved preferences", async () => {
      const app = createApp();

      // Set some preferences first
      await app.request("/api/me/preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ theme: "dark", swipe_left: "archive" }),
      });

      const res = await app.request("/api/me/preferences", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ theme: "dark", swipe_left: "archive" });
    });

    test("requires authentication", async () => {
      const app = createApp();

      const res = await app.request("/api/me/preferences");
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/me/preferences", () => {
    test("sets preferences", async () => {
      const app = createApp();

      const res = await app.request("/api/me/preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ theme: "dark", swipe_right: "delete" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.theme).toBe("dark");
      expect(body.swipe_right).toBe("delete");
    });

    test("upserts existing preferences", async () => {
      const app = createApp();

      // Set initial value
      await app.request("/api/me/preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ theme: "dark" }),
      });

      // Update it
      const res = await app.request("/api/me/preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ theme: "light" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.theme).toBe("light");
    });

    test("preserves other preferences when updating one", async () => {
      const app = createApp();

      // Set initial values
      await app.request("/api/me/preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ theme: "dark", swipe_left: "archive" }),
      });

      // Update only one
      await app.request("/api/me/preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ theme: "system" }),
      });

      // Fetch all
      const res = await app.request("/api/me/preferences", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.theme).toBe("system");
      expect(body.swipe_left).toBe("archive");
    });

    test("returns all preferences after update", async () => {
      const app = createApp();

      // Set initial
      await app.request("/api/me/preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ swipe_left: "delete" }),
      });

      // Set another
      const res = await app.request("/api/me/preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ swipe_right: "archive" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.swipe_left).toBe("delete");
      expect(body.swipe_right).toBe("archive");
    });

    test("preferences are scoped per user", async () => {
      // Create a second user
      const user2 = await createUserWithPassword(db, {
        name: "User2",
        username: "user2",
        password: "pass2",
      });

      const app = createApp();

      // User 1 sets preferences
      await app.request("/api/me/preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ theme: "dark" }),
      });

      // User 2 sets different preferences
      await app.request("/api/me/preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${user2.api_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ theme: "light" }),
      });

      // Verify user 1 sees their own
      const res1 = await app.request("/api/me/preferences", {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      const body1 = await res1.json();
      expect(body1.theme).toBe("dark");

      // Verify user 2 sees their own
      const res2 = await app.request("/api/me/preferences", {
        headers: { Authorization: `Bearer ${user2.api_token}` },
      });
      const body2 = await res2.json();
      expect(body2.theme).toBe("light");
    });
  });
});
