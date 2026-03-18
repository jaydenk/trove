import { describe, test, expect } from "bun:test";
import { parseHtmlBookmarks, parseCsv, parseJson } from "../importer";

// ---------------------------------------------------------------------------
// HTML bookmark parser
// ---------------------------------------------------------------------------

describe("parseHtmlBookmarks", () => {
  test("parses standard Chrome bookmark export with folders as collections", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3>Development</H3>
  <DL><p>
    <DT><A HREF="https://github.com" ADD_DATE="1700000000">GitHub</A>
    <DT><A HREF="https://stackoverflow.com" ADD_DATE="1700000100">Stack Overflow</A>
  </DL><p>
  <DT><H3>News</H3>
  <DL><p>
    <DT><A HREF="https://news.ycombinator.com" ADD_DATE="1700000200">Hacker News</A>
  </DL><p>
</DL><p>`;

    const result = parseHtmlBookmarks(html);

    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(3);

    expect(result.items[0]).toEqual({
      url: "https://github.com",
      title: "GitHub",
      collection: "Development",
      createdAt: new Date(1700000000 * 1000).toISOString(),
    });

    expect(result.items[1]).toEqual({
      url: "https://stackoverflow.com",
      title: "Stack Overflow",
      collection: "Development",
      createdAt: new Date(1700000100 * 1000).toISOString(),
    });

    expect(result.items[2]).toEqual({
      url: "https://news.ycombinator.com",
      title: "Hacker News",
      collection: "News",
      createdAt: new Date(1700000200 * 1000).toISOString(),
    });
  });

  test("extracts ADD_DATE as ISO date", () => {
    const html = `<DL><p>
      <DT><A HREF="https://example.com" ADD_DATE="1609459200">New Year 2021</A>
    </DL><p>`;

    const result = parseHtmlBookmarks(html);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].createdAt).toBe("2021-01-01T00:00:00.000Z");
  });

  test("extracts TAGS attribute (Firefox format)", () => {
    const html = `<DL><p>
      <DT><A HREF="https://example.com" TAGS="javascript,web,frontend">Tagged Link</A>
    </DL><p>`;

    const result = parseHtmlBookmarks(html);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].tags).toEqual(["javascript", "web", "frontend"]);
  });

  test("handles nested folders — uses immediate parent as collection", () => {
    const html = `<DL><p>
      <DT><H3>Top</H3>
      <DL><p>
        <DT><A HREF="https://top.com">Top Link</A>
        <DT><H3>Nested</H3>
        <DL><p>
          <DT><A HREF="https://nested.com">Nested Link</A>
        </DL><p>
      </DL><p>
    </DL><p>`;

    const result = parseHtmlBookmarks(html);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].collection).toBe("Top");
    expect(result.items[1].collection).toBe("Nested");
  });

  test("skips entries without href", () => {
    const html = `<DL><p>
      <DT><A>No Href</A>
      <DT><A HREF="https://valid.com">Valid</A>
    </DL><p>`;

    const result = parseHtmlBookmarks(html);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://valid.com");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("handles malformed/empty HTML gracefully", () => {
    const result1 = parseHtmlBookmarks("");
    expect(result1.items).toHaveLength(0);

    const result2 = parseHtmlBookmarks("<html><body>No bookmarks here</body></html>");
    expect(result2.items).toHaveLength(0);

    const result3 = parseHtmlBookmarks("not even html");
    expect(result3.items).toHaveLength(0);
  });

  test("handles bookmarks without a folder (no collection)", () => {
    const html = `<DL><p>
      <DT><A HREF="https://example.com">Root Bookmark</A>
    </DL><p>`;

    const result = parseHtmlBookmarks(html);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].collection).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

describe("parseCsv", () => {
  test("parses with all columns present", () => {
    const csv = `url,title,description,tags,collection
https://example.com,Example,A test site,"tag1,tag2",Reference`;

    const result = parseCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      url: "https://example.com",
      title: "Example",
      description: "A test site",
      tags: ["tag1", "tag2"],
      collection: "Reference",
    });
  });

  test("parses with only url column", () => {
    const csv = `url
https://example.com
https://another.com`;

    const result = parseCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ url: "https://example.com" });
    expect(result.items[1]).toEqual({ url: "https://another.com" });
  });

  test("handles tags as comma-separated", () => {
    const csv = `url,tags
https://example.com,"javascript,react,frontend"`;

    const result = parseCsv(csv);
    expect(result.items[0].tags).toEqual(["javascript", "react", "frontend"]);
  });

  test("handles quoted fields with commas", () => {
    const csv = `url,title,description
https://example.com,"Title, with comma","Description with ""quotes"" inside"`;

    const result = parseCsv(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Title, with comma");
    expect(result.items[0].description).toBe('Description with "quotes" inside');
  });

  test("skips empty rows and rows without url", () => {
    const csv = `url,title

,No URL here
https://valid.com,Valid

`;

    const result = parseCsv(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://valid.com");
  });

  test("case-insensitive header matching", () => {
    const csv = `URL,Title,Description,Tags,Collection
https://example.com,Example,Desc,"tag1",Col`;

    const result = parseCsv(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Example");
    expect(result.items[0].collection).toBe("Col");
  });

  test("returns error for CSV without url column", () => {
    const csv = `title,description
Example,Desc`;

    const result = parseCsv(csv);
    expect(result.items).toHaveLength(0);
    expect(result.errors).toContain("CSV missing required 'url' column");
  });

  test("returns error for empty CSV", () => {
    const result = parseCsv("");
    expect(result.items).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// JSON parser
// ---------------------------------------------------------------------------

describe("parseJson", () => {
  test("parses Trove { links: [...] } format", () => {
    const json = JSON.stringify({
      links: [
        {
          url: "https://example.com",
          title: "Example",
          description: "A test",
          tags: ["tag1", "tag2"],
          collection: "Reference",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = parseJson(json);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      url: "https://example.com",
      title: "Example",
      description: "A test",
      tags: ["tag1", "tag2"],
      collection: "Reference",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });

  test("parses plain array format", () => {
    const json = JSON.stringify([
      { url: "https://one.com", title: "One" },
      { url: "https://two.com", title: "Two" },
    ]);

    const result = parseJson(json);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].url).toBe("https://one.com");
    expect(result.items[1].url).toBe("https://two.com");
  });

  test("handles items without url — skips them and adds error", () => {
    const json = JSON.stringify([
      { title: "No URL" },
      { url: "https://valid.com", title: "Valid" },
      { url: "", title: "Empty URL" },
    ]);

    const result = parseJson(json);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://valid.com");
    expect(result.errors).toHaveLength(2);
  });

  test("handles invalid JSON — returns error and empty items", () => {
    const result = parseJson("this is not json {{{");
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Invalid JSON/);
  });

  test("preserves all optional fields", () => {
    const json = JSON.stringify([
      {
        url: "https://example.com",
        title: "Title",
        description: "Desc",
        tags: ["a", "b"],
        collection: "Col",
        createdAt: "2024-06-15T12:00:00.000Z",
      },
    ]);

    const result = parseJson(json);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.title).toBe("Title");
    expect(item.description).toBe("Desc");
    expect(item.tags).toEqual(["a", "b"]);
    expect(item.collection).toBe("Col");
    expect(item.createdAt).toBe("2024-06-15T12:00:00.000Z");
  });

  test("rejects non-array, non-object-with-links input", () => {
    const result = parseJson('"just a string"');
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
