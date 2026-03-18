import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { createTestDb } from "../../db/connection";
import health from "../health";

describe("GET /health", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    // Mock getDb to return the test database
    mock.module("../../db/connection", () => ({
      getDb: () => db,
      createTestDb,
    }));
  });

  afterEach(() => {
    db.close();
  });

  test("returns 200 with status ok and link count 0 for empty DB", async () => {
    const app = new Hono();
    app.route("/", health);

    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.links).toBe(0);
  });

  test("does not require auth", async () => {
    const app = new Hono();
    app.route("/", health);

    // No Authorization header
    const res = await app.request("/health");

    expect(res.status).toBe(200);
  });

  test("returns correct link count when links exist", async () => {
    // Create a user and collection first, then add links
    const { createUser } = await import("../../db/queries/users");
    const { seedDefaultCollections } = await import(
      "../../db/queries/collections"
    );

    const user = createUser(db, { name: "Alice", apiToken: "test-token" });
    seedDefaultCollections(db, user.id);

    // Get the inbox collection
    const collection = db
      .query<{ id: string }, [string]>(
        "SELECT id FROM collections WHERE user_id = ? LIMIT 1"
      )
      .get(user.id);

    // Insert a link
    db.query(
      `INSERT INTO links (id, user_id, url, title, collection_id) VALUES (?, ?, ?, ?, ?)`
    ).run("link-1", user.id, "https://example.com", "Example", collection!.id);

    const app = new Hono();
    app.route("/", health);

    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.links).toBe(1);
  });
});
