import { createMiddleware } from "hono/factory";
import type { AppVariables } from "./auth";

interface RateLimitEntry {
  timestamps: number[];
}

const WRITE_METHODS = new Set(["POST", "PATCH", "DELETE", "PUT"]);
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;
const CLEANUP_INTERVAL_MS = 60_000;

const store = new Map<string, RateLimitEntry>();

// Periodically clean up stale entries
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow the process to exit without waiting for the timer
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

export function rateLimitMiddleware() {
  ensureCleanupTimer();

  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    if (!WRITE_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    const user = c.get("user");
    if (!user) {
      await next();
      return;
    }

    const key = user.api_token;
    const now = Date.now();
    let entry = store.get(key);

    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

    if (entry.timestamps.length >= MAX_REQUESTS) {
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        429,
      );
    }

    entry.timestamps.push(now);
    await next();
  });
}

/** Reset the rate limit store — used in tests */
export function resetRateLimitStore() {
  store.clear();
}
