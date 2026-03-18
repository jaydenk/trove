import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "../connection";
import { createUser } from "../queries/users";
import {
  seedDefaultCollections,
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
} from "../queries/collections";
import { createLink } from "../queries/links";

describe("collections", () => {
  let db: Database;
  let userId: string;

  beforeEach(() => {
    db = createTestDb();
    const user = createUser(db, { name: "Alice", apiToken: "token-1" });
    userId = user.id;
  });

  afterEach(() => {
    db.close();
  });

  test("seed creates 5 default collections", () => {
    seedDefaultCollections(db, userId);
    const collections = listCollections(db, userId);
    expect(collections.length).toBe(5);

    const names = collections.map((c) => c.name).sort();
    expect(names).toEqual(
      ["inbox", "inspiration", "manuals", "reference", "tools"].sort()
    );
  });

  test("list collections with counts", () => {
    seedDefaultCollections(db, userId);
    const collections = listCollections(db, userId);
    const inbox = collections.find((c) => c.name === "inbox")!;

    // Create a link in the inbox
    createLink(db, userId, {
      url: "https://example.com",
      title: "Example",
      collectionId: inbox.id,
    });

    const updatedCollections = listCollections(db, userId);
    const updatedInbox = updatedCollections.find((c) => c.name === "inbox")!;
    expect(updatedInbox.link_count).toBe(1);
  });

  test("create collection", () => {
    const col = createCollection(db, userId, {
      name: "favourites",
      icon: "\u2764\uFE0F",
      color: "#ff0000",
    });

    expect(col.name).toBe("favourites");
    expect(col.icon).toBe("\u2764\uFE0F");
    expect(col.color).toBe("#ff0000");
    expect(col.user_id).toBe(userId);
  });

  test("update collection", () => {
    const col = createCollection(db, userId, { name: "old-name" });
    const updated = updateCollection(db, userId, col.id, {
      name: "new-name",
      icon: "\u{1F680}",
    });

    expect(updated.name).toBe("new-name");
    expect(updated.icon).toBe("\u{1F680}");
  });

  test("delete collection moves links to inbox", () => {
    seedDefaultCollections(db, userId);
    const collections = listCollections(db, userId);
    const inbox = collections.find((c) => c.name === "inbox")!;
    const tools = collections.find((c) => c.name === "tools")!;

    // Create a link in the tools collection
    const link = createLink(db, userId, {
      url: "https://example.com/tool",
      title: "My Tool",
      collectionId: tools.id,
    });

    // Delete the tools collection
    deleteCollection(db, userId, tools.id);

    // Verify the link moved to inbox
    const movedLink = db
      .query<{ collection_id: string }, [string]>(
        "SELECT collection_id FROM links WHERE id = ?"
      )
      .get(link.id);

    expect(movedLink!.collection_id).toBe(inbox.id);

    // Verify tools collection is gone
    const remaining = listCollections(db, userId);
    const toolsFound = remaining.find((c) => c.name === "tools");
    expect(toolsFound).toBeUndefined();
  });

  test("duplicate name per user fails", () => {
    createCollection(db, userId, { name: "duplicate" });
    expect(() =>
      createCollection(db, userId, { name: "duplicate" })
    ).toThrow();
  });

  test("different users can have same collection name", () => {
    const user2 = createUser(db, { name: "Bob", apiToken: "token-2" });

    const col1 = createCollection(db, userId, { name: "shared-name" });
    const col2 = createCollection(db, user2.id, { name: "shared-name" });

    expect(col1.id).not.toBe(col2.id);
    expect(col1.name).toBe(col2.name);
  });
});
