# Plugin Enhancements Design

**Date:** 2026-03-23
**Status:** Approved

## Overview

Enhance the Trove plugin system with three goals:

1. **Connection verification** — health checks for API-credential plugins, plus a test-execute mode for all export plugins.
2. **Richer existing plugins** — enhance Reader and Things with configurable options that match their respective APIs/URL schemes.
3. **New plugins** — add Obsidian and Reminders as system plugins; document Notion, Todoist, Pocket, Slack, and GitHub Starred as ready-to-paste example manifests.

Additionally, extend the config schema format to support dropdown options and placeholder text for a better settings UI.

---

## 1. Health Check System

### Manifest Addition

New optional `healthCheck` block on `PluginManifest`:

```typescript
interface HealthCheckBlock {
  url: string;                       // Template-interpolated
  headers?: Record<string, string>;  // Template-interpolated
  expectedStatus?: number;           // Default: 200
}
```

Only meaningful for `api-call` plugins with credentials to verify. Plugins using `url-redirect` or `file-write` won't declare one.

### Backend

- **New route:** `POST /api/plugins/:id/health-check`
  - **Preconditions:** Authenticated user. Plugin must exist. User does not need the plugin enabled (so they can verify credentials before enabling).
  - Interpolates `healthCheck.url` and `healthCheck.headers` using the calling user's config.
  - Makes the request with a 5-second timeout.
  - Returns `{ status: "ok" }` if response matches `expectedStatus` (default 200).
  - Returns `{ status: "error", message: "..." }` on failure (non-matching status, network error, timeout).
  - Returns 400 if the plugin has no `healthCheck` block.
- **Implementation:** `executeHealthCheck(healthCheck: HealthCheckBlock, config: Record<string, string>)` in `src/plugins/executor.ts`.

### Frontend

- When saving plugin config in `PluginSettings.tsx`, if the plugin has a `healthCheck` block, automatically run the check after a successful save.
- Show inline result below the save button: green "Connected" or red "Connection failed: ..." text.

### Manifest Validation

`validateManifest()` updated to validate `healthCheck` if present:
- `url` required, non-empty string.
- `expectedStatus` must be a number if provided.
- `headers` must be an object of strings if provided.

---

## 2. Test Execute

A dry-run mode that fires the plugin with a clearly identifiable test payload so the user can verify end-to-end.

### Backend

- **New route:** `POST /api/plugins/:id/test`
  - Requires the plugin to have an `execute` block (export plugins only).
  - Requires the user's config to have all required fields filled.
  - Constructs a synthetic test link:
    ```json
    {
      "url": "https://trove.test/plugin-test",
      "title": "[Trove Test] Plugin Verification",
      "description": "This is a test item created by Trove to verify plugin configuration. Safe to delete.",
      "domain": "trove.test",
      "tags": "trove-test",
      "tagsArray": "[\"trove-test\"]",
      "createdAt": "<current UTC timestamp>"
    }
    ```
  - Note: `tagsArray` is a JSON-stringified array string (e.g. `"[\"trove-test\"]"`), matching the format used in `TemplateContext.link.tagsArray`.
  - Passes this through the normal `executePlugin()` path with the user's real config values.
  - Returns the standard `PluginResult` (`success`, `redirect`, or `error`).
  - **Does not record an action** in `link_actions` — test executions should not pollute the action history.

### Frontend

- "Test" button in plugin settings, available for all enabled export plugins once config is saved.
- For `api-call` plugins with `healthCheck`: save triggers health check (quick auth verify), Test button available for full end-to-end check.
- For plugins without `healthCheck`: Test button is the only verification option.
- For `url-redirect` results: frontend opens the returned URL in a new tab and shows "Test sent" feedback.
- Result shown inline with same green/red treatment as health check.

---

## 3. Config Schema Enhancements

### New Optional Fields on `PluginConfigField`

```typescript
interface PluginConfigField {
  label: string;
  type: "string" | "boolean";
  required: boolean;
  options?: string[];    // NEW — constrains to a dropdown list
  placeholder?: string;  // NEW — hint text for optional fields
}
```

### Frontend Changes

In `PluginSettings.tsx`, the config form field renderer checks for `options`:
- If `options` is present and non-empty: render a `<select>` with an empty default option (using `placeholder` as the label) followed by each option value.
- If `options` is absent: render `<input>` as before, with `placeholder` attribute if provided.

### Manifest Validation

- `options` must be an array of non-empty strings if provided.
- `placeholder` must be a string if provided.

---

## 4. Enhanced Existing Plugins

### Readwise Reader (v1.0.0 → v1.1.0)

**New config fields:**

| Key | Label | Type | Required | Options | Placeholder |
|-----|-------|------|----------|---------|-------------|
| `READER_LOCATION` | Default Save Location | string | false | `new`, `later`, `archive`, `feed` | Default (new) |
| `READER_CATEGORY` | Content Category | string | false | `article`, `email`, `rss`, `highlight`, `note`, `pdf`, `epub`, `tweet`, `video` | Default (article) |

**Updated execute body:**

```json
{
  "url": "{{link.url}}",
  "tags": "{{link.tagsArray}}",
  "notes": "{{link.description}}",
  "location": "{{config.READER_LOCATION}}",
  "category": "{{config.READER_CATEGORY}}"
}
```

Empty config values interpolate to `""`. The Readwise API ignores empty/null fields — sending `"location": ""` is treated as absent.

**Health check:**

```json
"healthCheck": {
  "url": "https://readwise.io/api/v3/me/",
  "headers": {
    "Authorization": "Token {{config.READWISE_TOKEN}}"
  }
}
```

**Full updated manifest:** `data/plugins/reader.json`

```json
{
  "id": "reader",
  "name": "Readwise Reader",
  "icon": "📖",
  "description": "Send links to Readwise Reader for reading later",
  "version": "1.1.0",
  "direction": "export",
  "config": {
    "READWISE_TOKEN": {
      "label": "Readwise API Token",
      "type": "string",
      "required": true
    },
    "READER_LOCATION": {
      "label": "Default Save Location",
      "type": "string",
      "required": false,
      "options": ["new", "later", "archive", "feed"],
      "placeholder": "Default (new)"
    },
    "READER_CATEGORY": {
      "label": "Content Category",
      "type": "string",
      "required": false,
      "options": ["article", "email", "rss", "highlight", "note", "pdf", "epub", "tweet", "video"],
      "placeholder": "Default (article)"
    }
  },
  "execute": {
    "type": "api-call",
    "actionLabel": "Send to Reader",
    "method": "POST",
    "url": "https://readwise.io/api/v3/save/",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Token {{config.READWISE_TOKEN}}"
    },
    "body": {
      "url": "{{link.url}}",
      "tags": "{{link.tagsArray}}",
      "notes": "{{link.description}}",
      "location": "{{config.READER_LOCATION}}",
      "category": "{{config.READER_CATEGORY}}"
    },
    "successMessage": "Sent to Readwise Reader"
  },
  "healthCheck": {
    "url": "https://readwise.io/api/v3/me/",
    "headers": {
      "Authorization": "Token {{config.READWISE_TOKEN}}"
    }
  }
}
```

### Things (v1.0.0 → v1.1.0)

**New config fields:**

| Key | Label | Type | Required | Options | Placeholder |
|-----|-------|------|----------|---------|-------------|
| `THINGS_PROJECT` | Default Project | string | false | — | e.g. Reading, Research |
| `THINGS_WHEN` | Default Schedule | string | false | `today`, `tomorrow`, `evening`, `anytime`, `someday` | No schedule |
| `THINGS_TAGS` | Tags (comma-separated) | string | false | — | Default: trove |

**Updated URL template:**

```
things:///add?title={{link.title|urlencode}}&notes={{link.url|urlencode}}&tags={{config.THINGS_TAGS|urlencode}}&list={{config.THINGS_PROJECT|urlencode}}&when={{config.THINGS_WHEN|urlencode}}
```

Things URL scheme ignores empty query parameter values (`&list=&when=`), so empty config values are harmless.

**No health check** — Things uses a URL scheme, no API to verify.

**Full updated manifest:** `data/plugins/things.json`

```json
{
  "id": "things",
  "name": "Things",
  "icon": "✅",
  "description": "Create a task in Things from a link",
  "version": "1.1.0",
  "direction": "export",
  "config": {
    "THINGS_PROJECT": {
      "label": "Default Project",
      "type": "string",
      "required": false,
      "placeholder": "e.g. Reading, Research"
    },
    "THINGS_WHEN": {
      "label": "Default Schedule",
      "type": "string",
      "required": false,
      "options": ["today", "tomorrow", "evening", "anytime", "someday"],
      "placeholder": "No schedule"
    },
    "THINGS_TAGS": {
      "label": "Tags (comma-separated)",
      "type": "string",
      "required": false,
      "placeholder": "Default: trove"
    }
  },
  "execute": {
    "type": "url-redirect",
    "actionLabel": "Send to Things",
    "urlTemplate": "things:///add?title={{link.title|urlencode}}&notes={{link.url|urlencode}}&tags={{config.THINGS_TAGS|urlencode}}&list={{config.THINGS_PROJECT|urlencode}}&when={{config.THINGS_WHEN|urlencode}}"
  }
}
```

**Note on `THINGS_TAGS` default:** When `THINGS_TAGS` is empty, the URL will have `&tags=` which Things treats as no tags. The previous hardcoded `trove` tag is lost unless the user explicitly sets it. The placeholder text ("Default: trove") hints at this, but the actual default must be handled differently. Two options:

- **a)** Accept the behaviour change — users who want `trove` must type it. The placeholder communicates the recommendation.
- **b)** Handle in template interpolation — add a `default` filter (e.g. `{{config.THINGS_TAGS|default:trove}}`).

**Recommendation:** **(b)** — a `default` filter is generally useful and trivial to implement. Updated template segment: `&tags={{config.THINGS_TAGS|default:trove|urlencode}}`.

This requires adding a `default` filter to `src/plugins/template.ts`. Syntax: `{{variable|default:fallback_value}}`. The filter returns the variable's value if non-empty, otherwise the fallback.

### n8n Webhook — no changes (stays at v1.0.0)

---

## 5. New System Plugins

### Obsidian (v1.0.0)

File-write plugin. Saves a markdown note to a configured vault path.

```json
{
  "id": "obsidian",
  "name": "Obsidian",
  "icon": "💎",
  "description": "Save links as notes in your Obsidian vault",
  "version": "1.0.0",
  "direction": "export",
  "config": {
    "VAULT_PATH": {
      "label": "Vault Path",
      "type": "string",
      "required": true,
      "placeholder": "/path/to/your/vault"
    },
    "SUBFOLDER": {
      "label": "Subfolder (optional)",
      "type": "string",
      "required": false,
      "placeholder": "e.g. Clippings"
    }
  },
  "execute": {
    "type": "file-write",
    "actionLabel": "Save to Obsidian",
    "directory": "{{config.VAULT_PATH}}/{{config.SUBFOLDER}}",
    "filename": "{{link.title}}.md",
    "content": "---\nurl: {{link.url}}\ntags: {{link.tags|yamllist}}\ndate: {{link.createdAt}}\n---\n\n# {{link.title}}\n\n{{link.description}}\n\n[Original Link]({{link.url}})",
    "mode": "create",
    "successMessage": "Saved to Obsidian vault"
  }
}
```

No health check — filesystem, no remote API.

### Reminders (v1.0.0)

URL-redirect via Apple Shortcuts.

```json
{
  "id": "reminders",
  "name": "Apple Reminders",
  "icon": "📋",
  "description": "Create a reminder via Apple Shortcuts",
  "version": "1.0.0",
  "direction": "export",
  "config": {
    "SHORTCUT_NAME": {
      "label": "Shortcut Name",
      "type": "string",
      "required": true,
      "placeholder": "e.g. Add Reminder"
    }
  },
  "execute": {
    "type": "url-redirect",
    "actionLabel": "Add Reminder",
    "urlTemplate": "shortcuts://run-shortcut?name={{config.SHORTCUT_NAME|urlencode}}&input=text&text={{link.title|urlencode}}%0A{{link.url|urlencode}}"
  }
}
```

No health check — URL scheme, no remote API.

---

## 6. Documented Example Plugins

Added to `docs/plugin-development.md` under a new "Example Plugins" section. Ready-to-paste JSON manifests with brief setup instructions.

### Notion

```json
{
  "id": "notion-save",
  "name": "Save to Notion",
  "icon": "N",
  "description": "Save links to a Notion database",
  "version": "1.0.0",
  "direction": "export",
  "config": {
    "NOTION_TOKEN": {
      "label": "Notion Integration Token",
      "type": "string",
      "required": true
    },
    "DATABASE_ID": {
      "label": "Notion Database ID",
      "type": "string",
      "required": true
    }
  },
  "execute": {
    "type": "api-call",
    "actionLabel": "Save to Notion",
    "method": "POST",
    "url": "https://api.notion.com/v1/pages",
    "headers": {
      "Authorization": "Bearer {{config.NOTION_TOKEN}}",
      "Notion-Version": "2022-06-28"
    },
    "body": {
      "parent": { "database_id": "{{config.DATABASE_ID}}" },
      "properties": {
        "URL": { "url": "{{link.url}}" },
        "Name": { "title": [{ "text": { "content": "{{link.title}}" } }] }
      }
    },
    "successMessage": "Saved to Notion"
  },
  "healthCheck": {
    "url": "https://api.notion.com/v1/users/me",
    "headers": {
      "Authorization": "Bearer {{config.NOTION_TOKEN}}",
      "Notion-Version": "2022-06-28"
    }
  }
}
```

**Setup:** Create a Notion integration at notion.so/my-integrations, share a database with it, copy the integration token and database ID.

### Todoist

```json
{
  "id": "todoist",
  "name": "Todoist",
  "icon": "☑️",
  "description": "Create a task in Todoist from a link",
  "version": "1.0.0",
  "direction": "export",
  "config": {
    "TODOIST_TOKEN": {
      "label": "Todoist API Token",
      "type": "string",
      "required": true
    },
    "PROJECT_ID": {
      "label": "Project ID (optional)",
      "type": "string",
      "required": false,
      "placeholder": "Default: Inbox"
    }
  },
  "execute": {
    "type": "api-call",
    "actionLabel": "Add to Todoist",
    "method": "POST",
    "url": "https://api.todoist.com/rest/v2/tasks",
    "headers": {
      "Authorization": "Bearer {{config.TODOIST_TOKEN}}",
      "Content-Type": "application/json"
    },
    "body": {
      "content": "{{link.title}}",
      "description": "{{link.url}}",
      "project_id": "{{config.PROJECT_ID}}"
    },
    "successMessage": "Added to Todoist"
  },
  "healthCheck": {
    "url": "https://api.todoist.com/rest/v2/projects",
    "headers": {
      "Authorization": "Bearer {{config.TODOIST_TOKEN}}"
    }
  }
}
```

**Setup:** Find API token at todoist.com/app/settings/integrations/developer. Project ID is optional — find it in the URL when viewing a project.

### Pocket

```json
{
  "id": "pocket",
  "name": "Pocket",
  "icon": "📥",
  "description": "Save links to Pocket for reading later",
  "version": "1.0.0",
  "direction": "export",
  "config": {
    "CONSUMER_KEY": {
      "label": "Consumer Key",
      "type": "string",
      "required": true
    },
    "ACCESS_TOKEN": {
      "label": "Access Token",
      "type": "string",
      "required": true
    }
  },
  "execute": {
    "type": "api-call",
    "actionLabel": "Save to Pocket",
    "method": "POST",
    "url": "https://getpocket.com/v3/add",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "url": "{{link.url}}",
      "title": "{{link.title}}",
      "tags": "{{link.tags}}",
      "consumer_key": "{{config.CONSUMER_KEY}}",
      "access_token": "{{config.ACCESS_TOKEN}}"
    },
    "successMessage": "Saved to Pocket"
  }
}
```

**Setup:** Register an app at getpocket.com/developer to obtain a consumer key, then follow the Pocket OAuth flow to get an access token. No health check — Pocket's API lacks a lightweight auth-verification endpoint.

### Slack Incoming Webhook

```json
{
  "id": "slack-webhook",
  "name": "Slack",
  "icon": "💬",
  "description": "Share links to a Slack channel via incoming webhook",
  "version": "1.0.0",
  "direction": "export",
  "config": {
    "WEBHOOK_URL": {
      "label": "Incoming Webhook URL",
      "type": "string",
      "required": true,
      "placeholder": "https://hooks.slack.com/services/..."
    }
  },
  "execute": {
    "type": "api-call",
    "actionLabel": "Share to Slack",
    "method": "POST",
    "url": "{{config.WEBHOOK_URL}}",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "text": "<{{link.url}}|{{link.title}}>"
    },
    "successMessage": "Shared to Slack"
  }
}
```

**Setup:** Create an incoming webhook in your Slack workspace at api.slack.com/messaging/webhooks. No health check — webhooks are fire-and-forget.

### GitHub Starred (Ingest)

```json
{
  "id": "github-starred",
  "name": "GitHub Starred",
  "icon": "⭐",
  "description": "Receive starred GitHub repositories via webhook",
  "version": "1.0.0",
  "direction": "ingest",
  "config": {},
  "ingest": {
    "description": "Receive GitHub starred repositories from an n8n or automation workflow",
    "itemMapping": {
      "url": "$.html_url",
      "title": "$.full_name",
      "tags": "$.topics"
    }
  }
}
```

**Setup:** Pair with an n8n workflow or GitHub webhook that forwards star events. The webhook endpoint is `POST /api/plugins/github-starred/webhook`. Payload should include `html_url` and `full_name` from the GitHub repository object.

---

## 7. Template Engine Enhancements

### 7a. Filter Chaining

**Problem:** The current template parser splits on the first `|` only, treating everything after it as a single filter name. This means `{{var|default:trove|urlencode}}` would look for a filter named `default:trove|urlencode` and fail. The Things manifest needs `{{config.THINGS_TAGS|default:trove|urlencode}}`.

**Solution:** Refactor the filter parser in `src/plugins/template.ts` to support chaining multiple filters via `|`. Each filter is applied in order, left to right.

**Implementation:**

```typescript
// Current (single filter):
//   "link.title|urlencode" → path="link.title", filter="urlencode"
//
// New (chained filters):
//   "config.THINGS_TAGS|default:trove|urlencode"
//   → path="config.THINGS_TAGS", filters=[{name:"default",arg:"trove"}, {name:"urlencode",arg:null}]

// Parse steps:
// 1. Split trimmed expression on "|"
// 2. First segment is the variable path
// 3. Remaining segments are filters, each split on ":" into name and optional argument
// 4. Apply filters sequentially to the resolved value
```

The `interpolate()` function changes from:
- Split on first `|` → resolve path → apply single filter
To:
- Split on all `|` → first segment is path → remaining segments parsed as `name:arg` → apply in order

### 7b. `default` Filter

**Syntax:** `{{variable|default:fallback_value}}`

**Behaviour:** If the resolved variable is an empty string, return the fallback value instead. If non-empty, pass through unchanged.

**Implementation:** A parameterised filter — the first filter that takes an argument. The filter function receives both the value and the argument.

```typescript
// Filter type changes from:
type FilterFn = (value: string) => string;
// To:
type FilterFn = (value: string, arg?: string) => string;

// default filter:
default: (v, arg) => (v === "" && arg !== undefined) ? arg : v
```

The `default` filter is generally useful beyond Things — any optional config field could benefit from a fallback.

### 7c. Array Interpolation in `interpolateObject`

**Problem:** `interpolateObject()` currently skips arrays — it only recurses into plain objects. The documented Notion example plugin has arrays in its body (e.g. `"title": [{ "text": { "content": "{{link.title}}" } }]`). Template expressions inside arrays would not be resolved.

**Solution:** Extend `interpolateObject()` to recurse into arrays:

```typescript
// Current: arrays are passed through as-is
// New: arrays are mapped, recursing into each element
if (Array.isArray(value)) {
  result[key] = value.map(item => {
    if (typeof item === "string") return interpolate(item, context);
    if (typeof item === "object" && item !== null) return interpolateObject(item, context);
    return item;
  });
}
```

This is needed for the documented Notion example to work correctly if a user uploads it.

### 7d. Existing Filters

For reference, these filters already exist and require no changes:
- `urlencode` — URL-encode the value
- `json` — JSON-stringify the value
- `yamllist` — format comma-separated string as YAML block list items

---

## 8. Files to Modify

### Backend

| File | Changes |
|------|---------|
| `src/plugins/manifest.ts` | Add `HealthCheckBlock` type. Add `healthCheck?: HealthCheckBlock` to `PluginManifest`. Add `options?: string[]` and `placeholder?: string` to `PluginConfigField`. Widen `ApiCallExecute.body` from `Record<string, string>` to `Record<string, unknown>` (already handled at runtime via cast, but the type should match). Update `validateManifest()` for new fields. |
| `src/plugins/executor.ts` | Add `executeHealthCheck()` function. |
| `src/plugins/template.ts` | Refactor filter parser to support chaining (`{{var|filter1|filter2}}`). Add parameterised filter support (`name:arg`). Add `default` filter. Extend `interpolateObject()` to recurse into arrays. |
| `src/routes/plugins.ts` | Add `POST /api/plugins/:id/health-check` route. Add `POST /api/plugins/:id/test` route (no action recording). Update `manifestToPluginInfo()` to include `hasHealthCheck` flag. Note: `configSchema` passthrough from the manifest already includes `options`/`placeholder` — no additional mapping needed. |
| `data/plugins/reader.json` | Update to v1.1.0 with new config fields, body, and health check. |
| `data/plugins/things.json` | Update to v1.1.0 with new config fields and updated URL template. |
| `data/plugins/obsidian.json` | New file — Obsidian system plugin. |
| `data/plugins/reminders.json` | New file — Apple Reminders system plugin. |

### Frontend

| File | Changes |
|------|---------|
| `frontend/src/api.ts` | Add `healthCheck(id)` and `test(id)` methods to the plugins API. Add `hasHealthCheck` to `PluginInfo` type. Add `"file-write"` to `executeType` union (currently only `"api-call" | "url-redirect" | null`). Update `configSchema` type to include `options?: string[]` and `placeholder?: string`. |
| `frontend/src/components/PluginSettings.tsx` | Render `<select>` for config fields with `options`. Show `placeholder` on inputs. Add Test button for export plugins. Auto-run health check on config save. Show inline result feedback. |

### Documentation

| File | Changes |
|------|---------|
| `docs/plugin-development.md` | Add "Example Plugins" section with Notion, Todoist, Pocket, Slack, GitHub Starred manifests. Document `healthCheck` block. Document `options` and `placeholder` config fields. Document `default` template filter. |

---

## 9. Testing Strategy

### Health Check Tests (`src/plugins/__tests__/executor.test.ts`)

- Successful health check returns `{ status: "ok" }` when API returns expected status.
- Failed health check returns `{ status: "error", message }` on non-matching status code.
- Timeout returns error after 5 seconds.
- Headers are interpolated correctly from config.

### Test Execute Tests (`src/routes/__tests__/plugins.test.ts`)

- Test route constructs synthetic link with expected fields.
- Test route uses user's real config values.
- Returns error if plugin has no execute block.
- Returns error if required config is missing.

### Manifest Validation Tests (`src/plugins/__tests__/manifest.test.ts`)

- `healthCheck` block validates: `url` required, `expectedStatus` must be number, `headers` must be object of strings.
- `options` on config field must be array of non-empty strings.
- `placeholder` on config field must be a string.
- All updated and new plugin manifests pass validation.

### Template Tests (`src/plugins/__tests__/template.test.ts`)

- `default` filter returns fallback when value is empty.
- `default` filter returns original value when non-empty.
- Filter chaining applies filters in order: `{{var|default:fallback|urlencode}}` resolves default first, then URL-encodes.
- Filter chaining with existing filters: `{{var|urlencode}}` still works (single filter, no regression).
- `interpolateObject` recurses into arrays and interpolates string values within array elements.
- `interpolateObject` recurses into nested objects within arrays.

### Plugin Manifest Tests

- Updated Reader manifest interpolates correctly with sample data (including empty optional fields).
- Updated Things manifest produces valid URL with all config fields populated.
- Updated Things manifest produces valid URL with empty optional fields (tags fall back to `trove`).
- Obsidian manifest passes validation and interpolates file content correctly.
- Reminders manifest passes validation and produces valid Shortcuts URL.
