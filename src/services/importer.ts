import { JSDOM } from "jsdom";

export interface ImportItem {
  url: string;
  title?: string;
  description?: string;
  tags?: string[];
  collection?: string;
  createdAt?: string;
}

export type DetectedFormat = "html" | "json" | "csv" | "text";

export interface ImportResult {
  items: ImportItem[];
  errors: string[];
  detectedFormat: DetectedFormat;
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

export function detectFormat(content: string): DetectedFormat {
  const trimmed = content.trimStart();

  // HTML bookmarks: starts with <!DOCTYPE, <DL, <dl, or contains <A HREF=
  if (
    /^<!DOCTYPE/i.test(trimmed) ||
    /^<DL/i.test(trimmed) ||
    /^<dl/i.test(trimmed) ||
    /<A\s+HREF=/i.test(trimmed)
  ) {
    return "html";
  }

  // JSON: starts with [ or {
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    // Try to parse it — if it fails, fall through to text
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // Not valid JSON, fall through
    }
  }

  // CSV/TSV: first line looks like comma/tab/semicolon-separated headers with
  // a URL-like column name
  const firstLine = trimmed.split(/\r?\n/)[0] ?? "";
  const urlColumnNames = [
    "url",
    "link",
    "href",
    "address",
    "uri",
    "website",
  ];
  const lowerFirst = firstLine.toLowerCase();
  // Check if the first line contains a delimiter and a URL-like column name
  const hasDelimiter =
    firstLine.includes(",") ||
    firstLine.includes("\t") ||
    firstLine.includes(";");
  const hasUrlColumn = urlColumnNames.some((name) => {
    // Match whole-word column names (delimited by comma, tab, semicolon, or start/end)
    const re = new RegExp(`(?:^|[,\t;])\\s*"?${name}"?\\s*(?:[,\t;]|$)`, "i");
    return re.test(lowerFirst);
  });
  if (hasDelimiter && hasUrlColumn) {
    return "csv";
  }

  return "text";
}

// ---------------------------------------------------------------------------
// Smart import — auto-detect and parse
// ---------------------------------------------------------------------------

export function smartImport(content: string, formatHint?: string): ImportResult {
  let format: DetectedFormat;

  if (
    formatHint &&
    ["html", "json", "csv", "text"].includes(formatHint)
  ) {
    format = formatHint as DetectedFormat;
  } else {
    format = detectFormat(content);
  }

  switch (format) {
    case "html":
      return parseHtmlBookmarks(content);
    case "json":
      return parseJsonFlexible(content);
    case "csv":
      return parseCsvFlexible(content);
    case "text":
      return extractUrls(content);
  }
}

// ---------------------------------------------------------------------------
// HTML bookmark parser (Netscape bookmark format) — kept as-is
// ---------------------------------------------------------------------------

export function parseHtmlBookmarks(html: string): ImportResult {
  const items: ImportItem[] = [];
  const errors: string[] = [];

  let dom: JSDOM;
  try {
    dom = new JSDOM(html);
  } catch {
    return { items: [], errors: ["Failed to parse HTML"], detectedFormat: "html" };
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

  return { items, errors, detectedFormat: "html" };
}

// ---------------------------------------------------------------------------
// Flexible JSON parser
// ---------------------------------------------------------------------------

/** Field name aliases for fuzzy matching */
const URL_FIELDS = ["url", "link", "href", "address", "uri"];
const TITLE_FIELDS = ["title", "name", "label", "page_title", "pagetitle"];
const DESC_FIELDS = ["description", "desc", "summary", "excerpt", "note", "notes"];
const TAGS_FIELDS = ["tags", "labels", "categories", "keywords"];
const COLLECTION_FIELDS = ["collection", "folder", "category", "group", "list"];
const CREATED_FIELDS = [
  "created",
  "createdat",
  "created_at",
  "date",
  "timestamp",
  "added",
  "addedat",
  "added_at",
];

/** Wrapper keys to unwrap before processing */
const WRAPPER_KEYS = ["links", "data", "bookmarks", "items"];

/**
 * Find the first matching field value from an object using a list of possible
 * key names (case-insensitive).
 */
function findField(
  obj: Record<string, unknown>,
  aliases: string[],
): unknown | undefined {
  const keys = Object.keys(obj);
  for (const alias of aliases) {
    const match = keys.find((k) => k.toLowerCase() === alias);
    if (match !== undefined) return obj[match];
  }
  return undefined;
}

export function parseJsonFlexible(json: string): ImportResult {
  const items: ImportItem[] = [];
  const errors: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { items: [], errors: [`Invalid JSON: ${message}`], detectedFormat: "json" };
  }

  let rawItems: unknown[];

  if (Array.isArray(parsed)) {
    rawItems = parsed;
  } else if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    // Try to unwrap known wrapper keys
    let found = false;
    for (const key of WRAPPER_KEYS) {
      const lowerKeys = Object.keys(obj);
      const match = lowerKeys.find((k) => k.toLowerCase() === key);
      if (match && Array.isArray(obj[match])) {
        rawItems = obj[match] as unknown[];
        found = true;
        break;
      }
    }
    if (!found) {
      return {
        items: [],
        errors: [
          "JSON must be an array or an object with a recognised wrapper key (links, data, bookmarks, items)",
        ],
        detectedFormat: "json",
      };
    }
  } else {
    return {
      items: [],
      errors: [
        "JSON must be an array or an object with a recognised wrapper key (links, data, bookmarks, items)",
      ],
      detectedFormat: "json",
    };
  }

  for (let i = 0; i < rawItems!.length; i++) {
    const raw = rawItems![i];
    if (raw === null || typeof raw !== "object") {
      errors.push(`Item ${i}: not an object — skipped`);
      continue;
    }

    const obj = raw as Record<string, unknown>;

    // Find URL
    const urlVal = findField(obj, URL_FIELDS);
    const url = typeof urlVal === "string" ? urlVal.trim() : "";

    if (!url) {
      errors.push(`Item ${i}: missing or empty URL field — skipped`);
      continue;
    }

    const item: ImportItem = { url };

    // Title
    const titleVal = findField(obj, TITLE_FIELDS);
    if (typeof titleVal === "string" && titleVal.trim()) {
      item.title = titleVal.trim();
    }

    // Description
    const descVal = findField(obj, DESC_FIELDS);
    if (typeof descVal === "string" && descVal.trim()) {
      item.description = descVal.trim();
    }

    // Tags — accept string (comma/semicolon-separated) or array
    const tagsVal = findField(obj, TAGS_FIELDS);
    if (Array.isArray(tagsVal)) {
      const tags = tagsVal
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length > 0) item.tags = tags;
    } else if (typeof tagsVal === "string" && tagsVal.trim()) {
      const tags = tagsVal
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length > 0) item.tags = tags;
    }

    // Collection
    const collVal = findField(obj, COLLECTION_FIELDS);
    if (typeof collVal === "string" && collVal.trim()) {
      item.collection = collVal.trim();
    }

    // CreatedAt
    const createdVal = findField(obj, CREATED_FIELDS);
    if (typeof createdVal === "string" && createdVal.trim()) {
      item.createdAt = createdVal.trim();
    } else if (typeof createdVal === "number") {
      // Handle unix timestamps — if > 1e12, assume milliseconds; otherwise seconds
      const ms = createdVal > 1e12 ? createdVal : createdVal * 1000;
      item.createdAt = new Date(ms).toISOString();
    }

    items.push(item);
  }

  return { items, errors, detectedFormat: "json" };
}

// ---------------------------------------------------------------------------
// Flexible CSV/TSV parser
// ---------------------------------------------------------------------------

/** CSV column name aliases */
const CSV_URL_ALIASES = ["url", "link", "href", "address", "uri", "website"];
const CSV_TITLE_ALIASES = ["title", "name", "label", "page title", "pagetitle", "page_title"];
const CSV_DESC_ALIASES = ["description", "desc", "summary", "notes"];
const CSV_TAGS_ALIASES = ["tags", "labels", "categories", "keywords"];
const CSV_COLLECTION_ALIASES = ["collection", "folder", "category", "group"];

function detectDelimiter(line: string): string {
  const tabCount = (line.match(/\t/g) ?? []).length;
  const commaCount = (line.match(/,/g) ?? []).length;
  const semicolonCount = (line.match(/;/g) ?? []).length;

  if (tabCount > 0 && tabCount >= commaCount && tabCount >= semicolonCount) {
    return "\t";
  }
  if (semicolonCount > commaCount) {
    return ";";
  }
  return ",";
}

function parseDelimitedRow(line: string, delimiter: string): string[] {
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
      if (ch === delimiter) {
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

function findColumnIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.findIndex((h) => h === alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

export function parseCsvFlexible(csv: string): ImportResult {
  const items: ImportItem[] = [];
  const errors: string[] = [];

  const lines = csv.split(/\r?\n/);

  // Find first non-empty line as header
  let headerIdx = 0;
  while (headerIdx < lines.length && lines[headerIdx].trim() === "") {
    headerIdx++;
  }

  if (headerIdx >= lines.length) {
    return { items: [], errors: ["Empty CSV"], detectedFormat: "csv" };
  }

  const headerLine = lines[headerIdx];
  const delimiter = detectDelimiter(headerLine);
  const headerFields = parseDelimitedRow(headerLine, delimiter).map((h) =>
    h.trim().toLowerCase(),
  );

  // Find column indices using aliases
  const urlIdx = findColumnIndex(headerFields, CSV_URL_ALIASES);
  const titleIdx = findColumnIndex(headerFields, CSV_TITLE_ALIASES);
  const descIdx = findColumnIndex(headerFields, CSV_DESC_ALIASES);
  const tagsIdx = findColumnIndex(headerFields, CSV_TAGS_ALIASES);
  const collectionIdx = findColumnIndex(headerFields, CSV_COLLECTION_ALIASES);

  // If only ONE column or no recognisable URL header, treat each row as a URL
  if (urlIdx === -1) {
    // Check if header row itself looks like a URL — if so, treat all rows
    // (including header) as plain URLs
    const allLines =
      headerFields.length === 1 || !headerFields.some((h) => h.length > 0)
        ? lines
        : lines.slice(headerIdx + 1);

    // If single-column or no url header found, treat each non-empty row as a URL
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      if (!line) continue;
      // Extract the first field only
      const fields = parseDelimitedRow(line, delimiter);
      const url = fields[0]?.trim();
      if (url) {
        // Validate it looks like a URL
        try {
          new URL(url);
          items.push({ url });
        } catch {
          errors.push(`Row ${i + 1}: skipped — not a valid URL: ${url}`);
        }
      }
    }

    return { items, errors, detectedFormat: "csv" };
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;

    const fields = parseDelimitedRow(lines[i], delimiter);
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
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
    }

    if (collectionIdx !== -1 && fields[collectionIdx]?.trim()) {
      item.collection = fields[collectionIdx].trim();
    }

    items.push(item);
  }

  return { items, errors, detectedFormat: "csv" };
}

// ---------------------------------------------------------------------------
// Plain text URL extractor
// ---------------------------------------------------------------------------

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g;

export function extractUrls(text: string): ImportResult {
  const items: ImportItem[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  const matches = text.match(URL_REGEX);
  if (!matches || matches.length === 0) {
    return {
      items: [],
      errors: ["No URLs found in the provided text"],
      detectedFormat: "text",
    };
  }

  for (const rawUrl of matches) {
    // Clean trailing punctuation that's likely not part of the URL
    const url = rawUrl.replace(/[.,;:!?)]+$/, "");

    if (seen.has(url)) continue;
    seen.add(url);

    // Validate
    try {
      new URL(url);
      items.push({ url });
    } catch {
      errors.push(`Skipped invalid URL: ${url}`);
    }
  }

  return { items, errors, detectedFormat: "text" };
}
