import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "../connection";
import {
  createUser,
  createUserWithPassword,
  findByUsername,
  findByToken,
  verifyPassword,
  updatePassword,
  regenerateToken,
  updateUsername,
} from "../queries/users";

describe("auth queries", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("findByUsername", () => {
    test("returns user when username exists", async () => {
      const user = await createUserWithPassword(db, {
        name: "Alice",
        username: "alice",
        password: "password123",
        email: "alice@example.com",
      });

      const found = findByUsername(db, "alice");
      expect(found).not.toBeNull();
      expect(found!.id).toBe(user.id);
      expect(found!.username).toBe("alice");
      expect(found!.name).toBe("Alice");
    });

    test("returns null for non-existent username", () => {
      const found = findByUsername(db, "nonexistent");
      expect(found).toBeNull();
    });

    test("returns null for token-only user without username", () => {
      createUser(db, {
        name: "TokenOnly",
        apiToken: "some-token",
      });

      const found = findByUsername(db, "TokenOnly");
      expect(found).toBeNull();
    });
  });

  describe("createUserWithPassword", () => {
    test("creates user with hashed password and generated token", async () => {
      const user = await createUserWithPassword(db, {
        name: "Bob",
        username: "bob",
        password: "my-secret-password",
        email: "bob@example.com",
      });

      expect(user.id).toBeDefined();
      expect(user.name).toBe("Bob");
      expect(user.username).toBe("bob");
      expect(user.email).toBe("bob@example.com");
      expect(user.password_hash).toBeDefined();
      expect(user.password_hash).not.toBe("my-secret-password");
      expect(user.api_token).toBeDefined();
      expect(user.api_token.length).toBe(32);
      expect(user.is_admin).toBe(0);
    });

    test("creates admin user when isAdmin is true", async () => {
      const user = await createUserWithPassword(db, {
        name: "Admin",
        username: "admin",
        password: "admin-pass",
        isAdmin: true,
      });

      expect(user.is_admin).toBe(1);
    });

    test("throws on duplicate username", async () => {
      await createUserWithPassword(db, {
        name: "First",
        username: "duplicate",
        password: "pass1",
      });

      await expect(
        createUserWithPassword(db, {
          name: "Second",
          username: "duplicate",
          password: "pass2",
        })
      ).rejects.toThrow();
    });
  });

  describe("verifyPassword", () => {
    test("returns user for correct password", async () => {
      await createUserWithPassword(db, {
        name: "Carol",
        username: "carol",
        password: "correct-password",
      });

      const result = await verifyPassword(db, "carol", "correct-password");
      expect(result).not.toBeNull();
      expect(result!.username).toBe("carol");
    });

    test("returns null for wrong password", async () => {
      await createUserWithPassword(db, {
        name: "Dave",
        username: "dave",
        password: "right-password",
      });

      const result = await verifyPassword(db, "dave", "wrong-password");
      expect(result).toBeNull();
    });

    test("returns null for non-existent username", async () => {
      const result = await verifyPassword(db, "ghost", "any-password");
      expect(result).toBeNull();
    });

    test("returns null for user without password_hash", async () => {
      createUser(db, {
        name: "TokenUser",
        apiToken: "token-only",
      });

      // Manually set a username without a password
      db.query("UPDATE users SET username = ? WHERE api_token = ?").run(
        "tokenuser",
        "token-only"
      );

      const result = await verifyPassword(db, "tokenuser", "any-password");
      expect(result).toBeNull();
    });
  });

  describe("updatePassword", () => {
    test("changes the password hash", async () => {
      const user = await createUserWithPassword(db, {
        name: "Eve",
        username: "eve",
        password: "old-password",
      });

      const oldHash = user.password_hash;
      await updatePassword(db, user.id, "new-password");

      const updated = findByUsername(db, "eve");
      expect(updated!.password_hash).not.toBe(oldHash);
    });

    test("new password works after change", async () => {
      await createUserWithPassword(db, {
        name: "Frank",
        username: "frank",
        password: "original",
      });

      const frank = findByUsername(db, "frank")!;
      await updatePassword(db, frank.id, "changed");

      const resultOld = await verifyPassword(db, "frank", "original");
      expect(resultOld).toBeNull();

      const resultNew = await verifyPassword(db, "frank", "changed");
      expect(resultNew).not.toBeNull();
    });
  });

  describe("regenerateToken", () => {
    test("returns a new 32-character token", async () => {
      const user = await createUserWithPassword(db, {
        name: "Grace",
        username: "grace",
        password: "password",
      });

      const oldToken = user.api_token;
      const newToken = regenerateToken(db, user.id);

      expect(newToken).toBeDefined();
      expect(newToken.length).toBe(32);
      expect(newToken).not.toBe(oldToken);
    });

    test("old token no longer works after regeneration", async () => {
      const user = await createUserWithPassword(db, {
        name: "Heidi",
        username: "heidi",
        password: "password",
      });

      const oldToken = user.api_token;
      const newToken = regenerateToken(db, user.id);

      const foundByOld = findByToken(db, oldToken);
      expect(foundByOld).toBeNull();

      const foundByNew = findByToken(db, newToken);
      expect(foundByNew).not.toBeNull();
      expect(foundByNew!.id).toBe(user.id);
    });
  });

  describe("updateUsername", () => {
    test("changes the username", async () => {
      const user = await createUserWithPassword(db, {
        name: "Ivan",
        username: "ivan",
        password: "password",
      });

      updateUsername(db, user.id, "ivan2");

      const found = findByUsername(db, "ivan2");
      expect(found).not.toBeNull();
      expect(found!.id).toBe(user.id);

      const old = findByUsername(db, "ivan");
      expect(old).toBeNull();
    });
  });
});
