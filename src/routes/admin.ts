import { Hono } from "hono";
import { nanoid } from "nanoid";
import type { AppVariables } from "../middleware/auth";
import { getDb } from "../db/connection";
import { createUser, listUsers, deleteUser } from "../db/queries/users";
import { seedDefaultCollections } from "../db/queries/collections";
import { ForbiddenError, ValidationError } from "../lib/errors";

const admin = new Hono<{ Variables: AppVariables }>();

// Admin guard — all routes in this router require admin
admin.use("/*", async (c, next) => {
  const user = c.get("user");
  if (!user || user.is_admin !== 1) {
    throw new ForbiddenError();
  }
  await next();
});

admin.get("/api/admin/users", (c) => {
  const db = getDb();
  const users = listUsers(db);

  return c.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isAdmin: u.is_admin === 1,
      createdAt: u.created_at,
    }))
  );
});

admin.post("/api/admin/users", async (c) => {
  const body = await c.req.json<{ name?: string; email?: string }>();

  if (!body.name) {
    throw new ValidationError("Name is required");
  }

  const db = getDb();
  const apiToken = nanoid(32);

  const user = createUser(db, {
    name: body.name,
    email: body.email,
    apiToken,
  });

  seedDefaultCollections(db, user.id);

  return c.json(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: user.is_admin === 1,
      createdAt: user.created_at,
      apiToken,
    },
    201
  );
});

admin.delete("/api/admin/users/:id", (c) => {
  const db = getDb();
  const targetId = c.req.param("id");
  const currentUser = c.get("user");

  if (targetId === currentUser.id) {
    throw new ValidationError("Cannot delete yourself");
  }

  deleteUser(db, targetId);

  return c.body(null, 204);
});

export default admin;
