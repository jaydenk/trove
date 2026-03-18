import { describe, test, expect, afterAll, beforeAll } from "bun:test";
import { extractContent } from "../extractor";

const ARTICLE_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Test Article</title>
  <meta property="og:image" content="https://example.com/image.jpg" />
</head>
<body>
  <article>
    <h1>Test Article</h1>
    <p>This is the first paragraph of the article with enough content for Readability to pick it up.
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore
    et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
    aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse
    cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
    culpa qui officia deserunt mollit anim id est laborum.</p>
    <p>Second paragraph with more content to ensure Readability has enough to work with. This adds
    additional context and length so the extraction engine considers this a proper article. We need a
    reasonable amount of text here to pass the heuristics that Readability uses internally.</p>
    <p>Third paragraph continues the article. More text ensures better extraction results. The library
    needs sufficient content density relative to the page structure to decide this is indeed article
    content worth extracting rather than boilerplate navigation or sidebar text.</p>
  </article>
</body>
</html>`;

const MINIMAL_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Minimal Page</title>
  <meta property="og:title" content="OG Minimal Title" />
  <meta property="og:description" content="OG minimal description" />
  <meta property="og:image" content="https://example.com/og-minimal.jpg" />
</head>
<body>
  <nav>Home | About | Contact</nav>
</body>
</html>`;

describe("extractContent", () => {
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/article") {
          return new Response(ARTICLE_HTML, {
            headers: { "Content-Type": "text/html" },
          });
        }

        if (url.pathname === "/minimal") {
          return new Response(MINIMAL_HTML, {
            headers: { "Content-Type": "text/html" },
          });
        }

        if (url.pathname === "/long-content") {
          const longText = "A".repeat(100000);
          const html = `<!DOCTYPE html>
<html>
<head><title>Long Content</title></head>
<body>
  <article>
    <h1>Long Article</h1>
    <p>${longText}</p>
    <p>${longText}</p>
  </article>
</body>
</html>`;
          return new Response(html, {
            headers: { "Content-Type": "text/html" },
          });
        }

        if (url.pathname === "/slow") {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(
                new Response("<html><body>Slow</body></html>", {
                  headers: { "Content-Type": "text/html" },
                })
              );
            }, 500);
          });
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
  });

  test("extracts title from HTML with Readability", async () => {
    const result = await extractContent(`${baseUrl}/article`);

    expect(result.title).toBe("Test Article");
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.imageUrl).toBe("https://example.com/image.jpg");
  });

  test("falls back to OG tags when Readability returns null", async () => {
    const result = await extractContent(`${baseUrl}/minimal`);

    expect(result.title).toBe("OG Minimal Title");
    expect(result.description).toBe("OG minimal description");
    expect(result.imageUrl).toBe("https://example.com/og-minimal.jpg");
  });

  test("truncates content at TROVE_MAX_CONTENT_LENGTH_CHARS", async () => {
    const originalEnv = process.env.TROVE_MAX_CONTENT_LENGTH_CHARS;
    process.env.TROVE_MAX_CONTENT_LENGTH_CHARS = "100";

    try {
      const result = await extractContent(`${baseUrl}/long-content`);
      expect(result.content.length).toBeLessThanOrEqual(100);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.TROVE_MAX_CONTENT_LENGTH_CHARS;
      } else {
        process.env.TROVE_MAX_CONTENT_LENGTH_CHARS = originalEnv;
      }
    }
  });

  test("returns correct domain from URL", async () => {
    const result = await extractContent(`${baseUrl}/article`);
    expect(result.domain).toBe("localhost");
  });

  test("returns correct favicon URL", async () => {
    const result = await extractContent(`${baseUrl}/article`);
    expect(result.faviconUrl).toBe(
      "https://www.google.com/s2/favicons?domain=localhost&sz=64"
    );
  });

  test("handles fetch failure gracefully", async () => {
    await expect(
      extractContent("http://localhost:1/nonexistent")
    ).rejects.toThrow();
  });

  test("handles timeout", async () => {
    const originalEnv = process.env.TROVE_EXTRACTION_TIMEOUT_MS;
    process.env.TROVE_EXTRACTION_TIMEOUT_MS = "100";

    try {
      await expect(extractContent(`${baseUrl}/slow`)).rejects.toThrow();
    } finally {
      if (originalEnv === undefined) {
        delete process.env.TROVE_EXTRACTION_TIMEOUT_MS;
      } else {
        process.env.TROVE_EXTRACTION_TIMEOUT_MS = originalEnv;
      }
    }
  });
});
