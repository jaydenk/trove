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
// POST /api/import — Import links from uploaded data
// ---------------------------------------------------------------------------

importExport.post("/api/import", async (c) => {
  const db = getDb();
  const user = c.get("user");

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
    // Accept raw body text with content-type or query param for format
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

  // Use smart import with optional format hint — auto-detects if no hint
  const { items, errors: parseErrors, detectedFormat } = smartImport(
    data,
    format,
  );

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
    extractAndUpdate(db, link.id, item.url);

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
