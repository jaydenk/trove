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

  test("different users can have same tag name", () => {
    const user2 = createUser(db, { name: "Bob", apiToken: "token-2" });

    const tag1 = createTag(db, userId, "shared");
    const tag2 = createTag(db, user2.id, "shared");

    expect(tag1.id).not.toBe(tag2.id);
  });
});
