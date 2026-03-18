# Trove — Personal Link Library Design Spec

## Overview

Trove is a self-hosted personal link library and routing tool. It is a permanent, searchable catalogue of links, references, manuals, and saved resources, with the ability to route items outward via plugins (e.g., Readwise Reader, Things) and inward from external sources (e.g., n8n/RSS). It also exposes an MCP server so Claude can query and act on the library directly.

**Core use cases:**

1. Save a link from a browser or iOS and have it live in Trove permanently
2. Browse, search (by title or full text), filter, and tag saved links
3. Send a link from Trove to external tools via a standardised plugin system
4. Receive links from external sources via plugin webhooks
5. Allow Claude to search, query, and trigger actions in Trove via MCP

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Bun | Fast, TypeScript-native, built-in bundler and SQLite |
| IDs | nanoid | 21-char URL-safe unique IDs for all primary keys |
| API framework | Hono | Lightweight, Bun-native, excellent TypeScript support |
| Database | SQLite via `bun:sqlite` | Zero extra services, FTS5 for full-text search, WAL mode for concurrent reads |
| Frontend | React (Vite) + Tailwind CSS | SPA served by Hono as static files |
| Content extraction | `@mozilla/readability` + `jsdom` | Same engine as Firefox Reader View |
| MCP server | `@modelcontextprotocol/sdk` | Official SDK, stdio transport |
| Deployment | Docker Compose + GitHub Actions → GHCR | CI/CD from day one, consistent with homelab stack |
| Logging | pino | Structured JSON logging, lightweight |
| Testing | Bun test runner | Built-in, zero config, fast |
| Auth | Per-user API tokens (DB-stored) | Multi-user with isolated libraries, Tailscale handles network security |

---

## Project Structure

```
trove/
├── src/
│   ├── server.ts              # Hono app entry point
│   ├── db/
│   │   ├── schema.ts          # SQLite schema + migrations
│   │   └── queries.ts         # All DB query functions
│   ├── routes/
│   │   ├── links.ts           # CRUD for links
│   │   ├── collections.ts     # CRUD for collections
│   │   ├── tags.ts            # Tags endpoints
│   │   └── plugins.ts         # Plugin config + action + webhook endpoints
│   ├── plugins/
│   │   ├── registry.ts        # Plugin loader and registry
│   │   ├── types.ts           # Plugin interface definitions
│   │   ├── reader.ts          # Readwise Reader plugin
│   │   ├── things.ts          # Things URL scheme plugin
│   │   └── n8n.ts             # n8n webhook ingest plugin
│   ├── services/
│   │   └── extractor.ts       # URL content + metadata extraction
│   └── mcp/
│       └── server.ts          # MCP server (stdio transport)
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── LinkCard.tsx
│   │   │   ├── LinkDetail.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   ├── TagFilter.tsx
│   │   │   ├── CollectionSidebar.tsx
│   │   │   ├── CollectionManager.tsx
│   │   │   ├── AddLinkModal.tsx
│   │   │   ├── BulkActionBar.tsx
│   │   │   └── PluginSettings.tsx
│   │   └── hooks/
│   │       ├── useLinks.ts
│   │       └── usePlugins.ts
│   └── index.html
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── docker-compose.yml
├── docker-compose.override.example.yml
├── Dockerfile
├── env.example
└── .gitignore
```

---

## Database Schema

All DDL runs in a single migration function on startup. WAL mode is enabled via `PRAGMA journal_mode=WAL` in `schema.ts` at database initialisation, before any tables are created.

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Users
CREATE TABLE users (
  id         TEXT PRIMARY KEY,           -- nanoid
  name       TEXT NOT NULL,
  email      TEXT UNIQUE,               -- optional, for display
  api_token  TEXT NOT NULL UNIQUE,       -- bearer token for API auth
  is_admin   INTEGER DEFAULT 0,         -- admin can manage users
  created_at TEXT DEFAULT (datetime('now'))
);

-- The first user created is automatically an admin.
-- New users are created via the admin API or a CLI seed command.

-- Links table (scoped per user)
CREATE TABLE links (
  id                TEXT PRIMARY KEY,           -- nanoid
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url               TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  content           TEXT,                       -- full extracted text (Readability)
  favicon_url       TEXT,
  image_url         TEXT,                       -- og:image
  domain            TEXT,                       -- extracted from URL
  collection_id     TEXT REFERENCES collections(id) ON DELETE SET NULL,
  status            TEXT DEFAULT 'saved',       -- saved | archived
  extraction_status TEXT DEFAULT 'pending',     -- pending | completed | failed
  source            TEXT DEFAULT 'manual',      -- manual | plugin:<id> | extension
  source_feed       TEXT,                       -- feed name if from RSS plugin
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, url)                          -- same URL can exist in different users' libraries
);

CREATE INDEX idx_links_user_id ON links(user_id);

-- Tags (scoped per user)
CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, name)                         -- tag names unique per user
);

CREATE TABLE link_tags (
  link_id TEXT REFERENCES links(id) ON DELETE CASCADE,
  tag_id  TEXT REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (link_id, tag_id)
);

-- Collections (scoped per user)
CREATE TABLE collections (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  icon       TEXT,                 -- emoji
  color      TEXT,                 -- hex colour for UI
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, name)                         -- collection names unique per user
);

-- Plugin action history (tracks which plugin actions have been executed on links)
CREATE TABLE link_actions (
  id         TEXT PRIMARY KEY,           -- nanoid
  link_id    TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  plugin_id  TEXT NOT NULL,              -- validated against in-memory plugin registry
  status     TEXT NOT NULL CHECK(status IN ('success', 'error', 'redirect')),
  message    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_link_actions_link_id ON link_actions(link_id);

-- Plugin configuration (per-user, plugin_id validated against in-memory plugin registry)
CREATE TABLE plugin_config (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  key       TEXT NOT NULL,
  value     TEXT NOT NULL,
  PRIMARY KEY (user_id, plugin_id, key)
);

-- Keep updated_at current
CREATE TRIGGER links_updated_at AFTER UPDATE ON links
WHEN old.updated_at = new.updated_at
BEGIN
  UPDATE links SET updated_at = datetime('now') WHERE id = new.id;
END;

-- Full-text search virtual table
CREATE VIRTUAL TABLE links_fts USING fts5(
  id UNINDEXED,
  title,
  description,
  content,
  content='links',
  content_rowid='rowid'
);

-- Keep FTS in sync
CREATE TRIGGER links_ai AFTER INSERT ON links BEGIN
  INSERT INTO links_fts(rowid, id, title, description, content)
  VALUES (new.rowid, new.id, new.title, new.description, new.content);
END;

CREATE TRIGGER links_au AFTER UPDATE ON links BEGIN
  INSERT INTO links_fts(links_fts, rowid, id, title, description, content)
  VALUES ('delete', old.rowid, old.id, old.title, old.description, old.content);
  INSERT INTO links_fts(rowid, id, title, description, content)
  VALUES (new.rowid, new.id, new.title, new.description, new.content);
END;

CREATE TRIGGER links_ad AFTER DELETE ON links BEGIN
  INSERT INTO links_fts(links_fts, rowid, id, title, description, content)
  VALUES ('delete', old.rowid, old.id, old.title, old.description, old.content);
END;
```

**Default collections** (seeded per user on user creation):

| Collection | Icon | Purpose |
|---|---|---|
| inbox | 📥 | Unprocessed saves |
| reference | 📚 | Things to keep and return to |
| tools | 🛠️ | Apps, services, utilities |
| manuals | 📖 | Docs, guides, how-tos |
| inspiration | ✨ | Design, photography, ideas |

**Collection ID handling:** `collection_id` is nullable. When a collection is deleted, `ON DELETE SET NULL` sets the FK to NULL. The application treats `collection_id = NULL` as "inbox" — the API automatically assigns the user's inbox collection ID when creating links without an explicit collection. The frontend displays links with `collection_id = NULL` under the Inbox entry.

"Archive" is **not** a collection — it is a virtual sidebar entry that filters by `status = 'archived'`. Archiving a link preserves its original collection.

---

## Plugin System

### Interface

```typescript
interface TrovePlugin {
  id: string;              // 'reader', 'things', 'n8n', etc.
  name: string;            // Display name
  icon: string;            // Emoji or URL
  description: string;     // Short description for UI

  // Plugin-specific config keys (stored in plugin_config table)
  configSchema: Record<string, {
    label: string;
    type: 'string' | 'boolean';
    required: boolean;
  }>;

  // Optional: execute an outbound action on a link
  // Plugins must implement at least one of execute or ingest.
  execute?: {
    type: 'api-call' | 'url-redirect';
    run(link: Link, config: Record<string, string>): Promise<PluginResult>;
  };

  // Optional: accept inbound webhooks
  ingest?: {
    description: string;
    handleIngest(body: unknown, config: Record<string, string>): Promise<IngestResult>;
  };
}

type PluginResult =
  | { type: 'success'; message: string }
  | { type: 'redirect'; url: string }
  | { type: 'error'; message: string };

type IngestResult = {
  created: number;
  skipped: number;
  errors: string[];
};
```

### Shipped Plugins

**Reader** (`reader`)
- Execute: type `api-call` — POST to `https://readwise.io/api/v3/save/` with link URL and tags
- Config: `READWISE_TOKEN`
- No ingest capability

**Things** (`things`)
- Execute: type `url-redirect` — returns `things:///add?title={title}&notes={url}&tags=trove` URL (values URL-encoded)
- Config: none required
- No ingest capability

**n8n** (`n8n`)
- No execute capability (ingest-only plugin)
- Config: none required (uses Trove's own auth token)
- Ingest: accepts batch payload of `{ items: [{ url, title?, collection?, tags?, source_feed? }] }`

### Plugin API Endpoints

```
GET    /api/plugins                       # List registered plugins with config status
GET    /api/plugins/:id/config            # Get plugin config
PUT    /api/plugins/:id/config            # Set plugin config
POST   /api/links/:id/actions/:pluginId   # Execute plugin action on a link
POST   /api/plugins/:id/webhook           # Inbound webhook (for plugins with ingest)
```

---

## API Conventions

### Authentication

All endpoints require `Authorization: Bearer <token>` except `/health`. The token is looked up in the `users` table to identify the requesting user. All data queries are automatically scoped to that user. Missing or invalid tokens return `401`.

Each user has their own API token. The first user is created via a CLI seed command (`bun run seed`) using the `TROVE_ADMIN_TOKEN` env var, and is automatically an admin. Admins can create additional users via `POST /api/admin/users`.

The MCP server also authenticates via a user's API token (passed as `TROVE_API_TOKEN` env var in the MCP config) to scope queries to the correct user.

### Error Response Format

All errors return a consistent JSON envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "URL is required"
  }
}
```

Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `DUPLICATE_URL`, `PLUGIN_ERROR`, `EXTRACTION_FAILED`, `UNAUTHORIZED`.

### Pagination

List endpoints use `page` (1-indexed) and `limit` (default 50, max 200). Response envelope:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 142,
    "totalPages": 3
  }
}
```

The MCP server uses `offset`/`limit` instead of `page`/`limit` for simpler programmatic access. Both query the same underlying data.

### Search

The `q` parameter triggers FTS search across `title`, `description`, and `content`. It does **not** search `url` or `domain` — use the `domain` filter parameter for domain-specific filtering. When `q` is present, each result includes a `snippet` field with highlighted matches.

### CORS

In production (Docker), the SPA and API are served from the same origin — no CORS needed. In development, Vite's dev server proxy handles API requests. No wildcard CORS headers are used.

### Rate Limiting

Write operations (`POST`, `PATCH`, `DELETE`) are rate-limited to 60 requests per minute per token. Authentication attempts are limited to 10 per minute per IP.

### Logging

Structured JSON logging via `pino` to stdout. In Docker, logs are captured by the container runtime. The `/health` endpoint returns uptime and link count for monitoring. All API requests are logged with method, path, status code, and duration.

---

## API Endpoints

### Links

```
GET    /api/links              # List/search/filter links
                               # Params: q, collection_id, tag, domain, status, source, page, limit
                               # When q is present: FTS search with snippets
POST   /api/links              # Create link (triggers async extraction)
GET    /api/links/:id          # Single link with full content
PATCH  /api/links/:id          # Update title, collection, tags, status
DELETE /api/links/:id          # Delete link
POST   /api/links/:id/archive  # Set status = 'archived'
POST   /api/links/:id/extract  # Retry content extraction
```

### Collections

```
GET    /api/collections        # List all collections with link counts
POST   /api/collections        # Create collection
PATCH  /api/collections/:id    # Update name, icon, colour
DELETE /api/collections/:id    # Delete collection (moves links to inbox)
```

### Tags

```
GET    /api/tags               # List all tags with counts
POST   /api/tags               # Create tag
PATCH  /api/tags/:id           # Rename tag
DELETE /api/tags/:id           # Delete tag (removes from all links via CASCADE)
```

### Plugins

```
GET    /api/plugins                       # List plugins with config status
GET    /api/plugins/:id/config            # Get plugin config
PUT    /api/plugins/:id/config            # Set plugin config
POST   /api/links/:id/actions/:pluginId   # Execute plugin action
POST   /api/plugins/:id/webhook           # Inbound webhook
```

### Admin (requires `is_admin = 1`)

```
GET    /api/admin/users        # List all users
POST   /api/admin/users        # Create user (returns generated API token)
DELETE /api/admin/users/:id    # Delete user and all their data
```

### User Profile

```
GET    /api/me                 # Current user profile
PATCH  /api/me                 # Update name, email
```

### Health

```
GET    /health                 # { status: "ok", links: <count> }
```

---

## Content Extraction

On every new link save, extraction runs asynchronously (fire-and-forget):

1. Link is created with `extraction_status = 'pending'`
2. Response returns immediately to the client
3. Extraction fetches the URL, runs Readability, extracts OG metadata
4. On success: updates link with title, description, content, favicon, image, domain; sets `extraction_status = 'completed'`
5. On failure: sets `extraction_status = 'failed'`

The UI shows extraction state and offers a "Retry" button for failed extractions, which calls `POST /api/links/:id/extract`.

Extraction uses `@mozilla/readability` + `jsdom`. Falls back to OG meta tags when Readability returns nothing useful. Favicon sourced from Google's favicon service.

- `TROVE_EXTRACTION_TIMEOUT_MS` (default 10000): abort fetch if the target URL does not respond within this time.
- `TROVE_MAX_CONTENT_LENGTH_CHARS` (default 50000): truncate extracted text content at this limit to prevent oversized DB rows.
- Things URL scheme values (`title`, `url`) must be `encodeURIComponent`-encoded to handle special characters.

---

## Frontend

### Visual Style

- **Light mode:** Warm light (`#fafaf8` background, warm greys, subtle card shadows). Notion/Apple Notes-inspired.
- **Dark mode:** Warm charcoal (`#1c1b1a` base, brownish-grey cards). Not pure black.
- **Switching:** Automatic via `prefers-color-scheme`. No manual toggle.
- **Typography:** System font stack (`system-ui, -apple-system, sans-serif`).
- **Density:** Compact, similar to Linear. Not a consumer app.

### Layout

- **Desktop (≥1024px):** Three columns — collection sidebar (left), link list (centre), detail panel (right, on click).
- **Tablet (768–1023px):** Sidebar collapses to hamburger. Detail panel becomes full-width overlay.
- **Mobile (<768px):** No visible sidebar (hamburger). Full-width link list. Detail view is full-screen overlay with back navigation.

### Components

| Component | Purpose |
|---|---|
| `SearchBar` | Live search, debounced 300ms, queries `/api/links?q=` |
| `AddLinkModal` | URL → extraction preview → edit title/collection/tags → save |
| `LinkCard` | Title, domain, relative time, tags, inline plugin action buttons |
| `LinkDetail` | Full extracted content, metadata, action history, retry button |
| `CollectionSidebar` | Collections with counts + virtual "Archive" entry + tags list |
| `CollectionManager` | Settings screen: CRUD for collections (name, emoji icon, hex colour) |
| `BulkActionBar` | Multi-select: assign collection, add tags, trigger plugin actions, archive |
| `PluginSettings` | Configure plugin API keys and settings |

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+K` | Focus search |
| `Cmd+N` | Open add modal |
| `Escape` | Close detail panel / modal |

---

## MCP Server

Separate stdio process that imports shared modules from `src/db/` and `src/services/` directly, reading the same SQLite database (WAL mode handles concurrent reads). The MCP server and HTTP server share code but run as independent processes.

The `add_link` and `execute_action` tools import the extraction service and plugin registry directly — they do not call back to the HTTP API. This means both processes must have access to the same DB file and the same code.

The MCP server authenticates via `TROVE_API_TOKEN` env var, which identifies the user. All queries are scoped to that user's data.

### Tools (7)

**`search_links`** — Full-text search with optional collection/tag filters

**`get_link`** — Single link by ID with full content

**`list_links`** — Paginated browse with filters (collection, tag, domain, limit, offset)

**`list_collections`** — All collections with counts

**`list_tags`** — All tags with counts

**`add_link`** — Save a new link (triggers async extraction)

**`execute_action`** — Run a plugin action on a link by plugin ID

### Claude Desktop / Claude Code Config

```json
{
  "mcpServers": {
    "trove": {
      "command": "bun",
      "args": ["/path/to/trove/src/mcp/server.ts"],
      "env": {
        "TROVE_DB_PATH": "/path/to/trove/data/trove.db",
        "TROVE_API_TOKEN": "your-user-api-token"
      }
    }
  }
}
```

---

## Deployment

### Docker

**`docker-compose.yml`** (clean, portable — no Traefik config):

```yaml
services:
  trove:
    build: .
    image: ghcr.io/jaydenk/trove:latest
    container_name: trove
    restart: unless-stopped
    ports:
      - "3737:3737"
    volumes:
      - ./data:/app/data
      - /etc/localtime:/etc/localtime:ro
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3737/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

**`docker-compose.override.example.yml`** (Traefik deployment template):

```yaml
services:
  trove:
    networks:
      - proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.trove.rule=Host(`trove.${HOSTNAME}`)"
      - "traefik.http.routers.trove.entrypoints=web-secure"
      - "traefik.http.routers.trove.tls.certresolver=myresolver"
      - "traefik.http.services.trove.loadbalancer.server.port=3737"
networks:
  proxy:
    external: true
```

### CI/CD (GitHub Actions → GHCR)

| Workflow | Trigger | Steps |
|---|---|---|
| `ci.yml` | Push to any branch, PRs | Lint, type-check, run tests |
| `release.yml` | Push to `main` | Build Docker image, push to `ghcr.io/jaydenk/trove:latest` + `ghcr.io/jaydenk/trove:<sha>` |

### Environment Variables

```bash
# Required
TROVE_DB_PATH=./data/trove.db
PORT=3737

# Seed (used by `bun run seed` to create the first admin user)
TROVE_ADMIN_TOKEN=your-admin-api-token

# Optional
TROVE_EXTRACTION_TIMEOUT_MS=10000
TROVE_MAX_CONTENT_LENGTH_CHARS=50000
```

Plugin-specific config (e.g., `READWISE_TOKEN`) is stored per-user in the `plugin_config` database table, managed via the settings UI. No integration tokens in env vars.

---

## Capture Methods

- **iOS Shortcut:** Share Sheet → POST to `/api/links` with auth header → "Saved to Trove" notification
- **Browser extension (Phase 4):** Manifest v3 popup, current tab pre-filled, collection picker, tag input, `Cmd+Shift+S`
- **Bookmarklet (Phase 4):** Single-line JS opening Trove add modal pre-filled with current page
- **n8n plugin webhook:** `POST /api/plugins/n8n/webhook` for batch ingest from Inoreader

---

## Build Phases

| Phase | Scope |
|---|---|
| **1 — Core** | Project scaffolding, CI/CD pipeline (GitHub Actions → GHCR), SQLite schema + migrations (including users table), user auth + admin API + seed command, Hono API (links CRUD, collections CRUD, tags — all user-scoped), content extraction with status tracking, React frontend (login, list, search, add modal, collection sidebar, detail panel), Docker Compose |
| **2 — Plugins & Integrations** | Plugin system + registry, Reader plugin, Things plugin, n8n ingest plugin, plugin config UI, iOS Shortcut |
| **3 — MCP** | MCP server with all 7 tools (including `execute_action`), Claude Desktop/Code config |
| **4 — Polish** | Browser extension, bulk actions, keyboard shortcuts, bookmarklet, responsive mobile layout |
