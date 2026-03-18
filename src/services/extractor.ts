import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { Database } from "bun:sqlite";
import { updateExtraction } from "../db/queries/links";

export interface ExtractionResult {
  title: string;
  description: string;
  content: string;
  rawHtml: string;
  imageUrl: string | null;
  faviconUrl: string;
  domain: string;
}

function getTimeoutMs(): number {
  const env = process.env.TROVE_EXTRACTION_TIMEOUT_MS;
  return env ? parseInt(env, 10) : 10000;
}

function getMaxContentLength(): number {
  const env = process.env.TROVE_MAX_CONTENT_LENGTH_CHARS;
  return env ? parseInt(env, 10) : 50000;
}

/**
 * Strip HTML tags and normalise whitespace to produce clean plain text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")     // replace tags with space
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")         // collapse whitespace
    .trim();
}

function getMetaContent(doc: Document, property: string): string | null {
  const meta =
    doc.querySelector(`meta[property="${property}"]`) ??
    doc.querySelector(`meta[name="${property}"]`);
  return meta?.getAttribute("content") ?? null;
}

export async function extractContent(url: string): Promise<ExtractionResult> {
  const timeoutMs = getTimeoutMs();
  const maxContentLength = getMaxContentLength();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let html: string;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Trove/1.0 (personal link library)",
      },
    });
    html = await response.text();
  } finally {
    clearTimeout(timeout);
  }

  const parsed = new URL(url);
  const domain = parsed.hostname;

  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // Try Readability first
  const reader = new Readability(doc);
  const article = reader.parse();

  let title: string;
  let description: string;
  let content: string;
  let imageUrl: string | null;

  if (article) {
    title = article.title || getMetaContent(doc, "og:title") || domain;
    description =
      article.excerpt || getMetaContent(doc, "og:description") || "";
    // Use textContent (plain text) and strip any residual HTML tags
    content = stripHtml(article.textContent || "");
    imageUrl = getMetaContent(doc, "og:image");
  } else {
    // Fall back to OG meta tags
    title = getMetaContent(doc, "og:title") || doc.title || domain;
    description = getMetaContent(doc, "og:description") || "";
    content = "";
    imageUrl = getMetaContent(doc, "og:image");
  }

  // Truncate content
  if (content.length > maxContentLength) {
    content = content.substring(0, maxContentLength);
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  return {
    title,
    description,
    content,
    rawHtml: html,
    imageUrl,
    faviconUrl,
    domain,
  };
}

export function extractAndUpdate(
  db: Database,
  linkId: string,
  url: string
): void {
  extractContent(url)
    .then((result) => {
      updateExtraction(db, linkId, {
        title: result.title,
        description: result.description,
        content: result.content,
        raw_html: result.rawHtml,
        image_url: result.imageUrl ?? undefined,
        favicon_url: result.faviconUrl,
        domain: result.domain,
        extraction_status: "completed",
      });
    })
    .catch(() => {
      updateExtraction(db, linkId, {
        extraction_status: "failed",
      });
    });
}
