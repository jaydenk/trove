import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "../../connection";
import { createUser } from "../users";
import {
  insertPlugin,
  getPluginById,
  listAllPlugins,
  deletePlugin,
  enablePluginForUser,
  disablePluginForUser,
  isPluginEnabledForUser,
  listPluginsForUser,
  enableAllSystemPluginsForUser,
} from "../plugins";
import type { PluginManifest } from "../../../plugins/manifest";

const testManifest: PluginManifest = {
  id: "test-plugin",
  name: "Test Plugin",
  icon: "flask",
  description: "A plugin for testing",
  version: "1.0.0",
  direction: "export",
  config: {
    API_KEY: { label: "API Key", type: "string", required: true },
  },
  execute: {
    type: "url-redirect",
    actionLabel: "Test",
    urlTemplate: "https://example.com/{{link.url}}",
  },
};

const ingestManifest: PluginManifest = {
  id: "ingest-plugin",
  name: "Ingest Plugin",
  direction: "ingest",
  ingest: {
    itemMapping: { url: "$.url" },
  },
};

describe("plugin queries", () => {
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

  describe("CRUD", () => {
    test("insertPlugin + getPluginById", () => {
      insertPlugin(db, testManifest, true);
      const plugin = getPluginById(db, "test-plugin");

      expect(plugin).not.toBeNull();
      expect(plugin!.id).toBe("test-plugin");
      expect(plugin!.name).toBe("Test Plugin");
      expect(plugin!.direction).toBe("export");
      expect(plugin!.is_system).toBe(1);
      expect(plugin!.manifest.id).toBe("test-plugin");
      expect(plugin!.manifest.execute?.type).toBe("url-redirect");
    });

    test("getPluginById returns null for non-existent", () => {
      expect(getPluginById(db, "nonexistent")).toBeNull();
    });

    test("listAllPlugins returns all", () => {
      insertPlugin(db, testManifest, true);
      insertPlugin(db, ingestManifest, false);

      const all = listAllPlugins(db);
      expect(all).toHaveLength(2);
    });

    test("deletePlugin removes plugin and related data", () => {
      insertPlugin(db, testManifest, false);
      enablePluginForUser(db, userId, "test-plugin");

      deletePlugin(db, "test-plugin");

      expect(getPluginById(db, "test-plugin")).toBeNull();
      expect(listAllPlugins(db)).toHaveLength(0);
    });

    test("insertPlugin with same ID replaces (INSERT OR REPLACE)", () => {
      insertPlugin(db, testManifest, true);

      const updated = { ...testManifest, name: "Updated Name" };
      insertPlugin(db, updated, true);

      const plugin = getPluginById(db, "test-plugin");
      expect(plugin!.name).toBe("Updated Name");
      expect(listAllPlugins(db)).toHaveLength(1);
    });
  });

  describe("user_plugins", () => {
    test("enablePluginForUser + isPluginEnabledForUser", () => {
      insertPlugin(db, testManifest, false);
      enablePluginForUser(db, userId, "test-plugin");

      expect(isPluginEnabledForUser(db, userId, "test-plugin")).toBe(true);
    });

    test("disablePluginForUser", () => {
      insertPlugin(db, testManifest, false);
      enablePluginForUser(db, userId, "test-plugin");
      disablePluginForUser(db, userId, "test-plugin");

      expect(isPluginEnabledForUser(db, userId, "test-plugin")).toBe(false);
    });

    test("system plugin defaults to enabled (no user_plugins row)", () => {
      insertPlugin(db, testManifest, true);

      // No user_plugins row -> system plugin should default to enabled
      expect(isPluginEnabledForUser(db, userId, "test-plugin")).toBe(true);
    });

    test("non-system plugin defaults to not enabled (no user_plugins row)", () => {
      insertPlugin(db, testManifest, false);

      expect(isPluginEnabledForUser(db, userId, "test-plugin")).toBe(false);
    });

    test("listPluginsForUser includes enabled state", () => {
      insertPlugin(db, testManifest, true);
      insertPlugin(db, ingestManifest, false);
      enablePluginForUser(db, userId, "ingest-plugin");

      const plugins = listPluginsForUser(db, userId);
      expect(plugins).toHaveLength(2);

      const test_ = plugins.find((p) => p.id === "test-plugin");
      expect(test_!.enabled).toBe(true); // system default

      const ingest = plugins.find((p) => p.id === "ingest-plugin");
      expect(ingest!.enabled).toBe(true); // explicitly enabled
    });

    test("listPluginsForUser shows disabled state", () => {
      insertPlugin(db, testManifest, true);
      disablePluginForUser(db, userId, "test-plugin");

      const plugins = listPluginsForUser(db, userId);
      const test_ = plugins.find((p) => p.id === "test-plugin");
      expect(test_!.enabled).toBe(false);
    });

    test("enableAllSystemPluginsForUser enables all system plugins", () => {
      insertPlugin(db, testManifest, true);
      insertPlugin(db, ingestManifest, false);

      enableAllSystemPluginsForUser(db, userId);

      // System plugin should be explicitly enabled
      expect(isPluginEnabledForUser(db, userId, "test-plugin")).toBe(true);

      // Non-system plugin should still be not enabled
      expect(isPluginEnabledForUser(db, userId, "ingest-plugin")).toBe(false);
    });
  });
});
