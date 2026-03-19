import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestDb } from "../../db/connection";
import { createUser } from "../../db/queries/users";
import { setPluginConfig } from "../../db/queries/pluginConfig";
import type { TrovePlugin } from "../types";
import {
  registerPlugin,
  getPlugin,
  listPlugins,
  listPluginInfo,
  clearPlugins,
} from "../registry";

function makeMockPlugin(overrides: Partial<TrovePlugin> = {}): TrovePlugin {
  return {
    id: "test-plugin",
    name: "Test Plugin",
    icon: "flask",
    description: "A plugin for testing",
    configSchema: {
      apiKey: { label: "API Key", type: "string", required: true },
    },
    execute: {
      type: "api-call",
      actionLabel: "Test Action",
      async run() {
        return { type: "success", message: "ok" };
      },
    },
    ...overrides,
  };
}

describe("plugin registry", () => {
  beforeEach(() => {
    clearPlugins();
  });

  test("register a plugin successfully", () => {
    const plugin = makeMockPlugin();
    registerPlugin(plugin);
    expect(getPlugin("test-plugin")).toBe(plugin);
  });

  test("get plugin by id", () => {
    const plugin = makeMockPlugin();
    registerPlugin(plugin);
    expect(getPlugin("test-plugin")).toBe(plugin);
    expect(getPlugin("nonexistent")).toBeUndefined();
  });

  test("list plugins returns all registered", () => {
    const a = makeMockPlugin({ id: "plugin-a", name: "Plugin A" });
    const b = makeMockPlugin({ id: "plugin-b", name: "Plugin B" });
    registerPlugin(a);
    registerPlugin(b);

    const all = listPlugins();
    expect(all).toHaveLength(2);
    expect(all).toContain(a);
    expect(all).toContain(b);
  });

  test("register duplicate id throws", () => {
    registerPlugin(makeMockPlugin());
    expect(() => registerPlugin(makeMockPlugin())).toThrow(
      'Plugin "test-plugin" is already registered'
    );
  });

  test("register plugin without execute or ingest throws", () => {
    expect(() =>
      registerPlugin(
        makeMockPlugin({
          execute: undefined,
          ingest: undefined,
        })
      )
    ).toThrow('Plugin "test-plugin" must implement execute or ingest');
  });

  test("clearPlugins removes all", () => {
    registerPlugin(makeMockPlugin({ id: "a" }));
    registerPlugin(makeMockPlugin({ id: "b" }));
    expect(listPlugins()).toHaveLength(2);

    clearPlugins();
    expect(listPlugins()).toHaveLength(0);
  });

  describe("listPluginInfo", () => {
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

    test("returns isConfigured false when required config missing", () => {
      registerPlugin(makeMockPlugin());

      const infos = listPluginInfo(db, userId);
      expect(infos).toHaveLength(1);
      expect(infos[0].isConfigured).toBe(false);
      expect(infos[0].id).toBe("test-plugin");
      expect(infos[0].hasExecute).toBe(true);
      expect(infos[0].executeType).toBe("api-call");
      expect(infos[0].hasIngest).toBe(false);
    });

    test("returns isConfigured true when required config is set", () => {
      registerPlugin(makeMockPlugin());
      setPluginConfig(db, userId, "test-plugin", { apiKey: "my-secret" });

      const infos = listPluginInfo(db, userId);
      expect(infos).toHaveLength(1);
      expect(infos[0].isConfigured).toBe(true);
    });

    test("returns correct info for ingest-only plugin", () => {
      registerPlugin(
        makeMockPlugin({
          id: "ingest-only",
          execute: undefined,
          ingest: {
            description: "Import data",
            async handleIngest() {
              return { created: 0, skipped: 0, errors: [] };
            },
          },
          configSchema: {},
        })
      );

      const infos = listPluginInfo(db, userId);
      expect(infos).toHaveLength(1);
      expect(infos[0].hasExecute).toBe(false);
      expect(infos[0].executeType).toBeNull();
      expect(infos[0].hasIngest).toBe(true);
      expect(infos[0].isConfigured).toBe(true); // no required keys
    });
  });
});
