# Plugin Development

## Overview

Trove uses a declarative JSON plugin system. Plugins are JSON manifests — no TypeScript code required. Each plugin defines its capabilities, configuration schema, and templates for API calls or URL redirects. A built-in template engine interpolates variables like `{{link.url}}` and `{{config.API_TOKEN}}` at execution time.

Plugins can provide two capabilities:

- **Export actions** — perform an operation on a saved link (e.g. send to a read-later service or create a task). These appear as action buttons in the link detail panel.
- **Ingest webhooks** — receive links from external tools via a webhook endpoint, automatically saving them to Trove.

## Plugin Manifest Format

A plugin manifest is a JSON object with the following fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes | Unique identifier. Lowercase alphanumeric and hyphens only. |
| `name` | `string` | Yes | Display name shown in the UI. |
| `icon` | `string` | No | Emoji or short string used as the plugin icon. |
| `description` | `string` | No | Brief description of what the plugin does. |
| `version` | `string` | No | Semantic version (e.g. `"1.0.0"`). |
| `direction` | `string` | Yes | One of `"export"`, `"ingest"`, or `"both"`. |
| `config` | `object` | No | Configuration schema (see [Config Schema](#config-schema)). |
| `execute` | `object` | Conditional | Required when direction is `"export"` or `"both"`. |
| `ingest` | `object` | Conditional | Required when direction is `"ingest"` or `"both"`. |

## Direction

The `direction` field determines what blocks are required:

| Direction | `execute` block | `ingest` block | Description |
| --- | --- | --- | --- |
| `"export"` | Required | Not used | Sends links to external services |
| `"ingest"` | Not used | Required | Receives links from external services |
| `"both"` | Required | Required | Bidirectional — export actions and ingest webhooks |

## Execute Block

The `execute` block defines how the plugin acts on a link. There are three types:

### `api-call`

Makes an HTTP request to an external API.

```json
{
  "type": "api-call",
  "actionLabel": "Send to Reader",
  "method": "POST",
  "url": "https://api.example.com/save",
  "headers": {
    "Authorization": "Bearer {{config.API_TOKEN}}"
  },
  "body": {
    "url": "{{link.url}}",
    "title": "{{link.title}}"
  },
  "successMessage": "Sent successfully"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `"api-call"` | Yes | Execute type identifier |
| `actionLabel` | `string` | Yes | Button label shown in the UI |
| `method` | `string` | Yes | HTTP method (GET, POST, PUT, etc.) |
| `url` | `string` | Yes | Request URL (supports template variables) |
| `headers` | `object` | No | Request headers (supports template variables) |
| `body` | `object` | No | JSON request body (supports template variables) |
| `successMessage` | `string` | No | Message shown on success |

### `file-write`

Writes a file to a directory on the server's filesystem. Useful for integrations that read from a local directory (e.g. Obsidian vaults, watched folders).

```json
{
  "type": "file-write",
  "actionLabel": "Save to Vault",
  "directory": "{{config.VAULT_PATH}}/{{config.SUBFOLDER}}",
  "filename": "{{link.title|slugify}}.md",
  "content": "---\nurl: {{link.url}}\ntags: {{link.tagsArray|yamllist}}\ndate: {{link.createdAt}}\n---\n\n# {{link.title}}\n",
  "mode": "create",
  "successMessage": "Saved to vault"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `"file-write"` | Yes | Execute type identifier |
| `actionLabel` | `string` | Yes | Button label shown in the UI |
| `directory` | `string` | Yes | Target directory path (supports template variables) |
| `filename` | `string` | Yes | Filename including extension (supports template variables) |
| `content` | `string` | Yes | File content (supports template variables) |
| `mode` | `"create"` \| `"overwrite"` | No | `create` fails if the file already exists; `overwrite` replaces it. Defaults to `create`. |
| `successMessage` | `string` | No | Message shown on success |

**Security:** Path traversal sequences (`..`) are rejected. Filenames are sanitised to remove unsafe characters. File content is limited to 1 MB.

### `url-redirect`

Returns a URL for the client to open (useful for URL schemes like `things:///`).

```json
{
  "type": "url-redirect",
  "actionLabel": "Open in Things",
  "urlTemplate": "things:///add?title={{link.title|urlencode}}&notes={{link.url|urlencode}}"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `"url-redirect"` | Yes | Execute type identifier |
| `actionLabel` | `string` | Yes | Button label shown in the UI |
| `urlTemplate` | `string` | Yes | URL template (supports template variables and filters) |

## Ingest Block

The `ingest` block defines how the plugin maps incoming webhook data to Trove links.

```json
{
  "description": "Receive links from external workflows",
  "itemMapping": {
    "url": "$.url",
    "title": "$.title",
    "tags": "$.tags",
    "collection": "$.collection",
    "sourceFeed": "$.source_feed"
  }
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `description` | `string` | No | Description of the webhook endpoint |
| `itemMapping.url` | `string` | Yes | JSONPath to the URL field in each item |
| `itemMapping.title` | `string` | No | JSONPath to the title field |
| `itemMapping.tags` | `string` | No | JSONPath to tags (array or comma-separated string) |
| `itemMapping.collection` | `string` | No | JSONPath to collection name (matched by name) |
| `itemMapping.sourceFeed` | `string` | No | JSONPath to source feed URL |

The webhook endpoint accepts three payload shapes:

- `{ "items": [ ... ] }` — array of items in an `items` wrapper
- `[ ... ]` — plain array of items
- `{ ... }` — single item object

Duplicate URLs are silently skipped.

## Template Variables

Template expressions use `{{...}}` syntax. Available variables:

| Variable | Description |
| --- | --- |
| `{{link.url}}` | The link's URL |
| `{{link.title}}` | The link's title |
| `{{link.description}}` | The link's description |
| `{{link.domain}}` | The link's domain |
| `{{link.tags}}` | Comma-separated tag names |
| `{{link.tagsArray}}` | JSON array of tag names (e.g. `["dev","reading"]`) |
| `{{link.createdAt}}` | ISO 8601 UTC timestamp of when the link was saved (e.g. `2026-03-23T04:00:00.000Z`) |
| `{{config.KEY}}` | User-configured value for `KEY` |

### Template Filters

Filters are applied with the pipe syntax: `{{variable|filter}}`.

| Filter | Description |
| --- | --- |
| `\|urlencode` | URL-encode the value |
| `\|json` | JSON-stringify the value |
| `\|yamllist` | Format an array as a YAML block list (each item on its own line, prefixed with `- `) |

## Config Schema

The `config` field defines settings the user must provide before using the plugin. Each key maps to a config field:

```json
{
  "config": {
    "API_TOKEN": {
      "label": "API Token",
      "type": "string",
      "required": true
    },
    "NOTIFY": {
      "label": "Send notifications",
      "type": "boolean",
      "required": false
    }
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `label` | `string` | Display label in the settings UI |
| `type` | `"string"` or `"boolean"` | Input type |
| `required` | `boolean` | Whether the field must be filled before the plugin can execute |

Users configure plugin settings from **Settings > Plugins** in the web UI.

## Walkthrough: Creating an Export Plugin

This example creates a plugin that sends links to a hypothetical Notion API.

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
  }
}
```

## Walkthrough: Creating an Ingest Plugin

This example creates a plugin that receives links from a generic webhook sender.

```json
{
  "id": "webhook-receiver",
  "name": "Webhook Receiver",
  "icon": "W",
  "description": "Receive links from any webhook source",
  "version": "1.0.0",
  "direction": "ingest",
  "config": {},
  "ingest": {
    "description": "Accepts a JSON payload with a url field",
    "itemMapping": {
      "url": "$.url",
      "title": "$.title",
      "tags": "$.tags"
    }
  }
}
```

The webhook endpoint will be available at `POST /api/plugins/webhook-receiver/webhook` after upload.

## Installing Plugins

1. Go to **Settings > Plugins** in the Trove web UI
2. Click **Upload Plugin** (admin only)
3. Paste the JSON manifest
4. Enable the plugin for your account
5. Fill in any required configuration fields

## Testing Plugins

- **Export plugins** — save a link, then click the plugin's action button in the link detail panel. Check the action history for success or error messages.
- **Ingest plugins** — send a test payload to the webhook endpoint using `curl`:

  ```bash
  curl -X POST https://your-trove-url/api/plugins/YOUR_PLUGIN_ID/webhook \
    -H "Authorization: Bearer YOUR_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"items": [{"url": "https://example.com", "title": "Test"}]}'
  ```

## Shipped Plugins

Five plugins ship with Trove as system plugins (cannot be deleted):

### Readwise Reader

Sends links to [Readwise Reader](https://readwise.io/read) for reading later. Tags from Trove are forwarded automatically.

**Configuration:** Requires a `READWISE_TOKEN` (find it at [readwise.io/access_token](https://readwise.io/access_token)).

### Things

Creates a task in [Things](https://culturedcode.com/things/) from a link. The link title becomes the task name, the URL goes in the notes, and the task is tagged with `trove`. Uses the Things URL scheme — works on macOS and iOS where Things is installed.

**Configuration:** None required.

### Obsidian

Saves links as Markdown notes in an [Obsidian](https://obsidian.md) vault. Each note is written with YAML frontmatter containing the URL, tags, and creation date, followed by the link title as a heading.

**Configuration:**

| Field | Description |
| --- | --- |
| `VAULT_PATH` | Absolute path to your Obsidian vault directory on the server |
| `SUBFOLDER` | Optional subfolder within the vault (e.g. `Inbox`) |

Notes are written as `<title>.md` inside the configured directory. If a file with the same name already exists, the action returns an error — rename or delete the existing note first.

### Apple Reminders

Creates a reminder from a link using [Apple Shortcuts](https://support.apple.com/guide/shortcuts/welcome/ios). Because Reminders is only available on Apple platforms, this plugin works by calling a named Shortcut on the device, passing the link title and URL as text input. The Shortcut is responsible for creating the reminder.

**Setup:**

1. Create a Shortcut in the Shortcuts app that accepts text input and creates a reminder from it.
2. Configure the shortcut name in **Settings > Plugins > Apple Reminders**.

**Configuration:**

| Field | Description |
| --- | --- |
| `SHORTCUT_NAME` | The exact name of your Shortcut (case-sensitive) |

This plugin uses the `shortcuts://run-shortcut` URL scheme and requires the Shortcuts app to be available on the device triggering the action.

### n8n Webhook

Receives links from [n8n](https://n8n.io) automation workflows. Use this to pipe RSS feeds, email newsletters, or other data sources into Trove.

**Configuration:** None required.

**Webhook endpoint:** `POST /api/plugins/n8n/webhook`

**Payload format:**

```json
{
  "items": [
    {
      "url": "https://example.com/article",
      "title": "Optional title",
      "collection": "reference",
      "tags": ["automation", "rss"],
      "source_feed": "https://example.com/feed.xml"
    }
  ]
}
```

All fields except `url` are optional. The `collection` field matches by name — unmatched collections default to inbox.
