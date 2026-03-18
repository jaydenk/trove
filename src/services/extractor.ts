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

/**
 * Remove noisy elements from the DOM before Readability processes it.
 * This strips navigation, footers, code blocks, and other chrome that
 * pollutes extracted text on marketing/documentation pages.
 */
function preCleanDom(doc: Document): void {
  const noisySelectors = [
    "script", "style", "noscript", "iframe",
    "nav", "footer", "header",
    "aside", "[role='navigation']", "[role='banner']", "[role='contentinfo']",
    "pre", "code",           // code blocks add noise for a link library
    ".hljs", ".highlight",   // common code highlight wrappers
    "svg",                   // inline SVGs (icons, illustrations)
  ];
  for (const selector of noisySelectors) {
    for (const el of doc.querySelectorAll(selector)) {
      el.remove();
    }
  }
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

  // Extract OG tags BEFORE cleaning the DOM (they live in <head>)
  const ogTitle = getMetaContent(doc, "og:title");
  const ogDescription = getMetaContent(doc, "og:description");
  const ogImage = getMetaContent(doc, "og:image");
  const pageTitle = doc.title;

  // Pre-clean the DOM to remove noisy elements
  preCleanDom(doc);

  // Try Readability on the cleaned DOM
  const reader = new Readability(doc);
  const article = reader.parse();

  let title: string;
  let description: string;
  let content: string;
  let imageUrl: string | null;

  if (article) {
    title = article.title || ogTitle || domain;
    description = article.excerpt || ogDescription || "";
    content = stripHtml(article.textContent || "");
    imageUrl = ogImage;
  } else {
    title = ogTitle || pageTitle || domain;
    description = ogDescription || "";
    content = "";
    imageUrl = ogImage;
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
