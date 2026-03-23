import { describe, test, expect } from "bun:test";
import { validateManifest } from "../manifest";

describe("manifest validation", () => {
  test("validates a valid export manifest (api-call)", () => {
    const result = validateManifest({
      id: "reader",
      name: "Readwise Reader",
      icon: "\ud83d\udcd6",
      description: "Send links to Readwise Reader",
      version: "1.0.0",
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
        headers: { Authorization: "Token {{config.READWISE_TOKEN}}" },
        body: { url: "{{link.url}}" },
        successMessage: "Sent to Reader",
      },
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.manifest.id).toBe("reader");
      expect(result.manifest.direction).toBe("export");
    }
  });

  test("validates a valid export manifest (url-redirect)", () => {
    const result = validateManifest({
      id: "things",
      name: "Things",
      direction: "export",
      execute: {
        type: "url-redirect",
        actionLabel: "Send to Things",
        urlTemplate: "things:///add?title={{link.title|urlencode}}",
      },
    });

    expect(result.valid).toBe(true);
  });

  test("validates a valid ingest manifest", () => {
    const result = validateManifest({
      id: "n8n",
      name: "n8n Webhook",
      direction: "ingest",
      ingest: {
        description: "Receive links",
        itemMapping: {
          url: "$.url",
          title: "$.title",
        },
      },
    });

    expect(result.valid).toBe(true);
  });

  test("validates a valid both-direction manifest", () => {
    const result = validateManifest({
      id: "both-plugin",
      name: "Both Plugin",
      direction: "both",
      execute: {
        type: "url-redirect",
        actionLabel: "Do Something",
        urlTemplate: "https://example.com/{{link.url}}",
      },
      ingest: {
        itemMapping: { url: "$.url" },
      },
    });

    expect(result.valid).toBe(true);
  });

  test("rejects missing id", () => {
    const result = validateManifest({
      name: "No ID",
      direction: "export",
      execute: {
        type: "url-redirect",
        actionLabel: "Test",
        urlTemplate: "https://x.com",
      },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("id"))).toBe(true);
    }
  });

  test("rejects invalid id format (uppercase)", () => {
    const result = validateManifest({
      id: "MyPlugin",
      name: "Upper",
      direction: "export",
      execute: {
        type: "url-redirect",
        actionLabel: "Test",
        urlTemplate: "https://x.com",
      },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("id"))).toBe(true);
    }
  });

  test("rejects missing name", () => {
    const result = validateManifest({
      id: "no-name",
      direction: "export",
      execute: {
        type: "url-redirect",
        actionLabel: "Test",
        urlTemplate: "https://x.com",
      },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("name"))).toBe(true);
    }
  });

  test("rejects invalid direction", () => {
    const result = validateManifest({
      id: "bad-dir",
      name: "Bad Direction",
      direction: "invalid",
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("direction"))).toBe(true);
    }
  });

  test("rejects export direction without execute block", () => {
    const result = validateManifest({
      id: "no-exec",
      name: "No Execute",
      direction: "export",
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("execute"))).toBe(true);
    }
  });

  test("rejects ingest direction without ingest block", () => {
    const result = validateManifest({
      id: "no-ingest",
      name: "No Ingest",
      direction: "ingest",
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("ingest"))).toBe(true);
    }
  });

  test("rejects api-call without required fields", () => {
    const result = validateManifest({
      id: "bad-api",
      name: "Bad API",
      direction: "export",
      execute: {
        type: "api-call",
      },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3); // method, url, actionLabel
    }
  });

  test("rejects url-redirect without urlTemplate", () => {
    const result = validateManifest({
      id: "bad-redirect",
      name: "Bad Redirect",
      direction: "export",
      execute: {
        type: "url-redirect",
        actionLabel: "Test",
      },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("urlTemplate"))).toBe(true);
    }
  });

  test("rejects ingest without itemMapping.url", () => {
    const result = validateManifest({
      id: "bad-mapping",
      name: "Bad Mapping",
      direction: "ingest",
      ingest: {
        itemMapping: {
          title: "$.title",
        },
      },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("itemMapping.url"))).toBe(true);
    }
  });

  test("rejects invalid config field", () => {
    const result = validateManifest({
      id: "bad-config",
      name: "Bad Config",
      direction: "export",
      config: {
        KEY: { label: "", type: "invalid", required: "yes" },
      },
      execute: {
        type: "url-redirect",
        actionLabel: "Test",
        urlTemplate: "https://x.com",
      },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("rejects non-object input", () => {
    expect(validateManifest("string").valid).toBe(false);
    expect(validateManifest(null).valid).toBe(false);
    expect(validateManifest(42).valid).toBe(false);
    expect(validateManifest([]).valid).toBe(false);
  });

  test("validates a valid file-write manifest", () => {
    const result = validateManifest({
      id: "obsidian",
      name: "Obsidian",
      direction: "export",
      execute: {
        type: "file-write",
        actionLabel: "Save to Obsidian",
        directory: "{{config.VAULT_PATH}}",
        filename: "{{link.title}}.md",
        content: "# {{link.title}}",
      },
    });
    expect(result.valid).toBe(true);
  });

  test("rejects file-write missing directory", () => {
    const result = validateManifest({
      id: "bad",
      name: "Bad",
      direction: "export",
      execute: {
        type: "file-write",
        actionLabel: "Save",
        filename: "test.md",
        content: "hello",
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("directory"))).toBe(true);
    }
  });

  test("rejects file-write missing filename", () => {
    const result = validateManifest({
      id: "bad",
      name: "Bad",
      direction: "export",
      execute: {
        type: "file-write",
        actionLabel: "Save",
        directory: "/tmp",
        content: "hello",
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("filename"))).toBe(true);
    }
  });

  test("rejects file-write missing content", () => {
    const result = validateManifest({
      id: "bad",
      name: "Bad",
      direction: "export",
      execute: {
        type: "file-write",
        actionLabel: "Save",
        directory: "/tmp",
        filename: "test.md",
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("content"))).toBe(true);
    }
  });

  test("rejects file-write missing actionLabel", () => {
    const result = validateManifest({
      id: "bad",
      name: "Bad",
      direction: "export",
      execute: {
        type: "file-write",
        directory: "/tmp",
        filename: "test.md",
        content: "hello",
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("actionLabel"))).toBe(true);
    }
  });
});
