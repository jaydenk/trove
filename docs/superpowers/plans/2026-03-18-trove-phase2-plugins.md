# Trove Phase 2 — Plugins & Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standardised plugin system to Trove so links can be routed to external tools (Readwise Reader, Things) and ingested from external sources (n8n/RSS), with per-user configuration managed through the frontend.

**Architecture:** Plugins are TypeScript modules in `src/plugins/` that implement the `TrovePlugin` interface. A registry loads all plugins on startup and exposes them to the API and frontend. Plugin config is stored per-user in the existing `plugin_config` table. Outbound actions record history in the existing `link_actions` table. Inbound webhooks create links via the existing link creation logic.

**Tech Stack:** Hono routes, existing SQLite tables (plugin_config, link_actions), React components

**Spec:** `docs/superpowers/specs/2026-03-18-trove-design.md` — Plugin System section (lines 232–301)

**Depends on:** Phase 1 complete (all backend routes, frontend components, 120 passing tests)

**Spec deviation:** The `handleIngest` function signature adds `db: Database` and `userId: string` parameters not in the spec. This is intentional — ingest plugins must create links in the database and the spec's original signature has no way to access the DB. The spec should be updated to match.

**Test isolation:** The plugin registry uses module-level state (`Map`). All test files that interact with plugins MUST call `clearPlugins()` in `beforeEach` to prevent cross-test contamination. This includes plugin route tests (Task 7).

---

## File Map

### Backend — New Files

| File | Responsibility |
|---|---|
| `src/plugins/types.ts` | TypeScript interfaces: TrovePlugin, PluginResult, IngestResult, PluginInfo |
| `src/plugins/registry.ts` | Loads all plugins, validates, exposes lookup/list functions |
| `src/plugins/index.ts` | Barrel file: registers all shipped plugins |
| `src/plugins/reader.ts` | Readwise Reader plugin — sends links to Reader API |
| `src/plugins/things.ts` | Things plugin — generates `things:///add` URL for redirect |
| `src/plugins/n8n.ts` | n8n ingest plugin — accepts batch webhook payloads |
| `src/db/queries/pluginConfig.ts` | CRUD for per-user plugin config (get, set, delete) |
| `src/db/queries/linkActions.ts` | Record and list plugin action history |
| `src/routes/plugins.ts` | Hono router: list plugins, get/set config, execute action, webhook |

### Backend — Modified Files

| File | Change |
|---|---|
| `src/server.ts` | Mount plugins router |
| `src/routes/links.ts` | Add `actions` field to link detail response (history from link_actions) |

### Frontend — New Files

| File | Responsibility |
|---|---|
| `frontend/src/components/PluginSettings.tsx` | Settings screen: configure plugin API keys per user |
| `frontend/src/hooks/usePlugins.ts` | Hook: fetches plugin list with config status |

### Frontend — Modified Files

| File | Change |
|---|---|
| `frontend/src/api.ts` | Add plugin types and API methods |
| `frontend/src/components/LinkCard.tsx` | Add plugin action buttons (dynamic, based on registered plugins) |
| `frontend/src/components/LinkDetail.tsx` | Add plugin actions section + action history |
| `frontend/src/components/AuthenticatedApp.tsx` | Wire plugin settings into the UI (settings navigation) |

---

## Task 1: Plugin Type Definitions

**Files:**
- Create: `src/plugins/types.ts`

- [ ] **Step 1: Create `src/plugins/types.ts`**

```typescript
import type { Database } from "bun:sqlite";

/** Represents a link record passed to plugin execute functions */
export interface PluginLink {
  id: string;
  url: string;
  title: string;
  description: string | null;
  domain: string | null;
  tags: { id: string; name: string }[];
}

export interface PluginConfigField {
  label: string;
  type: "string" | "boolean";
  required: boolean;
}

export type PluginResult =
  | { type: "success"; message: string }
  | { type: "redirect"; url: string }
  | { type: "error"; message: string };

export interface IngestResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface TrovePlugin {
  id: string;
  name: string;
  icon: string;
  description: string;

  configSchema: Record<string, PluginConfigField>;

  execute?: {
    type: "api-call" | "url-redirect";
    run(link: PluginLink, config: Record<string, string>): Promise<PluginResult>;
  };

  ingest?: {
    description: string;
    handleIngest(
      body: unknown,
      config: Record<string, string>,
      db: Database,
      userId: string
    ): Promise<IngestResult>;
  };
}

/** Serialisable plugin info returned by the API (no functions) */
export interface PluginInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  configSchema: Record<string, PluginConfigField>;
  hasExecute: boolean;
  executeType: "api-call" | "url-redirect" | null;
  hasIngest: boolean;
  isConfigured: boolean; // true if all required config keys are set
}
```

- [ ] **Step 2: Commit**

Message: `feat: plugin type definitions`

---

## Task 2: Plugin Config and Action History Queries

**Files:**
- Create: `src/db/queries/pluginConfig.ts`, `src/db/queries/linkActions.ts`
- Test: `src/db/__tests__/pluginConfig.test.ts`, `src/db/__tests__/linkActions.test.ts`

- [ ] **Step 1: Create `src/db/queries/pluginConfig.ts`**

Functions:
- `getPluginConfig(db, userId, pluginId): Record<string, string>` — returns all key-value pairs for this user+plugin
- `setPluginConfig(db, userId, pluginId, config: Record<string, string>): void` — upserts all key-value pairs (INSERT OR REPLACE)
- `deletePluginConfig(db, userId, pluginId): void` — removes all config for this user+plugin

- [ ] **Step 2: Create `src/db/queries/linkActions.ts`**

Functions:
- `recordAction(db, { linkId, pluginId, status, message }): LinkAction` — inserts a new action record with nanoid
- `listActionsForLink(db, linkId): LinkAction[]` — returns all actions for a link, newest first

- [ ] **Step 3: Write pluginConfig tests**

Tests: set config, get config returns values, get empty returns empty object, overwrite existing key, delete config removes all keys, user isolation (user A can't read user B's config).

- [ ] **Step 4: Write linkActions tests**

Tests: record action, list returns actions sorted by newest first, list empty returns empty array, delete link cascades actions.

- [ ] **Step 5: Run tests** — Expected: all pass (120 existing + new)

- [ ] **Step 6: Commit**

Message: `feat: plugin config and action history query functions`

---

## Task 3: Plugin Registry

**Files:**
- Create: `src/plugins/registry.ts`
- Test: `src/plugins/__tests__/registry.test.ts`

- [ ] **Step 1: Create `src/plugins/registry.ts`**

```typescript
import type { TrovePlugin, PluginInfo } from "./types";
import type { Database } from "bun:sqlite";
import { getPluginConfig } from "../db/queries/pluginConfig";

const plugins = new Map<string, TrovePlugin>();

export function registerPlugin(plugin: TrovePlugin): void {
  if (plugins.has(plugin.id)) {
    throw new Error(`Plugin "${plugin.id}" is already registered`);
  }
  // Validate: must have at least execute or ingest
  if (!plugin.execute && !plugin.ingest) {
    throw new Error(`Plugin "${plugin.id}" must implement execute or ingest`);
  }
  plugins.set(plugin.id, plugin);
}

export function getPlugin(id: string): TrovePlugin | undefined {
  return plugins.get(id);
}

export function listPlugins(): TrovePlugin[] {
  return Array.from(plugins.values());
}

/** Returns serialisable plugin info with config status for a specific user */
export function listPluginInfo(db: Database, userId: string): PluginInfo[] {
  return listPlugins().map((p) => {
    const config = getPluginConfig(db, userId, p.id);
    const requiredKeys = Object.entries(p.configSchema)
      .filter(([, field]) => field.required)
      .map(([key]) => key);
    const isConfigured = requiredKeys.every((key) => config[key]?.length > 0);

    return {
      id: p.id,
      name: p.name,
      icon: p.icon,
      description: p.description,
      configSchema: p.configSchema,
      hasExecute: !!p.execute,
      executeType: p.execute?.type ?? null,
      hasIngest: !!p.ingest,
      isConfigured,
    };
  });
}

/** Clear all plugins — for testing only */
export function clearPlugins(): void {
  plugins.clear();
}
```

- [ ] **Step 2: Write registry tests**

Tests: register plugin, get by id, list plugins, register duplicate throws, register without execute or ingest throws, listPluginInfo returns correct isConfigured status, clearPlugins works.

- [ ] **Step 3: Run tests** — Expected: all pass

- [ ] **Step 4: Commit**

Message: `feat: plugin registry with validation and config status`

---

## Task 4: Reader Plugin

**Files:**
- Create: `src/plugins/reader.ts`
- Test: `src/plugins/__tests__/reader.test.ts`

- [ ] **Step 1: Create `src/plugins/reader.ts`**

Readwise Reader plugin:
- id: `"reader"`
- name: `"Readwise Reader"`
- icon: `"📖"`
- description: `"Send links to Readwise Reader for reading later"`
- configSchema: `{ READWISE_TOKEN: { label: "Readwise API Token", type: "string", required: true } }`
- execute: type `"api-call"`, run function POSTs to `https://readwise.io/api/v3/save/` with `{ url, tags }`, Authorization header `Token <READWISE_TOKEN>`
- No ingest

The run function:
1. Extracts the Readwise token from config
2. POSTs to the Reader API with the link URL and tag names
3. Returns `{ type: "success", message: "Sent to Readwise Reader" }` on 2xx
4. Returns `{ type: "error", message: "..." }` on failure

- [ ] **Step 2: Write reader plugin tests**

Tests: implements TrovePlugin interface correctly, has execute but not ingest, configSchema requires READWISE_TOKEN, execute.run makes correct API call (mock fetch), returns success on 200, returns error on 4xx/5xx, includes tags in the request body.

Use `mock.module` or `Bun.serve()` to mock the Readwise API.

- [ ] **Step 3: Run tests** — Expected: all pass

- [ ] **Step 4: Commit**

Message: `feat: Readwise Reader plugin`

---

## Task 5: Things Plugin

**Files:**
- Create: `src/plugins/things.ts`
- Test: `src/plugins/__tests__/things.test.ts`

- [ ] **Step 1: Create `src/plugins/things.ts`**

Things URL scheme plugin:
- id: `"things"`
- name: `"Things"`
- icon: `"✅"`
- description: `"Create a task in Things from a link"`
- configSchema: `{}` (no config needed)
- execute: type `"url-redirect"`, run function builds and returns a `things:///add` URL
- No ingest

The run function:
1. Builds URL: `things:///add?title=${encodeURIComponent(link.title)}&notes=${encodeURIComponent(link.url)}&tags=trove`
2. Returns `{ type: "redirect", url: thingsUrl }`

- [ ] **Step 2: Write things plugin tests**

Tests: implements interface, has execute (url-redirect) but not ingest, empty configSchema, returns redirect with correctly encoded URL, handles special characters in title (ampersands, quotes), includes "trove" tag.

- [ ] **Step 3: Run tests** — Expected: all pass

- [ ] **Step 4: Commit**

Message: `feat: Things URL scheme plugin`

---

## Task 6: n8n Ingest Plugin

**Files:**
- Create: `src/plugins/n8n.ts`
- Test: `src/plugins/__tests__/n8n.test.ts`

- [ ] **Step 1: Create `src/plugins/n8n.ts`**

n8n webhook ingest plugin:
- id: `"n8n"`
- name: `"n8n Webhook"`
- icon: `"🔗"`
- description: `"Receive links from n8n automation workflows"`
- configSchema: `{}` (uses Trove's own auth)
- No execute
- ingest: handleIngest function

The handleIngest function:
1. Validates body matches expected schema: `{ items: [{ url, title?, collection?, tags?, source_feed? }] }`
2. For each item:
   - Calls `createLink(db, userId, { url, title, source: "plugin:n8n", sourceFeed })`
   - If collection name provided, looks up collection by name for this user (add a `getCollectionByName(db, userId, name)` function to `src/db/queries/collections.ts`)
   - If tags provided, calls `getOrCreateTag` + `addTagToLink` for each
   - Fires `extractAndUpdate` async for each created link
   - Tracks created/skipped/errors
3. Returns `{ created, skipped, errors }`
4. Duplicate URLs are skipped (not errors)

- [ ] **Step 2: Write n8n plugin tests**

Tests: implements interface, has ingest but not execute, handles valid batch payload, creates links with correct source, handles duplicate URLs (skips), handles missing URL (error), handles empty items array, looks up collection by name, creates tags.

Use a real test DB (createTestDb) for these tests since ingest needs to interact with the database. **IMPORTANT:** Mock `../../services/extractor` to prevent real HTTP calls during tests — follow the same pattern as `src/routes/__tests__/links.test.ts` which mocks `extractAndUpdate`.

- [ ] **Step 3: Run tests** — Expected: all pass

- [ ] **Step 4: Commit**

Message: `feat: n8n webhook ingest plugin`

---

## Task 7: Plugin API Routes

**Files:**
- Create: `src/routes/plugins.ts`
- Test: `src/routes/__tests__/plugins.test.ts`

- [ ] **Step 1: Create `src/routes/plugins.ts`**

Hono router with these endpoints:

**GET /api/plugins** — List all registered plugins with config status for the current user. Returns `PluginInfo[]` from `listPluginInfo(db, userId)`.

**GET /api/plugins/:id/config** — Get the current user's config for a specific plugin. Returns `{ config: Record<string, string>, schema: Record<string, PluginConfigField> }`. Validates plugin exists (404 if not). **Note:** Config values (including API tokens) are returned in full. This is acceptable for a self-hosted tool on a trusted network (Tailscale). The frontend plugin settings screen needs the full values to pre-populate edit fields.

**PUT /api/plugins/:id/config** — Set config for a plugin. Accepts `Record<string, string>`. Calls `setPluginConfig`. Returns updated config. Validates plugin exists.

**POST /api/links/:id/actions/:pluginId** — Execute a plugin action on a link:
1. Validates link exists and belongs to user (404)
2. Validates plugin exists and has execute capability (400)
3. Validates plugin is configured (all required keys present) (400)
4. Calls `plugin.execute.run(link, config)`
5. Records action in `link_actions` table via `recordAction`
6. Returns the PluginResult

**POST /api/plugins/:id/webhook** — Inbound webhook for ingest plugins:
1. Validates plugin exists and has ingest capability (400)
2. Auth is still required (Bearer token identifies the user)
3. Calls `plugin.ingest.handleIngest(body, config, db, userId)`
4. Returns the IngestResult

- [ ] **Step 2: Write plugin route tests**

**IMPORTANT:** Call `clearPlugins()` in `beforeEach` and re-register needed plugins per test to prevent cross-test contamination. Mock `../../services/extractor` to prevent real HTTP calls.

Tests:
- GET /api/plugins returns list of registered plugins with config status
- GET /api/plugins/:id/config returns config and schema
- GET /api/plugins/:id/config returns 404 for non-existent plugin
- PUT /api/plugins/:id/config sets config
- POST /api/links/:id/actions/:pluginId executes action (use things plugin since it doesn't need external API)
- POST /api/links/:id/actions/:pluginId returns 400 for unconfigured plugin (reader without token)
- POST /api/links/:id/actions/:pluginId returns 404 for non-existent link
- POST /api/links/:id/actions/:pluginId returns 404 for another user's link (user isolation)
- POST /api/plugins/:id/webhook accepts ingest payload (n8n)
- POST /api/plugins/:id/webhook returns 400 for non-ingest plugin (things)
- All endpoints return 401 without auth token

Register test plugins in the test setup. Use the real things/n8n plugins for realistic tests. Use `NotFoundError` (404) for missing plugins, `ValidationError` (400) for capability/config errors.

- [ ] **Step 3: Run tests** — Expected: all pass

- [ ] **Step 4: Commit**

Message: `feat: plugin API routes for config, actions, and webhooks`

---

## Task 8: Register Plugins and Mount Routes

**Files:**
- Modify: `src/server.ts`
- Create: `src/plugins/index.ts`

- [ ] **Step 1: Create `src/plugins/index.ts`**

Registers all shipped plugins:

```typescript
import { registerPlugin } from "./registry";
import { readerPlugin } from "./reader";
import { thingsPlugin } from "./things";
import { n8nPlugin } from "./n8n";

export function registerAllPlugins(): void {
  registerPlugin(readerPlugin);
  registerPlugin(thingsPlugin);
  registerPlugin(n8nPlugin);
}
```

- [ ] **Step 2: Modify `src/server.ts`**

- Import and call `registerAllPlugins()` before starting the server
- Import and mount the plugins router: `app.route("/", plugins)`
- Mount it alongside the other API routes (under auth + rate limit middleware)

- [ ] **Step 3: Run full test suite** — Expected: all pass (existing + new)

- [ ] **Step 4: Manual smoke test**

```bash
# List plugins
curl -s -H "Authorization: Bearer test-admin-token" http://localhost:3737/api/plugins | python3 -m json.tool

# Set reader config
curl -s -X PUT -H "Authorization: Bearer test-admin-token" -H "Content-Type: application/json" \
  -d '{"READWISE_TOKEN":"test-token"}' http://localhost:3737/api/plugins/reader/config

# Execute things action on a link
curl -s -X POST -H "Authorization: Bearer test-admin-token" \
  http://localhost:3737/api/links/<link-id>/actions/things
```

- [ ] **Step 5: Commit**

Message: `feat: register all plugins and mount plugin routes in server`

---

## Task 9: Add Action History to Link Detail API

**Files:**
- Modify: `src/routes/links.ts`
- Modify: `src/db/queries/links.ts` (or use linkActions query directly in route)

- [ ] **Step 1: Modify GET /api/links/:id response**

Add an `actions` field to the single-link response that includes the action history from `link_actions`:

```typescript
// In the GET /api/links/:id handler, after fetching the link:
const actions = listActionsForLink(db, link.id);
return c.json({ ...link, actions });
```

Each action: `{ id, pluginId, status, message, createdAt }`

- [ ] **Step 2: Update the Link type in tests if needed**

- [ ] **Step 3: Run tests** — Expected: all pass

- [ ] **Step 4: Commit**

Message: `feat: include plugin action history in link detail response`

---

## Task 10: Frontend — Plugin Types and API Methods

**Files:**
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Add plugin types to api.ts**

```typescript
export interface PluginInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  configSchema: Record<string, { label: string; type: string; required: boolean }>;
  hasExecute: boolean;
  executeType: "api-call" | "url-redirect" | null;
  hasIngest: boolean;
  isConfigured: boolean;
}

export interface PluginActionResult {
  type: "success" | "redirect" | "error";
  message?: string;
  url?: string;
}

export interface LinkAction {
  id: string;
  pluginId: string;
  status: string;
  message: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Add plugin API methods**

```typescript
// Add to the api object:
plugins: {
  list: () => request<PluginInfo[]>("/plugins"),
  getConfig: (id: string) => request<{ config: Record<string, string>; schema: Record<string, any> }>(`/plugins/${id}/config`),
  setConfig: (id: string, config: Record<string, string>) =>
    request<Record<string, string>>(`/plugins/${id}/config`, {
      method: "PUT",
      body: JSON.stringify(config),
    }),
  executeAction: (linkId: string, pluginId: string) =>
    request<PluginActionResult>(`/links/${linkId}/actions/${pluginId}`, {
      method: "POST",
    }),
},
```

- [ ] **Step 3: Update Link interface to include optional actions**

Add `actions?: LinkAction[]` to the Link interface.

- [ ] **Step 4: Commit**

Message: `feat: frontend plugin types and API methods`

---

## Task 11: Frontend — Plugin Action Buttons in LinkCard

**Files:**
- Modify: `frontend/src/components/LinkCard.tsx`
- Create: `frontend/src/hooks/usePlugins.ts`
- Modify: `frontend/src/components/AuthenticatedApp.tsx`

- [ ] **Step 1: Create `frontend/src/hooks/usePlugins.ts`**

Hook that fetches plugins via `api.plugins.list()`. Returns `{ plugins, isLoading, refetch }`. Same pattern as useCollections.

- [ ] **Step 2: Modify LinkCard to accept plugins and show action buttons**

Add optional prop `plugins?: PluginInfo[]`. For each plugin that has `hasExecute && isConfigured`, show a small action button inline on the card. For `url-redirect` type, the button opens the returned URL. For `api-call` type, the button calls the API and shows brief inline feedback (a small tick/cross icon that fades after 2 seconds — no toast library needed, just local component state).

Keep the buttons subtle — small icon + abbreviated name, shown on hover or always visible depending on density preference. Don't clutter the card.

- [ ] **Step 3: Wire plugins into AuthenticatedApp**

Fetch plugins via `usePlugins()` in AuthenticatedApp, pass them down to LinkCard components.

- [ ] **Step 4: Commit**

Message: `feat: plugin action buttons on link cards`

---

## Task 12: Frontend — Plugin Actions and History in LinkDetail

**Files:**
- Modify: `frontend/src/components/LinkDetail.tsx`

- [ ] **Step 1: Add plugin actions section to LinkDetail**

Below the existing metadata, add:
- "Actions" section header
- For each configured plugin with execute capability: a button to trigger the action
- For `url-redirect`: button opens the returned URL in a new tab (or via `window.location.href` on iOS)
- For `api-call`: button calls the API, shows spinner while loading, shows success/error message

- [ ] **Step 2: Add action history section**

Below the actions buttons, show "History" with a list of past actions:
- Plugin name + icon
- Status (success/error/redirect)
- Message
- Relative time

Data comes from the `actions` field on the link detail response.

- [ ] **Step 3: Commit**

Message: `feat: plugin actions and history in link detail panel`

---

## Task 13: Frontend — Plugin Settings Screen

**Files:**
- Create: `frontend/src/components/PluginSettings.tsx`
- Modify: `frontend/src/components/AuthenticatedApp.tsx`

- [ ] **Step 1: Create `frontend/src/components/PluginSettings.tsx`**

Settings screen (similar to CollectionManager) for configuring plugins:

```typescript
interface PluginSettingsProps {
  onClose: () => void;
}
```

Shows:
- Header: "Plugin Settings" with back button
- For each registered plugin:
  - Plugin icon + name + description
  - Status badge: "Configured" (green) or "Not configured" (grey)
  - Expandable config section: for each field in configSchema, show a labelled input
  - "Save" button per plugin (calls api.plugins.setConfig)
  - For ingest plugins: show the webhook URL (`/api/plugins/:id/webhook`)

- [ ] **Step 2: Wire into AuthenticatedApp**

Add a way to navigate to PluginSettings — either:
- A "Plugins" button in the sidebar (below collections/tags)
- Or accessible from the same settings area as CollectionManager

Track `showPluginSettings` state in AuthenticatedApp.

- [ ] **Step 3: Commit**

Message: `feat: plugin settings screen with per-user configuration`

---

## Task 14: Update README and Final Tests

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Add:
- Plugin system section (what plugins are, how they work)
- List of shipped plugins (Reader, Things, n8n) with configuration instructions
- Webhook endpoint documentation for n8n integration
- Plugin settings UI mention

- [ ] **Step 2: Run full test suite**

Run: `bun test`
Expected: All pass

- [ ] **Step 3: Manual end-to-end test**

1. Open Trove UI
2. Navigate to Plugin Settings
3. Configure Reader plugin with a test token
4. Open a link detail panel
5. Click "Send to Reader" — should show success (or error if test token)
6. Click "Send to Things" — should open things:// URL
7. Check action history shows the actions
8. Test n8n webhook: `curl -X POST -H "Authorization: Bearer test-admin-token" -H "Content-Type: application/json" -d '{"items":[{"url":"https://example.com/test","tags":["webhook"]}]}' http://localhost:3737/api/plugins/n8n/webhook`
9. Verify the webhook-ingested link appears in the list

- [ ] **Step 4: Commit**

Message: `feat: Phase 2 complete — plugin system with Reader, Things, and n8n plugins`

---

## Task 15: iOS Shortcut Documentation

**Files:**
- Create: `docs/ios-shortcut.md`
- Modify: `README.md`

- [ ] **Step 1: Create iOS Shortcut documentation**

Create `docs/ios-shortcut.md` with step-by-step instructions for creating an iOS Shortcut that saves links to Trove:

1. Open the Shortcuts app on iOS
2. Create a new Shortcut
3. Set the trigger: "Share Sheet" → accepts URLs
4. Add action: "Get Contents of URL"
   - URL: `https://trove.your-tailscale-domain/api/links`
   - Method: POST
   - Headers: `Authorization: Bearer <your-api-token>`, `Content-Type: application/json`
   - Request body: `{"url":"<Shortcut Input>","source":"manual"}`
5. Add action: "Show Notification" → "Saved to Trove"
6. Name the Shortcut "Save to Trove"

Include screenshots-equivalent text descriptions for each step. Note that the Shortcut uses the standard `POST /api/links` endpoint — no special shortcut-specific API needed.

- [ ] **Step 2: Update README**

Add an "iOS Shortcut" section under Capture Methods, referencing `docs/ios-shortcut.md`.

- [ ] **Step 3: Commit**

Message: `docs: iOS Shortcut setup guide for saving links from Share Sheet`
