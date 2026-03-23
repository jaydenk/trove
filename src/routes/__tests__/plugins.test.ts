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
import { insertPlugin, enablePluginForUser } from "../../db/queries/plugins";
import { setPluginConfig } from "../../db/queries/pluginConfig";
import { listActionsForLink } from "../../db/queries/linkActions";
import { seedSystemPlugins } from "../../seed";
import plugins from "../plugins";

// Mock extractor to prevent real HTTP calls
mock.module("../../services/extractor", () => ({
  extractAndUpdate: () => {},
}));

// JSON manifests for testing
const thingsManifest = {
  id: "things",
  name: "Things",
  icon: "\u2705",
  description: "Create a task in Things from a link",
  version: "1.0.0",
  direction: "export" as const,
  config: {},
  execute: {
    type: "url-redirect" as const,
    actionLabel: "Send to Things",
    urlTemplate:
      "things:///add?title={{link.title|urlencode}}&notes={{link.url|urlencode}}&tags=trove",
  },
};

const readerManifest = {
  id: "reader",
  name: "Readwise Reader",
  icon: "\ud83d\udcd6",
  description: "Send links to Readwise Reader for reading later",
  version: "1.0.0",
  direction: "export" as const,
  config: {
    READWISE_TOKEN: {
      label: "Readwise API Token",
      type: "string" as const,
      required: true,
    },
  },
  execute: {
    type: "api-call" as const,
    actionLabel: "Send to Reader",
    method: "POST",
    url: "https://readwise.io/api/v3/save/",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Token {{config.READWISE_TOKEN}}",
    },
    body: {
      url: "{{link.url}}",
      tags: "{{link.tagsArray}}",
    },
    successMessage: "Sent to Readwise Reader",
  },
};

const n8nManifest = {
  id: "n8n",
  name: "n8n Webhook",
  icon: "\ud83d\udd17",
  description: "Receive links from n8n automation workflows",
  version: "1.0.0",
  direction: "ingest" as const,
  config: {},
  ingest: {
    description: "Receive links from n8n automation workflows",
    itemMapping: {
      url: "$.url",
      title: "$.title",
      tags: "$.tags",
      collection: "$.collection",
      sourceFeed: "$.source_feed",
    },
  },
};

const readerWithHealthCheck = {
  ...readerManifest,
  healthCheck: {
    url: "https://readwise.io/api/v2/auth/",
    headers: { Authorization: "Token {{config.READWISE_TOKEN}}" },
    expectedStatus: 204,
  },
};

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

  function seedPlugins() {
    insertPlugin(db, thingsManifest, true);
    insertPlugin(db, readerManifest, true);
    insertPlugin(db, n8nManifest, true);
    enablePluginForUser(db, userId, "things");
    enablePluginForUser(db, userId, "reader");
    enablePluginForUser(db, userId, "n8n");
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
    test("returns list of plugins with config status", async () => {
      seedPlugins();
      const app = createApp();

      const res = await app.request("/api/plugins", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(3);

      const things = body.find((p: { id: string }) => p.id === "things");
      expect(things).toBeDefined();
      expect(things.name).toBe("Things");
      expect(things.hasExecute).toBe(true);
      expect(things.isConfigured).toBe(true); // no required config
      expect(things.direction).toBe("export");
      expect(things.enabled).toBe(true);
      expect(things.isSystem).toBe(true);

      const reader = body.find((p: { id: string }) => p.id === "reader");
      expect(reader).toBeDefined();
      expect(reader.name).toBe("Readwise Reader");
      expect(reader.hasExecute).toBe(true);
      expect(reader.isConfigured).toBe(false); // missing READWISE_TOKEN
      expect(reader.direction).toBe("export");
    });
  });

  describe("GET /api/plugins/:id/config", () => {
    test("returns config and schema", async () => {
      seedPlugins();
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
      seedPlugins();
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

  describe("PUT /api/plugins/:id/enable and disable", () => {
    test("enables and disables a plugin for the user", async () => {
      seedPlugins();
      const app = createApp();

      // Disable
      const disableRes = await app.request("/api/plugins/things/disable", {
        method: "PUT",
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(disableRes.status).toBe(200);
      const disableBody = await disableRes.json();
      expect(disableBody.enabled).toBe(false);

      // Check list
      const listRes = await app.request("/api/plugins", {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      const listBody = await listRes.json();
      const things = listBody.find((p: { id: string }) => p.id === "things");
      expect(things.enabled).toBe(false);

      // Re-enable
      const enableRes = await app.request("/api/plugins/things/enable", {
        method: "PUT",
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(enableRes.status).toBe(200);
      const enableBody = await enableRes.json();
      expect(enableBody.enabled).toBe(true);
    });
  });

  describe("POST /api/plugins (upload)", () => {
    test("admin can upload a custom plugin", async () => {
      // Make user admin
      db.query("UPDATE users SET is_admin = 1 WHERE id = ?").run(userId);
      const app = createApp();

      const customManifest = {
        id: "custom-test",
        name: "Custom Test",
        direction: "export",
        config: {},
        execute: {
          type: "url-redirect",
          actionLabel: "Test",
          urlTemplate: "https://example.com/{{link.url|urlencode}}",
        },
      };

      const res = await app.request("/api/plugins", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(customManifest),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe("custom-test");
      expect(body.name).toBe("Custom Test");
      expect(body.isSystem).toBe(false);
    });

    test("non-admin cannot upload a plugin", async () => {
      const app = createApp();

      const res = await app.request("/api/plugins", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "blocked",
          name: "Blocked",
          direction: "export",
          execute: {
            type: "url-redirect",
            actionLabel: "X",
            urlTemplate: "https://x.com",
          },
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/plugins/:id", () => {
    test("admin can delete non-system plugin", async () => {
      db.query("UPDATE users SET is_admin = 1 WHERE id = ?").run(userId);
      insertPlugin(
        db,
        {
          id: "deletable",
          name: "Deletable",
          direction: "export",
          config: {},
          execute: {
            type: "url-redirect",
            actionLabel: "X",
            urlTemplate: "https://x.com",
          },
        },
        false
      );
      const app = createApp();

      const res = await app.request("/api/plugins/deletable", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(204);
    });

    test("admin cannot delete system plugin", async () => {
      db.query("UPDATE users SET is_admin = 1 WHERE id = ?").run(userId);
      seedPlugins();
      const app = createApp();

      const res = await app.request("/api/plugins/things", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain("system");
    });
  });

  describe("POST /api/links/:id/actions/:pluginId", () => {
    test("executes action (things plugin — returns redirect URL)", async () => {
      seedPlugins();
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
      seedPlugins();
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
      seedPlugins();
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
      seedPlugins();
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
      seedPlugins();

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
      seedPlugins();
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
      seedPlugins();
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

  describe("POST /api/plugins/:id/health-check", () => {
    test("returns ok for valid health check", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response("", { status: 204 }))
      ) as any;

      try {
        insertPlugin(db, readerWithHealthCheck as any, true);
        enablePluginForUser(db, userId, "reader");
        setPluginConfig(db, userId, "reader", { READWISE_TOKEN: "test-token" });

        const app = createApp();
        const res = await app.request("/api/plugins/reader/health-check", {
          method: "POST",
          headers: { Authorization: `Bearer ${userToken}` },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe("ok");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("returns 400 for plugin without healthCheck", async () => {
      insertPlugin(db, thingsManifest, true);
      enablePluginForUser(db, userId, "things");

      const app = createApp();
      const res = await app.request("/api/plugins/things/health-check", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(400);
    });

    test("returns 404 for unknown plugin", async () => {
      const app = createApp();
      const res = await app.request("/api/plugins/nonexistent/health-check", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/plugins/:id/test", () => {
    test("returns redirect result for url-redirect plugin", async () => {
      insertPlugin(db, thingsManifest, true);
      enablePluginForUser(db, userId, "things");

      const app = createApp();
      const res = await app.request("/api/plugins/things/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe("redirect");
      expect(body.url).toContain("things:///add");
      expect(body.url).toContain("Trove%20Test");
    });

    test("returns error for plugin without execute block", async () => {
      const ingestOnly = {
        id: "ingest-only",
        name: "Ingest",
        direction: "ingest" as const,
        ingest: { itemMapping: { url: "$.url" } },
      };
      insertPlugin(db, ingestOnly as any, false);
      enablePluginForUser(db, userId, "ingest-only");

      const app = createApp();
      const res = await app.request("/api/plugins/ingest-only/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(400);
    });

    test("does not record action in link_actions", async () => {
      insertPlugin(db, thingsManifest, true);
      enablePluginForUser(db, userId, "things");

      const app = createApp();
      await app.request("/api/plugins/things/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      const actions = db
        .query("SELECT COUNT(*) as count FROM link_actions")
        .get() as { count: number };
      expect(actions.count).toBe(0);
    });
  });

  describe("authentication", () => {
    test("GET /api/plugins returns 401 without auth token", async () => {
      seedPlugins();
      const app = createApp();

      const res = await app.request("/api/plugins");
      expect(res.status).toBe(401);
    });

    test("GET /api/plugins/:id/config returns 401 without auth token", async () => {
      seedPlugins();
      const app = createApp();

      const res = await app.request("/api/plugins/things/config");
      expect(res.status).toBe(401);
    });

    test("PUT /api/plugins/:id/config returns 401 without auth token", async () => {
      seedPlugins();
      const app = createApp();

      const res = await app.request("/api/plugins/reader/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ READWISE_TOKEN: "token" }),
      });
      expect(res.status).toBe(401);
    });

    test("POST /api/links/:id/actions/:pluginId returns 401 without auth token", async () => {
      seedPlugins();
      const app = createApp();

      const res = await app.request("/api/links/some-link/actions/things", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    test("POST /api/plugins/:id/webhook returns 401 without auth token", async () => {
      seedPlugins();
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
