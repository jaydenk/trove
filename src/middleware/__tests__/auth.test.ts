import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { createTestDb } from "../../db/connection";
import { createUser } from "../../db/queries/users";
import { authMiddleware, type AppVariables } from "../auth";
import { TroveError } from "../../lib/errors";

describe("auth middleware", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    createUser(db, { name: "Alice", apiToken: "valid-token-123" });
  });

  afterEach(() => {
    db.close();
  });

  function createApp() {
    const app = new Hono<{ Variables: AppVariables }>();

    // Error handler that converts TroveError into JSON responses
    app.onError((err, c) => {
      if (err instanceof TroveError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          err.status as 401,
        );
      }
      return c.json({ error: { code: "INTERNAL", message: "Unexpected error" } }, 500);
    });

    app.use("/*", authMiddleware(db));

    app.get("/test", (c) => {
      const user = c.get("user");
      return c.json({ userId: user.id, name: user.name });
    });

    return app;
  }

  test("valid token sets user on context", async () => {
    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer valid-token-123" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Alice");
    expect(body.userId).toBeDefined();
  });

  test("missing Authorization header returns 401", async () => {
    const app = createApp();
    const res = await app.request("/test");

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toBeDefined();
  });

  test("invalid token returns 401", async () => {
    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer bad-token" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("malformed header (no Bearer prefix) returns 401", async () => {
    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: "Token valid-token-123" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("empty Bearer value returns 401", async () => {
    const app = createApp();
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer " },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });
});
