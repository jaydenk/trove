# Layout Views & Plugin Extensibility Design

**Date:** 2026-03-23
**Status:** Approved

## Overview

Two features for Trove:

1. **Expanded layout view** — A new card layout mode showing text excerpts and optional image thumbnails alongside the existing condensed view.
2. **Plugin extensibility** — A new `file-write` execute type for the plugin system, validated by building Obsidian and Apple Reminders plugins.

---

## Feature 1: Plugin Extensibility — `file-write` Execute Type

### Problem

The current plugin system supports two execute types: `api-call` (HTTP requests) and `url-redirect` (URL scheme launches). Plugins that need to write to the local filesystem (e.g. saving a note to an Obsidian vault) have no path forward.

### Solution

Add a third execute type: `file-write`. It writes templated content to a configurable directory on the server's filesystem. This keeps the declarative JSON manifest approach while adding filesystem capability.

### Type Definition

```typescript
interface FileWriteExecute {
  type: "file-write";
  actionLabel: string;
  directory: string;       // Template: "{{config.VAULT_PATH}}/{{config.SUBFOLDER}}"
  filename: string;        // Template: "{{link.title}}.md"
  content: string;         // Template: full file body with {{link.*}} interpolation
  mode?: "create" | "overwrite";  // Default: "create"
  successMessage?: string;
}
```

### Files to Modify

- **`src/plugins/manifest.ts`** — Add `FileWriteExecute` to the `ExecuteBlock` union type. Add `"file-write"` to the validation function's valid execute types. Validate required fields: `directory`, `filename`, `content`, `actionLabel`.
- **`src/plugins/executor.ts`** — Add `executeFileWrite()` handler:
  1. Interpolate `directory`, `filename`, and `content` from the template context.
  2. Sanitise the filename (replace `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` with `-`).
  3. Normalise the resolved path (collapse double slashes, strip trailing slashes, resolve `.`).
  4. Create subdirectories if needed (`mkdir -p` equivalent). On permission denied, return `{ type: "error", message: "Cannot create directory: permission denied" }`.
  5. Security check: use `fs.realpath()` on the now-existing resolved directory, then verify the target file path starts with it. Runs *after* directory creation so `realpath` has a real path to resolve. Catches both `..` traversal and symlink escapes.
  6. Write the file respecting the `mode` setting. In `create` mode, if the file already exists, return `{ type: "error", message: "File already exists: <filename>" }`. In `overwrite` mode, replace the existing file.
  7. Return success or error result.
- **`src/plugins/template.ts`** — Add `link.createdAt` to the `TemplateContext` interface. Add a `yamllist` filter that converts a comma-separated string into YAML list items (e.g. `"dev, reading"` → `"\n  - dev\n  - reading"`).
- **`src/routes/plugins.ts`** — Update `buildTemplateContext()` (around line 34) to include `createdAt` from the link record.
- **`src/mcp/server.ts`** — Update the inline `TemplateContext` construction (around line 435) to include `createdAt`. Note: MCP calls also go through `executePlugin()`, so `file-write` will work from MCP as well.

### Frontend Handling

The `file-write` executor returns `{ type: "success", message }`, which the existing `PluginActionButton` in `LinkCard.tsx` already handles correctly (shows a checkmark). No new result type or frontend changes are needed for plugin execution.

### Security

- **Path traversal protection:** After directory creation, use `fs.realpath()` on the resolved directory to get the canonical path (resolving any symlinks). Then verify the target file's resolved path starts with this canonical directory. This catches both `..` traversal and symlink-based escapes.
- **File size cap:** 1MB maximum on interpolated `content` to prevent accidental abuse.
- **Filename sanitisation:** Replace `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` with `-`.
- **Path normalisation:** Collapse double slashes, strip trailing slashes, and resolve `.` segments. Handles the case where optional config fields (like `SUBFOLDER`) are empty or absent, producing paths like `/vault//file.md` or `/vault/`.

### New System Plugins

#### Obsidian (`data/plugins/obsidian.json`)

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
      "required": true
    },
    "SUBFOLDER": {
      "label": "Subfolder (optional)",
      "type": "string",
      "required": false
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

#### Apple Reminders (`data/plugins/reminders.json`)

Uses existing `url-redirect` type with Apple Shortcuts URL scheme. No new execute type needed.

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
      "required": true
    }
  },
  "execute": {
    "type": "url-redirect",
    "actionLabel": "Add Reminder",
    "urlTemplate": "shortcuts://run-shortcut?name={{config.SHORTCUT_NAME|urlencode}}&input=text&text={{link.title|urlencode}}%0A{{link.url|urlencode}}"
  }
}
```

This approach generalises — any Apple Shortcut becomes a plugin target (Notes, OmniFocus, Telegram, etc.).

---

## Feature 2: Layout Views — Condensed vs Expanded

### Problem

The current link list shows only title, domain, time, and tags. Users who want more context before acting on a link must click into each one. An expanded view showing extracted text and images would reduce this friction.

### Solution

Add a user preference for view mode (condensed/expanded) in Settings > Appearance, with an optional sub-preference for image thumbnails when expanded.

### New User Preferences

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `view_mode` | `"condensed"` \| `"expanded"` | `"condensed"` | Card layout mode |
| `show_images` | `boolean` | `true` | Show image thumbnails in expanded mode |

### Settings > Appearance Changes

Add a "Layout" section between the existing Theme and Swipe Actions sections:
- **View mode** — segmented control: Condensed | Expanded
- **Show image thumbnails** — toggle, only visible when view mode is "expanded"

### LinkCard Component Changes

**New props:** `viewMode: "condensed" | "expanded"` and `showImages: boolean`

When `viewMode === "expanded"`:

1. **Excerpt row** (after domain/time row):
   - Source priority: `link.description` if available, fall back to `link.content`
   - Truncated to 2 lines via CSS `-webkit-line-clamp: 2`
   - Styled at 13px, secondary text colour, `padding-left: 24px` (aligned with title text)
   - Omitted entirely if neither description nor content exists (card looks like condensed)

2. **Image thumbnail** (if `showImages` is true and `link.imageUrl` exists):
   - 72×72px rounded thumbnail on the right side of the card
   - Text content (title, domain, excerpt, tags) flexes to fill remaining space
   - Cards without an image render full-width text — no empty placeholder

### Data Flow

- `AuthenticatedApp` fetches preferences and passes `viewMode` + `showImages` through the link list to each `LinkCard`
- When the user changes the setting in Appearance, a `PATCH /api/me/preferences` call persists it
- The existing preferences API handles arbitrary key-value pairs — no backend route changes needed

### Payload Considerations

The list endpoint already uses `SELECT l.*` which includes `content`, `description`, and `image_url`. No additional data needs to be fetched — the expanded view simply renders fields that are already in the response. No backend query changes required.

### Unaffected Areas

- Triage mode (has its own expanded layout)
- Mobile swipe behaviour (works identically in both modes)
- Plugin action buttons (same hover behaviour)
- Search results (respects whichever view mode is active)

---

## Testing Strategy

### Plugin `file-write` Tests (`src/plugins/__tests__/executor.test.ts`)

- Writes a file with interpolated content to a temp directory
- Respects `mode: "create"` — returns error if file already exists
- Respects `mode: "overwrite"` — replaces existing file
- Path traversal rejection: `../` in filename or directory is rejected
- Symlink escape rejection: symlink pointing outside directory is rejected
- Missing directory is created automatically
- Permission denied on directory creation returns descriptive error
- Sanitises filenames (replaces invalid characters with `-`)
- Path normalisation collapses double slashes and trailing slashes

### Plugin Manifest Validation Tests (`src/plugins/__tests__/manifest.test.ts`)

- Validates `file-write` execute block requires `directory`, `filename`, `content`, `actionLabel`
- Rejects unknown execute types

### Layout Preference Tests

- Frontend: `LinkCard` renders excerpt row when `viewMode === "expanded"`
- Frontend: `LinkCard` renders image thumbnail when `showImages` is true and `imageUrl` exists
- Frontend: `LinkCard` omits excerpt when neither `description` nor `content` exists
- Frontend: Settings > Appearance shows image toggle only when expanded is selected
- API: preferences round-trip `view_mode` and `show_images` correctly

### System Plugin Manifest Tests

- `obsidian.json` and `reminders.json` pass manifest validation
- Obsidian manifest interpolates correctly with sample link data
- Reminders manifest produces valid Shortcuts URL
