import { mock } from "bun:test";

mock.module("../../services/extractor", () => ({
  extractAndUpdate: () => {},
}));

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleIngest } from "../executor";
import { createTestDb } from "../../db/connection";
import { createUser } from "../../db/queries/users";
import { seedDefaultCollections } from "../../db/queries/collections";
import { createLink } from "../../db/queries/links";
import { listTags } from "../../db/queries/tags";
import type { PluginManifest } from "../manifest";

const n8nManifest: PluginManifest = {
  id: "n8n",
  name: "n8n Webhook",
  icon: "\ud83d\udd17",
  description: "Receive links from n8n automation workflows",
  version: "1.0.0",
  direction: "ingest",
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

describe("ingest handler", () => {
  test("handles valid batch payload (items array)", async () => {
    const result = await handleIngest(
      n8nManifest,
      {
        items: [
          { url: "https://example.com/one" },
          { url: "https://example.com/two", title: "Article Two" },
        ],
      },
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

    const result = await handleIngest(
      n8nManifest,
      {
        items: [
          { url: "https://example.com/existing" },
          { url: "https://example.com/new-one" },
        ],
      },
      db,
      userId
    );

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  test("handles missing URL in an item", async () => {
    const result = await handleIngest(
      n8nManifest,
      {
        items: [{ title: "No URL" }],
      },
      db,
      userId
    );

    expect(result.created).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("url");
  });

  test("handles empty items array", async () => {
    const result = await handleIngest(
      n8nManifest,
      { items: [] },
      db,
      userId
    );

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  test("looks up collection by name and assigns it", async () => {
    const result = await handleIngest(
      n8nManifest,
      {
        items: [
          { url: "https://example.com/ref-article", collection: "reference" },
        ],
      },
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
    const result = await handleIngest(
      n8nManifest,
      {
        items: [
          {
            url: "https://example.com/tagged",
            tags: ["automation", "workflow"],
          },
        ],
      },
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
    const result = await handleIngest(
      n8nManifest,
      {
        items: [
          {
            url: "https://example.com/feed-item",
            source_feed: "https://blog.example.com/rss",
          },
        ],
      },
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
    const result = await handleIngest(n8nManifest, "not valid", db, userId);

    expect(result).toEqual({
      created: 0,
      skipped: 0,
      errors: ["Invalid payload"],
    });
  });

  test("handles invalid payload (null)", async () => {
    const result = await handleIngest(n8nManifest, null, db, userId);

    expect(result).toEqual({
      created: 0,
      skipped: 0,
      errors: ["Invalid payload"],
    });
  });

  test("handles a plain array body (not wrapped in items)", async () => {
    const result = await handleIngest(
      n8nManifest,
      [
        { url: "https://example.com/array-1" },
        { url: "https://example.com/array-2" },
      ],
      db,
      userId
    );

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
  });
});
