import { describe, test, expect } from "bun:test";
import { createTestDb } from "../connection";

describe("schema", () => {
  test("creates all expected tables", () => {
    const db = createTestDb();

    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map((r) => r.name);

    expect(tables).toContain("users");
    expect(tables).toContain("links");
    expect(tables).toContain("tags");
    expect(tables).toContain("link_tags");
    expect(tables).toContain("collections");
    expect(tables).toContain("link_actions");
    expect(tables).toContain("plugin_config");
    expect(tables).toContain("links_fts");

    db.close();
  });

  test("creates all expected triggers", () => {
    const db = createTestDb();

    const triggers = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name"
      )
      .all()
      .map((r) => r.name);

    expect(triggers).toContain("links_updated_at");
    expect(triggers).toContain("links_ai");
    expect(triggers).toContain("links_au");
    expect(triggers).toContain("links_ad");

    db.close();
  });

  test("migrations are idempotent (run twice without crash)", () => {
    const db = createTestDb();

    // createTestDb already ran migrations once. Running again should not throw.
    const { runMigrations } = require("../schema");
    expect(() => runMigrations(db)).not.toThrow();

    // Verify tables still exist
    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map((r) => r.name);

    expect(tables).toContain("users");
    expect(tables).toContain("links");

    db.close();
  });
});
