import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "../connection";
import { createUser, findByToken, listUsers, deleteUser } from "../queries/users";

describe("users", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("create user and find by token", () => {
    const user = createUser(db, {
      name: "Alice",
      email: "alice@example.com",
      apiToken: "token-abc-123",
    });

    expect(user.id).toBeDefined();
    expect(user.id.length).toBe(21);
    expect(user.name).toBe("Alice");
    expect(user.email).toBe("alice@example.com");
    expect(user.api_token).toBe("token-abc-123");
    expect(user.is_admin).toBe(0);
    expect(user.created_at).toBeDefined();

    const found = findByToken(db, "token-abc-123");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
  });

  test("find by invalid token returns null", () => {
    const found = findByToken(db, "nonexistent-token");
    expect(found).toBeNull();
  });

  test("list users", () => {
    createUser(db, { name: "Alice", apiToken: "token-1" });
    createUser(db, { name: "Bob", apiToken: "token-2" });

    const users = listUsers(db);
    expect(users.length).toBe(2);
  });

  test("delete user", () => {
    const user = createUser(db, { name: "Alice", apiToken: "token-1" });
    deleteUser(db, user.id);

    const users = listUsers(db);
    expect(users.length).toBe(0);
  });

  test("duplicate token fails", () => {
    createUser(db, { name: "Alice", apiToken: "same-token" });
    expect(() =>
      createUser(db, { name: "Bob", apiToken: "same-token" })
    ).toThrow();
  });

  test("create admin user", () => {
    const user = createUser(db, {
      name: "Admin",
      apiToken: "admin-token",
      isAdmin: true,
    });

    expect(user.is_admin).toBe(1);
  });
});
