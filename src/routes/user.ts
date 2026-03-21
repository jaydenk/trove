import { Hono } from "hono";
import type { AppVariables } from "../middleware/auth";
import { getDb } from "../db/connection";
import {
  updateUser,
  updatePassword,
  updateUsername,
  regenerateToken,
  findByUsername,
} from "../db/queries/users";
import {
  getPreferences,
  setPreferences,
} from "../db/queries/preferences";
import { ValidationError } from "../lib/errors";

const user = new Hono<{ Variables: AppVariables }>();

user.get("/api/me", (c) => {
  const u = c.get("user");

  return c.json({
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    isAdmin: u.is_admin === 1,
    createdAt: u.created_at,
  });
});

user.patch("/api/me", async (c) => {
  const body = await c.req.json<{
    name?: string;
    email?: string;
    password?: string;
    username?: string;
  }>();

  if (!body.name && !body.email && !body.password && !body.username) {
    throw new ValidationError(
      "At least one of name, email, password, or username must be provided"
    );
  }

  if (body.name !== undefined && typeof body.name !== "string") {
    throw new ValidationError("Name must be a string");
  }

  if (body.email !== undefined && typeof body.email !== "string") {
    throw new ValidationError("Email must be a string");
  }

  const db = getDb();
  const currentUser = c.get("user");

  // Handle password change
  if (body.password !== undefined) {
    if (typeof body.password !== "string" || body.password.length === 0) {
      throw new ValidationError("Password must be a non-empty string");
    }
    await updatePassword(db, currentUser.id, body.password);
  }

  // Handle username change
  if (body.username !== undefined) {
    if (typeof body.username !== "string" || body.username.length === 0) {
      throw new ValidationError("Username must be a non-empty string");
    }
    // Check uniqueness
    const existing = findByUsername(db, body.username);
    if (existing && existing.id !== currentUser.id) {
      throw new ValidationError("Username is already taken");
    }
    updateUsername(db, currentUser.id, body.username);
  }

  // Handle name/email changes
  if (body.name !== undefined || body.email !== undefined) {
    updateUser(db, currentUser.id, {
      name: body.name,
      email: body.email,
    });
  }

  // Re-fetch the updated user for the response
  const updated = db
    .query<any, [string]>("SELECT * FROM users WHERE id = ?")
    .get(currentUser.id)!;

  return c.json({
    id: updated.id,
    name: updated.name,
    username: updated.username,
    email: updated.email,
    isAdmin: updated.is_admin === 1,
    createdAt: updated.created_at,
  });
});

user.post("/api/me/regenerate-token", (c) => {
  const db = getDb();
  const currentUser = c.get("user");
  const newToken = regenerateToken(db, currentUser.id);

  return c.json({ token: newToken });
});

user.get("/api/me/preferences", (c) => {
  const db = getDb();
  const currentUser = c.get("user");
  const prefs = getPreferences(db, currentUser.id);

  return c.json(prefs);
});

user.patch("/api/me/preferences", async (c) => {
  const body = await c.req.json<Record<string, string>>();

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("Body must be a JSON object of key-value pairs");
  }

  for (const [key, value] of Object.entries(body)) {
    if (typeof key !== "string" || typeof value !== "string") {
      throw new ValidationError("All keys and values must be strings");
    }
  }

  const db = getDb();
  const currentUser = c.get("user");
  setPreferences(db, currentUser.id, body);

  const updated = getPreferences(db, currentUser.id);
  return c.json(updated);
});

export default user;
