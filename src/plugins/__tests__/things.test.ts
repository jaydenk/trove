import { describe, test, expect } from "bun:test";
import { thingsPlugin } from "../things";
import type { PluginLink } from "../types";

const mockLink: PluginLink = {
  id: "link-1",
  url: "https://example.com/article",
  title: "Example Article",
  description: "A test article",
  domain: "example.com",
  tags: [{ id: "t1", name: "dev" }],
};

describe("things plugin", () => {
  test("has correct id, name, icon, and description", () => {
    expect(thingsPlugin.id).toBe("things");
    expect(thingsPlugin.name).toBe("Things");
    expect(thingsPlugin.icon).toBe("✅");
    expect(thingsPlugin.description).toBe(
      "Create a task in Things from a link"
    );
  });

  test("has execute (url-redirect) but not ingest", () => {
    expect(thingsPlugin.execute).toBeDefined();
    expect(thingsPlugin.execute!.type).toBe("url-redirect");
    expect(thingsPlugin.ingest).toBeUndefined();
  });

  test("has empty configSchema", () => {
    expect(thingsPlugin.configSchema).toEqual({});
  });

  describe("execute.run", () => {
    test("returns redirect with correctly encoded URL", async () => {
      const result = await thingsPlugin.execute!.run(mockLink, {});

      expect(result.type).toBe("redirect");
      const redirectResult = result as { type: "redirect"; url: string };

      // things:///add is an opaque URI; verify the raw string starts correctly
      expect(redirectResult.url).toMatch(/^things:\/\/\/add\?/);
      const url = new URL(redirectResult.url);
      expect(url.searchParams.get("title")).toBe("Example Article");
      expect(url.searchParams.get("notes")).toBe(
        "https://example.com/article"
      );
      expect(url.searchParams.get("tags")).toBe("trove");
    });

    test("includes trove tag", async () => {
      const result = await thingsPlugin.execute!.run(mockLink, {});
      const redirectResult = result as { type: "redirect"; url: string };
      expect(redirectResult.url).toContain("tags=trove");
    });

    test("handles ampersands in title", async () => {
      const link: PluginLink = {
        ...mockLink,
        title: "Tom & Jerry: A Classic",
      };
      const result = await thingsPlugin.execute!.run(link, {});
      const redirectResult = result as { type: "redirect"; url: string };

      // The ampersand should be encoded, not treated as a query separator
      const url = new URL(redirectResult.url);
      expect(url.searchParams.get("title")).toBe("Tom & Jerry: A Classic");
    });

    test("handles quotes in title", async () => {
      const link: PluginLink = {
        ...mockLink,
        title: 'Read "The Art of Code"',
      };
      const result = await thingsPlugin.execute!.run(link, {});
      const redirectResult = result as { type: "redirect"; url: string };

      const url = new URL(redirectResult.url);
      expect(url.searchParams.get("title")).toBe('Read "The Art of Code"');
    });

    test("handles unicode in title", async () => {
      const link: PluginLink = {
        ...mockLink,
        title: "Caf\u00e9 et cr\u00e8me br\u00fbl\u00e9e \ud83c\udf69",
      };
      const result = await thingsPlugin.execute!.run(link, {});
      const redirectResult = result as { type: "redirect"; url: string };

      const url = new URL(redirectResult.url);
      expect(url.searchParams.get("title")).toBe(
        "Caf\u00e9 et cr\u00e8me br\u00fbl\u00e9e \ud83c\udf69"
      );
    });

    test("URL notes field contains the link URL", async () => {
      const link: PluginLink = {
        ...mockLink,
        url: "https://example.com/path?q=1&r=2",
      };
      const result = await thingsPlugin.execute!.run(link, {});
      const redirectResult = result as { type: "redirect"; url: string };

      const url = new URL(redirectResult.url);
      expect(url.searchParams.get("notes")).toBe(
        "https://example.com/path?q=1&r=2"
      );
    });
  });
});
