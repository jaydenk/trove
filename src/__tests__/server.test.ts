import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { createTestDb } from "../db/connection";
import { createUser } from "../db/queries/users";
import { seedDefaultCollections } from "../db/queries/collections";
import type { AppVariables } from "../middleware/auth";
import { authMiddleware } from "../middleware/auth";
import { loggerMiddleware } from "../middleware/logger";
import { rateLimitMiddleware } from "../middleware/rateLimit";
import { TroveError, NotFoundError, UnauthorizedError } from "../lib/errors";

import health from "../routes/health";
import links from "../routes/links";
import collections from "../routes/collections";
import tags from "../routes/tags";
import admin from "../routes/admin";
import user from "../routes/user";

/**
 * Builds a Hono app that mirrors server.ts assembly, using the given test DB.
 * Admin is mounted last to prevent its internal use("/*") guard from leaking
 * to routes registered before it.
 */
function buildApp(db: Database): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();

  // Global logger
  app.use("*", loggerMiddleware());

  // Global error handler
  app.onError((err, c) => {
    if (err instanceof TroveError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.status as any,
      );
    }
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error",
        },
      },
      500,
    );
  });

  // Public routes (no auth)
  app.route("/", health);

  // Protected routes
  app.use("/api/*", authMiddleware(db));
  app.use("/api/*", rateLimitMiddleware());

  // API routers — admin last (see server.ts comment)
  app.route("/", links);
  app.route("/", collections);
  app.route("/", tags);
  app.route("/", user);
  app.route("/", admin);

  return app;
}

describe("server", () => {
  let db: Database;
  let app: Hono<{ Variables: AppVariables }>;
  let token: string;

  beforeEach(() => {
    db = createTestDb();

    // Mock getDb so all route handlers use the test database
    mock.module("../db/connection", () => ({
      getDb: () => db,
      createTestDb,
      closeDb: () => {},
    }));

    token = "test-server-token-123";
    const u = createUser(db, { name: "TestUser", apiToken: token });
    seedDefaultCollections(db, u.id);

    app = buildApp(db);
  });

  afterEach(() => {
    db.close();
  });

  test("GET /health returns 200 without auth", async () => {
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.links).toBe("number");
  });

  test("GET /api/links returns 401 without auth", async () => {
    const res = await app.request("/api/links");

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("GET /api/links returns 200 with valid token", async () => {
    const res = await app.request("/api/links", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.pagination).toBeDefined();
  });

  test("GET /api/me returns 200 with valid token", async () => {
    const res = await app.request("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("TestUser");
  });

  test("GET /api/me returns 401 without auth", async () => {
    const res = await app.request("/api/me");

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("GET /api/collections returns 200 with valid token", async () => {
    const res = await app.request("/api/collections", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/tags returns 200 with valid token", async () => {
    const res = await app.request("/api/tags", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  describe("error handler", () => {
    test("returns correct JSON format for TroveError", async () => {
      // Build a minimal app with just the error handler and a test route
      const testApp = new Hono();
      testApp.onError((err, c) => {
        if (err instanceof TroveError) {
          return c.json(
            { error: { code: err.code, message: err.message } },
            err.status as any,
          );
        }
        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Internal server error",
            },
          },
          500,
        );
      });

      testApp.get("/test/trove-error", () => {
        throw new NotFoundError("Test resource not found");
      });

      const res = await testApp.request("/test/trove-error");

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Test resource not found");
    });

    test("returns 500 with INTERNAL_ERROR for unknown errors", async () => {
      const testApp = new Hono();
      testApp.onError((err, c) => {
        if (err instanceof TroveError) {
          return c.json(
            { error: { code: err.code, message: err.message } },
            err.status as any,
          );
        }
        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Internal server error",
            },
          },
          500,
        );
      });

      testApp.get("/test/generic-error", () => {
        throw new Error("Something went wrong");
      });

      const res = await testApp.request("/test/generic-error");

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe("Internal server error");
    });

    test("returns correct status code for UnauthorizedError", async () => {
      const testApp = new Hono();
      testApp.onError((err, c) => {
        if (err instanceof TroveError) {
          return c.json(
            { error: { code: err.code, message: err.message } },
            err.status as any,
          );
        }
        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Internal server error",
            },
          },
          500,
        );
      });

      testApp.get("/test/unauth-error", () => {
        throw new UnauthorizedError("Custom unauth message");
      });

      const res = await testApp.request("/test/unauth-error");

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Custom unauth message");
    });
  });

  test("auth middleware is applied to all /api/* routes", async () => {
    const endpoints = [
      "/api/links",
      "/api/collections",
      "/api/tags",
      "/api/me",
    ];

    for (const endpoint of endpoints) {
      const res = await app.request(endpoint);
      expect(res.status).toBe(401);
    }
  });
});
