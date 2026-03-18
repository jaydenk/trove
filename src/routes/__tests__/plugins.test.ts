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
import { registerPlugin, clearPlugins } from "../../plugins/registry";
import { thingsPlugin } from "../../plugins/things";
import { readerPlugin } from "../../plugins/reader";
import { n8nPlugin } from "../../plugins/n8n";
import { setPluginConfig } from "../../db/queries/pluginConfig";
import { listActionsForLink } from "../../db/queries/linkActions";
import plugins from "../plugins";

// Mock extractor to prevent real HTTP calls
mock.module("../../services/extractor", () => ({
  extractAndUpdate: () => {},
}));

describe("plugin routes", () => {
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

    clearPlugins();

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
    app.route("/", plugins);

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
      description?: string;
      userIdOverride?: string;
    } = {}
  ) {
    const domain = opts.domain ?? new URL(url).hostname;
    const collectionId = opts.collectionId ?? inboxId;
    const status = opts.status ?? "saved";
    const ownerUserId = opts.userIdOverride ?? userId;
    db.query(
      `INSERT INTO links (id, user_id, url, title, domain, collection_id, status, extraction_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')`
    ).run(id, ownerUserId, url, title, domain, collectionId, status);
  }

  describe("GET /api/plugins", () => {
    test("returns list of registered plugins with config status", async () => {
      registerPlugin(thingsPlugin);
      registerPlugin(readerPlugin);
      const app = createApp();

      const res = await app.request("/api/plugins", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);

      const things = body.find((p: { id: string }) => p.id === "things");
      expect(things).toBeDefined();
      expect(things.name).toBe("Things");
      expect(things.hasExecute).toBe(true);
      expect(things.isConfigured).toBe(true); // no required config

      const reader = body.find((p: { id: string }) => p.id === "reader");
      expect(reader).toBeDefined();
      expect(reader.name).toBe("Readwise Reader");
      expect(reader.hasExecute).toBe(true);
      expect(reader.isConfigured).toBe(false); // missing READWISE_TOKEN
    });
  });

  describe("GET /api/plugins/:id/config", () => {
    test("returns config and schema", async () => {
      registerPlugin(readerPlugin);
      setPluginConfig(db, userId, "reader", {
        READWISE_TOKEN: "my-secret-token",
      });
      const app = createApp();

      const res = await app.request("/api/plugins/reader/config", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.READWISE_TOKEN).toBe("my-secret-token");
      expect(body.schema.READWISE_TOKEN).toBeDefined();
      expect(body.schema.READWISE_TOKEN.required).toBe(true);
    });

    test("returns 404 for non-existent plugin", async () => {
      const app = createApp();

      const res = await app.request("/api/plugins/nonexistent/config", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PUT /api/plugins/:id/config", () => {
    test("sets config", async () => {
      registerPlugin(readerPlugin);
      const app = createApp();

      const res = await app.request("/api/plugins/reader/config", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ READWISE_TOKEN: "new-token-value" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.config.READWISE_TOKEN).toBe("new-token-value");
    });
  });

  describe("POST /api/links/:id/actions/:pluginId", () => {
    test("executes action (things plugin — returns redirect URL)", async () => {
      registerPlugin(thingsPlugin);
      insertLink("link-action-1", "https://example.com", "Example Article");
      const app = createApp();

      const res = await app.request(
        "/api/links/link-action-1/actions/things",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe("redirect");
      expect(body.url).toContain("things:///add");
      expect(body.url).toContain("Example%20Article");
    });

    test("records action in link_actions", async () => {
      registerPlugin(thingsPlugin);
      insertLink("link-action-2", "https://example.com/record", "Record Test");
      const app = createApp();

      await app.request("/api/links/link-action-2/actions/things", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const actions = listActionsForLink(db, "link-action-2");
      expect(actions.length).toBe(1);
      expect(actions[0].pluginId).toBe("things");
      expect(actions[0].status).toBe("redirect");
      expect(actions[0].message).toContain("things:///add");
    });

    test("returns 400 for unconfigured plugin (reader without token)", async () => {
      registerPlugin(readerPlugin);
      insertLink(
        "link-action-3",
        "https://example.com/unconfig",
        "Unconfigured"
      );
      const app = createApp();

      const res = await app.request(
        "/api/links/link-action-3/actions/reader",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("READWISE_TOKEN");
    });

    test("returns 404 for non-existent link", async () => {
      registerPlugin(thingsPlugin);
      const app = createApp();

      const res = await app.request(
        "/api/links/nonexistent-link/actions/things",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    test("returns 404 for another user's link (user isolation)", async () => {
      registerPlugin(thingsPlugin);

      // Create another user and their link
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

      insertLink("other-user-link", "https://secret.com", "Secret Link", {
        userIdOverride: otherUser.id,
        collectionId: otherInbox,
      });

      const app = createApp();

      // User A tries to execute an action on user B's link
      const res = await app.request(
        "/api/links/other-user-link/actions/things",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("POST /api/plugins/:id/webhook", () => {
    test("accepts ingest payload (n8n)", async () => {
      registerPlugin(n8nPlugin);
      const app = createApp();

      const res = await app.request("/api/plugins/n8n/webhook", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [
            { url: "https://ingested.com/article-1", title: "Ingested One" },
            { url: "https://ingested.com/article-2", title: "Ingested Two" },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.created).toBe(2);
      expect(body.skipped).toBe(0);
      expect(body.errors).toEqual([]);

      // Verify the links exist in the DB
      const links = db
        .query<{ url: string }, [string]>(
          "SELECT url FROM links WHERE user_id = ? ORDER BY url"
        )
        .all(userId);
      expect(links.length).toBe(2);
      expect(links[0].url).toBe("https://ingested.com/article-1");
      expect(links[1].url).toBe("https://ingested.com/article-2");
    });

    test("returns 400 for non-ingest plugin (things)", async () => {
      registerPlugin(thingsPlugin);
      const app = createApp();

      const res = await app.request("/api/plugins/things/webhook", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: [] }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("ingest");
    });
  });

  describe("authentication", () => {
    test("GET /api/plugins returns 401 without auth token", async () => {
      registerPlugin(thingsPlugin);
      const app = createApp();

      const res = await app.request("/api/plugins");
      expect(res.status).toBe(401);
    });

    test("GET /api/plugins/:id/config returns 401 without auth token", async () => {
      registerPlugin(thingsPlugin);
      const app = createApp();

      const res = await app.request("/api/plugins/things/config");
      expect(res.status).toBe(401);
    });

    test("PUT /api/plugins/:id/config returns 401 without auth token", async () => {
      registerPlugin(readerPlugin);
      const app = createApp();

      const res = await app.request("/api/plugins/reader/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ READWISE_TOKEN: "token" }),
      });
      expect(res.status).toBe(401);
    });

    test("POST /api/links/:id/actions/:pluginId returns 401 without auth token", async () => {
      registerPlugin(thingsPlugin);
      const app = createApp();

      const res = await app.request("/api/links/some-link/actions/things", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    test("POST /api/plugins/:id/webhook returns 401 without auth token", async () => {
      registerPlugin(n8nPlugin);
      const app = createApp();

      const res = await app.request("/api/plugins/n8n/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [] }),
      });
      expect(res.status).toBe(401);
    });
  });
});
