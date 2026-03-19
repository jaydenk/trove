import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "../db/connection";
import {
  findByToken,
  findByUsername,
  listUsers,
  verifyPassword,
} from "../db/queries/users";
import { listCollections } from "../db/queries/collections";
import { seedAdmin, seedAdminWithPassword } from "../seed";

describe("seed", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("legacy token-based (seedAdmin)", () => {
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
        ["inbox", "inspiration", "manuals", "reference", "tools"].sort()
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

  describe("password-based (seedAdminWithPassword)", () => {
    test("creates admin with username 'admin' and hashed password", async () => {
      const result = await seedAdminWithPassword(db, "admin-pass-123");

      expect(result.created).toBe(true);
      expect(result.userId).toBeDefined();
      expect(result.apiToken).toBeDefined();
      expect(result.apiToken!.length).toBe(32);

      const user = findByUsername(db, "admin");
      expect(user).not.toBeNull();
      expect(user!.is_admin).toBe(1);
      expect(user!.name).toBe("Admin");
      expect(user!.username).toBe("admin");
      expect(user!.password_hash).toBeDefined();
      expect(user!.password_hash).not.toBe("admin-pass-123");
    });

    test("password is verifiable after seeding", async () => {
      await seedAdminWithPassword(db, "my-secure-password");

      const verified = await verifyPassword(db, "admin", "my-secure-password");
      expect(verified).not.toBeNull();
      expect(verified!.username).toBe("admin");
    });

    test("seeds 5 default collections", async () => {
      const result = await seedAdminWithPassword(db, "password");

      const collections = listCollections(db, result.userId);
      expect(collections.length).toBe(5);
    });

    test("idempotent — running twice does not crash or create duplicates", async () => {
      const first = await seedAdminWithPassword(db, "password");
      expect(first.created).toBe(true);

      const second = await seedAdminWithPassword(db, "password");
      expect(second.created).toBe(false);
      expect(second.userId).toBe(first.userId);

      const users = listUsers(db);
      expect(users.length).toBe(1);

      const collections = listCollections(db, first.userId);
      expect(collections.length).toBe(5);
    });
  });
});
