import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "../connection";
import { createUser } from "../queries/users";
import {
  getPluginConfig,
  setPluginConfig,
  deletePluginConfig,
} from "../queries/pluginConfig";

describe("pluginConfig", () => {
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

  test("set config then get returns values", () => {
    setPluginConfig(db, userId, "reader", {
      apiKey: "abc123",
      folder: "inbox",
    });

    const config = getPluginConfig(db, userId, "reader");
    expect(config).toEqual({
      apiKey: "abc123",
      folder: "inbox",
    });
  });

  test("get empty returns empty object", () => {
    const config = getPluginConfig(db, userId, "nonexistent-plugin");
    expect(config).toEqual({});
  });

  test("overwrite existing key", () => {
    setPluginConfig(db, userId, "reader", { apiKey: "old-key" });
    setPluginConfig(db, userId, "reader", { apiKey: "new-key" });

    const config = getPluginConfig(db, userId, "reader");
    expect(config.apiKey).toBe("new-key");
  });

  test("delete config removes all keys", () => {
    setPluginConfig(db, userId, "reader", {
      apiKey: "abc123",
      folder: "inbox",
    });

    deletePluginConfig(db, userId, "reader");

    const config = getPluginConfig(db, userId, "reader");
    expect(config).toEqual({});
  });

  test("user isolation — user A cannot read user B config", () => {
    const userB = createUser(db, { name: "Bob", apiToken: "token-2" });

    setPluginConfig(db, userId, "reader", { apiKey: "alice-key" });
    setPluginConfig(db, userB.id, "reader", { apiKey: "bob-key" });

    const aliceConfig = getPluginConfig(db, userId, "reader");
    expect(aliceConfig.apiKey).toBe("alice-key");

    const bobConfig = getPluginConfig(db, userB.id, "reader");
    expect(bobConfig.apiKey).toBe("bob-key");
  });
});
