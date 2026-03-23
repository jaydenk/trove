import { describe, test, expect } from "bun:test";
import { interpolate, interpolateObject } from "../template";
import type { TemplateContext } from "../template";

const context: TemplateContext = {
  link: {
    url: "https://example.com/article?q=1&r=2",
    title: "Example Article",
    description: "A test article",
    domain: "example.com",
    tags: "dev, reading",
    tagsArray: '["dev","reading"]',
    createdAt: "2026-03-23T10:00:00Z",
  },
  config: {
    API_TOKEN: "test-token-abc",
    WEBHOOK_URL: "https://hooks.example.com/abc",
  },
};

describe("template engine", () => {
  describe("interpolate", () => {
    test("simple variable substitution — link.url", () => {
      expect(interpolate("{{link.url}}", context)).toBe(
        "https://example.com/article?q=1&r=2"
      );
    });

    test("simple variable substitution — link.title", () => {
      expect(interpolate("{{link.title}}", context)).toBe("Example Article");
    });

    test("config variable substitution", () => {
      expect(interpolate("Token {{config.API_TOKEN}}", context)).toBe(
        "Token test-token-abc"
      );
    });

    test("urlencode filter", () => {
      expect(interpolate("{{link.title|urlencode}}", context)).toBe(
        "Example%20Article"
      );
    });

    test("urlencode filter on URL with special chars", () => {
      expect(interpolate("{{link.url|urlencode}}", context)).toBe(
        encodeURIComponent("https://example.com/article?q=1&r=2")
      );
    });

    test("json filter", () => {
      expect(interpolate("{{link.title|json}}", context)).toBe(
        '"Example Article"'
      );
    });

    test("missing variable resolves to empty string", () => {
      expect(interpolate("{{link.nonexistent}}", context)).toBe("");
      expect(interpolate("{{config.MISSING}}", context)).toBe("");
    });

    test("null description resolves to empty string", () => {
      const ctx: TemplateContext = {
        ...context,
        link: { ...context.link, description: null },
      };
      expect(interpolate("{{link.description}}", ctx)).toBe("");
    });

    test("multiple variables in one string", () => {
      const result = interpolate(
        "{{link.title}} at {{link.url}}",
        context
      );
      expect(result).toBe(
        "Example Article at https://example.com/article?q=1&r=2"
      );
    });

    test("combined filter and variables in one string", () => {
      const result = interpolate(
        "things:///add?title={{link.title|urlencode}}&notes={{link.url|urlencode}}&tags=trove",
        context
      );
      expect(result).toContain("Example%20Article");
      expect(result).toContain(
        encodeURIComponent("https://example.com/article?q=1&r=2")
      );
      expect(result).toContain("tags=trove");
    });

    test("whitespace around variable path is trimmed", () => {
      expect(interpolate("{{ link.title }}", context)).toBe("Example Article");
      expect(interpolate("{{ link.title | urlencode }}", context)).toBe(
        "Example%20Article"
      );
    });

    test("unknown filter is ignored (no crash)", () => {
      // Unknown filter is not applied; value is returned as-is
      expect(interpolate("{{link.title|nonexistentfilter}}", context)).toBe(
        "Example Article"
      );
    });

    test("resolves link.createdAt", () => {
      expect(interpolate("{{link.createdAt}}", context)).toBe("2026-03-23T10:00:00Z");
    });

    test("yamllist filter converts comma-separated to YAML list", () => {
      const result = interpolate("{{link.tags|yamllist}}", context);
      expect(result).toBe("\n  - dev\n  - reading");
    });

    test("yamllist filter handles single tag", () => {
      const ctx: TemplateContext = {
        ...context,
        link: { ...context.link, tags: "dev" },
      };
      const result = interpolate("{{link.tags|yamllist}}", ctx);
      expect(result).toBe("\n  - dev");
    });

    test("yamllist filter handles empty string", () => {
      const ctx: TemplateContext = {
        ...context,
        link: { ...context.link, tags: "" },
      };
      const result = interpolate("{{link.tags|yamllist}}", ctx);
      expect(result).toBe("");
    });

    test("default filter returns fallback when value is empty", () => {
      expect(interpolate("{{config.MISSING|default:fallback}}", context)).toBe(
        "fallback"
      );
    });

    test("default filter passes through non-empty value", () => {
      expect(interpolate("{{config.API_TOKEN|default:fallback}}", context)).toBe(
        "test-token-abc"
      );
    });

    test("chained filters apply left to right", () => {
      const ctx: TemplateContext = {
        ...context,
        config: {},
      };
      expect(
        interpolate("{{config.MISSING|default:hello world|urlencode}}", ctx)
      ).toBe("hello%20world");
    });

    test("chained filters — non-empty value passes through default then encodes", () => {
      expect(
        interpolate("{{link.title|default:unused|urlencode}}", context)
      ).toBe("Example%20Article");
    });

    test("single filter still works after refactor (no regression)", () => {
      expect(interpolate("{{link.title|urlencode}}", context)).toBe(
        "Example%20Article"
      );
    });

  });

  describe("interpolateObject", () => {
    test("interpolates all string values in a flat object", () => {
      const result = interpolateObject(
        {
          url: "{{link.url}}",
          title: "{{link.title}}",
        },
        context
      );

      expect(result.url).toBe("https://example.com/article?q=1&r=2");
      expect(result.title).toBe("Example Article");
    });

    test("interpolates nested objects", () => {
      const result = interpolateObject(
        {
          outer: {
            inner: "{{config.API_TOKEN}}",
          },
        },
        context
      );

      expect((result.outer as Record<string, unknown>).inner).toBe(
        "test-token-abc"
      );
    });

    test("non-string values are passed through", () => {
      const result = interpolateObject(
        {
          count: 42 as unknown as string,
          flag: true as unknown as string,
          url: "{{link.url}}",
        },
        context
      );

      expect(result.count).toBe(42);
      expect(result.flag).toBe(true);
      expect(result.url).toBe("https://example.com/article?q=1&r=2");
    });
  });
});
