import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { createTestDb } from "../../db/connection";
import { createUser } from "../../db/queries/users";
import { seedDefaultCollections } from "../../db/queries/collections";
import { authMiddleware, type AppVariables } from "../../middleware/auth";
import { TroveError } from "../../lib/errors";
import collections from "../collections";

describe("collections routes", () => {
  let db: Database;
  let userToken: string;
  let userId: string;

  beforeEach(() => {
    db = createTestDb();
    userToken = "user-token-123";

    mock.module("../../db/connection", () => ({
      getDb: () => db,
      createTestDb,
    }));

    const user = createUser(db, {
      name: "TestUser",
      apiToken: userToken,
    });
    userId = user.id;
    seedDefaultCollections(db, userId);
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
    app.route("/", collections);

    return app;
  }

  describe("GET /api/collections", () => {
    test("returns seeded collections with link counts", async () => {
      const app = createApp();

      const res = await app.request("/api/collections", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(5); // 5 default collections

      for (const col of body) {
        expect(col.id).toBeDefined();
        expect(col.name).toBeDefined();
        expect(col.createdAt).toBeDefined();
        expect(typeof col.linkCount).toBe("number");
        expect(col.linkCount).toBe(0);
      }

      // Should be ordered by name
      const names = body.map((c: { name: string }) => c.name);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });
  });

  describe("POST /api/collections", () => {
    test("returns 400 when name is missing", async () => {
      const app = createApp();

      const res = await app.request("/api/collections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ icon: "test" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("Name is required");
    });

    test("creates collection with full data (name, icon, color)", async () => {
      const app = createApp();

      const res = await app.request("/api/collections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "recipes",
          icon: "🍳",
          color: "#ff6600",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("recipes");
      expect(body.icon).toBe("🍳");
      expect(body.color).toBe("#ff6600");
      expect(body.id).toBeDefined();
      expect(body.createdAt).toBeDefined();
    });

    test("duplicate name returns error", async () => {
      const app = createApp();

      // "inbox" already exists from seeding
      const res = await app.request("/api/collections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "inbox" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("already exists");
    });
  });

  describe("PATCH /api/collections/:id", () => {
    test("updates collection fields", async () => {
      const app = createApp();

      // Get an existing collection to update
      const col = db
        .query<{ id: string; name: string }, [string]>(
          "SELECT id, name FROM collections WHERE user_id = ? AND name = 'reference'"
        )
        .get(userId)!;

      const res = await app.request(`/api/collections/${col.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "bookmarks",
          icon: "🔖",
          color: "#00ff00",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("bookmarks");
      expect(body.icon).toBe("🔖");
      expect(body.color).toBe("#00ff00");
      expect(body.id).toBe(col.id);
    });
  });

  describe("DELETE /api/collections/:id", () => {
    test("deletes collection and moves links to inbox", async () => {
      const app = createApp();

      // Get the "tools" collection and inbox
      const toolsCol = db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM collections WHERE user_id = ? AND name = ?"
        )
        .get(userId, "tools")!;

      const inboxCol = db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM collections WHERE user_id = ? AND name = ?"
        )
        .get(userId, "inbox")!;

      // Create a link in the tools collection
      db.query(
        `INSERT INTO links (id, user_id, url, title, domain, collection_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run("link-1", userId, "https://example.com", "Example", "example.com", toolsCol.id);

      const res = await app.request(`/api/collections/${toolsCol.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(204);

      // Verify the link was moved to inbox
      const link = db
        .query<{ collection_id: string }, [string]>(
          "SELECT collection_id FROM links WHERE id = ?"
        )
        .get("link-1")!;

      expect(link.collection_id).toBe(inboxCol.id);

      // Verify the collection was deleted
      const deleted = db
        .query<{ id: string }, [string]>(
          "SELECT id FROM collections WHERE id = ?"
        )
        .get(toolsCol.id);

      expect(deleted).toBeNull();
    });
  });

  describe("cross-user isolation", () => {
    test("cannot access another user's collection", async () => {
      const app = createApp();

      // Create another user with their own collections
      const otherToken = "other-token-456";
      const otherUser = createUser(db, {
        name: "OtherUser",
        apiToken: otherToken,
      });
      seedDefaultCollections(db, otherUser.id);

      // Get one of the other user's collections
      const otherCol = db
        .query<{ id: string }, [string]>(
          "SELECT id FROM collections WHERE user_id = ? LIMIT 1"
        )
        .get(otherUser.id)!;

      // Try to update it as the first user
      const patchRes = await app.request(`/api/collections/${otherCol.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "hijacked" }),
      });

      expect(patchRes.status).toBe(404);

      // Try to delete it as the first user
      const deleteRes = await app.request(`/api/collections/${otherCol.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(deleteRes.status).toBe(404);
    });
  });
});
