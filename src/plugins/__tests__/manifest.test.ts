import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
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

  test("validates manifest with healthCheck block", () => {
    const result = validateManifest({
      id: "reader",
      name: "Reader",
      direction: "export",
      execute: {
        type: "api-call",
        actionLabel: "Send",
        method: "POST",
        url: "https://api.example.com/save",
      },
      healthCheck: {
        url: "https://api.example.com/me",
        headers: { Authorization: "Bearer {{config.TOKEN}}" },
        expectedStatus: 200,
      },
    });
    expect(result.valid).toBe(true);
  });

  test("rejects healthCheck with missing url", () => {
    const result = validateManifest({
      id: "bad-hc",
      name: "Bad",
      direction: "export",
      execute: {
        type: "api-call",
        actionLabel: "Send",
        method: "POST",
        url: "https://api.example.com/save",
      },
      healthCheck: {
        headers: {},
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("healthCheck.url"))).toBe(true);
    }
  });

  test("rejects healthCheck with non-number expectedStatus", () => {
    const result = validateManifest({
      id: "bad-hc2",
      name: "Bad",
      direction: "export",
      execute: {
        type: "api-call",
        actionLabel: "Send",
        method: "POST",
        url: "https://api.example.com/save",
      },
      healthCheck: {
        url: "https://api.example.com/me",
        expectedStatus: "200",
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) => e.includes("healthCheck.expectedStatus"))
      ).toBe(true);
    }
  });

  test("validates config field with options array", () => {
    const result = validateManifest({
      id: "opts",
      name: "Options Plugin",
      direction: "export",
      config: {
        LOCATION: {
          label: "Location",
          type: "string",
          required: false,
          options: ["new", "later", "archive"],
          placeholder: "Default (new)",
        },
      },
      execute: {
        type: "url-redirect",
        actionLabel: "Test",
        urlTemplate: "https://x.com",
      },
    });
    expect(result.valid).toBe(true);
  });

  test("rejects config field with non-array options", () => {
    const result = validateManifest({
      id: "bad-opts",
      name: "Bad",
      direction: "export",
      config: {
        KEY: {
          label: "Key",
          type: "string",
          required: false,
          options: "not-an-array",
        },
      },
      execute: {
        type: "url-redirect",
        actionLabel: "Test",
        urlTemplate: "https://x.com",
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("options"))).toBe(true);
    }
  });

  test("rejects config field with non-string placeholder", () => {
    const result = validateManifest({
      id: "bad-ph",
      name: "Bad",
      direction: "export",
      config: {
        KEY: {
          label: "Key",
          type: "string",
          required: false,
          placeholder: 123,
        },
      },
      execute: {
        type: "url-redirect",
        actionLabel: "Test",
        urlTemplate: "https://x.com",
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("placeholder"))).toBe(true);
    }
  });
});

function loadManifest(filename: string): unknown {
  const raw = readFileSync(
    join(import.meta.dir, "..", "manifests", filename),
    "utf-8"
  );
  return JSON.parse(raw);
}

describe("shipped plugin manifests", () => {
  test("reader.json passes validation", () => {
    const result = validateManifest(loadManifest("reader.json"));
    expect(result.valid).toBe(true);
  });

  test("things.json passes validation", () => {
    const result = validateManifest(loadManifest("things.json"));
    expect(result.valid).toBe(true);
  });

  test("n8n.json passes validation", () => {
    const result = validateManifest(loadManifest("n8n.json"));
    expect(result.valid).toBe(true);
  });

  test("obsidian.json passes validation", () => {
    const result = validateManifest(loadManifest("obsidian.json"));
    expect(result.valid).toBe(true);
  });

  test("reminders.json passes validation", () => {
    const result = validateManifest(loadManifest("reminders.json"));
    expect(result.valid).toBe(true);
  });
});

