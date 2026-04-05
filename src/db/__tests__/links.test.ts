import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "../connection";
import { createUser } from "../queries/users";
import { seedDefaultCollections, listCollections } from "../queries/collections";
import { createTag, addTagToLink } from "../queries/tags";
import {
  createLink,
  getLink,
  listLinks,
  updateLink,
  deleteLink,
  archiveLink,
  updateExtraction,
} from "../queries/links";
import { recordAction } from "../queries/linkActions";
import { insertPlugin } from "../queries/plugins";

describe("links", () => {
  let db: Database;
  let userId: string;
  let inboxId: string;

  beforeEach(() => {
    db = createTestDb();
    const user = createUser(db, { name: "Alice", apiToken: "token-1" });
    userId = user.id;
    seedDefaultCollections(db, userId);
    const collections = listCollections(db, userId);
    inboxId = collections.find((c) => c.name === "inbox")!.id;
  });

  afterEach(() => {
    db.close();
  });

  test("create link returns pending extraction", () => {
    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "Example Site",
    });

    expect(link.id).toBeDefined();
    expect(link.id.length).toBe(21);
    expect(link.url).toBe("https://example.com");
    expect(link.title).toBe("Example Site");
    expect(link.extraction_status).toBe("pending");
    expect(link.status).toBe("saved");
    expect(link.collection_id).toBe(inboxId);
    expect(link.domain).toBe("example.com");
  });

  test("create link without title uses domain", () => {
    const link = createLink(db, userId, {
      url: "https://www.mozilla.org/en-US/",
    });

    expect(link.title).toBe("www.mozilla.org");
  });

  test("get link by id includes tags", () => {
    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "Example",
    });

    const tag = createTag(db, userId, "test-tag");
    addTagToLink(db, link.id, tag.id);

    const result = getLink(db, userId, link.id);
    expect(result).not.toBeNull();
    expect(result!.tags).toHaveLength(1);
    expect(result!.tags[0].name).toBe("test-tag");
  });

  test("get link returns null for non-existent", () => {
    const result = getLink(db, userId, "nonexistent-id");
    expect(result).toBeNull();
  });

  test("list links with pagination", () => {
    // Create 5 links
    for (let i = 0; i < 5; i++) {
      createLink(db, userId, {
        url: `https://example.com/${i}`,
        title: `Link ${i}`,
      });
    }

    const result = listLinks(db, userId, { page: 1, limit: 2 });
    expect(result.data.length).toBe(2);
    expect(result.pagination.total).toBe(5);
    expect(result.pagination.totalPages).toBe(3);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(2);

    const page2 = listLinks(db, userId, { page: 2, limit: 2 });
    expect(page2.data.length).toBe(2);

    const page3 = listLinks(db, userId, { page: 3, limit: 2 });
    expect(page3.data.length).toBe(1);
  });

  test("filter by collection_id", () => {
    const collections = listCollections(db, userId);
    const tools = collections.find((c) => c.name === "tools")!;

    createLink(db, userId, {
      url: "https://example.com/inbox-link",
      title: "Inbox Link",
    });
    createLink(db, userId, {
      url: "https://example.com/tool-link",
      title: "Tool Link",
      collectionId: tools.id,
    });

    const result = listLinks(db, userId, { collection_id: tools.id });
    expect(result.data.length).toBe(1);
    expect(result.data[0].title).toBe("Tool Link");
  });

  test("filter by status=archived", () => {
    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "To Archive",
    });

    archiveLink(db, userId, link.id);

    const archived = listLinks(db, userId, { status: "archived" });
    expect(archived.data.length).toBe(1);
    expect(archived.data[0].status).toBe("archived");

    const saved = listLinks(db, userId, { status: "saved" });
    expect(saved.data.length).toBe(0);
  });

  test("filter by tag name", () => {
    const link1 = createLink(db, userId, {
      url: "https://example.com/tagged",
      title: "Tagged Link",
    });
    createLink(db, userId, {
      url: "https://example.com/untagged",
      title: "Untagged Link",
    });

    const tag = createTag(db, userId, "javascript");
    addTagToLink(db, link1.id, tag.id);

    const result = listLinks(db, userId, { tag: "javascript" });
    expect(result.data.length).toBe(1);
    expect(result.data[0].title).toBe("Tagged Link");
  });

  test("filter by domain", () => {
    createLink(db, userId, {
      url: "https://github.com/repo",
      title: "GitHub Repo",
    });
    createLink(db, userId, {
      url: "https://stackoverflow.com/question",
      title: "SO Question",
    });

    const result = listLinks(db, userId, { domain: "github.com" });
    expect(result.data.length).toBe(1);
    expect(result.data[0].title).toBe("GitHub Repo");
  });

  test("filter by source", () => {
    createLink(db, userId, {
      url: "https://example.com/manual",
      title: "Manual Link",
    });
    createLink(db, userId, {
      url: "https://example.com/rss",
      title: "RSS Link",
      source: "rss",
    });

    const manualResult = listLinks(db, userId, { source: "manual" });
    expect(manualResult.data.length).toBe(1);
    expect(manualResult.data[0].title).toBe("Manual Link");

    const rssResult = listLinks(db, userId, { source: "rss" });
    expect(rssResult.data.length).toBe(1);
    expect(rssResult.data[0].title).toBe("RSS Link");
  });

  test("FTS search returns results with snippets", () => {
    createLink(db, userId, {
      url: "https://example.com/typescript",
      title: "TypeScript Handbook",
    });
    createLink(db, userId, {
      url: "https://example.com/python",
      title: "Python Tutorial",
    });

    // Update the first link with content for FTS
    const link = listLinks(db, userId).data.find(
      (l) => l.title === "TypeScript Handbook"
    )!;
    updateExtraction(db, link.id, {
      description: "A comprehensive guide to TypeScript programming",
      extraction_status: "done",
    });

    const result = listLinks(db, userId, { q: "TypeScript" });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(
      result.data.some((l) => l.title === "TypeScript Handbook")
    ).toBe(true);
  });

  test("update link", () => {
    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "Original",
    });

    const updated = updateLink(db, userId, link.id, {
      title: "Updated Title",
    });

    expect(updated.title).toBe("Updated Title");
  });

  test("delete link", () => {
    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "To Delete",
    });

    deleteLink(db, userId, link.id);

    const result = getLink(db, userId, link.id);
    expect(result).toBeNull();
  });

  test("archive link", () => {
    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "To Archive",
    });

    archiveLink(db, userId, link.id);

    const result = getLink(db, userId, link.id);
    expect(result!.status).toBe("archived");
  });

  test("duplicate URL per user fails", () => {
    createLink(db, userId, {
      url: "https://example.com",
      title: "First",
    });

    expect(() =>
      createLink(db, userId, {
        url: "https://example.com",
        title: "Second",
      })
    ).toThrow();
  });

  test("same URL different users succeeds", () => {
    const user2 = createUser(db, { name: "Bob", apiToken: "token-2" });
    seedDefaultCollections(db, user2.id);

    const link1 = createLink(db, userId, {
      url: "https://example.com",
      title: "Alice's link",
    });
    const link2 = createLink(db, user2.id, {
      url: "https://example.com",
      title: "Bob's link",
    });

    expect(link1.id).not.toBe(link2.id);
  });

  test("user isolation — A cannot see B's links", () => {
    const user2 = createUser(db, { name: "Bob", apiToken: "token-2" });
    seedDefaultCollections(db, user2.id);

    createLink(db, userId, {
      url: "https://example.com/alice",
      title: "Alice's link",
    });
    createLink(db, user2.id, {
      url: "https://example.com/bob",
      title: "Bob's link",
    });

    const aliceLinks = listLinks(db, userId);
    expect(aliceLinks.data.length).toBe(1);
    expect(aliceLinks.data[0].title).toBe("Alice's link");

    const bobLinks = listLinks(db, user2.id);
    expect(bobLinks.data.length).toBe(1);
    expect(bobLinks.data[0].title).toBe("Bob's link");
  });

  test("updateExtraction updates link fields", () => {
    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "Before Extraction",
    });

    updateExtraction(db, link.id, {
      title: "After Extraction",
      description: "A great site",
      content: "Full page content here",
      favicon_url: "https://example.com/favicon.ico",
      image_url: "https://example.com/og.png",
      domain: "example.com",
      extraction_status: "done",
    });

    const updated = getLink(db, userId, link.id);
    expect(updated!.title).toBe("After Extraction");
    expect(updated!.description).toBe("A great site");
    expect(updated!.content).toBe("Full page content here");
    expect(updated!.favicon_url).toBe("https://example.com/favicon.ico");
    expect(updated!.extraction_status).toBe("done");
  });

  test("archived links include deduplicated action badges", () => {
    const link = createLink(db, userId, {
      url: "https://example.com/with-actions",
      title: "Actioned Link",
    });

    // Insert a plugin so we can reference it
    insertPlugin(db, {
      id: "reader",
      name: "Readwise Reader",
      icon: "📖",
      description: "Send to Reader",
      version: "1.0.0",
      direction: "export" as const,
      config: {},
      execute: {
        type: "url-redirect" as const,
        actionLabel: "Send to Reader",
        urlTemplate: "https://reader.example.com/{{link.url}}",
      },
    }, true);

    // Record two successful actions for the same plugin (should deduplicate)
    recordAction(db, { linkId: link.id, pluginId: "reader", status: "success", message: "Sent" });
    recordAction(db, { linkId: link.id, pluginId: "reader", status: "success", message: "Sent again" });

    // Record a failed action (should be excluded)
    recordAction(db, { linkId: link.id, pluginId: "reader", status: "error", message: "Failed" });

    // Archive the link
    archiveLink(db, userId, link.id);

    // List archived links
    const result = listLinks(db, userId, { status: "archived" });
    expect(result.data.length).toBe(1);
    expect(result.data[0].actions).toBeDefined();
    expect(result.data[0].actions!.length).toBe(1); // Deduplicated
    expect(result.data[0].actions![0].pluginId).toBe("reader");
    expect(result.data[0].actions![0].pluginName).toBe("Readwise Reader");
    expect(result.data[0].actions![0].pluginIcon).toBe("📖");
  });

  test("non-archived links do not include actions array", () => {
    const link = createLink(db, userId, {
      url: "https://example.com/no-actions",
      title: "Normal Link",
    });

    const result = listLinks(db, userId);
    const found = result.data.find((l) => l.id === link.id);
    expect(found).toBeDefined();
    expect(found!.actions).toBeUndefined();
  });
});
