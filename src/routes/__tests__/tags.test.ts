import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { createTestDb } from "../../db/connection";
import { createUser } from "../../db/queries/users";
import { seedDefaultCollections } from "../../db/queries/collections";
import { authMiddleware, type AppVariables } from "../../middleware/auth";
import { TroveError } from "../../lib/errors";
import tags from "../tags";

describe("tags routes", () => {
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
    app.route("/", tags);

    return app;
  }

  describe("GET /api/tags", () => {
    test("returns empty array when no tags exist", async () => {
      const app = createApp();

      const res = await app.request("/api/tags", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });

    test("returns tags with link counts", async () => {
      const app = createApp();

      // Create tags
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "tag-1",
        userId,
        "javascript"
      );
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "tag-2",
        userId,
        "typescript"
      );

      // Get the inbox collection for links
      const inbox = db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM collections WHERE user_id = ? AND name = ?"
        )
        .get(userId, "inbox")!;

      // Create links and associate with tags
      db.query(
        `INSERT INTO links (id, user_id, url, title, domain, collection_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run("link-1", userId, "https://example.com", "Example", "example.com", inbox.id);

      db.query(
        `INSERT INTO links (id, user_id, url, title, domain, collection_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run("link-2", userId, "https://example.org", "Example 2", "example.org", inbox.id);

      // Tag link-1 with both tags, link-2 with only javascript
      db.query("INSERT INTO link_tags (link_id, tag_id) VALUES (?, ?)").run("link-1", "tag-1");
      db.query("INSERT INTO link_tags (link_id, tag_id) VALUES (?, ?)").run("link-1", "tag-2");
      db.query("INSERT INTO link_tags (link_id, tag_id) VALUES (?, ?)").run("link-2", "tag-1");

      const res = await app.request("/api/tags", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBe(2);

      // Ordered by name: javascript, typescript
      expect(body[0].name).toBe("javascript");
      expect(body[0].linkCount).toBe(2);
      expect(body[0].id).toBeDefined();
      expect(body[0].createdAt).toBeDefined();

      expect(body[1].name).toBe("typescript");
      expect(body[1].linkCount).toBe(1);
    });
  });

  describe("POST /api/tags", () => {
    test("returns 400 when name is missing", async () => {
      const app = createApp();

      const res = await app.request("/api/tags", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("Name is required");
    });

    test("creates tag successfully", async () => {
      const app = createApp();

      const res = await app.request("/api/tags", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "rust" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("rust");
      expect(body.id).toBeDefined();
      expect(body.createdAt).toBeDefined();
    });

    test("duplicate name returns error", async () => {
      const app = createApp();

      // Create the tag first
      await app.request("/api/tags", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "rust" }),
      });

      // Try to create with same name
      const res = await app.request("/api/tags", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "rust" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("already exists");
    });
  });

  describe("PATCH /api/tags/:id", () => {
    test("renames tag successfully", async () => {
      const app = createApp();

      // Create a tag directly in db
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "tag-rename",
        userId,
        "old-name"
      );

      const res = await app.request("/api/tags/tag-rename", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "new-name" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("new-name");
      expect(body.id).toBe("tag-rename");
      expect(body.createdAt).toBeDefined();
    });

    test("returns 404 for non-existent tag", async () => {
      const app = createApp();

      const res = await app.request("/api/tags/non-existent", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "new-name" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("DELETE /api/tags/:id", () => {
    test("deletes tag and cascades to link_tags", async () => {
      const app = createApp();

      // Create a tag
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "tag-del",
        userId,
        "to-delete"
      );

      // Get inbox for link
      const inbox = db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM collections WHERE user_id = ? AND name = ?"
        )
        .get(userId, "inbox")!;

      // Create a link and associate with the tag
      db.query(
        `INSERT INTO links (id, user_id, url, title, domain, collection_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run("link-del", userId, "https://del.com", "Delete Me", "del.com", inbox.id);

      db.query("INSERT INTO link_tags (link_id, tag_id) VALUES (?, ?)").run(
        "link-del",
        "tag-del"
      );

      const res = await app.request("/api/tags/tag-del", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(204);

      // Verify tag is deleted
      const tag = db
        .query<{ id: string }, [string]>("SELECT id FROM tags WHERE id = ?")
        .get("tag-del");
      expect(tag).toBeNull();

      // Verify link_tags entry was cascaded
      const linkTag = db
        .query<{ link_id: string }, [string]>(
          "SELECT link_id FROM link_tags WHERE tag_id = ?"
        )
        .get("tag-del");
      expect(linkTag).toBeNull();

      // Verify the link itself still exists
      const link = db
        .query<{ id: string }, [string]>("SELECT id FROM links WHERE id = ?")
        .get("link-del");
      expect(link).not.toBeNull();
    });

    test("returns 404 for non-existent tag", async () => {
      const app = createApp();

      const res = await app.request("/api/tags/non-existent", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("DELETE /api/tags/empty", () => {
    test("deletes empty tags and returns count", async () => {
      const app = createApp();

      // Create tags — two empty, one with a link
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "tag-empty-1",
        userId,
        "empty-one"
      );
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "tag-empty-2",
        userId,
        "empty-two"
      );
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "tag-active",
        userId,
        "active"
      );

      // Get inbox for link
      const inbox = db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM collections WHERE user_id = ? AND name = ?"
        )
        .get(userId, "inbox")!;

      // Create a link and tag it
      db.query(
        `INSERT INTO links (id, user_id, url, title, domain, collection_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run("link-active", userId, "https://active.com", "Active", "active.com", inbox.id);
      db.query("INSERT INTO link_tags (link_id, tag_id) VALUES (?, ?)").run(
        "link-active",
        "tag-active"
      );

      const res = await app.request("/api/tags/empty", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(2);

      // Verify only the active tag remains
      const remaining = db
        .query<{ id: string }, [string]>(
          "SELECT id FROM tags WHERE user_id = ?"
        )
        .all(userId);
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe("tag-active");
    });

    test("returns 0 when no empty tags exist", async () => {
      const app = createApp();

      const res = await app.request("/api/tags/empty", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(0);
    });

    test("does not delete other user's empty tags", async () => {
      const app = createApp();

      // Create an empty tag for the main user
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "my-empty",
        userId,
        "my-empty"
      );

      // Create another user with an empty tag
      const otherToken = "other-token-empty";
      const otherUser = createUser(db, {
        name: "OtherUser",
        apiToken: otherToken,
      });
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "their-empty",
        otherUser.id,
        "their-empty"
      );

      const res = await app.request("/api/tags/empty", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(1);

      // Verify other user's tag still exists
      const otherTag = db
        .query<{ id: string }, [string]>(
          "SELECT id FROM tags WHERE id = ?"
        )
        .get("their-empty");
      expect(otherTag).not.toBeNull();
    });
  });

  describe("cross-user isolation", () => {
    test("cannot modify another user's tag", async () => {
      const app = createApp();

      // Create another user
      const otherToken = "other-token-456";
      const otherUser = createUser(db, {
        name: "OtherUser",
        apiToken: otherToken,
      });

      // Create a tag for the other user
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "other-tag",
        otherUser.id,
        "private-tag"
      );

      // Try to rename it as the first user
      const patchRes = await app.request("/api/tags/other-tag", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "hijacked" }),
      });

      expect(patchRes.status).toBe(404);

      // Try to delete it as the first user
      const deleteRes = await app.request("/api/tags/other-tag", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(deleteRes.status).toBe(404);

      // Verify the tag is untouched
      const tag = db
        .query<{ name: string }, [string]>(
          "SELECT name FROM tags WHERE id = ?"
        )
        .get("other-tag");
      expect(tag).not.toBeNull();
      expect(tag!.name).toBe("private-tag");
    });

    test("listing only returns own tags", async () => {
      const app = createApp();

      // Create tags for the main user
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "my-tag",
        userId,
        "my-tag"
      );

      // Create another user with their own tag
      const otherToken = "other-token-789";
      const otherUser = createUser(db, {
        name: "OtherUser2",
        apiToken: otherToken,
      });
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "their-tag",
        otherUser.id,
        "their-tag"
      );

      const res = await app.request("/api/tags", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBe(1);
      expect(body[0].name).toBe("my-tag");
    });
  });
});
