import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { AppVariables } from "./middleware/auth";
import { authMiddleware } from "./middleware/auth";
import { loggerMiddleware } from "./middleware/logger";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { logger } from "./middleware/logger";
import { TroveError } from "./lib/errors";
import { getDb } from "./db/connection";

import { registerAllPlugins } from "./plugins/index";
import health from "./routes/health";
import links from "./routes/links";
import collections from "./routes/collections";
import tags from "./routes/tags";
import admin from "./routes/admin";
import user from "./routes/user";
import plugins from "./routes/plugins";

const app = new Hono<{ Variables: AppVariables }>();

// Global logger middleware on all routes
app.use("*", loggerMiddleware());

// Global error handler
app.onError((err, c) => {
  if (err instanceof TroveError) {
    return c.json(
      { error: { code: err.code, message: err.message } },
      err.status as any,
    );
  }

  logger.error({ err }, "Unhandled error");
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    500,
  );
});

// Public routes (no auth)
app.route("/", health);

// Protected routes under /api/*: rate limit + auth
const db = getDb();
registerAllPlugins();
app.use("/api/*", authMiddleware(db));
app.use("/api/*", rateLimitMiddleware());

// API routers — admin is mounted last because its internal use("/*") guard
// would apply to any route registered after it in the same app. By mounting
// it after all other routers, we ensure the guard only affects admin paths.
app.route("/", links);
app.route("/", collections);
app.route("/", tags);
app.route("/", user);
app.route("/", plugins);
app.route("/", admin);

// Serve frontend static files for production
app.use(
  "/*",
  serveStatic({ root: "./frontend/dist" }),
);

// SPA fallback: serve index.html for any unmatched routes
app.get("*", serveStatic({ path: "./frontend/dist/index.html" }));

export { app };

const port = parseInt(process.env.PORT ?? "3737");

logger.info(`Trove listening on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
