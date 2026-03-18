import { Hono } from "hono";
import type { AppVariables } from "../middleware/auth";
import { getDb } from "../db/connection";
import { updateUser } from "../db/queries/users";
import { ValidationError } from "../lib/errors";

const user = new Hono<{ Variables: AppVariables }>();

user.get("/api/me", (c) => {
  const u = c.get("user");

  return c.json({
    id: u.id,
    name: u.name,
    email: u.email,
    isAdmin: u.is_admin === 1,
    createdAt: u.created_at,
  });
});

user.patch("/api/me", async (c) => {
  const body = await c.req.json<{ name?: string; email?: string }>();

  if (!body.name && !body.email) {
    throw new ValidationError("At least one of name or email must be provided");
  }

  if (body.name !== undefined && typeof body.name !== "string") {
    throw new ValidationError("Name must be a string");
  }

  if (body.email !== undefined && typeof body.email !== "string") {
    throw new ValidationError("Email must be a string");
  }

  const db = getDb();
  const currentUser = c.get("user");
  const updated = updateUser(db, currentUser.id, {
    name: body.name,
    email: body.email,
  });

  return c.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    isAdmin: updated.is_admin === 1,
    createdAt: updated.created_at,
  });
});

export default user;
