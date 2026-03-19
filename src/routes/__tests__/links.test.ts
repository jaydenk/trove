import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
} from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { createTestDb } from "../../db/connection";
import { createUser } from "../../db/queries/users";
import { seedDefaultCollections } from "../../db/queries/collections";
import { authMiddleware, type AppVariables } from "../../middleware/auth";
import { TroveError } from "../../lib/errors";
import links from "../links";

// Mock extractor to prevent real HTTP calls
mock.module("../../services/extractor", () => ({
  extractAndUpdate: () => {},
}));

describe("links routes", () => {
  let db: Database;
  let userToken: string;
  let userId: string;
  let inboxId: string;

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

    inboxId = db
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM collections WHERE user_id = ? AND name = ?"
      )
      .get(userId, "inbox")!.id;
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
    app.route("/", links);

    return app;
  }

  function insertLink(
    id: string,
    url: string,
    title: string,
    opts: {
      collectionId?: string;
      status?: string;
      domain?: string;
      content?: string;
      description?: string;
      extractionStatus?: string;
    } = {}
  ) {
    const domain = opts.domain ?? new URL(url).hostname;
    const collectionId = opts.collectionId ?? inboxId;
    const status = opts.status ?? "saved";
    const extractionStatus = opts.extractionStatus ?? "completed";
    db.query(
      `INSERT INTO links (id, user_id, url, title, domain, collection_id, status, extraction_status, description, content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      url,
      title,
      domain,
      collectionId,
      status,
      extractionStatus,
      opts.description ?? null,
      opts.content ?? null
    );
  }

  describe("POST /api/links", () => {
    test("creates link with pending extraction status", async () => {
      const app = createApp();

      const res = await app.request("/api/links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://example.com/article" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.url).toBe("https://example.com/article");
      expect(body.extraction_status).toBe("pending");
      expect(body.id).toBeDefined();
      expect(body.domain).toBe("example.com");
      expect(body.tags).toEqual([]);
    });

    test("creates link with tags", async () => {
      const app = createApp();

      const res = await app.request("/api/links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: "https://example.com/tagged",
          tags: ["javascript", "tutorial"],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.tags).toHaveLength(2);

      const tagNames = body.tags.map((t: { name: string }) => t.name).sort();
      expect(tagNames).toEqual(["javascript", "tutorial"]);
    });

    test("validates URL required (400)", async () => {
      const app = createApp();

      const res = await app.request("/api/links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "No URL" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("URL is required");
    });

    test("validates URL format (400)", async () => {
      const app = createApp();

      const res = await app.request("/api/links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "not-a-url" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("Invalid URL");
    });

    test("duplicate URL returns 409", async () => {
      const app = createApp();

      // Create the first link
      await app.request("/api/links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://duplicate.com" }),
      });

      // Try to create with the same URL
      const res = await app.request("/api/links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://duplicate.com" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("DUPLICATE_URL");
    });
  });

  describe("GET /api/links/:id", () => {
    test("returns link with tags", async () => {
      const app = createApp();

      insertLink("link-get-1", "https://example.com", "Example", {
        content: "Some content here",
      });

      // Add tags
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "tag-a",
        userId,
        "alpha"
      );
      db.query("INSERT INTO link_tags (link_id, tag_id) VALUES (?, ?)").run(
        "link-get-1",
        "tag-a"
      );

      const res = await app.request("/api/links/link-get-1", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("link-get-1");
      expect(body.url).toBe("https://example.com");
      expect(body.content).toBe("Some content here");
      expect(body.tags).toHaveLength(1);
      expect(body.tags[0].name).toBe("alpha");
    });

    test("returns 404 for non-existent link", async () => {
      const app = createApp();

      const res = await app.request("/api/links/non-existent", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("GET /api/links", () => {
    test("returns paginated list", async () => {
      const app = createApp();

      // Create 3 links
      insertLink("link-list-1", "https://one.com", "One");
      insertLink("link-list-2", "https://two.com", "Two");
      insertLink("link-list-3", "https://three.com", "Three");

      const res = await app.request("/api/links", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(3);
      expect(body.pagination.total).toBe(3);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(50);
      expect(body.pagination.totalPages).toBe(1);
    });

    test("filters by collection_id", async () => {
      const app = createApp();

      const toolsId = db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM collections WHERE user_id = ? AND name = ?"
        )
        .get(userId, "tools")!.id;

      insertLink("link-inbox", "https://inbox.com", "Inbox Link", {
        collectionId: inboxId,
      });
      insertLink("link-tools", "https://tools.com", "Tools Link", {
        collectionId: toolsId,
      });

      const res = await app.request(
        `/api/links?collection_id=${toolsId}`,
        {
          headers: { Authorization: `Bearer ${userToken}` },
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].url).toBe("https://tools.com");
    });

    test("filters by status", async () => {
      const app = createApp();

      insertLink("link-saved", "https://saved.com", "Saved", {
        status: "saved",
      });
      insertLink("link-archived", "https://archived.com", "Archived", {
        status: "archived",
      });

      const res = await app.request("/api/links?status=archived", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].url).toBe("https://archived.com");
    });

    test("FTS search returns results", async () => {
      const app = createApp();

      insertLink("link-fts-1", "https://fts1.com", "Quantum Computing Guide", {
        content: "An introduction to quantum computing fundamentals",
        description: "Learn about qubits",
      });
      insertLink("link-fts-2", "https://fts2.com", "Cooking Recipes", {
        content: "How to make a perfect pasta dish",
        description: "Italian food",
      });

      const res = await app.request("/api/links?q=quantum", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("Quantum Computing Guide");
      expect(body.pagination.total).toBe(1);
    });
  });

  describe("PATCH /api/links/:id", () => {
    test("updates fields", async () => {
      const app = createApp();

      insertLink("link-patch-1", "https://patch.com", "Original Title");

      const res = await app.request("/api/links/link-patch-1", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Updated Title" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe("Updated Title");
      expect(body.id).toBe("link-patch-1");
    });

    test("replaces all tags", async () => {
      const app = createApp();

      insertLink("link-patch-tags", "https://patch-tags.com", "Tag Test");

      // Add initial tags
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "tag-old-1",
        userId,
        "old-tag-1"
      );
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "tag-old-2",
        userId,
        "old-tag-2"
      );
      db.query("INSERT INTO link_tags (link_id, tag_id) VALUES (?, ?)").run(
        "link-patch-tags",
        "tag-old-1"
      );
      db.query("INSERT INTO link_tags (link_id, tag_id) VALUES (?, ?)").run(
        "link-patch-tags",
        "tag-old-2"
      );

      const res = await app.request("/api/links/link-patch-tags", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tags: ["new-tag-1", "new-tag-2", "new-tag-3"] }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tags).toHaveLength(3);

      const tagNames = body.tags.map((t: { name: string }) => t.name).sort();
      expect(tagNames).toEqual(["new-tag-1", "new-tag-2", "new-tag-3"]);

      // Verify old tags are no longer associated
      const oldLinks = db
        .query<{ tag_id: string }, [string]>(
          "SELECT tag_id FROM link_tags WHERE link_id = ?"
        )
        .all("link-patch-tags");

      // None of the old tag IDs should be present
      const tagIds = oldLinks.map((r) => r.tag_id);
      expect(tagIds).not.toContain("tag-old-1");
      expect(tagIds).not.toContain("tag-old-2");
    });

    test("returns 404 for non-existent link", async () => {
      const app = createApp();

      const res = await app.request("/api/links/non-existent", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "nope" }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("DELETE /api/links/:id", () => {
    test("returns 204", async () => {
      const app = createApp();

      insertLink("link-del-1", "https://delete.com", "Delete Me");

      const res = await app.request("/api/links/link-del-1", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(204);

      // Verify the link is gone
      const link = db
        .query<{ id: string }, [string]>("SELECT id FROM links WHERE id = ?")
        .get("link-del-1");
      expect(link).toBeNull();
    });

    test("returns 404 for non-existent link", async () => {
      const app = createApp();

      const res = await app.request("/api/links/non-existent", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("POST /api/links/:id/archive", () => {
    test("sets status to archived", async () => {
      const app = createApp();

      insertLink("link-archive-1", "https://archive.com", "Archive Me");

      const res = await app.request("/api/links/link-archive-1/archive", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("archived");

      // Verify in DB
      const link = db
        .query<{ status: string }, [string]>(
          "SELECT status FROM links WHERE id = ?"
        )
        .get("link-archive-1");
      expect(link!.status).toBe("archived");
    });

    test("returns 404 for non-existent link", async () => {
      const app = createApp();

      const res = await app.request("/api/links/non-existent/archive", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("POST /api/links/:id/extract", () => {
    test("resets extraction status to pending", async () => {
      const app = createApp();

      insertLink("link-extract-1", "https://extract.com", "Extract Me", {
        extractionStatus: "failed",
      });

      const res = await app.request("/api/links/link-extract-1/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.extractionStatus).toBe("pending");

      // Verify in DB
      const link = db
        .query<{ extraction_status: string }, [string]>(
          "SELECT extraction_status FROM links WHERE id = ?"
        )
        .get("link-extract-1");
      expect(link!.extraction_status).toBe("pending");
    });

    test("returns 404 for non-existent link", async () => {
      const app = createApp();

      const res = await app.request("/api/links/non-existent/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("cross-user isolation", () => {
    test("user A cannot see user B's links", async () => {
      const app = createApp();

      // Create another user
      const otherToken = "other-token-456";
      const otherUser = createUser(db, {
        name: "OtherUser",
        apiToken: otherToken,
      });
      seedDefaultCollections(db, otherUser.id);

      const otherInbox = db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM collections WHERE user_id = ? AND name = ?"
        )
        .get(otherUser.id, "inbox")!.id;

      // Create a link for the other user
      db.query(
        `INSERT INTO links (id, user_id, url, title, domain, collection_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        "other-link",
        otherUser.id,
        "https://secret.com",
        "Secret",
        "secret.com",
        otherInbox
      );

      // User A tries to GET it
      const getRes = await app.request("/api/links/other-link", {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(getRes.status).toBe(404);

      // User A tries to PATCH it
      const patchRes = await app.request("/api/links/other-link", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Hijacked" }),
      });
      expect(patchRes.status).toBe(404);

      // User A tries to DELETE it
      const deleteRes = await app.request("/api/links/other-link", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(deleteRes.status).toBe(404);

      // User A tries to archive it
      const archiveRes = await app.request("/api/links/other-link/archive", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(archiveRes.status).toBe(404);

      // Verify the link is untouched
      const link = db
        .query<{ title: string; status: string }, [string]>(
          "SELECT title, status FROM links WHERE id = ?"
        )
        .get("other-link");
      expect(link).not.toBeNull();
      expect(link!.title).toBe("Secret");
      expect(link!.status).toBe("saved");
    });

    test("user A listing does not include user B's links", async () => {
      const app = createApp();

      insertLink("my-link", "https://mine.com", "My Link");

      // Create another user with a link
      const otherToken = "other-token-789";
      const otherUser = createUser(db, {
        name: "OtherUser2",
        apiToken: otherToken,
      });
      seedDefaultCollections(db, otherUser.id);

      const otherInbox = db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM collections WHERE user_id = ? AND name = ?"
        )
        .get(otherUser.id, "inbox")!.id;

      db.query(
        `INSERT INTO links (id, user_id, url, title, domain, collection_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        "their-link",
        otherUser.id,
        "https://theirs.com",
        "Their Link",
        "theirs.com",
        otherInbox
      );

      const res = await app.request("/api/links", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].url).toBe("https://mine.com");
    });
  });

  describe("POST /api/links with pre-extracted content", () => {
    test("sets extraction_status to completed when content is provided", async () => {
      const app = createApp();

      const res = await app.request("/api/links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: "https://example.com/extracted",
          title: "Extracted Page",
          content: "This is the pre-extracted page content",
          description: "A test description",
          rawHtml: "<html><body>Test</body></html>",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.url).toBe("https://example.com/extracted");
      expect(body.extraction_status).toBe("completed");

      // Verify in DB
      const link = db
        .query<
          {
            extraction_status: string;
            content: string;
            description: string;
            raw_html: string;
          },
          [string]
        >("SELECT extraction_status, content, description, raw_html FROM links WHERE id = ?")
        .get(body.id);

      expect(link!.extraction_status).toBe("completed");
      expect(link!.content).toBe("This is the pre-extracted page content");
      expect(link!.description).toBe("A test description");
      expect(link!.raw_html).toBe("<html><body>Test</body></html>");
    });

    test("stores description and rawHtml correctly", async () => {
      const app = createApp();

      const res = await app.request("/api/links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: "https://example.com/full-extraction",
          content: "Full page content here",
          description: "Meta description from OG tags",
          rawHtml: "<!DOCTYPE html><html><head></head><body>Full page</body></html>",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      const link = db
        .query<
          { description: string; raw_html: string; favicon_url: string },
          [string]
        >("SELECT description, raw_html, favicon_url FROM links WHERE id = ?")
        .get(body.id);

      expect(link!.description).toBe("Meta description from OG tags");
      expect(link!.raw_html).toBe(
        "<!DOCTYPE html><html><head></head><body>Full page</body></html>"
      );
      expect(link!.favicon_url).toContain("example.com");
    });

    test("without content field triggers server-side extraction (pending status)", async () => {
      const app = createApp();

      const res = await app.request("/api/links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: "https://example.com/no-content",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.extraction_status).toBe("pending");
    });
  });
});
