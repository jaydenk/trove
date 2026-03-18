import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "../db/connection";
import { findByToken, listUsers } from "../db/queries/users";
import { listCollections } from "../db/queries/collections";
import { seedAdmin } from "../seed";

describe("seed", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  test("creates admin user with is_admin=1", () => {
    const result = seedAdmin(db, "admin-token-xyz");

    expect(result.created).toBe(true);
    expect(result.userId).toBeDefined();

    const user = findByToken(db, "admin-token-xyz");
    expect(user).not.toBeNull();
    expect(user!.is_admin).toBe(1);
    expect(user!.name).toBe("Admin");
  });

  test("seeds 5 default collections for the admin", () => {
    const result = seedAdmin(db, "admin-token-xyz");

    const collections = listCollections(db, result.userId);
    expect(collections.length).toBe(5);

    const names = collections.map((c) => c.name).sort();
    expect(names).toEqual(
      ["inbox", "inspiration", "manuals", "reference", "tools"].sort(),
    );
  });

  test("idempotent — running twice does not crash or create duplicates", () => {
    const first = seedAdmin(db, "admin-token-xyz");
    expect(first.created).toBe(true);

    const second = seedAdmin(db, "admin-token-xyz");
    expect(second.created).toBe(false);
    expect(second.userId).toBe(first.userId);

    // Still only one user
    const users = listUsers(db);
    expect(users.length).toBe(1);

    // Still only 5 collections
    const collections = listCollections(db, first.userId);
    expect(collections.length).toBe(5);
  });
});
