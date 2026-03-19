import { Hono } from "hono";
import type { AppVariables } from "../middleware/auth";
import { getDb } from "../db/connection";
import { verifyPassword } from "../db/queries/users";
import { UnauthorizedError, ValidationError } from "../lib/errors";
import { TroveError } from "../lib/errors";

// Login-specific rate limiter: 10 attempts per minute per IP
interface LoginRateLimitEntry {
  timestamps: number[];
}

const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginStore = new Map<string, LoginRateLimitEntry>();

/** Reset the login rate limit store — used in tests */
export function resetLoginRateLimitStore() {
  loginStore.clear();
}

// Periodically clean up stale entries
let loginCleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureLoginCleanupTimer() {
  if (loginCleanupTimer) return;
  loginCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of loginStore) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < LOGIN_WINDOW_MS);
      if (entry.timestamps.length === 0) {
        loginStore.delete(key);
      }
    }
  }, LOGIN_WINDOW_MS);

  if (
    loginCleanupTimer &&
    typeof loginCleanupTimer === "object" &&
    "unref" in loginCleanupTimer
  ) {
    loginCleanupTimer.unref();
  }
}

const auth = new Hono<{ Variables: AppVariables }>();

auth.post("/api/auth/login", async (c) => {
  // Rate limit by IP
  ensureLoginCleanupTimer();
  const ip =
    c.req.header("x-forwarded-for") ??
    c.req.header("x-real-ip") ??
    "unknown";
  const now = Date.now();

  let entry = loginStore.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    loginStore.set(ip, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => now - t < LOGIN_WINDOW_MS);

  if (entry.timestamps.length >= LOGIN_MAX_ATTEMPTS) {
    return c.json(
      { error: { code: "RATE_LIMITED", message: "Too many login attempts" } },
      429
    );
  }

  entry.timestamps.push(now);

  // Parse and validate body
  let body: { username?: unknown; password?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new ValidationError("Invalid request body");
  }

  if (!body.username || typeof body.username !== "string") {
    throw new ValidationError("Username is required");
  }

  if (!body.password || typeof body.password !== "string") {
    throw new ValidationError("Password is required");
  }

  const db = getDb();
  const user = await verifyPassword(db, body.username, body.password);

  if (!user) {
    throw new UnauthorizedError("Invalid username or password");
  }

  return c.json({
    token: user.api_token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      isAdmin: user.is_admin === 1,
    },
  });
});

export default auth;
