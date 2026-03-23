# Plugin Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the plugin system with health checks, test-execute, richer config schema, upgraded existing plugins, and new system plugins.

**Architecture:** Extend the declarative JSON manifest format with `healthCheck` block and config `options`/`placeholder` fields. Refactor the template engine for filter chaining and a `default` filter. Add two new API routes for health check and test execute. Update frontend settings UI to render dropdowns and verification controls.

**Tech Stack:** Bun, Hono, SQLite, React 18, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-23-plugin-enhancements-design.md`

---

### Task 1: Template Engine — Filter Chaining & Default Filter

**Files:**
- Modify: `src/plugins/template.ts:22-88`
- Test: `src/plugins/__tests__/template.test.ts`

- [ ] **Step 1: Write failing tests for filter chaining and default filter**

Add these tests to `src/plugins/__tests__/template.test.ts` inside the existing `describe("interpolate", ...)` block:

```typescript
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
  // default:hello world then urlencode → "hello%20world" if empty
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test src/plugins/__tests__/template.test.ts`
Expected: New tests FAIL (default filter not found, chaining not supported)

- [ ] **Step 3: Refactor filter parser and add default filter**

Replace the filters map and the `interpolate` function in `src/plugins/template.ts`:

```typescript
// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

type FilterFn = (value: string, arg?: string) => string;

const filters: Record<string, FilterFn> = {
  urlencode: (v) => encodeURIComponent(v),
  json: (v) => JSON.stringify(v),
  yamllist: (v) => {
    if (!v.trim()) return "";
    return v
      .split(",")
      .map((t) => `\n  - ${t.trim()}`)
      .join("");
  },
  default: (v, arg) => (v === "" && arg !== undefined ? arg : v),
};

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/**
 * Parse a filter segment like "urlencode" or "default:trove" into name + optional arg.
 */
function parseFilter(segment: string): { name: string; arg?: string } {
  const colonIndex = segment.indexOf(":");
  if (colonIndex === -1) {
    return { name: segment.trim() };
  }
  return {
    name: segment.slice(0, colonIndex).trim(),
    arg: segment.slice(colonIndex + 1),
  };
}

/**
 * Interpolate all `{{...}}` expressions in a template string.
 *
 * Supports:
 * - `{{link.url}}` — simple variable
 * - `{{link.title|urlencode}}` — variable with filter
 * - `{{config.TAGS|default:trove|urlencode}}` — chained filters
 * - `{{config.KEY}}` — config variable
 */
export function interpolate(
  template: string,
  context: TemplateContext
): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_match, expr: string) => {
    const trimmed = expr.trim();
    const segments = trimmed.split("|");
    const path = segments[0].trim();

    let value = resolve(path, context);

    for (let i = 1; i < segments.length; i++) {
      const { name, arg } = parseFilter(segments[i]);
      if (filters[name]) {
        value = filters[name](value, arg);
      }
    }

    return value;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test src/plugins/__tests__/template.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/template.ts src/plugins/__tests__/template.test.ts
git commit -m "feat(plugins): add filter chaining and default filter to template engine"
```

---

### Task 2: Template Engine — Array Interpolation in `interpolateObject`

**Files:**
- Modify: `src/plugins/template.ts:94-118`
- Test: `src/plugins/__tests__/template.test.ts`

- [ ] **Step 1: Write failing tests for array interpolation**

Add to the `describe("interpolateObject", ...)` block:

```typescript
test("interpolates strings inside arrays", () => {
  const result = interpolateObject(
    {
      items: ["{{link.url}}", "{{link.title}}"],
    },
    context
  );
  expect(result.items).toEqual([
    "https://example.com/article?q=1&r=2",
    "Example Article",
  ]);
});

test("interpolates nested objects inside arrays", () => {
  const result = interpolateObject(
    {
      data: [{ text: { content: "{{link.title}}" } }],
    },
    context
  );
  const arr = result.data as Array<Record<string, unknown>>;
  expect((arr[0].text as Record<string, unknown>).content).toBe(
    "Example Article"
  );
});

test("non-string/non-object array items pass through", () => {
  const result = interpolateObject(
    {
      mixed: [42, true, "{{link.url}}"],
    },
    context
  );
  expect(result.mixed).toEqual([
    42,
    true,
    "https://example.com/article?q=1&r=2",
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test src/plugins/__tests__/template.test.ts`
Expected: Array tests FAIL (arrays passed through without interpolation)

- [ ] **Step 3: Update `interpolateObject` to handle arrays**

In `src/plugins/template.ts`, replace the `interpolateObject` function:

```typescript
/**
 * Recursively interpolate a single value (string, object, array, or primitive).
 */
function interpolateValue(
  value: unknown,
  context: TemplateContext
): unknown {
  if (typeof value === "string") {
    return interpolate(value, context);
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, context));
  }
  if (value !== null && typeof value === "object") {
    return interpolateObject(value as Record<string, unknown>, context);
  }
  return value;
}

/**
 * Recursively interpolate all string values in an object.
 * Returns a new object with all template expressions resolved.
 */
export function interpolateObject(
  obj: Record<string, unknown>,
  context: TemplateContext
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    result[key] = interpolateValue(value, context);
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test src/plugins/__tests__/template.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/template.ts src/plugins/__tests__/template.test.ts
git commit -m "feat(plugins): add array interpolation to template engine"
```

---

### Task 3: Manifest Types — HealthCheck, Config Options, Body Type

**Files:**
- Modify: `src/plugins/manifest.ts:5-31` (types) and `src/plugins/manifest.ts:188-213` (validation)
- Test: `src/plugins/__tests__/manifest.test.ts`

- [ ] **Step 1: Write failing tests for new manifest features**

Add to `src/plugins/__tests__/manifest.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test src/plugins/__tests__/manifest.test.ts`
Expected: New tests FAIL (healthCheck not validated, options not validated)

- [ ] **Step 3: Update types and validation**

In `src/plugins/manifest.ts`, add the new types and update validation.

Add `HealthCheckBlock` type and update `PluginManifest`:

```typescript
export interface HealthCheckBlock {
  url: string;
  headers?: Record<string, string>;
  expectedStatus?: number;
}

export interface PluginConfigField {
  label: string;
  type: "string" | "boolean";
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  version?: string;
  direction: "export" | "ingest" | "both";
  config?: Record<string, PluginConfigField>;
  execute?: ExecuteBlock;
  ingest?: IngestBlock;
  healthCheck?: HealthCheckBlock;
}
```

Update `ApiCallExecute.body` type:

```typescript
export interface ApiCallExecute {
  type: "api-call";
  actionLabel: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  successMessage?: string;
}
```

Add healthCheck validation at the end of `validateManifest()`, before the final error check:

```typescript
// healthCheck block validation (optional)
if (obj.healthCheck !== undefined) {
  if (typeof obj.healthCheck !== "object" || obj.healthCheck === null) {
    errors.push("'healthCheck' must be an object if provided");
  } else {
    const hc = obj.healthCheck as Record<string, unknown>;
    if (typeof hc.url !== "string" || hc.url.length === 0) {
      errors.push("healthCheck.url is required and must be a non-empty string");
    }
    if (hc.expectedStatus !== undefined && typeof hc.expectedStatus !== "number") {
      errors.push("healthCheck.expectedStatus must be a number if provided");
    }
    if (hc.headers !== undefined) {
      if (typeof hc.headers !== "object" || hc.headers === null) {
        errors.push("healthCheck.headers must be an object if provided");
      }
    }
  }
}
```

Update config field validation (inside the existing `for (const [key, field] of Object.entries(config))` loop) to add after the `required` check:

```typescript
if (f.options !== undefined) {
  if (!Array.isArray(f.options)) {
    errors.push(`config.${key}.options must be an array if provided`);
  } else if (f.options.some((o: unknown) => typeof o !== "string" || (o as string).length === 0)) {
    errors.push(`config.${key}.options must contain non-empty strings`);
  }
}
if (f.placeholder !== undefined && typeof f.placeholder !== "string") {
  errors.push(`config.${key}.placeholder must be a string if provided`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test src/plugins/__tests__/manifest.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Run all plugin tests to check for regressions**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test src/plugins/`
Expected: ALL tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/plugins/manifest.ts src/plugins/__tests__/manifest.test.ts
git commit -m "feat(plugins): add healthCheck block, config options/placeholder, widen body type"
```

---

### Task 4: Health Check Executor

**Files:**
- Modify: `src/plugins/executor.ts`
- Test: `src/plugins/__tests__/executor.test.ts`

- [ ] **Step 1: Write failing tests for health check execution**

Add a new `describe("executeHealthCheck", ...)` block to `src/plugins/__tests__/executor.test.ts`. Import the function:

```typescript
import { executeHealthCheck } from "../executor";
import type { HealthCheckBlock } from "../manifest";
```

Tests:

```typescript
describe("executeHealthCheck", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns ok when API returns expected status", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("ok", { status: 200 }))
    ) as any;

    const hc: HealthCheckBlock = {
      url: "https://api.example.com/me",
      headers: { Authorization: "Token {{config.TOKEN}}" },
    };

    const result = await executeHealthCheck(hc, { TOKEN: "abc123" });
    expect(result.status).toBe("ok");
  });

  test("returns error when API returns non-matching status", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Unauthorized", { status: 401 }))
    ) as any;

    const hc: HealthCheckBlock = {
      url: "https://api.example.com/me",
    };

    const result = await executeHealthCheck(hc, {});
    expect(result.status).toBe("error");
    expect(result.message).toContain("401");
  });

  test("returns error on network failure", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("fetch failed"))
    ) as any;

    const hc: HealthCheckBlock = {
      url: "https://unreachable.example.com",
    };

    const result = await executeHealthCheck(hc, {});
    expect(result.status).toBe("error");
    expect(result.message).toContain("fetch failed");
  });

  test("interpolates config in URL and headers", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = mock((url: string, opts: any) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as any;

    const hc: HealthCheckBlock = {
      url: "https://api.example.com/{{config.VERSION}}/me",
      headers: { Authorization: "Bearer {{config.TOKEN}}" },
    };

    await executeHealthCheck(hc, { TOKEN: "xyz", VERSION: "v3" });
    expect(capturedUrl).toBe("https://api.example.com/v3/me");
    expect(capturedHeaders.Authorization).toBe("Bearer xyz");
  });

  test("uses custom expectedStatus", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("ok", { status: 204 }))
    ) as any;

    const hc: HealthCheckBlock = {
      url: "https://api.example.com/me",
      expectedStatus: 204,
    };

    const result = await executeHealthCheck(hc, {});
    expect(result.status).toBe("ok");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test src/plugins/__tests__/executor.test.ts`
Expected: FAIL — `executeHealthCheck` not exported

- [ ] **Step 3: Implement `executeHealthCheck`**

Add to `src/plugins/executor.ts`, after the imports. Import the new type and the `interpolate` function:

```typescript
import type { HealthCheckBlock } from "./manifest";
```

Add the function (before or after the existing `executePlugin`):

```typescript
// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

export type HealthCheckResult =
  | { status: "ok" }
  | { status: "error"; message: string };

export async function executeHealthCheck(
  healthCheck: HealthCheckBlock,
  config: Record<string, string>
): Promise<HealthCheckResult> {
  // Build a minimal TemplateContext with only config (no link data needed)
  const context: TemplateContext = {
    link: {
      url: "",
      title: "",
      description: null,
      domain: null,
      tags: "",
      tagsArray: "[]",
      createdAt: "",
    },
    config,
  };

  try {
    const url = interpolate(healthCheck.url, context);
    const headers: Record<string, string> = {};
    if (healthCheck.headers) {
      for (const [key, value] of Object.entries(healthCheck.headers)) {
        headers[key] = interpolate(value, context);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const expected = healthCheck.expectedStatus ?? 200;
    if (response.status !== expected) {
      return {
        status: "error",
        message: `Expected status ${expected}, got ${response.status}`,
      };
    }

    return { status: "ok" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return { status: "error", message };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test src/plugins/__tests__/executor.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/executor.ts src/plugins/__tests__/executor.test.ts
git commit -m "feat(plugins): add health check executor with timeout and config interpolation"
```

---

### Task 5: Health Check & Test Execute Routes

**Files:**
- Modify: `src/routes/plugins.ts`
- Test: `src/routes/__tests__/plugins.test.ts`

- [ ] **Step 1: Write failing tests for new routes**

Add to `src/routes/__tests__/plugins.test.ts` inside the existing `describe("plugin routes", ...)` block. Add a manifest constant near the other manifest constants at the top of the file:

```typescript
const readerWithHealthCheck = {
  ...readerManifest,
  healthCheck: {
    url: "https://readwise.io/api/v3/me/",
    headers: { Authorization: "Token {{config.READWISE_TOKEN}}" },
  },
};
```

Add tests (using the existing `userToken`, `userId`, `db`, and `createApp()` pattern):

```typescript
describe("POST /api/plugins/:id/health-check", () => {
  test("returns ok for valid health check", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("ok", { status: 200 }))
    ) as any;

    try {
      insertPlugin(db, readerWithHealthCheck as any, true);
      enablePluginForUser(db, userId, "reader");
      setPluginConfig(db, userId, "reader", { READWISE_TOKEN: "test-token" });

      const app = createApp();
      const res = await app.request("/api/plugins/reader/health-check", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns 400 for plugin without healthCheck", async () => {
    insertPlugin(db, thingsManifest, true);
    enablePluginForUser(db, userId, "things");

    const app = createApp();
    const res = await app.request("/api/plugins/things/health-check", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.status).toBe(400);
  });

  test("returns 404 for unknown plugin", async () => {
    const app = createApp();
    const res = await app.request("/api/plugins/nonexistent/health-check", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.status).toBe(404);
  });
});

describe("POST /api/plugins/:id/test", () => {
  test("returns redirect result for url-redirect plugin", async () => {
    insertPlugin(db, thingsManifest, true);
    enablePluginForUser(db, userId, "things");

    const app = createApp();
    const res = await app.request("/api/plugins/things/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("redirect");
    expect(body.url).toContain("things:///add");
    expect(body.url).toContain("Trove%20Test");
  });

  test("returns error for plugin without execute block", async () => {
    const ingestOnly = {
      id: "ingest-only",
      name: "Ingest",
      direction: "ingest" as const,
      ingest: { itemMapping: { url: "$.url" } },
    };
    insertPlugin(db, ingestOnly as any, false);
    enablePluginForUser(db, userId, "ingest-only");

    const app = createApp();
    const res = await app.request("/api/plugins/ingest-only/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.status).toBe(400);
  });

  test("does not record action in link_actions", async () => {
    insertPlugin(db, thingsManifest, true);
    enablePluginForUser(db, userId, "things");

    const app = createApp();
    await app.request("/api/plugins/things/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
    });

    // Verify no actions were recorded (no link was involved)
    const actions = db
      .query("SELECT COUNT(*) as count FROM link_actions")
      .get() as { count: number };
    expect(actions.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test src/routes/__tests__/plugins.test.ts`
Expected: FAIL — routes don't exist

- [ ] **Step 3: Add health check and test routes**

In `src/routes/plugins.ts`, add import for `executeHealthCheck`:

```typescript
import { executePlugin, handleIngest, executeHealthCheck } from "../plugins/executor";
```

Add the health check route (before the webhook route):

```typescript
// ---------------------------------------------------------------------------
// POST /api/plugins/:id/health-check — Run health check for a plugin
// ---------------------------------------------------------------------------

plugins.post("/api/plugins/:id/health-check", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const pluginId = c.req.param("id");

  const plugin = getPluginById(db, pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  if (!plugin.manifest.healthCheck) {
    throw new ValidationError("Plugin does not have a health check");
  }

  const config = getPluginConfig(db, user.id, pluginId);
  const result = await executeHealthCheck(plugin.manifest.healthCheck, config);

  return c.json(result);
});
```

Add the test execute route:

```typescript
// ---------------------------------------------------------------------------
// POST /api/plugins/:id/test — Test execute with synthetic data
// ---------------------------------------------------------------------------

plugins.post("/api/plugins/:id/test", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const pluginId = c.req.param("id");

  const plugin = getPluginById(db, pluginId);
  if (!plugin) {
    throw new NotFoundError("Plugin not found");
  }

  if (!plugin.manifest.execute) {
    throw new ValidationError("Plugin does not support execute actions");
  }

  const config = getPluginConfig(db, user.id, pluginId);

  // Check required config keys
  const requiredKeys = Object.entries(plugin.manifest.config ?? {})
    .filter(([, field]) => field.required)
    .map(([key]) => key);
  const missingKeys = requiredKeys.filter(
    (key) => !config[key] || config[key].length === 0
  );
  if (missingKeys.length > 0) {
    throw new ValidationError(
      `Plugin is not configured. Missing: ${missingKeys.join(", ")}`
    );
  }

  // Build synthetic test context
  const context: TemplateContext = {
    link: {
      url: "https://trove.test/plugin-test",
      title: "[Trove Test] Plugin Verification",
      description:
        "This is a test item created by Trove to verify plugin configuration. Safe to delete.",
      domain: "trove.test",
      tags: "trove-test",
      tagsArray: '["trove-test"]',
      createdAt: new Date().toISOString(),
    },
    config,
  };

  const result = await executePlugin(plugin.manifest, context);

  // Do NOT record action — test executions should not pollute history

  return c.json(result);
});
```

Update `manifestToPluginInfo` to include `hasHealthCheck`:

```typescript
function manifestToPluginInfo(
  manifest: PluginManifest,
  opts: {
    isConfigured: boolean;
    enabled: boolean;
    isSystem: boolean;
    version: string | null;
  }
) {
  return {
    id: manifest.id,
    name: manifest.name,
    icon: manifest.icon ?? "",
    description: manifest.description ?? "",
    configSchema: manifest.config ?? {},
    hasExecute: !!manifest.execute,
    executeType: manifest.execute?.type ?? null,
    actionLabel:
      manifest.execute && "actionLabel" in manifest.execute
        ? manifest.execute.actionLabel
        : null,
    hasIngest: !!manifest.ingest,
    hasHealthCheck: !!manifest.healthCheck,
    isConfigured: opts.isConfigured,
    direction: manifest.direction,
    enabled: opts.enabled,
    isSystem: opts.isSystem,
    version: opts.version,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test src/routes/__tests__/plugins.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Run all backend tests**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test`
Expected: ALL tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/plugins.ts src/routes/__tests__/plugins.test.ts src/plugins/executor.ts
git commit -m "feat(plugins): add health check and test execute API routes"
```

---

### Task 6: Update Plugin Manifests

**Files:**
- Modify: `data/plugins/reader.json`
- Modify: `data/plugins/things.json`
- Create: `data/plugins/obsidian.json`
- Create: `data/plugins/reminders.json`

- [ ] **Step 1: Update reader.json to v1.1.0**

Replace `data/plugins/reader.json` with the updated manifest from the spec (Section 4). Key changes: version bump to 1.1.0, add `READER_LOCATION` and `READER_CATEGORY` config fields with `options` and `placeholder`, add `notes`/`location`/`category` to execute body, add `healthCheck` block.

- [ ] **Step 2: Update things.json to v1.1.0**

Replace `data/plugins/things.json` with the updated manifest from the spec (Section 4). Key changes: version bump to 1.1.0, add `THINGS_PROJECT`, `THINGS_WHEN` (with options), `THINGS_TAGS` (with placeholder) config fields, update URL template to use `|default:trove` for tags.

- [ ] **Step 3: Create obsidian.json**

Create `data/plugins/obsidian.json` with the manifest from the spec (Section 5). File-write plugin with `VAULT_PATH` and `SUBFOLDER` config.

- [ ] **Step 4: Create reminders.json**

Create `data/plugins/reminders.json` with the manifest from the spec (Section 5). URL-redirect plugin with `SHORTCUT_NAME` config.

- [ ] **Step 5: Write manifest validation tests for all updated/new manifests**

Add to `src/plugins/__tests__/manifest.test.ts`:

```typescript
import { readFileSync } from "fs";
import { join } from "path";

function loadManifest(filename: string): unknown {
  const raw = readFileSync(
    join(import.meta.dir, "..", "..", "..", "data", "plugins", filename),
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
```

- [ ] **Step 6: Run manifest tests**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test src/plugins/__tests__/manifest.test.ts`
Expected: ALL tests PASS

- [ ] **Step 7: Commit**

```bash
git add data/plugins/ src/plugins/__tests__/manifest.test.ts
git commit -m "feat(plugins): update Reader/Things to v1.1.0, add Obsidian and Reminders plugins"
```

---

### Task 7: Frontend — API Client & Types

**Files:**
- Modify: `frontend/src/api.ts:52-67` (types) and `frontend/src/api.ts:349-382` (api methods)

- [ ] **Step 1: Update `PluginInfo` type**

In `frontend/src/api.ts`, update the `PluginInfo` interface:

```typescript
export interface PluginInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  configSchema: Record<
    string,
    {
      label: string;
      type: string;
      required: boolean;
      options?: string[];
      placeholder?: string;
    }
  >;
  hasExecute: boolean;
  executeType: "api-call" | "url-redirect" | "file-write" | null;
  actionLabel: string | null;
  hasIngest: boolean;
  hasHealthCheck: boolean;
  isConfigured: boolean;
  direction: "export" | "ingest" | "both";
  enabled: boolean;
  isSystem: boolean;
  version: string | null;
}
```

Add `HealthCheckResult` type:

```typescript
export interface HealthCheckResult {
  status: "ok" | "error";
  message?: string;
}
```

- [ ] **Step 2: Add API methods**

Add to the `plugins` object in `frontend/src/api.ts`:

```typescript
healthCheck: (id: string) =>
  request<HealthCheckResult>(`/plugins/${id}/health-check`, {
    method: "POST",
  }),

test: (id: string) =>
  request<PluginActionResult>(`/plugins/${id}/test`, {
    method: "POST",
  }),
```

- [ ] **Step 3: Run frontend type check**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager/frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.ts
git commit -m "feat(plugins): add health check and test API methods, update PluginInfo type"
```

---

### Task 8: Frontend — Plugin Settings UI Enhancements

**Files:**
- Modify: `frontend/src/components/PluginSettings.tsx`

- [ ] **Step 1: Add state for health check and test results to `PluginRow`**

In the `PluginRow` component, add new state variables:

```typescript
const [healthStatus, setHealthStatus] = useState<{
  type: "ok" | "error";
  message?: string;
} | null>(null);
const [checking, setChecking] = useState(false);
const [testing, setTesting] = useState(false);
const [testResult, setTestResult] = useState<{
  type: "success" | "error";
  message: string;
} | null>(null);
```

- [ ] **Step 2: Update `handleSave` to auto-run health check**

Modify the `handleSave` function to run health check after successful save:

```typescript
async function handleSave() {
  setSaving(true);
  setFeedback(null);
  setHealthStatus(null);
  try {
    await api.plugins.setConfig(plugin.id, fields);
    setFeedback({ type: "success", message: "Saved" });
    onSaved();

    // Auto-run health check if plugin has one
    if (plugin.hasHealthCheck) {
      setChecking(true);
      try {
        const result = await api.plugins.healthCheck(plugin.id);
        setHealthStatus(
          result.status === "ok"
            ? { type: "ok" }
            : { type: "error", message: result.message }
        );
      } catch {
        setHealthStatus({ type: "error", message: "Health check failed" });
      } finally {
        setChecking(false);
      }
    }
  } catch (err) {
    if (err instanceof ApiError) {
      setFeedback({ type: "error", message: err.message });
    } else {
      setFeedback({ type: "error", message: "Failed to save configuration." });
    }
  } finally {
    setSaving(false);
  }
}
```

- [ ] **Step 3: Add test execute handler**

```typescript
async function handleTest() {
  setTesting(true);
  setTestResult(null);
  try {
    const result = await api.plugins.test(plugin.id);
    if (result.type === "redirect" && result.url) {
      window.open(result.url, "_blank");
      setTestResult({ type: "success", message: "Test sent — check the target app" });
    } else if (result.type === "success") {
      setTestResult({ type: "success", message: result.message ?? "Test succeeded" });
    } else {
      setTestResult({ type: "error", message: result.message ?? "Test failed" });
    }
  } catch (err) {
    if (err instanceof ApiError) {
      setTestResult({ type: "error", message: err.message });
    } else {
      setTestResult({ type: "error", message: "Test failed" });
    }
  } finally {
    setTesting(false);
  }
}
```

- [ ] **Step 4: Update config form to render `<select>` for fields with `options`**

Replace the config form field rendering (the `Object.entries(plugin.configSchema).map(...)` block) with:

```typescript
{Object.entries(plugin.configSchema).map(([key, schema]) => (
  <div key={key}>
    <label className="block text-xs font-medium text-muted dark:text-dark-muted mb-1">
      {schema.label}
      {schema.required && (
        <span className="text-red-500 ml-0.5">*</span>
      )}
    </label>
    {schema.options && schema.options.length > 0 ? (
      <select
        value={fields[key] ?? ""}
        onChange={(e) =>
          setFields({ ...fields, [key]: e.target.value })
        }
        className={inputClass}
      >
        <option value="">
          {schema.placeholder ?? `Select ${schema.label}`}
        </option>
        {schema.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    ) : (
      <input
        type={key.toLowerCase().includes("token") || key.toLowerCase().includes("password") || key.toLowerCase().includes("secret") ? "password" : "text"}
        value={fields[key] ?? ""}
        onChange={(e) =>
          setFields({ ...fields, [key]: e.target.value })
        }
        placeholder={schema.placeholder ?? schema.label}
        className={inputClass}
      />
    )}
  </div>
))}
```

- [ ] **Step 5: Add Test button and health check / test result display**

Update the button/feedback section (the `<div className="flex items-center gap-3 pt-1">` block) to include the Test button and health check/test results:

```typescript
<div className="space-y-2 pt-1">
  <div className="flex items-center gap-3">
    <button
      type="button"
      onClick={handleSave}
      disabled={saving}
      className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {saving && <Spinner className="h-3 w-3" />}
      {saving ? "Saving..." : "Save"}
    </button>
    {plugin.hasExecute && plugin.isConfigured && (
      <button
        type="button"
        onClick={handleTest}
        disabled={testing}
        className="inline-flex items-center gap-1.5 rounded-md border border-border dark:border-dark-border text-neutral-900 dark:text-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {testing && <Spinner className="h-3 w-3" />}
        {testing ? "Testing..." : "Test"}
      </button>
    )}
    {feedback && (
      <span
        className={`text-xs ${
          feedback.type === "error"
            ? "text-red-600 dark:text-red-400"
            : "text-green-600 dark:text-green-400"
        }`}
      >
        {feedback.message}
      </span>
    )}
  </div>
  {/* Health check result */}
  {checking && (
    <div className="flex items-center gap-2 text-xs text-muted dark:text-dark-muted">
      <Spinner className="h-3 w-3" />
      Checking connection...
    </div>
  )}
  {healthStatus && (
    <p
      className={`text-xs ${
        healthStatus.type === "ok"
          ? "text-green-600 dark:text-green-400"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      {healthStatus.type === "ok"
        ? "✓ Connected"
        : `✗ Connection failed: ${healthStatus.message}`}
    </p>
  )}
  {/* Test result */}
  {testResult && (
    <p
      className={`text-xs ${
        testResult.type === "success"
          ? "text-green-600 dark:text-green-400"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      {testResult.type === "success"
        ? `✓ ${testResult.message}`
        : `✗ ${testResult.message}`}
    </p>
  )}
</div>
```

- [ ] **Step 6: Run frontend type check**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager/frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/PluginSettings.tsx
git commit -m "feat(plugins): add health check, test button, and dropdown config fields to settings UI"
```

---

### Task 9: Documentation Update

**Files:**
- Modify: `docs/plugin-development.md`

- [ ] **Step 1: Add new sections to plugin-development.md**

Add the following sections:

1. **Health Check Block** section (after Config Schema section) — document the `healthCheck` manifest field with an example.

2. **Config Field Options** — document `options` and `placeholder` fields with examples.

3. **`default` Template Filter** — add to the Template Filters table: `|default:value` — Returns fallback value if the variable is empty.

4. **Filter Chaining** — add a note that filters can be chained: `{{var|default:fallback|urlencode}}`.

5. **Example Plugins** section (at the end, before the Testing section) — add ready-to-paste JSON manifests with setup instructions for:
   - Notion
   - Todoist
   - Pocket
   - Slack Incoming Webhook
   - GitHub Starred (ingest)

Use the exact manifests from the spec (Section 6).

6. Update **Shipped Plugins** to include Obsidian and Apple Reminders entries.

- [ ] **Step 2: Run a quick review of the docs**

Read through the updated file to ensure consistency with the code changes.

- [ ] **Step 3: Update README if it references plugins**

Check `README.md` for any plugin-related content that should be updated.

- [ ] **Step 4: Commit**

```bash
git add docs/plugin-development.md README.md
git commit -m "docs: update plugin documentation with health checks, examples, and new shipped plugins"
```

---

### Task 10: Version Bump & Final Verification

**Files:**
- Modify: `package.json` (root)
- Modify: `frontend/package.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version to 1.2.0**

This is a new feature (minor version bump per CLAUDE.md versioning scheme).

Update `version` in both `package.json` (root) and `frontend/package.json` from `1.1.0` to `1.2.0`.

Update `CLAUDE.md` version reference from `1.1.0` to `1.2.0`.

- [ ] **Step 2: Run all backend tests**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager && bun test`
Expected: ALL tests PASS

- [ ] **Step 3: Run frontend type check**

Run: `cd /Users/kerrj/Documents/Development/TroveLinkManager/frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit version bump**

```bash
git add package.json frontend/package.json CLAUDE.md
git commit -m "chore: bump to v1.2.0 for plugin enhancements"
```
