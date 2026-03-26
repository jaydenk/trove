import { Hono } from "hono";
import type { AppVariables } from "../middleware/auth";
import { getDb } from "../db/connection";
import { createLink, exportLinks } from "../db/queries/links";
import { getCollectionByName } from "../db/queries/collections";
import { getOrCreateTag, addTagToLink } from "../db/queries/tags";
import { extractAndUpdate } from "../services/extractor";
import { smartImport } from "../services/importer";
import { exportJson, exportCsv, exportHtml } from "../services/exporter";
import { ValidationError } from "../lib/errors";
import { emitLinkEvent } from "../lib/events";
import type { ImportItem } from "../services/importer";

const importExport = new Hono<{ Variables: AppVariables }>();

// ---------------------------------------------------------------------------
// POST /api/import/preview — Parse file and return detected items for review
// ---------------------------------------------------------------------------

importExport.post("/api/import/preview", async (c) => {
  let format: string | undefined;
  let data: string | undefined;

  const contentType = c.req.header("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await c.req.json<{
      format?: string;
      data?: string;
    }>();
    format = body.format;
    data = body.data;
  } else {
    data = await c.req.text();
    format = c.req.query("format");

    if (!format) {
      if (contentType.includes("text/html")) {
        format = "html";
      } else if (contentType.includes("text/csv")) {
        format = "csv";
      }
    }
  }

  if (!data) {
    throw new ValidationError("No data provided");
  }

  const { items, errors, detectedFormat } = smartImport(data, format);

  return c.json({ detectedFormat, items, errors });
});

// ---------------------------------------------------------------------------
// POST /api/import — Import links from uploaded data or pre-parsed items
// ---------------------------------------------------------------------------

importExport.post("/api/import", async (c) => {
  const db = getDb();
  const user = c.get("user");

  let items: ImportItem[] = [];
  let parseErrors: string[] = [];
  let detectedFormat: string | undefined;

  const contentType = c.req.header("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await c.req.json<{
      format?: string;
      data?: string;
      items?: ImportItem[];
    }>();

    if (Array.isArray(body.items) && body.items.length > 0) {
      // Pre-parsed items from the preview flow — use directly
      items = body.items;
      detectedFormat = "preview";
    } else if (body.data) {
      // Raw data string — parse it
      const result = smartImport(body.data, body.format);
      items = result.items;
      parseErrors = result.errors;
      detectedFormat = result.detectedFormat;
    } else {
      throw new ValidationError("No data or items provided");
    }
  } else {
    // Accept raw body text with content-type or query param for format
    const data = await c.req.text();
    const format = c.req.query("format") ??
      (contentType.includes("text/html")
        ? "html"
        : contentType.includes("text/csv")
          ? "csv"
          : undefined);

    if (!data) {
      throw new ValidationError("No data provided");
    }

    const result = smartImport(data, format);
    items = result.items;
    parseErrors = result.errors;
    detectedFormat = result.detectedFormat;
  }

  let imported = 0;
  let skipped = 0;
  const errors = [...parseErrors];

  for (const item of items) {
    // Resolve collection ID if collection name is provided
    let collectionId: string | undefined;
    if (item.collection) {
      const collection = getCollectionByName(db, user.id, item.collection);
      if (collection) {
        collectionId = collection.id;
      }
      // If collection not found, link goes to inbox (default behaviour)
    }

    let link;
    try {
      link = createLink(db, user.id, {
        url: item.url,
        title: item.title,
        collectionId,
        source: "import",
      });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message.includes("UNIQUE constraint failed")
      ) {
        skipped++;
        continue;
      }
      errors.push(`Failed to import ${item.url}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    // Apply tags
    if (item.tags && item.tags.length > 0) {
      for (const tagName of item.tags) {
        const tag = getOrCreateTag(db, user.id, tagName);
        addTagToLink(db, link.id, tag.id);
      }
    }

    // Fire-and-forget extraction
    extractAndUpdate(db, link.id, item.url, user.id);

    imported++;
  }

  if (imported > 0) {
    emitLinkEvent({ type: "link:created", linkId: "bulk", userId: user.id });
  }

  return c.json({ imported, skipped, errors, detectedFormat });
});

// ---------------------------------------------------------------------------
// GET /api/export/json — Export all links as JSON
// ---------------------------------------------------------------------------

importExport.get("/api/export/json", (c) => {
  const db = getDb();
  const user = c.get("user");

  const links = exportLinks(db, user.id);
  const body = exportJson(links);

  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", 'attachment; filename="trove-export.json"');
  return c.body(body);
});

// ---------------------------------------------------------------------------
// GET /api/export/csv — Export all links as CSV
// ---------------------------------------------------------------------------

importExport.get("/api/export/csv", (c) => {
  const db = getDb();
  const user = c.get("user");

  const links = exportLinks(db, user.id);
  const body = exportCsv(links);

  c.header("Content-Type", "text/csv");
  c.header("Content-Disposition", 'attachment; filename="trove-export.csv"');
  return c.body(body);
});

// ---------------------------------------------------------------------------
// GET /api/export/html — Export all links as HTML bookmarks
// ---------------------------------------------------------------------------

importExport.get("/api/export/html", (c) => {
  const db = getDb();
  const user = c.get("user");

  const links = exportLinks(db, user.id);
  const body = exportHtml(links);

  c.header("Content-Type", "text/html");
  c.header(
    "Content-Disposition",
    'attachment; filename="trove-bookmarks.html"'
  );
  return c.body(body);
});

export default importExport;
