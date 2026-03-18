import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "../connection";
import { createUser } from "../queries/users";
import { seedDefaultCollections } from "../queries/collections";
import { createLink, deleteLink } from "../queries/links";
import { recordAction, listActionsForLink } from "../queries/linkActions";

describe("linkActions", () => {
  let db: Database;
  let userId: string;
  let linkId: string;

  beforeEach(() => {
    db = createTestDb();
    const user = createUser(db, { name: "Alice", apiToken: "token-1" });
    userId = user.id;
    seedDefaultCollections(db, userId);
    const link = createLink(db, userId, {
      url: "https://example.com",
      title: "Test Link",
    });
    linkId = link.id;
  });

  afterEach(() => {
    db.close();
  });

  test("record action returns action with id", () => {
    const action = recordAction(db, {
      linkId,
      pluginId: "reader",
      status: "success",
      message: "Saved to Reader",
    });

    expect(action.id).toBeDefined();
    expect(action.id.length).toBe(21);
    expect(action.linkId).toBe(linkId);
    expect(action.pluginId).toBe("reader");
    expect(action.status).toBe("success");
    expect(action.message).toBe("Saved to Reader");
    expect(action.createdAt).toBeDefined();
  });

  test("list returns actions sorted newest first", () => {
    recordAction(db, {
      linkId,
      pluginId: "reader",
      status: "success",
      message: "First action",
    });

    // Manually set a later timestamp on the second action so ordering is deterministic
    const second = recordAction(db, {
      linkId,
      pluginId: "things",
      status: "error",
      message: "Second action",
    });

    // Update the second action's created_at to be later
    db.query("UPDATE link_actions SET created_at = datetime('now', '+1 second') WHERE id = ?").run(
      second.id
    );

    const actions = listActionsForLink(db, linkId);
    expect(actions).toHaveLength(2);
    // Newest first
    expect(actions[0].pluginId).toBe("things");
    expect(actions[1].pluginId).toBe("reader");
  });

  test("list empty returns empty array", () => {
    const actions = listActionsForLink(db, linkId);
    expect(actions).toEqual([]);
  });

  test("delete link cascades to actions", () => {
    recordAction(db, {
      linkId,
      pluginId: "reader",
      status: "success",
      message: "Saved",
    });

    // Verify action exists
    const before = listActionsForLink(db, linkId);
    expect(before).toHaveLength(1);

    // Delete the link
    deleteLink(db, userId, linkId);

    // Actions should be gone due to ON DELETE CASCADE
    const after = listActionsForLink(db, linkId);
    expect(after).toEqual([]);
  });
});
