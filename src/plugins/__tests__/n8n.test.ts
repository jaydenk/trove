import { mock } from "bun:test";

mock.module("../../services/extractor", () => ({
  extractAndUpdate: () => {},
}));

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { n8nPlugin } from "../n8n";
import { createTestDb } from "../../db/connection";
import { createUser } from "../../db/queries/users";
import { seedDefaultCollections } from "../../db/queries/collections";
import { createLink } from "../../db/queries/links";
import { getLink } from "../../db/queries/links";
import { listTags } from "../../db/queries/tags";

let db: Database;
let userId: string;

beforeEach(() => {
  db = createTestDb();
  const user = createUser(db, {
    name: "Test User",
    apiToken: "test-token-123",
  });
  userId = user.id;
  seedDefaultCollections(db, userId);
});

afterEach(() => {
  db.close();
});

describe("n8n plugin", () => {
  test("implements TrovePlugin interface (has ingest, no execute)", () => {
    expect(n8nPlugin.id).toBe("n8n");
    expect(n8nPlugin.name).toBe("n8n Webhook");
    expect(n8nPlugin.icon).toBe("🔗");
    expect(n8nPlugin.description).toBe(
      "Receive links from n8n automation workflows"
    );
    expect(n8nPlugin.configSchema).toEqual({});
    expect(n8nPlugin.ingest).toBeDefined();
    expect(n8nPlugin.execute).toBeUndefined();
  });

  test("handles valid batch payload", async () => {
    const result = await n8nPlugin.ingest!.handleIngest(
      {
        items: [
          { url: "https://example.com/one" },
          { url: "https://example.com/two", title: "Article Two" },
        ],
      },
      {},
      db,
      userId
    );

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify links were created with source "plugin:n8n"
    const links = db
      .query<{ url: string; source: string }, [string]>(
        "SELECT url, source FROM links WHERE user_id = ?"
      )
      .all(userId);

    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.source).toBe("plugin:n8n");
    }
  });

  test("handles duplicate URLs (skips, increments skipped count)", async () => {
    // Create first link
    createLink(db, userId, {
      url: "https://example.com/existing",
      source: "manual",
    });

    const result = await n8nPlugin.ingest!.handleIngest(
      {
        items: [
          { url: "https://example.com/existing" },
          { url: "https://example.com/new-one" },
        ],
      },
      {},
      db,
      userId
    );

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  test("handles missing URL in an item (adds to errors)", async () => {
    const result = await n8nPlugin.ingest!.handleIngest(
      {
        items: [
          { title: "No URL" } as unknown,
        ],
      },
      {},
      db,
      userId
    );

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual(["Invalid payload"]);
  });

  test("handles empty items array", async () => {
    const result = await n8nPlugin.ingest!.handleIngest(
      { items: [] },
      {},
      db,
      userId
    );

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  test("looks up collection by name and assigns it", async () => {
    const result = await n8nPlugin.ingest!.handleIngest(
      {
        items: [
          { url: "https://example.com/ref-article", collection: "reference" },
        ],
      },
      {},
      db,
      userId
    );

    expect(result.created).toBe(1);

    // Verify the link was assigned to the "reference" collection
    const link = db
      .query<{ collection_id: string }, [string]>(
        "SELECT collection_id FROM links WHERE user_id = ? AND url = 'https://example.com/ref-article'"
      )
      .get(userId);

    const refCollection = db
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM collections WHERE user_id = ? AND name = ?"
      )
      .get(userId, "reference");

    expect(link!.collection_id).toBe(refCollection!.id);
  });

  test("creates tags from the tags array", async () => {
    const result = await n8nPlugin.ingest!.handleIngest(
      {
        items: [
          {
            url: "https://example.com/tagged",
            tags: ["automation", "workflow"],
          },
        ],
      },
      {},
      db,
      userId
    );

    expect(result.created).toBe(1);

    // Verify tags were created and assigned
    const tags = listTags(db, userId);
    const tagNames = tags.map((t) => t.name);
    expect(tagNames).toContain("automation");
    expect(tagNames).toContain("workflow");

    // Verify tags are linked to the link
    const link = db
      .query<{ id: string }, [string]>(
        "SELECT id FROM links WHERE user_id = ? AND url = 'https://example.com/tagged'"
      )
      .get(userId);

    const linkTags = db
      .query<{ name: string }, [string]>(
        `SELECT t.name FROM tags t
         INNER JOIN link_tags lt ON lt.tag_id = t.id
         WHERE lt.link_id = ?
         ORDER BY t.name`
      )
      .all(link!.id);

    expect(linkTags.map((t) => t.name)).toEqual(["automation", "workflow"]);
  });

  test("handles source_feed field", async () => {
    const result = await n8nPlugin.ingest!.handleIngest(
      {
        items: [
          {
            url: "https://example.com/feed-item",
            source_feed: "https://blog.example.com/rss",
          },
        ],
      },
      {},
      db,
      userId
    );

    expect(result.created).toBe(1);

    const link = db
      .query<{ source_feed: string | null }, [string]>(
        "SELECT source_feed FROM links WHERE user_id = ? AND url = 'https://example.com/feed-item'"
      )
      .get(userId);

    expect(link!.source_feed).toBe("https://blog.example.com/rss");
  });

  test("handles invalid payload (not an object)", async () => {
    const result = await n8nPlugin.ingest!.handleIngest(
      "not valid",
      {},
      db,
      userId
    );

    expect(result).toEqual({
      created: 0,
      skipped: 0,
      errors: ["Invalid payload"],
    });
  });

  test("handles invalid payload (null)", async () => {
    const result = await n8nPlugin.ingest!.handleIngest(
      null,
      {},
      db,
      userId
    );

    expect(result).toEqual({
      created: 0,
      skipped: 0,
      errors: ["Invalid payload"],
    });
  });
});
