import { Hono } from "hono";
import type { AppVariables } from "../middleware/auth";
import { getDb } from "../db/connection";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
} from "../db/queries/tags";
import { NotFoundError, ValidationError } from "../lib/errors";

const tags = new Hono<{ Variables: AppVariables }>();

tags.get("/api/tags", (c) => {
  const db = getDb();
  const user = c.get("user");
  const rows = listTags(db, user.id);

  return c.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      linkCount: r.link_count,
    }))
  );
});

tags.post("/api/tags", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const body = await c.req.json<{ name?: string }>();

  if (!body.name) {
    throw new ValidationError("Name is required");
  }

  try {
    const created = createTag(db, user.id, body.name);

    return c.json(
      {
        id: created.id,
        name: created.name,
        createdAt: created.created_at,
      },
      201
    );
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("UNIQUE constraint failed")
    ) {
      throw new ValidationError("A tag with that name already exists");
    }
    throw err;
  }
});

tags.patch("/api/tags/:id", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{ name?: string }>();

  if (!body.name) {
    throw new ValidationError("Name is required");
  }

  try {
    const updated = updateTag(db, user.id, id, body.name);

    return c.json({
      id: updated.id,
      name: updated.name,
      createdAt: updated.created_at,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Tag not found") {
      throw new NotFoundError("Tag not found");
    }
    if (
      err instanceof Error &&
      err.message.includes("UNIQUE constraint failed")
    ) {
      throw new ValidationError("A tag with that name already exists");
    }
    throw err;
  }
});

tags.delete("/api/tags/:id", (c) => {
  const db = getDb();
  const user = c.get("user");
  const id = c.req.param("id");

  // Verify the tag belongs to this user before deleting
  const existing = db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM tags WHERE id = ? AND user_id = ?"
    )
    .get(id, user.id);

  if (!existing) {
    throw new NotFoundError("Tag not found");
  }

  deleteTag(db, user.id, id);

  return c.body(null, 204);
});

export default tags;
