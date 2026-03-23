import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { createTestDb } from "../../db/connection";
import { createUser, findByToken } from "../../db/queries/users";
import {
  seedDefaultCollections,
  listCollections,
  getCollectionByName,
} from "../../db/queries/collections";
import {
  createLink,
  getLink,
  listLinks,
  updateExtraction,
} from "../../db/queries/links";
import { listTags, getOrCreateTag, addTagToLink } from "../../db/queries/tags";
import { getPluginConfig } from "../../db/queries/pluginConfig";
import { recordAction, listActionsForLink } from "../../db/queries/linkActions";
import {
  insertPlugin,
  getPluginById,
  enablePluginForUser,
} from "../../db/queries/plugins";
import { executePlugin } from "../../plugins/executor";
import type { Database } from "bun:sqlite";
import type { TemplateContext } from "../../plugins/template";

// Mock extractor to prevent real HTTP calls
mock.module("../../services/extractor", () => ({
  extractAndUpdate: () => {},
}));

// Things manifest for testing
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

describe("MCP tool logic", () => {
  let db: Database;
  let userId: string;
  let inboxId: string;

  beforeEach(() => {
    db = createTestDb();
    const user = createUser(db, { name: "TestUser", apiToken: "test-token-mcp" });
    userId = user.id;
    seedDefaultCollections(db, userId);
    const collections = listCollections(db, userId);
    inboxId = collections.find((c) => c.name === "inbox")!.id;
  });

  afterEach(() => {
    db.close();
  });

  // -----------------------------------------------------------------------
  // 1. search_links logic
  // -----------------------------------------------------------------------
  test("search_links: FTS finds links by keyword in title", () => {
    createLink(db, userId, {
      url: "https://example.com/rust-guide",
      title: "The Rust Programming Language",
    });
    createLink(db, userId, {
      url: "https://example.com/go-guide",
      title: "Getting Started with Go",
    });

    // Update the Rust link with content so FTS index has data
    const rustLink = listLinks(db, userId).data.find(
      (l) => l.title === "The Rust Programming Language",
    )!;
    updateExtraction(db, rustLink.id, {
      description: "A comprehensive guide to Rust programming",
      extraction_status: "done",
    });

    const result = listLinks(db, userId, { q: "Rust" });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data.some((l) => l.title === "The Rust Programming Language")).toBe(
      true,
    );
    // FTS queries add a snippet field
    const match = result.data.find(
      (l) => l.title === "The Rust Programming Language",
    ) as unknown as Record<string, unknown>;
    expect(match.snippet).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 2. search_links with collection filter
  // -----------------------------------------------------------------------
  test("search_links: filters by collection_id", () => {
    const collections = listCollections(db, userId);
    const tools = collections.find((c) => c.name === "tools")!;

    createLink(db, userId, {
      url: "https://example.com/inbox-item",
      title: "Inbox Article",
    });
    createLink(db, userId, {
      url: "https://example.com/tool-item",
      title: "Useful Tool",
      collectionId: tools.id,
    });

    // Update both so FTS has entries
    const allLinks = listLinks(db, userId).data;
    for (const l of allLinks) {
      updateExtraction(db, l.id, {
        description: `Desc for ${l.title}`,
        extraction_status: "done",
      });
    }

    const result = listLinks(db, userId, { q: "Tool", collection_id: tools.id });
    expect(result.data.length).toBe(1);
    expect(result.data[0].title).toBe("Useful Tool");
  });

  // -----------------------------------------------------------------------
  // 3. get_link logic
  // -----------------------------------------------------------------------
  test("get_link: returns full data including tags", () => {
    const link = createLink(db, userId, {
      url: "https://example.com/tagged",
      title: "Tagged Article",
    });

    const tag1 = getOrCreateTag(db, userId, "typescript");
    const tag2 = getOrCreateTag(db, userId, "guide");
    addTagToLink(db, link.id, tag1.id);
    addTagToLink(db, link.id, tag2.id);

    const result = getLink(db, userId, link.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(link.id);
    expect(result!.url).toBe("https://example.com/tagged");
    expect(result!.title).toBe("Tagged Article");
    expect(result!.tags).toHaveLength(2);
    expect(result!.tags.map((t) => t.name).sort()).toEqual(["guide", "typescript"]);
  });

  // -----------------------------------------------------------------------
  // 4. get_link not found
  // -----------------------------------------------------------------------
  test("get_link: returns null for non-existent ID", () => {
    const result = getLink(db, userId, "does-not-exist-abc");
    expect(result).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 5. list_links pagination
  // -----------------------------------------------------------------------
  test("list_links: pagination envelope is correct with limit", () => {
    createLink(db, userId, { url: "https://example.com/a", title: "Link A" });
    createLink(db, userId, { url: "https://example.com/b", title: "Link B" });
    createLink(db, userId, { url: "https://example.com/c", title: "Link C" });

    const result = listLinks(db, userId, { page: 1, limit: 2 });
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.totalPages).toBe(2);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 6. list_links offset-to-page conversion
  // -----------------------------------------------------------------------
  test("list_links: offset to page conversion returns correct page", () => {
    createLink(db, userId, { url: "https://example.com/1", title: "Link 1" });
    createLink(db, userId, { url: "https://example.com/2", title: "Link 2" });
    createLink(db, userId, { url: "https://example.com/3", title: "Link 3" });

    // MCP server converts offset to page: page = Math.floor(offset / limit) + 1
    const limit = 2;
    const offset = 2;
    const page = Math.floor(offset / limit) + 1; // page 2

    const result = listLinks(db, userId, { page, limit });
    expect(result.data).toHaveLength(1);
    expect(result.pagination.page).toBe(2);
    expect(result.pagination.total).toBe(3);
  });

  // -----------------------------------------------------------------------
  // 7. list_collections
  // -----------------------------------------------------------------------
  test("list_collections: returns 5 default collections with counts", () => {
    // Create a link in inbox so at least one collection has a count > 0
    createLink(db, userId, { url: "https://example.com/inbox", title: "Inbox Link" });

    const collections = listCollections(db, userId);
    expect(collections).toHaveLength(5);

    const names = collections.map((c) => c.name).sort();
    expect(names).toEqual(["inbox", "inspiration", "manuals", "reference", "tools"]);

    // Each collection object has a link_count property
    for (const col of collections) {
      expect(typeof col.link_count).toBe("number");
    }

    const inbox = collections.find((c) => c.name === "inbox")!;
    expect(inbox.link_count).toBe(1);

    const tools = collections.find((c) => c.name === "tools")!;
    expect(tools.link_count).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 8. list_tags
  // -----------------------------------------------------------------------
  test("list_tags: returns tags with correct counts", () => {
    const link1 = createLink(db, userId, {
      url: "https://example.com/ts",
      title: "TS Guide",
    });
    const link2 = createLink(db, userId, {
      url: "https://example.com/js",
      title: "JS Guide",
    });

    const tsTag = getOrCreateTag(db, userId, "typescript");
    const jsTag = getOrCreateTag(db, userId, "javascript");
    addTagToLink(db, link1.id, tsTag.id);
    addTagToLink(db, link1.id, jsTag.id);
    addTagToLink(db, link2.id, jsTag.id);

    const tags = listTags(db, userId);
    expect(tags).toHaveLength(2);

    const js = tags.find((t) => t.name === "javascript")!;
    expect(js.link_count).toBe(2);

    const ts = tags.find((t) => t.name === "typescript")!;
    expect(ts.link_count).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 9. add_link logic
  // -----------------------------------------------------------------------
  test("add_link: createLink + tags results in correct link with source", () => {
    // Replicate what the MCP add_link tool does
    const link = createLink(db, userId, {
      url: "https://example.com/new-article",
      title: "New Article",
      source: "mcp",
    });

    const tag = getOrCreateTag(db, userId, "reading");
    addTagToLink(db, link.id, tag.id);

    // Verify the link was saved correctly
    const fetched = getLink(db, userId, link.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.url).toBe("https://example.com/new-article");
    expect(fetched!.title).toBe("New Article");
    expect(fetched!.source).toBe("mcp");
    expect(fetched!.collection_id).toBe(inboxId);
    expect(fetched!.tags).toHaveLength(1);
    expect(fetched!.tags[0].name).toBe("reading");
  });

  // -----------------------------------------------------------------------
  // 10. execute_action logic (declarative things plugin)
  // -----------------------------------------------------------------------
  test("execute_action: things plugin returns redirect and records action", async () => {
    // Insert the things plugin manifest into the DB
    insertPlugin(db, thingsManifest, true);
    enablePluginForUser(db, userId, "things");

    const link = createLink(db, userId, {
      url: "https://example.com/article-to-act-on",
      title: "Article For Things",
    });

    const fetched = getLink(db, userId, link.id)!;

    // Build template context as the MCP server does
    const tagNames = fetched.tags.map((t) => t.name);
    const context: TemplateContext = {
      link: {
        url: fetched.url,
        title: fetched.title,
        description: fetched.description,
        domain: fetched.domain,
        tags: tagNames.join(", "),
        tagsArray: JSON.stringify(tagNames),
        createdAt: fetched.created_at,
      },
      config: getPluginConfig(db, userId, "things"),
    };

    // Fetch the plugin from DB and execute
    const plugin = getPluginById(db, "things")!;
    const result = await executePlugin(plugin.manifest, context);

    expect(result.type).toBe("redirect");
    const redirect = result as { type: "redirect"; url: string };
    expect(redirect.url).toMatch(/^things:\/\/\/add\?/);
    expect(redirect.url).toContain(encodeURIComponent("Article For Things"));

    // Record the action as the MCP server does
    const actionMessage = result.type === "redirect" ? redirect.url : "";
    const action = recordAction(db, {
      linkId: link.id,
      pluginId: "things",
      status: result.type,
      message: actionMessage,
    });

    expect(action.linkId).toBe(link.id);
    expect(action.pluginId).toBe("things");
    expect(action.status).toBe("redirect");

    // Verify action history
    const history = listActionsForLink(db, link.id);
    expect(history).toHaveLength(1);
    expect(history[0].pluginId).toBe("things");
    expect(history[0].status).toBe("redirect");
  });

  // -----------------------------------------------------------------------
  // 11. collection name to ID resolution
  // -----------------------------------------------------------------------
  test("getCollectionByName: resolves inbox to correct ID", () => {
    const inbox = getCollectionByName(db, userId, "inbox");
    expect(inbox).not.toBeNull();
    expect(inbox!.id).toBe(inboxId);
    expect(inbox!.name).toBe("inbox");
  });

  test("getCollectionByName: returns null for non-existent collection", () => {
    const result = getCollectionByName(db, userId, "nonexistent");
    expect(result).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 12. auth: findByToken
  // -----------------------------------------------------------------------
  test("findByToken: returns user for valid token", () => {
    const result = findByToken(db, "test-token-mcp");
    expect(result).not.toBeNull();
    expect(result!.id).toBe(userId);
    expect(result!.name).toBe("TestUser");
  });

  test("findByToken: returns null for invalid token", () => {
    const result = findByToken(db, "invalid-token-xyz");
    expect(result).toBeNull();
  });
});
