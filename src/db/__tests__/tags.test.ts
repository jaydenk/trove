import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "../connection";
import { createUser } from "../queries/users";
import { seedDefaultCollections } from "../queries/collections";
import { createLink } from "../queries/links";
import {
  createTag,
  listTags,
  updateTag,
  deleteTag,
  deleteEmptyTags,
  addTagToLink,
  removeTagFromLink,
  getOrCreateTag,
} from "../queries/tags";

describe("tags", () => {
  let db: Database;
  let userId: string;

  beforeEach(() => {
    db = createTestDb();
    const user = createUser(db, { name: "Alice", apiToken: "token-1" });
    userId = user.id;
    seedDefaultCollections(db, userId);
  });

  afterEach(() => {
    db.close();
  });

  test("create tag", () => {
    const tag = createTag(db, userId, "javascript");
    expect(tag.id).toBeDefined();
    expect(tag.id.length).toBe(21);
    expect(tag.name).toBe("javascript");
    expect(tag.user_id).toBe(userId);
  });

  test("list tags with counts", () => {
    const tag = createTag(db, userId, "typescript");
    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "Example",
    });

    addTagToLink(db, link.id, tag.id);

    const tags = listTags(db, userId);
    expect(tags.length).toBe(1);
    expect(tags[0].name).toBe("typescript");
    expect(tags[0].link_count).toBe(1);
  });

  test("rename tag", () => {
    const tag = createTag(db, userId, "old-name");
    const updated = updateTag(db, userId, tag.id, "new-name");
    expect(updated.name).toBe("new-name");
  });

  test("delete tag cascades link_tags", () => {
    const tag = createTag(db, userId, "to-delete");
    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "Example",
    });

    addTagToLink(db, link.id, tag.id);

    // Verify link_tags exists
    const before = db
      .query<{ link_id: string }, [string]>(
        "SELECT link_id FROM link_tags WHERE tag_id = ?"
      )
      .all(tag.id);
    expect(before.length).toBe(1);

    deleteTag(db, userId, tag.id);

    // Verify link_tags is gone
    const after = db
      .query<{ link_id: string }, [string]>(
        "SELECT link_id FROM link_tags WHERE tag_id = ?"
      )
      .all(tag.id);
    expect(after.length).toBe(0);

    // Verify tag is gone
    const tags = listTags(db, userId);
    expect(tags.length).toBe(0);
  });

  test("add and remove tag from link", () => {
    const tag = createTag(db, userId, "testing");
    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "Example",
    });

    addTagToLink(db, link.id, tag.id);

    let linkTags = db
      .query<{ tag_id: string }, [string]>(
        "SELECT tag_id FROM link_tags WHERE link_id = ?"
      )
      .all(link.id);
    expect(linkTags.length).toBe(1);

    removeTagFromLink(db, link.id, tag.id);

    linkTags = db
      .query<{ tag_id: string }, [string]>(
        "SELECT tag_id FROM link_tags WHERE link_id = ?"
      )
      .all(link.id);
    expect(linkTags.length).toBe(0);
  });

  test("getOrCreate returns existing tag", () => {
    const tag = createTag(db, userId, "existing");
    const found = getOrCreateTag(db, userId, "existing");
    expect(found.id).toBe(tag.id);
  });

  test("getOrCreate creates new tag", () => {
    const tag = getOrCreateTag(db, userId, "brand-new");
    expect(tag.id).toBeDefined();
    expect(tag.name).toBe("brand-new");
  });

  test("unique name per user", () => {
    createTag(db, userId, "duplicate");
    expect(() => createTag(db, userId, "duplicate")).toThrow();
  });

  test("deleteEmptyTags removes only orphaned tags", () => {
    const tagWithLink = createTag(db, userId, "has-link");
    const tagEmpty1 = createTag(db, userId, "empty-1");
    const tagEmpty2 = createTag(db, userId, "empty-2");

    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "Example",
    });
    addTagToLink(db, link.id, tagWithLink.id);

    const deleted = deleteEmptyTags(db, userId);
    expect(deleted).toBe(2);

    const remaining = listTags(db, userId);
    expect(remaining.length).toBe(1);
    expect(remaining[0].name).toBe("has-link");
  });

  test("deleteEmptyTags returns 0 when no empty tags", () => {
    const tag = createTag(db, userId, "active");
    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "Example",
    });
    addTagToLink(db, link.id, tag.id);

    const deleted = deleteEmptyTags(db, userId);
    expect(deleted).toBe(0);
  });

  test("deleteEmptyTags only affects current user", () => {
    const user2 = createUser(db, { name: "Bob", apiToken: "token-2" });

    // Create empty tags for both users
    createTag(db, userId, "my-empty");
    createTag(db, user2.id, "their-empty");

    const deleted = deleteEmptyTags(db, userId);
    expect(deleted).toBe(1);

    // Other user's tag still exists
    const otherTags = listTags(db, user2.id);
    expect(otherTags.length).toBe(1);
    expect(otherTags[0].name).toBe("their-empty");
  });

  test("different users can have same tag name", () => {
    const user2 = createUser(db, { name: "Bob", apiToken: "token-2" });

    const tag1 = createTag(db, userId, "shared");
    const tag2 = createTag(db, user2.id, "shared");

    expect(tag1.id).not.toBe(tag2.id);
  });
});
