import { Hono } from "hono";
import type { AppVariables } from "../middleware/auth";
import { getDb } from "../db/connection";
import {
  createLink,
  getLink,
  listLinks,
  updateLink,
  deleteLink,
  archiveLink,
  updateExtraction,
} from "../db/queries/links";
import { getOrCreateTag, addTagToLink } from "../db/queries/tags";
import { extractAndUpdate } from "../services/extractor";
import {
  NotFoundError,
  ValidationError,
  DuplicateUrlError,
} from "../lib/errors";

const links = new Hono<{ Variables: AppVariables }>();

links.get("/api/links", (c) => {
  const db = getDb();
  const user = c.get("user");

  const q = c.req.query("q");
  const collection_id = c.req.query("collection_id");
  const tag = c.req.query("tag");
  const domain = c.req.query("domain");
  const status = c.req.query("status");
  const source = c.req.query("source");
  const page = c.req.query("page") ? parseInt(c.req.query("page")!, 10) : 1;
  const limit = c.req.query("limit")
    ? parseInt(c.req.query("limit")!, 10)
    : 50;

  const result = listLinks(db, user.id, {
    q,
    collection_id,
    tag,
    domain,
    status,
    source,
    page,
    limit,
  });

  return c.json(result);
});

links.post("/api/links", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const body = await c.req.json<{
    url?: string;
    title?: string;
    collectionId?: string;
    tags?: string[];
    source?: string;
    sourceFeed?: string;
  }>();

  if (!body.url) {
    throw new ValidationError("URL is required");
  }

  // Validate URL format
  try {
    new URL(body.url);
  } catch {
    throw new ValidationError("Invalid URL format");
  }

  let link;
  try {
    link = createLink(db, user.id, {
      url: body.url,
      title: body.title,
      collectionId: body.collectionId,
      source: body.source,
      sourceFeed: body.sourceFeed,
    });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("UNIQUE constraint failed")
    ) {
      throw new DuplicateUrlError();
    }
    throw err;
  }

  // Handle tags
  if (body.tags && body.tags.length > 0) {
    for (const tagName of body.tags) {
      const tag = getOrCreateTag(db, user.id, tagName);
      addTagToLink(db, link.id, tag.id);
    }
  }

  // Fire-and-forget extraction
  extractAndUpdate(db, link.id, body.url);

  // Re-fetch with tags
  const created = getLink(db, user.id, link.id)!;

  return c.json(created, 201);
});

links.get("/api/links/:id", (c) => {
  const db = getDb();
  const user = c.get("user");
  const id = c.req.param("id");

  const link = getLink(db, user.id, id);
  if (!link) {
    throw new NotFoundError("Link not found");
  }

  return c.json(link);
});

links.patch("/api/links/:id", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{
    title?: string;
    collectionId?: string;
    status?: string;
    tags?: string[];
  }>();

  let updated;
  try {
    updated = updateLink(db, user.id, id, {
      title: body.title,
      collectionId: body.collectionId,
      status: body.status,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Link not found") {
      throw new NotFoundError("Link not found");
    }
    throw err;
  }

  // Handle tag replacement
  if (body.tags !== undefined) {
    // Remove all existing tags for this link
    db.query("DELETE FROM link_tags WHERE link_id = ?").run(id);

    // Add new tags
    for (const tagName of body.tags) {
      const tag = getOrCreateTag(db, user.id, tagName);
      addTagToLink(db, updated.id, tag.id);
    }
  }

  // Re-fetch with tags
  const result = getLink(db, user.id, updated.id)!;

  return c.json(result);
});

links.delete("/api/links/:id", (c) => {
  const db = getDb();
  const user = c.get("user");
  const id = c.req.param("id");

  // Verify the link belongs to this user before deleting
  const existing = db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM links WHERE id = ? AND user_id = ?"
    )
    .get(id, user.id);

  if (!existing) {
    throw new NotFoundError("Link not found");
  }

  deleteLink(db, user.id, id);

  return c.body(null, 204);
});

links.post("/api/links/:id/archive", (c) => {
  const db = getDb();
  const user = c.get("user");
  const id = c.req.param("id");

  // Verify the link belongs to this user
  const existing = db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM links WHERE id = ? AND user_id = ?"
    )
    .get(id, user.id);

  if (!existing) {
    throw new NotFoundError("Link not found");
  }

  archiveLink(db, user.id, id);

  return c.json({ status: "archived" });
});

links.post("/api/links/:id/extract", (c) => {
  const db = getDb();
  const user = c.get("user");
  const id = c.req.param("id");

  // Verify the link belongs to this user and get the URL
  const existing = db
    .query<{ id: string; url: string }, [string, string]>(
      "SELECT id, url FROM links WHERE id = ? AND user_id = ?"
    )
    .get(id, user.id);

  if (!existing) {
    throw new NotFoundError("Link not found");
  }

  // Reset extraction status to pending
  updateExtraction(db, id, { extraction_status: "pending" });

  // Fire-and-forget extraction
  extractAndUpdate(db, id, existing.url);

  return c.json({ extractionStatus: "pending" });
});

export default links;
