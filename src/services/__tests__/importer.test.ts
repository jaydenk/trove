import { describe, test, expect } from "bun:test";
import {
  parseHtmlBookmarks,
  parseJsonFlexible,
  parseCsvFlexible,
  extractUrls,
  smartImport,
  detectFormat,
} from "../importer";

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

describe("detectFormat", () => {
  test("detects HTML bookmarks starting with <!DOCTYPE", () => {
    expect(detectFormat("<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL>")).toBe(
      "html",
    );
  });

  test("detects HTML bookmarks starting with <DL", () => {
    expect(detectFormat("<DL><p><DT><A HREF=\"https://example.com\">Ex</A>")).toBe(
      "html",
    );
  });

  test("detects HTML bookmarks containing <A HREF=", () => {
    expect(
      detectFormat(
        '<html><body><DL><DT><A HREF="https://example.com">Ex</A></DL></body></html>',
      ),
    ).toBe("html");
  });

  test("detects JSON array", () => {
    expect(detectFormat('[{"url": "https://example.com"}]')).toBe("json");
  });

  test("detects JSON object", () => {
    expect(
      detectFormat('{"links": [{"url": "https://example.com"}]}'),
    ).toBe("json");
  });

  test("detects CSV with standard headers", () => {
    expect(detectFormat("url,title,description\nhttps://example.com,Ex,Desc")).toBe(
      "csv",
    );
  });

  test("detects CSV with non-standard URL header", () => {
    expect(detectFormat("link,name\nhttps://example.com,Ex")).toBe("csv");
  });

  test("detects TSV", () => {
    expect(detectFormat("url\ttitle\nhttps://example.com\tEx")).toBe("csv");
  });

  test("detects semicolon-delimited CSV", () => {
    expect(detectFormat("url;title\nhttps://example.com;Ex")).toBe("csv");
  });

  test("falls back to text for plain content", () => {
    expect(
      detectFormat("Check out https://example.com — it's great!"),
    ).toBe("text");
  });

  test("falls back to text for empty input", () => {
    expect(detectFormat("")).toBe("text");
  });

  test("falls back to text for invalid JSON starting with {", () => {
    expect(detectFormat("{not valid json at all")).toBe("text");
  });
});

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
    expect(result.detectedFormat).toBe("html");

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
// Flexible JSON parser
// ---------------------------------------------------------------------------

describe("parseJsonFlexible", () => {
  test("parses plain array format", () => {
    const json = JSON.stringify([
      { url: "https://one.com", title: "One" },
      { url: "https://two.com", title: "Two" },
    ]);

    const result = parseJsonFlexible(json);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(2);
    expect(result.detectedFormat).toBe("json");
    expect(result.items[0].url).toBe("https://one.com");
    expect(result.items[1].url).toBe("https://two.com");
  });

  test("parses { links: [...] } wrapper", () => {
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

    const result = parseJsonFlexible(json);
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

  test("parses { data: [...] } wrapper", () => {
    const json = JSON.stringify({
      data: [{ url: "https://data-wrap.com", title: "Data" }],
    });

    const result = parseJsonFlexible(json);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://data-wrap.com");
  });

  test("parses { bookmarks: [...] } wrapper", () => {
    const json = JSON.stringify({
      bookmarks: [{ url: "https://bm.com", title: "BM" }],
    });

    const result = parseJsonFlexible(json);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://bm.com");
  });

  test("parses { items: [...] } wrapper", () => {
    const json = JSON.stringify({
      items: [{ url: "https://item.com", title: "Item" }],
    });

    const result = parseJsonFlexible(json);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://item.com");
  });

  test("fuzzy matches URL field names (href, link, uri, address)", () => {
    const json = JSON.stringify([
      { href: "https://href.com", name: "Href Link" },
      { link: "https://link.com", label: "Link" },
      { uri: "https://uri.com" },
      { address: "https://addr.com" },
    ]);

    const result = parseJsonFlexible(json);
    expect(result.items).toHaveLength(4);
    expect(result.items[0].url).toBe("https://href.com");
    expect(result.items[0].title).toBe("Href Link");
    expect(result.items[1].url).toBe("https://link.com");
    expect(result.items[1].title).toBe("Link");
    expect(result.items[2].url).toBe("https://uri.com");
    expect(result.items[3].url).toBe("https://addr.com");
  });

  test("fuzzy matches title field names (name, label, page_title, pageTitle)", () => {
    const json = JSON.stringify([
      { url: "https://a.com", name: "By Name" },
      { url: "https://b.com", label: "By Label" },
      { url: "https://c.com", page_title: "By PageTitle" },
      { url: "https://d.com", pageTitle: "By PageTitleCamel" },
    ]);

    const result = parseJsonFlexible(json);
    expect(result.items[0].title).toBe("By Name");
    expect(result.items[1].title).toBe("By Label");
    expect(result.items[2].title).toBe("By PageTitle");
    expect(result.items[3].title).toBe("By PageTitleCamel");
  });

  test("fuzzy matches description field names", () => {
    const json = JSON.stringify([
      { url: "https://a.com", desc: "Short" },
      { url: "https://b.com", summary: "Sum" },
      { url: "https://c.com", excerpt: "Exc" },
      { url: "https://d.com", notes: "Notes" },
    ]);

    const result = parseJsonFlexible(json);
    expect(result.items[0].description).toBe("Short");
    expect(result.items[1].description).toBe("Sum");
    expect(result.items[2].description).toBe("Exc");
    expect(result.items[3].description).toBe("Notes");
  });

  test("accepts tags as a comma-separated string", () => {
    const json = JSON.stringify([
      { url: "https://a.com", tags: "foo,bar,baz" },
    ]);

    const result = parseJsonFlexible(json);
    expect(result.items[0].tags).toEqual(["foo", "bar", "baz"]);
  });

  test("accepts tags as an array", () => {
    const json = JSON.stringify([
      { url: "https://a.com", tags: ["foo", "bar"] },
    ]);

    const result = parseJsonFlexible(json);
    expect(result.items[0].tags).toEqual(["foo", "bar"]);
  });

  test("fuzzy matches tags field names (labels, categories, keywords)", () => {
    const json = JSON.stringify([
      { url: "https://a.com", labels: ["one", "two"] },
      { url: "https://b.com", categories: ["cat1"] },
      { url: "https://c.com", keywords: "k1;k2" },
    ]);

    const result = parseJsonFlexible(json);
    expect(result.items[0].tags).toEqual(["one", "two"]);
    expect(result.items[1].tags).toEqual(["cat1"]);
    expect(result.items[2].tags).toEqual(["k1", "k2"]);
  });

  test("fuzzy matches collection field names (folder, category, group, list)", () => {
    const json = JSON.stringify([
      { url: "https://a.com", folder: "F" },
      { url: "https://b.com", category: "C" },
      { url: "https://c.com", group: "G" },
      { url: "https://d.com", list: "L" },
    ]);

    const result = parseJsonFlexible(json);
    expect(result.items[0].collection).toBe("F");
    expect(result.items[1].collection).toBe("C");
    expect(result.items[2].collection).toBe("G");
    expect(result.items[3].collection).toBe("L");
  });

  test("fuzzy matches created field names", () => {
    const json = JSON.stringify([
      { url: "https://a.com", created_at: "2024-01-01T00:00:00Z" },
      { url: "https://b.com", date: "2024-06-15T12:00:00Z" },
      { url: "https://c.com", timestamp: 1700000000 },
    ]);

    const result = parseJsonFlexible(json);
    expect(result.items[0].createdAt).toBe("2024-01-01T00:00:00Z");
    expect(result.items[1].createdAt).toBe("2024-06-15T12:00:00Z");
    // Unix timestamp gets converted to ISO
    expect(result.items[2].createdAt).toBe(
      new Date(1700000000 * 1000).toISOString(),
    );
  });

  test("handles items without a recognisable URL field — skips them", () => {
    const json = JSON.stringify([
      { title: "No URL" },
      { url: "https://valid.com", title: "Valid" },
      { url: "", title: "Empty URL" },
    ]);

    const result = parseJsonFlexible(json);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://valid.com");
    expect(result.errors).toHaveLength(2);
  });

  test("handles invalid JSON — returns error", () => {
    const result = parseJsonFlexible("this is not json {{{");
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Invalid JSON/);
  });

  test("rejects non-array, non-wrapper input", () => {
    const result = parseJsonFlexible('"just a string"');
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  test("parses Linkwarden backup format with nested collections/links", () => {
    const json = JSON.stringify({
      name: "Jayden",
      collections: [
        {
          id: 1,
          name: "Unorganized",
          links: [
            {
              id: 626,
              name: "How To Know What Turns You On",
              url: "https://itsnormal.com/article/1",
              tags: [{ name: "Supernote" }, { name: "Manta" }],
              createdAt: "2026-02-10T02:02:42.219Z",
            },
          ],
        },
        {
          id: 2,
          name: "Tech Stuff",
          links: [
            {
              id: 700,
              name: "Bun Runtime",
              url: "https://bun.sh",
              tags: [{ name: "javascript" }],
              createdAt: "2026-03-01T10:00:00.000Z",
            },
            {
              id: 701,
              name: "Hono Framework",
              url: "https://hono.dev",
              tags: [],
              createdAt: "2026-03-02T12:00:00.000Z",
            },
          ],
        },
      ],
    });

    const result = parseJsonFlexible(json);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(3);
    expect(result.detectedFormat).toBe("json");

    // First collection's link
    expect(result.items[0]).toEqual({
      url: "https://itsnormal.com/article/1",
      title: "How To Know What Turns You On",
      tags: ["Supernote", "Manta"],
      collection: "Unorganized",
      createdAt: "2026-02-10T02:02:42.219Z",
    });

    // Second collection's links
    expect(result.items[1]).toEqual({
      url: "https://bun.sh",
      title: "Bun Runtime",
      tags: ["javascript"],
      collection: "Tech Stuff",
      createdAt: "2026-03-01T10:00:00.000Z",
    });

    expect(result.items[2]).toEqual({
      url: "https://hono.dev",
      title: "Hono Framework",
      collection: "Tech Stuff",
      createdAt: "2026-03-02T12:00:00.000Z",
    });
  });

  test("parses Linkwarden format with empty collections", () => {
    const json = JSON.stringify({
      name: "User",
      collections: [
        { id: 1, name: "Empty", links: [] },
        {
          id: 2,
          name: "Has Links",
          links: [
            { id: 1, name: "Link One", url: "https://example.com" },
          ],
        },
      ],
    });

    const result = parseJsonFlexible(json);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://example.com");
    expect(result.items[0].collection).toBe("Has Links");
  });

  test("parses Linkwarden format with duplicate collection names", () => {
    const json = JSON.stringify({
      name: "User",
      collections: [
        {
          id: 1,
          name: "Imports",
          links: [{ id: 1, name: "A", url: "https://a.com" }],
        },
        {
          id: 2,
          name: "Imports",
          links: [{ id: 2, name: "B", url: "https://b.com" }],
        },
      ],
    });

    const result = parseJsonFlexible(json);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(2);
    // Both get the same collection name
    expect(result.items[0].collection).toBe("Imports");
    expect(result.items[1].collection).toBe("Imports");
  });

  test("handles Linkwarden tag objects with { name: string } format", () => {
    const json = JSON.stringify({
      name: "User",
      collections: [
        {
          id: 1,
          name: "Col",
          links: [
            {
              id: 1,
              name: "Tagged",
              url: "https://tagged.com",
              tags: [{ name: "alpha" }, { name: "beta" }, { name: "gamma" }],
            },
          ],
        },
      ],
    });

    const result = parseJsonFlexible(json);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].tags).toEqual(["alpha", "beta", "gamma"]);
  });

  test("handles tag objects with { name } in standard (non-Linkwarden) JSON", () => {
    const json = JSON.stringify([
      {
        url: "https://example.com",
        tags: [{ name: "foo" }, { name: "bar" }],
      },
    ]);

    const result = parseJsonFlexible(json);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].tags).toEqual(["foo", "bar"]);
  });

  test("finds link arrays nested deeply in JSON structure", () => {
    const json = JSON.stringify({
      result: {
        payload: {
          entries: [
            { url: "https://deep-one.com", title: "Deep One" },
            { url: "https://deep-two.com", title: "Deep Two" },
          ],
        },
      },
    });

    const result = parseJsonFlexible(json);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].url).toBe("https://deep-one.com");
    expect(result.items[1].url).toBe("https://deep-two.com");
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

    const result = parseJsonFlexible(json);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.title).toBe("Title");
    expect(item.description).toBe("Desc");
    expect(item.tags).toEqual(["a", "b"]);
    expect(item.collection).toBe("Col");
    expect(item.createdAt).toBe("2024-06-15T12:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Flexible CSV/TSV parser
// ---------------------------------------------------------------------------

describe("parseCsvFlexible", () => {
  test("parses with all standard columns", () => {
    const csv = `url,title,description,tags,collection
https://example.com,Example,A test site,"tag1,tag2",Reference`;

    const result = parseCsvFlexible(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(1);
    expect(result.detectedFormat).toBe("csv");
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

    const result = parseCsvFlexible(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ url: "https://example.com" });
    expect(result.items[1]).toEqual({ url: "https://another.com" });
  });

  test("handles tags as comma-separated", () => {
    const csv = `url,tags
https://example.com,"javascript,react,frontend"`;

    const result = parseCsvFlexible(csv);
    expect(result.items[0].tags).toEqual(["javascript", "react", "frontend"]);
  });

  test("handles tags as semicolon-separated", () => {
    const csv = `url,tags
https://example.com,"javascript;react;frontend"`;

    const result = parseCsvFlexible(csv);
    expect(result.items[0].tags).toEqual(["javascript", "react", "frontend"]);
  });

  test("handles quoted fields with commas", () => {
    const csv = `url,title,description
https://example.com,"Title, with comma","Description with ""quotes"" inside"`;

    const result = parseCsvFlexible(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Title, with comma");
    expect(result.items[0].description).toBe('Description with "quotes" inside');
  });

  test("skips empty rows and rows without url", () => {
    const csv = `url,title

,No URL here
https://valid.com,Valid

`;

    const result = parseCsvFlexible(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://valid.com");
  });

  test("case-insensitive header matching", () => {
    const csv = `URL,Title,Description,Tags,Collection
https://example.com,Example,Desc,"tag1",Col`;

    const result = parseCsvFlexible(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Example");
    expect(result.items[0].collection).toBe("Col");
  });

  test("fuzzy matches non-standard column headers", () => {
    const csv = `link,name,notes,labels,folder
https://example.com,My Link,Some notes,"label1,label2",My Folder`;

    const result = parseCsvFlexible(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://example.com");
    expect(result.items[0].title).toBe("My Link");
    expect(result.items[0].description).toBe("Some notes");
    expect(result.items[0].tags).toEqual(["label1", "label2"]);
    expect(result.items[0].collection).toBe("My Folder");
  });

  test("handles TSV (tab-separated)", () => {
    const tsv = "url\ttitle\tdescription\nhttps://example.com\tExample\tA test";

    const result = parseCsvFlexible(tsv);
    expect(result.items).toHaveLength(1);
    expect(result.detectedFormat).toBe("csv");
    expect(result.items[0].url).toBe("https://example.com");
    expect(result.items[0].title).toBe("Example");
    expect(result.items[0].description).toBe("A test");
  });

  test("handles semicolon-delimited CSV", () => {
    const csv = "href;name;category\nhttps://example.com;Example;Reference";

    const result = parseCsvFlexible(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://example.com");
    expect(result.items[0].title).toBe("Example");
    expect(result.items[0].collection).toBe("Reference");
  });

  test("handles single-column CSV as URLs (no recognisable header)", () => {
    const csv = `https://example.com
https://another.com
https://third.com`;

    const result = parseCsvFlexible(csv);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].url).toBe("https://example.com");
    expect(result.items[1].url).toBe("https://another.com");
    expect(result.items[2].url).toBe("https://third.com");
  });

  test("returns error for empty CSV", () => {
    const result = parseCsvFlexible("");
    expect(result.items).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Plain text URL extractor
// ---------------------------------------------------------------------------

describe("extractUrls", () => {
  test("extracts URLs from plain text", () => {
    const text = `Check out https://example.com and http://another.com for more info.`;

    const result = extractUrls(text);
    expect(result.items).toHaveLength(2);
    expect(result.detectedFormat).toBe("text");
    expect(result.items[0].url).toBe("https://example.com");
    expect(result.items[1].url).toBe("http://another.com");
  });

  test("extracts URLs from mixed content (paragraphs with embedded URLs)", () => {
    const text = `Hey team,

I found some great resources today:
- https://developer.mozilla.org/en-US/docs/Web is the MDN docs
- This article https://blog.example.com/post/123 was really helpful
- Also check https://github.com/some/repo

Let me know what you think!
Thanks`;

    const result = extractUrls(text);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].url).toBe(
      "https://developer.mozilla.org/en-US/docs/Web",
    );
    expect(result.items[1].url).toBe("https://blog.example.com/post/123");
    expect(result.items[2].url).toBe("https://github.com/some/repo");
  });

  test("deduplicates URLs", () => {
    const text = `Visit https://example.com today.
Also see https://example.com for details.`;

    const result = extractUrls(text);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://example.com");
  });

  test("strips trailing punctuation", () => {
    const text = `See https://example.com. Also https://another.com, and https://third.com!`;

    const result = extractUrls(text);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].url).toBe("https://example.com");
    expect(result.items[1].url).toBe("https://another.com");
    expect(result.items[2].url).toBe("https://third.com");
  });

  test("returns error for input with no URLs", () => {
    const result = extractUrls("No links here at all.");
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/No URLs found/);
  });

  test("handles empty input", () => {
    const result = extractUrls("");
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  test("no title/tags/collection — items have only url", () => {
    const text = "https://example.com";
    const result = extractUrls(text);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ url: "https://example.com" });
    expect(result.items[0].title).toBeUndefined();
    expect(result.items[0].tags).toBeUndefined();
    expect(result.items[0].collection).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// smartImport — integration
// ---------------------------------------------------------------------------

describe("smartImport", () => {
  test("auto-detects HTML bookmarks", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><A HREF="https://example.com">Example</A>
</DL><p>`;

    const result = smartImport(html);
    expect(result.detectedFormat).toBe("html");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://example.com");
  });

  test("auto-detects JSON array", () => {
    const json = JSON.stringify([{ url: "https://example.com", title: "Ex" }]);

    const result = smartImport(json);
    expect(result.detectedFormat).toBe("json");
    expect(result.items).toHaveLength(1);
  });

  test("auto-detects JSON with wrapper object", () => {
    const json = JSON.stringify({
      links: [{ url: "https://example.com" }],
    });

    const result = smartImport(json);
    expect(result.detectedFormat).toBe("json");
    expect(result.items).toHaveLength(1);
  });

  test("auto-detects CSV", () => {
    const csv = "url,title\nhttps://example.com,Example";

    const result = smartImport(csv);
    expect(result.detectedFormat).toBe("csv");
    expect(result.items).toHaveLength(1);
  });

  test("auto-detects TSV", () => {
    const tsv = "url\ttitle\nhttps://example.com\tExample";

    const result = smartImport(tsv);
    expect(result.detectedFormat).toBe("csv");
    expect(result.items).toHaveLength(1);
  });

  test("extracts URLs from plain text", () => {
    const text = "Check out https://example.com and https://another.com";

    const result = smartImport(text);
    expect(result.detectedFormat).toBe("text");
    expect(result.items).toHaveLength(2);
  });

  test("returns detectedFormat in result", () => {
    expect(smartImport("[]").detectedFormat).toBe("json");
    expect(smartImport("<DL></DL>").detectedFormat).toBe("html");
    expect(smartImport("url,title\n").detectedFormat).toBe("csv");
    expect(smartImport("just text").detectedFormat).toBe("text");
  });

  test("handles empty input", () => {
    const result = smartImport("");
    expect(result.items).toHaveLength(0);
    expect(result.detectedFormat).toBe("text");
  });

  test("handles input with no URLs (plain text)", () => {
    const result = smartImport("No links here");
    expect(result.items).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("auto-detects Linkwarden backup JSON", () => {
    const json = JSON.stringify({
      name: "Jayden",
      collections: [
        {
          id: 1,
          name: "Tech",
          links: [
            {
              id: 1,
              name: "Bun",
              url: "https://bun.sh",
              tags: [{ name: "js" }],
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
    });

    const result = smartImport(json);
    expect(result.detectedFormat).toBe("json");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://bun.sh");
    expect(result.items[0].title).toBe("Bun");
    expect(result.items[0].tags).toEqual(["js"]);
    expect(result.items[0].collection).toBe("Tech");
  });

  test("respects format hint when provided", () => {
    // This JSON string would be auto-detected as JSON, but we force CSV
    // which will fail to parse URLs — just verifying hint is respected
    const data = "url,title\nhttps://example.com,Test";
    const result = smartImport(data, "csv");
    expect(result.detectedFormat).toBe("csv");
    expect(result.items).toHaveLength(1);
  });
});
