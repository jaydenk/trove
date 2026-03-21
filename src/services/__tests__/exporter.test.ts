import { describe, test, expect } from "bun:test";
import { exportJson, exportCsv, exportHtml, type ExportLink } from "../exporter";
import { parseHtmlBookmarks, parseJsonFlexible } from "../importer";

const sampleLinks: ExportLink[] = [
  {
    url: "https://example.com/article-1",
    title: "First Article",
    description: "A great article about testing",
    domain: "example.com",
    collectionName: "Development",
    tags: ["testing", "javascript"],
    source: "manual",
    createdAt: "2024-01-15T10:00:00.000Z",
    updatedAt: "2024-01-15T12:00:00.000Z",
  },
  {
    url: "https://news.example.com/story",
    title: "Breaking News",
    description: null,
    domain: "news.example.com",
    collectionName: "News",
    tags: [],
    source: "api",
    createdAt: "2024-02-20T08:30:00.000Z",
    updatedAt: "2024-02-20T08:30:00.000Z",
  },
  {
    url: "https://example.com/another",
    title: "Another Dev Link",
    description: "More development content",
    domain: "example.com",
    collectionName: "Development",
    tags: ["web"],
    source: "manual",
    createdAt: "2024-03-01T14:00:00.000Z",
    updatedAt: "2024-03-01T14:00:00.000Z",
  },
];

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

describe("exportJson", () => {
  test("exports valid JSON with all fields", () => {
    const output = exportJson(sampleLinks);
    const parsed = JSON.parse(output);

    expect(parsed.version).toBe("1.0");
    expect(parsed.links).toHaveLength(3);
    expect(parsed.links[0].url).toBe("https://example.com/article-1");
    expect(parsed.links[0].title).toBe("First Article");
    expect(parsed.links[0].description).toBe("A great article about testing");
    expect(parsed.links[0].domain).toBe("example.com");
    expect(parsed.links[0].collectionName).toBe("Development");
    expect(parsed.links[0].tags).toEqual(["testing", "javascript"]);
    expect(parsed.links[0].source).toBe("manual");
    expect(parsed.links[0].createdAt).toBe("2024-01-15T10:00:00.000Z");
    expect(parsed.links[0].updatedAt).toBe("2024-01-15T12:00:00.000Z");
  });

  test("includes exportedAt timestamp", () => {
    const before = new Date().toISOString();
    const output = exportJson(sampleLinks);
    const parsed = JSON.parse(output);
    const after = new Date().toISOString();

    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.exportedAt >= before).toBe(true);
    expect(parsed.exportedAt <= after).toBe(true);
  });

  test("round-trip: output can be parsed by parseJsonFlexible", () => {
    const output = exportJson(sampleLinks);
    const result = parseJsonFlexible(output);

    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].url).toBe("https://example.com/article-1");
    expect(result.items[0].title).toBe("First Article");
  });

  test("handles empty links array", () => {
    const output = exportJson([]);
    const parsed = JSON.parse(output);

    expect(parsed.links).toHaveLength(0);
    expect(parsed.version).toBe("1.0");
  });
});

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

describe("exportCsv", () => {
  test("first row is header", () => {
    const output = exportCsv(sampleLinks);
    const lines = output.split("\n");

    expect(lines[0]).toBe("url,title,description,domain,collection,tags,source,created_at");
  });

  test("tags joined with semicolons", () => {
    const output = exportCsv(sampleLinks);
    const lines = output.split("\n");

    // First data row has tags "testing" and "javascript"
    expect(lines[1]).toContain("testing;javascript");
  });

  test("handles titles with commas — properly quoted", () => {
    const links: ExportLink[] = [
      {
        url: "https://example.com",
        title: "Hello, World",
        description: null,
        domain: "example.com",
        collectionName: "Test",
        tags: [],
        source: "manual",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    const output = exportCsv(links);
    const lines = output.split("\n");

    // The title field should be wrapped in quotes
    expect(lines[1]).toContain('"Hello, World"');
  });

  test("handles titles with quotes — properly escaped", () => {
    const links: ExportLink[] = [
      {
        url: "https://example.com",
        title: 'He said "hello"',
        description: null,
        domain: "example.com",
        collectionName: "Test",
        tags: [],
        source: "manual",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    const output = exportCsv(links);
    const lines = output.split("\n");

    // Quotes should be doubled and field wrapped in quotes
    expect(lines[1]).toContain('"He said ""hello"""');
  });

  test("correct number of data rows", () => {
    const output = exportCsv(sampleLinks);
    const lines = output.split("\n").filter((l) => l.trim() !== "");

    // Header + 3 data rows
    expect(lines).toHaveLength(4);
  });

  test("handles null description and domain", () => {
    const output = exportCsv([sampleLinks[1]]); // "Breaking News" has null description
    const lines = output.split("\n");
    const fields = lines[1].split(",");

    // description (index 2) should be empty
    expect(fields[2]).toBe("");
  });
});

// ---------------------------------------------------------------------------
// HTML export
// ---------------------------------------------------------------------------

describe("exportHtml", () => {
  test("valid Netscape bookmark format — starts with DOCTYPE", () => {
    const output = exportHtml(sampleLinks);
    expect(output.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>")).toBe(true);
  });

  test("collections as H3 folder headings", () => {
    const output = exportHtml(sampleLinks);

    expect(output).toContain("<H3>Development</H3>");
    expect(output).toContain("<H3>News</H3>");
  });

  test("includes ADD_DATE on each bookmark", () => {
    const output = exportHtml(sampleLinks);

    // 2024-01-15T10:00:00.000Z = 1705312800 Unix timestamp
    const expectedTimestamp = Math.floor(new Date("2024-01-15T10:00:00.000Z").getTime() / 1000);
    expect(output).toContain(`ADD_DATE="${expectedTimestamp}"`);
  });

  test("includes all bookmark URLs and titles", () => {
    const output = exportHtml(sampleLinks);

    expect(output).toContain('HREF="https://example.com/article-1"');
    expect(output).toContain(">First Article</A>");
    expect(output).toContain('HREF="https://news.example.com/story"');
    expect(output).toContain(">Breaking News</A>");
  });

  test("round-trip: output can be parsed by parseHtmlBookmarks", () => {
    const output = exportHtml(sampleLinks);
    const result = parseHtmlBookmarks(output);

    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(3);

    // Check that URLs survived the round-trip
    const urls = result.items.map((i) => i.url).sort();
    expect(urls).toEqual([
      "https://example.com/another",
      "https://example.com/article-1",
      "https://news.example.com/story",
    ]);

    // Check that collections survived
    const devLinks = result.items.filter((i) => i.collection === "Development");
    expect(devLinks).toHaveLength(2);

    const newsLinks = result.items.filter((i) => i.collection === "News");
    expect(newsLinks).toHaveLength(1);
  });

  test("escapes HTML entities in titles and URLs", () => {
    const links: ExportLink[] = [
      {
        url: "https://example.com/page?a=1&b=2",
        title: "Title with <html> & \"quotes\"",
        description: null,
        domain: "example.com",
        collectionName: "Test",
        tags: [],
        source: "manual",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    const output = exportHtml(links);

    expect(output).toContain("&amp;b=2");
    expect(output).toContain("&lt;html&gt;");
    expect(output).toContain("&amp;");
    expect(output).toContain("&quot;quotes&quot;");
  });

  test("handles empty links array", () => {
    const output = exportHtml([]);
    expect(output).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
    expect(output).toContain("<DL><p>");
    expect(output).toContain("</DL><p>");
  });
});
