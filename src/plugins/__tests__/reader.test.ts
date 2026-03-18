import { describe, test, expect, afterAll } from "bun:test";
import { readerPlugin } from "../reader";
import type { PluginLink } from "../types";

const mockLink: PluginLink = {
  id: "link-1",
  url: "https://example.com/article",
  title: "Example Article",
  description: "A test article",
  domain: "example.com",
  tags: [
    { id: "t1", name: "dev" },
    { id: "t2", name: "reading" },
  ],
};

describe("reader plugin", () => {
  test("has correct id, name, icon, and description", () => {
    expect(readerPlugin.id).toBe("reader");
    expect(readerPlugin.name).toBe("Readwise Reader");
    expect(readerPlugin.icon).toBe("📖");
    expect(readerPlugin.description).toBe(
      "Send links to Readwise Reader for reading later"
    );
  });

  test("has execute but not ingest", () => {
    expect(readerPlugin.execute).toBeDefined();
    expect(readerPlugin.ingest).toBeUndefined();
  });

  test("execute type is api-call", () => {
    expect(readerPlugin.execute!.type).toBe("api-call");
  });

  test("configSchema has READWISE_TOKEN", () => {
    expect(readerPlugin.configSchema).toEqual({
      READWISE_TOKEN: {
        label: "Readwise API Token",
        type: "string",
        required: true,
      },
    });
  });

  describe("execute.run", () => {
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

      // Temporarily override fetch to redirect to our mock server
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
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
      };

      try {
        const result = await readerPlugin.execute!.run(mockLink, {
          READWISE_TOKEN: "test-token-abc",
        });

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
          tags: ["dev", "reading"],
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
      globalThis.fetch = async (input, init) => {
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
      };

      try {
        const result = await readerPlugin.execute!.run(mockLink, {
          READWISE_TOKEN: "bad-token",
        });

        expect(result.type).toBe("error");
        expect((result as { type: "error"; message: string }).message).toContain(
          "401"
        );
      } finally {
        globalThis.fetch = originalFetch;
        mockServer.stop();
      }
    });

    test("returns error on network failure", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
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
      };

      try {
        const result = await readerPlugin.execute!.run(mockLink, {
          READWISE_TOKEN: "some-token",
        });

        expect(result.type).toBe("error");
        expect((result as { type: "error"; message: string }).message).toBe(
          "Network connection refused"
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
