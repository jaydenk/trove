import { JSDOM } from "jsdom";

export interface ImportItem {
  url: string;
  title?: string;
  description?: string;
  tags?: string[];
  collection?: string;
  createdAt?: string;
}

export interface ImportResult {
  items: ImportItem[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// HTML bookmark parser (Netscape bookmark format)
// ---------------------------------------------------------------------------

export function parseHtmlBookmarks(html: string): ImportResult {
  const items: ImportItem[] = [];
  const errors: string[] = [];

  let dom: JSDOM;
  try {
    dom = new JSDOM(html);
  } catch {
    return { items: [], errors: ["Failed to parse HTML"] };
  }

  const doc = dom.window.document;

  function walk(node: Element, parentFolder: string | undefined): void {
    const children = Array.from(node.children);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      if (child.tagName === "DT") {
        // Check for a folder heading (H3) first — JSDOM nests child DTs
        // inside the folder DT, so checking A first would match anchors
        // from nested bookmarks rather than the folder itself.
        const heading = child.querySelector(":scope > H3");
        if (heading) {
          const folderName = heading.textContent?.trim() ?? undefined;
          const dl = child.querySelector(":scope > DL");
          if (dl) {
            walk(dl, folderName);
          }
          continue;
        }

        // Check for an anchor (bookmark entry)
        const anchor = child.querySelector(":scope > A");
        if (anchor) {
          const href = anchor.getAttribute("HREF") ?? anchor.getAttribute("href");
          if (!href) {
            errors.push(`Skipped bookmark without URL: ${anchor.textContent?.trim() ?? "(no title)"}`);
            continue;
          }

          // Validate URL
          try {
            new URL(href);
          } catch {
            errors.push(`Skipped invalid URL: ${href}`);
            continue;
          }

          const item: ImportItem = { url: href };

          const title = anchor.textContent?.trim();
          if (title) item.title = title;

          const addDate = anchor.getAttribute("ADD_DATE") ?? anchor.getAttribute("add_date");
          if (addDate) {
            const timestamp = parseInt(addDate, 10);
            if (!isNaN(timestamp)) {
              item.createdAt = new Date(timestamp * 1000).toISOString();
            }
          }

          const tagsAttr = anchor.getAttribute("TAGS") ?? anchor.getAttribute("tags");
          if (tagsAttr) {
            const tags = tagsAttr.split(",").map((t) => t.trim()).filter(Boolean);
            if (tags.length > 0) item.tags = tags;
          }

          if (parentFolder) item.collection = parentFolder;

          items.push(item);
          continue;
        }

        // Fallback: recurse into any DL children within this DT
        const dl = child.querySelector(":scope > DL");
        if (dl) {
          walk(dl, parentFolder);
        }
      } else if (child.tagName === "DL") {
        walk(child, parentFolder);
      }
    }
  }

  // Start walking from the root — the bookmarks live inside DL elements
  const rootDls = doc.querySelectorAll("DL");
  if (rootDls.length === 0) {
    // Try case-insensitive
    const allDls = doc.querySelectorAll("dl");
    for (const dl of allDls) {
      walk(dl, undefined);
    }
  } else {
    // Walk only the top-level DL(s)
    for (const dl of rootDls) {
      // Only walk top-level DLs (those not nested inside another DL)
      if (!dl.parentElement?.closest("DL, dl")) {
        walk(dl, undefined);
      }
    }
  }

  return { items, errors };
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === ",") {
        fields.push(current);
        current = "";
        i++;
        continue;
      }
      current += ch;
      i++;
    }
  }

  fields.push(current);
  return fields;
}

export function parseCsv(csv: string): ImportResult {
  const items: ImportItem[] = [];
  const errors: string[] = [];

  const lines = csv.split(/\r?\n/);
  if (lines.length === 0) {
    return { items: [], errors: ["Empty CSV"] };
  }

  // Find the first non-empty line as the header
  let headerIdx = 0;
  while (headerIdx < lines.length && lines[headerIdx].trim() === "") {
    headerIdx++;
  }

  if (headerIdx >= lines.length) {
    return { items: [], errors: ["Empty CSV"] };
  }

  const headerFields = parseCsvRow(lines[headerIdx]).map((h) => h.trim().toLowerCase());

  const urlIdx = headerFields.indexOf("url");
  if (urlIdx === -1) {
    return { items: [], errors: ["CSV missing required 'url' column"] };
  }

  const titleIdx = headerFields.indexOf("title");
  const descIdx = headerFields.indexOf("description");
  const tagsIdx = headerFields.indexOf("tags");
  const collectionIdx = headerFields.indexOf("collection");

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;

    const fields = parseCsvRow(lines[i]);
    const url = fields[urlIdx]?.trim();

    if (!url) {
      errors.push(`Row ${i + 1}: skipped — no URL`);
      continue;
    }

    const item: ImportItem = { url };

    if (titleIdx !== -1 && fields[titleIdx]?.trim()) {
      item.title = fields[titleIdx].trim();
    }

    if (descIdx !== -1 && fields[descIdx]?.trim()) {
      item.description = fields[descIdx].trim();
    }

    if (tagsIdx !== -1 && fields[tagsIdx]?.trim()) {
      item.tags = fields[tagsIdx]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }

    if (collectionIdx !== -1 && fields[collectionIdx]?.trim()) {
      item.collection = fields[collectionIdx].trim();
    }

    items.push(item);
  }

  return { items, errors };
}

// ---------------------------------------------------------------------------
// JSON parser
// ---------------------------------------------------------------------------

export function parseJson(json: string): ImportResult {
  const items: ImportItem[] = [];
  const errors: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { items: [], errors: [`Invalid JSON: ${message}`] };
  }

  let rawItems: unknown[];

  if (Array.isArray(parsed)) {
    rawItems = parsed;
  } else if (
    parsed !== null &&
    typeof parsed === "object" &&
    "links" in parsed &&
    Array.isArray((parsed as Record<string, unknown>).links)
  ) {
    rawItems = (parsed as Record<string, unknown>).links as unknown[];
  } else {
    return {
      items: [],
      errors: ["JSON must be an array or an object with a 'links' array"],
    };
  }

  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i];
    if (raw === null || typeof raw !== "object") {
      errors.push(`Item ${i}: not an object — skipped`);
      continue;
    }

    const obj = raw as Record<string, unknown>;
    const url = typeof obj.url === "string" ? obj.url.trim() : "";

    if (!url) {
      errors.push(`Item ${i}: missing or empty 'url' — skipped`);
      continue;
    }

    const item: ImportItem = { url };

    if (typeof obj.title === "string" && obj.title.trim()) {
      item.title = obj.title.trim();
    }

    if (typeof obj.description === "string" && obj.description.trim()) {
      item.description = obj.description.trim();
    }

    if (Array.isArray(obj.tags)) {
      const tags = obj.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length > 0) item.tags = tags;
    }

    if (typeof obj.collection === "string" && obj.collection.trim()) {
      item.collection = obj.collection.trim();
    }

    if (typeof obj.createdAt === "string" && obj.createdAt.trim()) {
      item.createdAt = obj.createdAt.trim();
    }

    items.push(item);
  }

  return { items, errors };
}
