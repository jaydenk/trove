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
import importExport from "../importExport";

// Mock extractor to prevent real HTTP calls
mock.module("../../services/extractor", () => ({
  extractAndUpdate: () => {},
}));

describe("import/export routes", () => {
  let db: Database;
  let userToken: string;
  let userId: string;
  let inboxId: string;

  beforeEach(() => {
    db = createTestDb();
    userToken = "ie-test-token-123";

    mock.module("../../db/connection", () => ({
      getDb: () => db,
      createTestDb,
    }));

    const user = createUser(db, {
      name: "ImportExportUser",
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
    app.route("/", importExport);

    return app;
  }

  function insertLink(
    id: string,
    url: string,
    title: string,
    opts: {
      collectionId?: string;
      description?: string;
      domain?: string;
    } = {}
  ) {
    const domain = opts.domain ?? new URL(url).hostname;
    const collectionId = opts.collectionId ?? inboxId;
    db.query(
      `INSERT INTO links (id, user_id, url, title, domain, collection_id, description, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`
    ).run(id, userId, url, title, domain, collectionId, opts.description ?? null);
  }

  // -------------------------------------------------------------------------
  // POST /api/import/preview
  // -------------------------------------------------------------------------

  describe("POST /api/import/preview", () => {
    test("returns parsed items without creating them", async () => {
      const app = createApp();

      const jsonData = JSON.stringify([
        { url: "https://example.com/one", title: "One" },
        { url: "https://example.com/two", title: "Two" },
      ]);

      const res = await app.request("/api/import/preview", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: jsonData }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.detectedFormat).toBe("json");
      expect(body.items).toHaveLength(2);
      expect(body.items[0].url).toBe("https://example.com/one");
      expect(body.items[0].title).toBe("One");
      expect(body.items[1].url).toBe("https://example.com/two");
      expect(body.errors).toEqual([]);

      // Verify NO links were created in the database
      const count = db
        .query<{ cnt: number }, [string]>(
          "SELECT COUNT(*) as cnt FROM links WHERE user_id = ?"
        )
        .get(userId);
      expect(count!.cnt).toBe(0);
    });

    test("previews nested collections with link arrays", async () => {
      const app = createApp();

      const jsonData = JSON.stringify({
        name: "Jayden",
        collections: [
          {
            id: 1,
            name: "Tech",
            links: [
              {
                id: 1,
                name: "Bun Runtime",
                url: "https://bun.sh",
                tags: [{ name: "javascript" }],
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
        ],
      });

      const res = await app.request("/api/import/preview", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: jsonData }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.detectedFormat).toBe("json");
      expect(body.items).toHaveLength(1);
      expect(body.items[0].url).toBe("https://bun.sh");
      expect(body.items[0].title).toBe("Bun Runtime");
      expect(body.items[0].tags).toEqual(["javascript"]);
      expect(body.items[0].collection).toBe("Tech");
    });

    test("returns 401 without auth", async () => {
      const app = createApp();

      const res = await app.request("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: "[]" }),
      });

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/import
  // -------------------------------------------------------------------------

  describe("POST /api/import", () => {
    test("imports JSON format and returns count", async () => {
      const app = createApp();

      const jsonData = JSON.stringify([
        { url: "https://example.com/one", title: "One" },
        { url: "https://example.com/two", title: "Two" },
        { url: "https://example.com/three", title: "Three" },
      ]);

      const res = await app.request("/api/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ format: "json", data: jsonData }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.imported).toBe(3);
      expect(body.skipped).toBe(0);
      expect(body.errors).toEqual([]);

      // Verify links exist in DB
      const count = db
        .query<{ cnt: number }, [string]>(
          "SELECT COUNT(*) as cnt FROM links WHERE user_id = ?"
        )
        .get(userId);
      expect(count!.cnt).toBe(3);
    });

    test("skips duplicate URLs and returns skipped count", async () => {
      const app = createApp();

      // Insert an existing link
      insertLink("existing-1", "https://example.com/existing", "Existing");

      const jsonData = JSON.stringify([
        { url: "https://example.com/existing", title: "Duplicate" },
        { url: "https://example.com/new", title: "New" },
      ]);

      const res = await app.request("/api/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ format: "json", data: jsonData }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.imported).toBe(1);
      expect(body.skipped).toBe(1);
    });

    test("creates tags from imported data", async () => {
      const app = createApp();

      const jsonData = JSON.stringify([
        {
          url: "https://example.com/tagged",
          title: "Tagged Link",
          tags: ["javascript", "tutorial"],
        },
      ]);

      const res = await app.request("/api/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ format: "json", data: jsonData }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.imported).toBe(1);

      // Verify tags were created
      const tags = db
        .query<{ name: string }, [string]>(
          "SELECT t.name FROM tags t WHERE t.user_id = ? ORDER BY t.name"
        )
        .all(userId);
      expect(tags.map((t) => t.name)).toEqual(["javascript", "tutorial"]);

      // Verify tags are linked
      const link = db
        .query<{ id: string }, [string]>(
          "SELECT id FROM links WHERE url = ?"
        )
        .get("https://example.com/tagged");
      const linkTags = db
        .query<{ name: string }, [string]>(
          `SELECT t.name FROM tags t
           INNER JOIN link_tags lt ON lt.tag_id = t.id
           WHERE lt.link_id = ?
           ORDER BY t.name`
        )
        .all(link!.id);
      expect(linkTags.map((t) => t.name)).toEqual(["javascript", "tutorial"]);
    });

    test("returns 401 without auth", async () => {
      const app = createApp();

      const res = await app.request("/api/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          format: "json",
          data: JSON.stringify([{ url: "https://example.com" }]),
        }),
      });

      expect(res.status).toBe(401);
    });

    test("imports CSV format", async () => {
      const app = createApp();

      const csvData = "url,title\nhttps://csv-one.com,CSV One\nhttps://csv-two.com,CSV Two";

      const res = await app.request("/api/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ format: "csv", data: csvData }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.imported).toBe(2);
      expect(body.skipped).toBe(0);
    });

    test("imports HTML bookmark format", async () => {
      const app = createApp();

      const htmlData = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>reference</H3>
    <DL><p>
        <DT><A HREF="https://html-link.com" ADD_DATE="1700000000">HTML Link</A>
    </DL><p>
</DL><p>`;

      const res = await app.request("/api/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ format: "html", data: htmlData }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.imported).toBe(1);

      // Verify the link was placed in the "reference" collection
      const link = db
        .query<{ collection_id: string }, [string]>(
          "SELECT collection_id FROM links WHERE url = ?"
        )
        .get("https://html-link.com");

      const refCollection = db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM collections WHERE user_id = ? AND name = ?"
        )
        .get(userId, "reference");

      expect(link!.collection_id).toBe(refCollection!.id);
    });

    test("auto-detects format when format is omitted", async () => {
      const app = createApp();

      const jsonData = JSON.stringify([
        { url: "https://example.com/auto", title: "Auto Detected" },
      ]);

      const res = await app.request("/api/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: jsonData }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.imported).toBe(1);
      expect(body.detectedFormat).toBe("json");
    });

    test("imports pre-parsed items array directly (preview flow)", async () => {
      const app = createApp();

      const items = [
        { url: "https://example.com/pre-one", title: "Pre One" },
        { url: "https://example.com/pre-two", title: "Pre Two", tags: ["tag1"] },
      ];

      const res = await app.request("/api/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.imported).toBe(2);
      expect(body.skipped).toBe(0);
      expect(body.detectedFormat).toBe("preview");

      // Verify links exist in DB
      const count = db
        .query<{ cnt: number }, [string]>(
          "SELECT COUNT(*) as cnt FROM links WHERE user_id = ?"
        )
        .get(userId);
      expect(count!.cnt).toBe(2);

      // Verify tags were created
      const tags = db
        .query<{ name: string }, [string]>(
          "SELECT t.name FROM tags t WHERE t.user_id = ? ORDER BY t.name"
        )
        .all(userId);
      expect(tags.map((t) => t.name)).toEqual(["tag1"]);
    });

    test("imports empty items array without error", async () => {
      const app = createApp();

      const res = await app.request("/api/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: [] }),
      });

      // Empty array should trigger the data path since items.length === 0
      expect(res.status).toBe(400);
    });

    test("returns detectedFormat in response", async () => {
      const app = createApp();

      const csvData = "url,title\nhttps://csv-detect.com,CSV Detect";

      const res = await app.request("/api/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: csvData }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.imported).toBe(1);
      expect(body.detectedFormat).toBe("csv");
    });

    test("imports plain text with URLs (auto-detected)", async () => {
      const app = createApp();

      const textData = "Check out https://text-import.com and https://text-import2.com today";

      const res = await app.request("/api/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: textData }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.imported).toBe(2);
      expect(body.detectedFormat).toBe("text");
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/export/*
  // -------------------------------------------------------------------------

  describe("GET /api/export/json", () => {
    test("returns valid JSON with Content-Disposition header", async () => {
      const app = createApp();

      insertLink("exp-1", "https://export-one.com", "Export One");
      insertLink("exp-2", "https://export-two.com", "Export Two");

      const res = await app.request("/api/export/json", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Disposition")).toContain(
        'filename="trove-export.json"'
      );
      expect(res.headers.get("Content-Type")).toContain("application/json");

      const body = JSON.parse(await res.text());
      expect(body.version).toBe("1.0");
      expect(body.links).toHaveLength(2);
      expect(body.links[0].url).toBeDefined();
    });
  });

  describe("GET /api/export/csv", () => {
    test("returns valid CSV with Content-Disposition header", async () => {
      const app = createApp();

      insertLink("csv-1", "https://csv-export.com", "CSV Export");

      const res = await app.request("/api/export/csv", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Disposition")).toContain(
        'filename="trove-export.csv"'
      );
      expect(res.headers.get("Content-Type")).toContain("text/csv");

      const text = await res.text();
      expect(text).toContain("url,title,description,domain,collection,tags,source,created_at");
      expect(text).toContain("https://csv-export.com");
    });
  });

  describe("GET /api/export/html", () => {
    test("returns valid HTML with Content-Disposition header", async () => {
      const app = createApp();

      insertLink("html-1", "https://html-export.com", "HTML Export");

      const res = await app.request("/api/export/html", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Disposition")).toContain(
        'filename="trove-bookmarks.html"'
      );
      expect(res.headers.get("Content-Type")).toContain("text/html");

      const text = await res.text();
      expect(text).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
      expect(text).toContain("https://html-export.com");
    });
  });

  // -------------------------------------------------------------------------
  // Round-trip test
  // -------------------------------------------------------------------------

  describe("round-trip", () => {
    test("export as JSON then re-import preserves data", async () => {
      const app = createApp();

      // Create some links with tags
      insertLink("rt-1", "https://roundtrip-one.com", "Roundtrip One");
      insertLink("rt-2", "https://roundtrip-two.com", "Roundtrip Two");

      // Add a tag to one of them
      db.query("INSERT INTO tags (id, user_id, name) VALUES (?, ?, ?)").run(
        "rt-tag-1",
        userId,
        "test-tag"
      );
      db.query("INSERT INTO link_tags (link_id, tag_id) VALUES (?, ?)").run(
        "rt-1",
        "rt-tag-1"
      );

      // Export
      const exportRes = await app.request("/api/export/json", {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(exportRes.status).toBe(200);
      const exportedJson = await exportRes.text();
      const parsed = JSON.parse(exportedJson);
      expect(parsed.links).toHaveLength(2);

      // Delete existing links
      db.query("DELETE FROM links WHERE user_id = ?").run(userId);

      // Re-import
      const importRes = await app.request("/api/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ format: "json", data: exportedJson }),
      });

      expect(importRes.status).toBe(200);
      const importBody = await importRes.json();
      expect(importBody.imported).toBe(2);
      expect(importBody.skipped).toBe(0);

      // Verify the re-imported links
      const links = db
        .query<{ url: string; title: string }, [string]>(
          "SELECT url, title FROM links WHERE user_id = ? ORDER BY url"
        )
        .all(userId);
      expect(links).toHaveLength(2);
      expect(links[0].url).toBe("https://roundtrip-one.com");
      expect(links[1].url).toBe("https://roundtrip-two.com");
    });
  });

  // -------------------------------------------------------------------------
  // Auth on export endpoints
  // -------------------------------------------------------------------------

  describe("export auth", () => {
    test("GET /api/export/json returns 401 without auth", async () => {
      const app = createApp();
      const res = await app.request("/api/export/json");
      expect(res.status).toBe(401);
    });

    test("GET /api/export/csv returns 401 without auth", async () => {
      const app = createApp();
      const res = await app.request("/api/export/csv");
      expect(res.status).toBe(401);
    });

    test("GET /api/export/html returns 401 without auth", async () => {
      const app = createApp();
      const res = await app.request("/api/export/html");
      expect(res.status).toBe(401);
    });
  });
});
