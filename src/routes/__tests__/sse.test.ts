import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
} from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { createTestDb } from "../../db/connection";
import { createUser } from "../../db/queries/users";
import { TroveError } from "../../lib/errors";
import sse from "../sse";

describe("SSE endpoint", () => {
  let db: Database;
  let userToken: string;
  let userId: string;

  beforeEach(() => {
    db = createTestDb();
    userToken = "sse-test-token-123";

    mock.module("../../db/connection", () => ({
      getDb: () => db,
      createTestDb,
    }));

    const user = createUser(db, {
      name: "SSEUser",
      apiToken: userToken,
    });
    userId = user.id;
  });

  afterEach(() => {
    db.close();
  });

  function createApp() {
    const app = new Hono();

    app.onError((err, c) => {
      if (err instanceof TroveError) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          err.status as 400,
        );
      }
      return c.json(
        { error: { code: "INTERNAL", message: "Unexpected error" } },
        500,
      );
    });

    app.route("/", sse);

    return app;
  }

  test("returns 401 without token", async () => {
    const app = createApp();

    const res = await app.request("/api/events");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("returns 401 with invalid token", async () => {
    const app = createApp();

    const res = await app.request("/api/events?token=invalid-token");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("returns SSE stream with valid token", async () => {
    const app = createApp();

    const res = await app.request(
      `/api/events?token=${encodeURIComponent(userToken)}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });
});
