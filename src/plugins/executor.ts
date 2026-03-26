import type { Database } from "bun:sqlite";
import type {
  PluginManifest,
  ApiCallExecute,
  UrlRedirectExecute,
  FileWriteExecute,
  HealthCheckBlock,
} from "./manifest";
import type { TemplateContext } from "./template";
import { interpolate, interpolateObject } from "./template";
import { mkdir, writeFile, access, realpath } from "node:fs/promises";
import { resolve, normalize, join } from "node:path";
import { createLink, updateLink } from "../db/queries/links";
import { getCollectionByName } from "../db/queries/collections";
import { getOrCreateTag, addTagToLink } from "../db/queries/tags";
import { extractAndUpdate } from "../services/extractor";

// ---------------------------------------------------------------------------
// Execute Result Types
// ---------------------------------------------------------------------------

export type PluginResult =
  | { type: "success"; message: string }
  | { type: "redirect"; url: string }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

export type HealthCheckResult =
  | { status: "ok" }
  | { status: "error"; message: string };

export async function executeHealthCheck(
  healthCheck: HealthCheckBlock,
  config: Record<string, string>
): Promise<HealthCheckResult> {
  const context: TemplateContext = {
    link: {
      url: "",
      title: "",
      description: null,
      domain: null,
      tags: "",
      tagsArray: "[]",
      createdAt: "",
    },
    config,
  };

  try {
    const url = interpolate(healthCheck.url, context);
    const headers: Record<string, string> = {};
    if (healthCheck.headers) {
      for (const [key, value] of Object.entries(healthCheck.headers)) {
        headers[key] = interpolate(value, context);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const expected = healthCheck.expectedStatus ?? 200;
    if (response.status !== expected) {
      return {
        status: "error",
        message: `Expected status ${expected}, got ${response.status}`,
      };
    }

    return { status: "ok" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return { status: "error", message };
  }
}

// ---------------------------------------------------------------------------
// Execute Plugin
// ---------------------------------------------------------------------------

export async function executePlugin(
  manifest: PluginManifest,
  context: TemplateContext
): Promise<PluginResult> {
  if (!manifest.execute) {
    return { type: "error", message: "Plugin has no execute block" };
  }

  const exec = manifest.execute;

  if (exec.type === "api-call") {
    return executeApiCall(exec, context);
  }

  if (exec.type === "url-redirect") {
    return executeUrlRedirect(exec, context);
  }

  if (exec.type === "file-write") {
    return executeFileWrite(exec, context);
  }

  return { type: "error", message: `Unknown execute type: ${(exec as { type: string }).type}` };
}

async function executeApiCall(
  exec: ApiCallExecute,
  context: TemplateContext
): Promise<PluginResult> {
  try {
    const url = interpolate(exec.url, context);
    const method = exec.method;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (exec.headers) {
      for (const [key, value] of Object.entries(exec.headers)) {
        headers[key] = interpolate(value, context);
      }
    }

    let body: string | undefined;
    if (exec.body) {
      const interpolatedBody = interpolateObject(
        exec.body as Record<string, unknown>,
        context
      );
      // Remove empty string values — APIs like Readwise reject "" for
      // optional enum fields (e.g. category, location)
      const cleaned = Object.fromEntries(
        Object.entries(interpolatedBody).filter(([, v]) => v !== "")
      );
      body = JSON.stringify(cleaned);
    }

    const response = await fetch(url, { method, headers, body });

    if (!response.ok) {
      const text = await response.text();
      return {
        type: "error",
        message: `API returned ${response.status}: ${text}`,
      };
    }

    return {
      type: "success",
      message: exec.successMessage || "Action completed",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return { type: "error", message };
  }
}

function executeUrlRedirect(
  exec: UrlRedirectExecute,
  context: TemplateContext
): PluginResult {
  const url = interpolate(exec.urlTemplate, context);
  return { type: "redirect", url };
}

// ---------------------------------------------------------------------------
// File Write Handler
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

const INVALID_FILENAME_CHARS = /[\/\\:*?"<>|]/g;

function sanitiseFilename(name: string): string {
  return name.replace(INVALID_FILENAME_CHARS, "-");
}

function normalisePath(p: string): string {
  return normalize(p).replace(/\/+$/, "") || "/";
}

async function executeFileWrite(
  exec: FileWriteExecute,
  context: TemplateContext
): Promise<PluginResult> {
  try {
    const rawDir = interpolate(exec.directory, context);
    const rawFilename = interpolate(exec.filename, context);
    const content = interpolate(exec.content, context);
    const mode = exec.mode ?? "create";

    if (Buffer.byteLength(content, "utf-8") > MAX_FILE_SIZE) {
      return { type: "error", message: "File content exceeds maximum size of 1MB" };
    }

    // Reject path traversal attempts in the raw filename before sanitisation
    if (rawFilename.includes("..") || rawFilename.includes("/") || rawFilename.includes("\\")) {
      return { type: "error", message: "Path traversal detected: filename contains invalid path components" };
    }

    const filename = sanitiseFilename(rawFilename);
    const dir = normalisePath(rawDir);

    try {
      await mkdir(dir, { recursive: true });
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "EACCES") {
        return { type: "error", message: "Cannot create directory: permission denied" };
      }
      throw err;
    }

    const realDir = await realpath(dir);
    const resolvedFile = resolve(realDir, filename);
    if (!resolvedFile.startsWith(realDir + "/") && resolvedFile !== realDir) {
      return { type: "error", message: "Path traversal detected: file path escapes target directory" };
    }

    if (mode === "create") {
      try {
        await access(resolvedFile);
        return { type: "error", message: `File already exists: ${filename}` };
      } catch {
        // File doesn't exist — proceed
      }
    }

    await writeFile(resolvedFile, content, "utf-8");

    return { type: "success", message: exec.successMessage || "File saved" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { type: "error", message };
  }
}

// ---------------------------------------------------------------------------
// Ingest Handler
// ---------------------------------------------------------------------------

export interface IngestResult {
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Resolve a JSONPath-like dot notation against an object.
 * e.g. "$.url" -> item.url, "$.nested.field" -> item.nested.field
 */
function resolveJsonPath(obj: unknown, path: string): unknown {
  if (typeof obj !== "object" || obj === null) return undefined;

  // Strip the leading "$." prefix if present
  const cleanPath = path.startsWith("$.") ? path.slice(2) : path;
  const parts = cleanPath.split(".");

  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

export async function handleIngest(
  manifest: PluginManifest,
  body: unknown,
  db: Database,
  userId: string
): Promise<IngestResult> {
  if (!manifest.ingest) {
    return { created: 0, skipped: 0, errors: ["Plugin has no ingest block"] };
  }

  const mapping = manifest.ingest.itemMapping;

  // Determine items: body.items array, plain array, or single item
  let items: unknown[];
  if (typeof body !== "object" || body === null) {
    return { created: 0, skipped: 0, errors: ["Invalid payload"] };
  }

  const bodyObj = body as Record<string, unknown>;
  if (Array.isArray(bodyObj.items)) {
    items = bodyObj.items;
  } else if (Array.isArray(body)) {
    items = body;
  } else {
    // Treat the body itself as a single item
    items = [body];
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      // Extract URL (required)
      const url = resolveJsonPath(item, mapping.url);
      if (typeof url !== "string" || url.length === 0) {
        errors.push("Item missing required 'url' field");
        continue;
      }

      // Extract optional fields
      const title = mapping.title
        ? (resolveJsonPath(item, mapping.title) as string | undefined)
        : undefined;

      const link = createLink(db, userId, {
        url,
        title: typeof title === "string" ? title : undefined,
        source: `plugin:${manifest.id}`,
        sourceFeed: mapping.sourceFeed
          ? (resolveJsonPath(item, mapping.sourceFeed) as
              | string
              | undefined) ?? undefined
          : undefined,
      });

      // Assign collection if specified
      if (mapping.collection) {
        const collectionName = resolveJsonPath(
          item,
          mapping.collection
        ) as string | undefined;
        if (typeof collectionName === "string" && collectionName.length > 0) {
          const collection = getCollectionByName(
            db,
            userId,
            collectionName
          );
          if (collection) {
            updateLink(db, userId, link.id, {
              collectionId: collection.id,
            });
          }
        }
      }

      // Create and assign tags
      if (mapping.tags) {
        const rawTags = resolveJsonPath(item, mapping.tags);
        let tagNames: string[] = [];
        if (Array.isArray(rawTags)) {
          tagNames = rawTags.filter(
            (t): t is string => typeof t === "string"
          );
        } else if (typeof rawTags === "string" && rawTags.length > 0) {
          tagNames = rawTags.split(",").map((t) => t.trim());
        }
        for (const tagName of tagNames) {
          if (tagName.length > 0) {
            const tag = getOrCreateTag(db, userId, tagName);
            addTagToLink(db, link.id, tag.id);
          }
        }
      }

      // Fire async extraction
      extractAndUpdate(db, link.id, url, userId);

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
