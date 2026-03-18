import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { createTestDb } from "../../db/connection";
import { createUser } from "../../db/queries/users";
import { authMiddleware, type AppVariables } from "../../middleware/auth";
import { TroveError } from "../../lib/errors";
import admin from "../admin";

describe("admin routes", () => {
  let db: Database;
  let adminToken: string;
  let adminUserId: string;

  beforeEach(() => {
    db = createTestDb();
    adminToken = "admin-token-123";

    // Mock getDb to return the test database
    mock.module("../../db/connection", () => ({
      getDb: () => db,
      createTestDb,
    }));

    const adminUser = createUser(db, {
      name: "Admin",
      apiToken: adminToken,
      isAdmin: true,
    });
    adminUserId = adminUser.id;
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
          err.status as 403
        );
      }
      return c.json(
        { error: { code: "INTERNAL", message: "Unexpected error" } },
        500
      );
    });

    app.use("/*", authMiddleware(db));
    app.route("/", admin);

    return app;
  }

  describe("GET /api/admin/users", () => {
    test("returns list of users without tokens", async () => {
      const app = createApp();

      // Add another user
      createUser(db, { name: "Bob", email: "bob@test.com", apiToken: "bob-token" });

      const res = await app.request("/api/admin/users", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);

      // Ensure no tokens are exposed
      for (const user of body) {
        expect(user.apiToken).toBeUndefined();
        expect(user.api_token).toBeUndefined();
        expect(user.id).toBeDefined();
        expect(user.name).toBeDefined();
        expect(user.createdAt).toBeDefined();
        expect(typeof user.isAdmin).toBe("boolean");
      }
    });
  });

  describe("POST /api/admin/users", () => {
    test("creates user, returns token, seeds collections", async () => {
      const app = createApp();

      const res = await app.request("/api/admin/users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Charlie", email: "charlie@test.com" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("Charlie");
      expect(body.email).toBe("charlie@test.com");
      expect(body.apiToken).toBeDefined();
      expect(body.apiToken.length).toBe(32);
      expect(body.isAdmin).toBe(false);

      // Verify default collections were seeded
      const collections = db
        .query<{ id: string }, [string]>(
          "SELECT id FROM collections WHERE user_id = ?"
        )
        .all(body.id);
      expect(collections.length).toBe(5);
    });

    test("returns 400 when name is missing", async () => {
      const app = createApp();

      const res = await app.request("/api/admin/users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "nobody@test.com" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("DELETE /api/admin/users/:id", () => {
    test("removes user and returns 204", async () => {
      const app = createApp();

      const target = createUser(db, {
        name: "ToDelete",
        apiToken: "delete-me-token",
      });

      const res = await app.request(`/api/admin/users/${target.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(204);

      // Verify user is deleted
      const users = db
        .query<{ id: string }, [string]>("SELECT id FROM users WHERE id = ?")
        .all(target.id);
      expect(users.length).toBe(0);
    });

    test("cannot delete self — returns 400", async () => {
      const app = createApp();

      const res = await app.request(`/api/admin/users/${adminUserId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("yourself");
    });
  });

  describe("non-admin access", () => {
    test("non-admin gets 403 on GET /api/admin/users", async () => {
      const app = createApp();
      const regularToken = "regular-token-456";
      createUser(db, { name: "Regular", apiToken: regularToken });

      const res = await app.request("/api/admin/users", {
        headers: { Authorization: `Bearer ${regularToken}` },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    test("non-admin gets 403 on POST /api/admin/users", async () => {
      const app = createApp();
      const regularToken = "regular-token-789";
      createUser(db, { name: "Regular2", apiToken: regularToken });

      const res = await app.request("/api/admin/users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${regularToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Hacker" }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    test("non-admin gets 403 on DELETE /api/admin/users/:id", async () => {
      const app = createApp();
      const regularToken = "regular-token-000";
      createUser(db, { name: "Regular3", apiToken: regularToken });

      const res = await app.request(`/api/admin/users/${adminUserId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${regularToken}` },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });
  });
});
