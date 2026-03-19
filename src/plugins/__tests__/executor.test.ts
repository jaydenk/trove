import { describe, test, expect, afterAll, mock } from "bun:test";
import { executePlugin } from "../executor";
import type { PluginManifest } from "../manifest";
import type { TemplateContext } from "../template";

const baseContext: TemplateContext = {
  link: {
    url: "https://example.com/article",
    title: "Example Article",
    description: "A test article",
    domain: "example.com",
    tags: "dev, reading",
    tagsArray: '["dev","reading"]',
  },
  config: {
    READWISE_TOKEN: "test-token-abc",
  },
};

describe("plugin executor", () => {
  describe("url-redirect", () => {
    const thingsManifest: PluginManifest = {
      id: "things",
      name: "Things",
      direction: "export",
      execute: {
        type: "url-redirect",
        actionLabel: "Send to Things",
        urlTemplate:
          "things:///add?title={{link.title|urlencode}}&notes={{link.url|urlencode}}&tags=trove",
      },
    };

    test("returns redirect with interpolated URL", async () => {
      const result = await executePlugin(thingsManifest, baseContext);

      expect(result.type).toBe("redirect");
      if (result.type === "redirect") {
        expect(result.url).toContain("things:///add");
        expect(result.url).toContain("Example%20Article");
        expect(result.url).toContain(
          encodeURIComponent("https://example.com/article")
        );
        expect(result.url).toContain("tags=trove");
      }
    });

    test("handles special characters in title", async () => {
      const ctx: TemplateContext = {
        ...baseContext,
        link: {
          ...baseContext.link,
          title: "Tom & Jerry: A Classic",
        },
      };

      const result = await executePlugin(thingsManifest, ctx);
      expect(result.type).toBe("redirect");
      if (result.type === "redirect") {
        const url = new URL(result.url);
        expect(url.searchParams.get("title")).toBe("Tom & Jerry: A Classic");
      }
    });
  });

  describe("api-call", () => {
    const readerManifest: PluginManifest = {
      id: "reader",
      name: "Readwise Reader",
      direction: "export",
      config: {
        READWISE_TOKEN: {
          label: "Readwise API Token",
          type: "string",
          required: true,
        },
      },
      execute: {
        type: "api-call",
        actionLabel: "Send to Reader",
        method: "POST",
        url: "https://readwise.io/api/v3/save/",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Token {{config.READWISE_TOKEN}}",
        },
        body: {
          url: "{{link.url}}",
          tags: "{{link.tagsArray}}",
        },
        successMessage: "Sent to Readwise Reader",
      },
    };

    let mockServer: ReturnType<typeof Bun.serve>;
    let receivedRequests: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body: unknown;
    }[] = [];

    function startMockServer(statusCode: number, responseBody: unknown) {
      receivedRequests = [];
      mockServer = Bun.serve({
        port: 0,
        async fetch(req) {
          const body = await req.json();
          receivedRequests.push({
            method: req.method,
            url: req.url,
            headers: {
              "content-type": req.headers.get("content-type") ?? "",
              authorization: req.headers.get("authorization") ?? "",
            },
            body,
          });
          return new Response(JSON.stringify(responseBody), {
            status: statusCode,
            headers: { "Content-Type": "application/json" },
          });
        },
      });
    }

    afterAll(() => {
      if (mockServer) mockServer.stop();
    });

    test("makes correct API call and returns success on 200", async () => {
      startMockServer(200, { id: "abc123" });
      const baseUrl = `http://localhost:${mockServer.port}/`;

      // Override fetch to redirect to mock server
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input: any, init: any) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url === "https://readwise.io/api/v3/save/") {
          return originalFetch(baseUrl, init);
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      try {
        const result = await executePlugin(readerManifest, baseContext);

        expect(result).toEqual({
          type: "success",
          message: "Sent to Readwise Reader",
        });

        expect(receivedRequests).toHaveLength(1);
        const req = receivedRequests[0];
        expect(req.method).toBe("POST");
        expect(req.headers.authorization).toBe("Token test-token-abc");
        expect(req.headers["content-type"]).toBe("application/json");
        expect(req.body).toEqual({
          url: "https://example.com/article",
          tags: '["dev","reading"]',
        });
      } finally {
        globalThis.fetch = originalFetch;
        mockServer.stop();
      }
    });

    test("returns error on 4xx response", async () => {
      startMockServer(401, { detail: "Invalid token" });
      const baseUrl = `http://localhost:${mockServer.port}/`;

      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input: any, init: any) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url === "https://readwise.io/api/v3/save/") {
          return originalFetch(baseUrl, init);
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      try {
        const result = await executePlugin(readerManifest, baseContext);
        expect(result.type).toBe("error");
        if (result.type === "error") {
          expect(result.message).toContain("401");
        }
      } finally {
        globalThis.fetch = originalFetch;
        mockServer.stop();
      }
    });

    test("returns error on network failure", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input: any, init: any) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url === "https://readwise.io/api/v3/save/") {
          throw new Error("Network connection refused");
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      try {
        const result = await executePlugin(readerManifest, baseContext);
        expect(result.type).toBe("error");
        if (result.type === "error") {
          expect(result.message).toBe("Network connection refused");
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  test("returns error when manifest has no execute block", async () => {
    const manifest: PluginManifest = {
      id: "no-exec",
      name: "No Execute",
      direction: "ingest",
      ingest: {
        itemMapping: { url: "$.url" },
      },
    };

    const result = await executePlugin(manifest, baseContext);
    expect(result.type).toBe("error");
    if (result.type === "error") {
      expect(result.message).toContain("no execute block");
    }
  });
});
