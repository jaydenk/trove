import type { Database } from "bun:sqlite";
import type { TrovePlugin, IngestResult } from "./types";
import { createLink } from "../db/queries/links";
import { getCollectionByName } from "../db/queries/collections";
import { getOrCreateTag, addTagToLink } from "../db/queries/tags";
import { extractAndUpdate } from "../services/extractor";
import { updateLink } from "../db/queries/links";

interface IngestItem {
  url: string;
  title?: string;
  collection?: string;
  tags?: string[];
  source_feed?: string;
}

interface IngestPayload {
  items: IngestItem[];
}

function isValidPayload(body: unknown): body is IngestPayload {
  if (typeof body !== "object" || body === null) return false;
  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.items)) return false;

  for (const item of obj.items) {
    if (typeof item !== "object" || item === null) return false;
    const i = item as Record<string, unknown>;
    if (typeof i.url !== "string") return false;
    if (i.title !== undefined && typeof i.title !== "string") return false;
    if (i.collection !== undefined && typeof i.collection !== "string")
      return false;
    if (i.tags !== undefined) {
      if (!Array.isArray(i.tags)) return false;
      for (const tag of i.tags) {
        if (typeof tag !== "string") return false;
      }
    }
    if (i.source_feed !== undefined && typeof i.source_feed !== "string")
      return false;
  }

  return true;
}

async function handleIngest(
  body: unknown,
  _config: Record<string, string>,
  db: Database,
  userId: string
): Promise<IngestResult> {
  if (!isValidPayload(body)) {
    return { created: 0, skipped: 0, errors: ["Invalid payload"] };
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of body.items) {
    try {
      const link = createLink(db, userId, {
        url: item.url,
        title: item.title,
        source: "plugin:n8n",
        sourceFeed: item.source_feed,
      });

      // Assign collection if specified
      if (item.collection) {
        const collection = getCollectionByName(db, userId, item.collection);
        if (collection) {
          updateLink(db, userId, link.id, {
            collectionId: collection.id,
          });
        }
      }

      // Create and assign tags
      if (item.tags) {
        for (const tagName of item.tags) {
          const tag = getOrCreateTag(db, userId, tagName);
          addTagToLink(db, link.id, tag.id);
        }
      }

      // Fire async extraction
      extractAndUpdate(db, link.id, item.url);

      created++;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint")
      ) {
        skipped++;
      } else {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        errors.push(message);
      }
    }
  }

  return { created, skipped, errors };
}

export const n8nPlugin: TrovePlugin = {
  id: "n8n",
  name: "n8n Webhook",
  icon: "\uD83D\uDD17",
  description: "Receive links from n8n automation workflows",

  configSchema: {},

  ingest: {
    description: "Receive links from n8n automation workflows",
    handleIngest,
  },
};
