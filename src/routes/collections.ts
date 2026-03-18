import { Hono } from "hono";
import type { AppVariables } from "../middleware/auth";
import { getDb } from "../db/connection";
import {
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
} from "../db/queries/collections";
import { NotFoundError, ValidationError } from "../lib/errors";

const collections = new Hono<{ Variables: AppVariables }>();

collections.get("/api/collections", (c) => {
  const db = getDb();
  const user = c.get("user");
  const rows = listCollections(db, user.id);

  return c.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      color: r.color,
      createdAt: r.created_at,
      linkCount: r.link_count,
    }))
  );
});

collections.post("/api/collections", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const body = await c.req.json<{ name?: string; icon?: string; color?: string }>();

  if (!body.name) {
    throw new ValidationError("Name is required");
  }

  try {
    const created = createCollection(db, user.id, {
      name: body.name,
      icon: body.icon,
      color: body.color,
    });

    return c.json(
      {
        id: created.id,
        name: created.name,
        icon: created.icon,
        color: created.color,
        createdAt: created.created_at,
      },
      201
    );
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("UNIQUE constraint failed")
    ) {
      throw new ValidationError("A collection with that name already exists");
    }
    throw err;
  }
});

collections.patch("/api/collections/:id", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{ name?: string; icon?: string; color?: string }>();

  try {
    const updated = updateCollection(db, user.id, id, {
      name: body.name,
      icon: body.icon,
      color: body.color,
    });

    return c.json({
      id: updated.id,
      name: updated.name,
      icon: updated.icon,
      color: updated.color,
      createdAt: updated.created_at,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Collection not found") {
      throw new NotFoundError("Collection not found");
    }
    if (
      err instanceof Error &&
      err.message.includes("UNIQUE constraint failed")
    ) {
      throw new ValidationError("A collection with that name already exists");
    }
    throw err;
  }
});

collections.delete("/api/collections/:id", (c) => {
  const db = getDb();
  const user = c.get("user");
  const id = c.req.param("id");

  // Verify the collection belongs to this user before deleting
  const existing = db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM collections WHERE id = ? AND user_id = ?"
    )
    .get(id, user.id);

  if (!existing) {
    throw new NotFoundError("Collection not found");
  }

  try {
    deleteCollection(db, user.id, id);
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message === "Cannot delete the inbox collection"
    ) {
      throw new ValidationError("Cannot delete the inbox collection");
    }
    throw err;
  }

  return c.body(null, 204);
});

export default collections;
