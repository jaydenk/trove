# Trove

Trove is a self-hosted personal link library for saving, organising, and searching web pages. It extracts readable content and metadata automatically, supports full-text search across your saved links, and provides a clean three-column interface for browsing by collection, tag, or domain. Built with Bun, Hono, React, and SQLite — it runs as a single container with no external dependencies.

## Features

- **Save and organise links** into collections with colour-coded icons
- **Automatic content extraction** via Mozilla Readability with OpenGraph fallback
- **Full-text search** powered by SQLite FTS5 with highlighted snippets
- **Tagging system** for flexible cross-collection categorisation
- **Archive support** to keep links without cluttering your active view
- **Filtering** by collection, tag, domain, status, or source
- **Import/export** bookmarks in HTML (Netscape), CSV, and JSON formats with round-trip support
- **Plugin system** for extending Trove with external services (Readwise Reader, Things, n8n)
- **MCP server** for AI assistant integration (search, browse, save links via Claude, etc.)
- **Multi-user** with token-based authentication and admin management
- **Rate limiting** on write operations (60 requests/minute per token)
- **Structured logging** via Pino with pretty-printing in development
- **Single-container deployment** with Docker and healthcheck support
- **Bulk actions** for archiving, deleting, and moving multiple links at once
- **Keyboard shortcuts** for navigation (j/k), search (/), and selection (x)
- **Bookmarklet** for saving links from any page in one click
- **Responsive UI** built with React 19, Tailwind CSS 4, and Vite 6 with mobile-optimised layout

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Backend:** [Hono](https://hono.dev) (TypeScript)
- **Frontend:** React 19 + Vite 6 + Tailwind CSS 4
- **Database:** SQLite via `bun:sqlite` (WAL mode, FTS5)

## Quick Start with Docker

1. Clone the repository and create your environment file:

   ```bash
   git clone https://github.com/jaydenk/TroveLinkManager.git
   cd TroveLinkManager
   cp env.example .env
   ```

2. Edit `.env` and set a secure admin token:

   ```
   TROVE_ADMIN_TOKEN=your-secure-token-here
   ```

3. Start the container:

   ```bash
   docker compose up -d
   ```

4. Seed the admin user:

   ```bash
   docker compose exec trove bun run seed
   ```

5. Open your browser at [http://localhost:3737](http://localhost:3737) and log in with the token you set in `.env`.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later

### Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/jaydenk/TroveLinkManager.git
   cd TroveLinkManager
   ```

2. Install dependencies:

   ```bash
   bun install
   cd frontend && bun install && cd ..
   ```

3. Create your environment file:

   ```bash
   cp env.example .env
   ```

4. Seed the admin user:

   ```bash
   TROVE_ADMIN_TOKEN=your-secure-token bun run seed
   ```

5. Start the backend (with hot reload):

   ```bash
   bun run dev
   ```

6. In a separate terminal, start the frontend dev server (Vite on port 5173, proxies API requests to port 3737):

   ```bash
   bun run dev:frontend
   ```

### Available Scripts

| Script                 | Description                        |
| ---------------------- | ---------------------------------- |
| `bun run dev`          | Start backend with hot reload      |
| `bun run dev:frontend` | Start Vite frontend dev server     |
| `bun run build:frontend` | Build frontend for production   |
| `bun run seed`         | Create the first admin user        |
| `bun run test`         | Run tests                          |
| `bun run lint`         | Type-check with TypeScript         |
| `bun run start`        | Start backend (production)         |
| `bun run mcp`          | Start MCP server (stdio transport) |

## Environment Variables

| Variable                         | Required | Default          | Description                                       |
| -------------------------------- | -------- | ---------------- | ------------------------------------------------- |
| `TROVE_DB_PATH`                  | Yes      | `./data/trove.db`| Path to the SQLite database file                  |
| `PORT`                           | No       | `3737`           | Server listening port                             |
| `TROVE_ADMIN_TOKEN`              | Seed     | —                | Token for the admin user (used by `bun run seed`) |
| `TROVE_API_TOKEN`                | MCP      | —                | User API token for the MCP server process         |
| `TROVE_EXTRACTION_TIMEOUT_MS`    | No       | `10000`          | Content extraction fetch timeout in milliseconds  |
| `TROVE_MAX_CONTENT_LENGTH_CHARS` | No       | `50000`          | Maximum character length for stored page content  |

## API Endpoints

All API routes (under `/api/*`) require a `Authorization: Bearer <token>` header. The health endpoint is public.

### Health

| Method | Path      | Auth | Description                   |
| ------ | --------- | ---- | ----------------------------- |
| GET    | `/health` | No   | Returns status and link count |

### User Profile

| Method | Path      | Auth | Description              |
| ------ | --------- | ---- | ------------------------ |
| GET    | `/api/me` | Yes  | Get current user         |
| PATCH  | `/api/me` | Yes  | Update name and/or email |

### Admin (requires admin role)

| Method | Path                   | Auth  | Description                      |
| ------ | ---------------------- | ----- | -------------------------------- |
| GET    | `/api/admin/users`     | Admin | List all users (tokens excluded) |
| POST   | `/api/admin/users`     | Admin | Create user (returns token once) |
| DELETE | `/api/admin/users/:id` | Admin | Delete user and all related data |

### Collections

| Method | Path                   | Auth | Description                                            |
| ------ | ---------------------- | ---- | ------------------------------------------------------ |
| GET    | `/api/collections`     | Yes  | List collections with link counts                      |
| POST   | `/api/collections`     | Yes  | Create collection (name required, icon/colour optional)|
| PATCH  | `/api/collections/:id` | Yes  | Update collection name, icon, or colour                |
| DELETE | `/api/collections/:id` | Yes  | Delete collection (moves links to inbox first)         |

### Tags

| Method | Path            | Auth | Description                                     |
| ------ | --------------- | ---- | ----------------------------------------------- |
| GET    | `/api/tags`     | Yes  | List tags with link counts                      |
| POST   | `/api/tags`     | Yes  | Create tag (name required, unique per user)     |
| PATCH  | `/api/tags/:id` | Yes  | Rename tag                                      |
| DELETE | `/api/tags/:id` | Yes  | Delete tag (cascades removal from linked items) |

### Links

| Method | Path                     | Auth | Description                                            |
| ------ | ------------------------ | ---- | ------------------------------------------------------ |
| GET    | `/api/links`             | Yes  | List links with pagination and filtering               |
| POST   | `/api/links`             | Yes  | Create link (triggers async content extraction)        |
| GET    | `/api/links/:id`         | Yes  | Get a single link with tags, content, and action history |
| PATCH  | `/api/links/:id`         | Yes  | Update link title, collection, status, or replace tags |
| DELETE | `/api/links/:id`         | Yes  | Delete link                                            |
| POST   | `/api/links/:id/archive` | Yes  | Set link status to archived                            |
| POST   | `/api/links/:id/extract` | Yes  | Retry content extraction                               |
| POST   | `/api/links/:id/actions/:pluginId` | Yes | Execute a plugin action on a link              |

**GET /api/links query parameters:**

| Parameter       | Default | Description                                     |
| --------------- | ------- | ----------------------------------------------- |
| `q`             | —       | Full-text search query (FTS5, returns snippets) |
| `collection_id` | —       | Filter by collection ID                         |
| `tag`           | —       | Filter by tag name                              |
| `domain`        | —       | Filter by domain                                |
| `status`        | —       | Filter by status (`saved`, `archived`)          |
| `source`        | —       | Filter by source (`manual`, etc.)               |
| `page`          | 1       | Page number                                     |
| `limit`         | 50      | Results per page (max 200)                      |

**POST /api/links** accepts `{ url, title?, collectionId?, tags?: string[], source?, sourceFeed? }`. Returns `409` with `DUPLICATE_URL` if the URL already exists for the user.

### Plugins

| Method | Path                              | Auth | Description                                      |
| ------ | --------------------------------- | ---- | ------------------------------------------------ |
| GET    | `/api/plugins`                    | Yes  | List registered plugins with config status       |
| GET    | `/api/plugins/:id/config`         | Yes  | Get plugin config and schema for current user    |
| PUT    | `/api/plugins/:id/config`         | Yes  | Set plugin config values                         |
| POST   | `/api/plugins/:id/webhook`        | Yes  | Inbound webhook for ingest plugins (e.g. n8n)   |

**PUT /api/plugins/:id/config** accepts a flat `Record<string, string>` body. Returns the updated config.

**POST /api/plugins/:id/webhook** accepts the plugin-specific ingest payload. Returns `{ created, skipped, errors }`.

**POST /api/links/:id/actions/:pluginId** executes the plugin's action on the specified link and records the result. Returns the `PluginResult` (`{ type: "success"|"redirect"|"error", message|url }`).

### Import / Export

| Method | Path                | Auth | Description                                          |
| ------ | ------------------- | ---- | ---------------------------------------------------- |
| POST   | `/api/import`       | Yes  | Import links from HTML bookmarks, CSV, or JSON data  |
| GET    | `/api/export/json`  | Yes  | Export all links as JSON (attachment download)        |
| GET    | `/api/export/csv`   | Yes  | Export all links as CSV (attachment download)         |
| GET    | `/api/export/html`  | Yes  | Export all links as HTML bookmarks (attachment download) |

**POST /api/import** accepts `{ format: "html"|"csv"|"json", data: "file contents as string" }`. Returns `{ imported: number, skipped: number, errors: string[] }`. Duplicate URLs are silently skipped and counted in the `skipped` field. Collection names from the import data are matched to existing collections; unmatched collections default to inbox.

**GET /api/export/*** endpoints return the exported file with appropriate `Content-Type` and `Content-Disposition` headers for browser download.

**Response envelope:**

```json
{
  "data": [ ... ],
  "pagination": { "page": 1, "limit": 50, "total": 123, "totalPages": 3 }
}
```

### Error Responses

All errors return a structured JSON body:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Not found"
  }
}
```

Error codes: `NOT_FOUND` (404), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `VALIDATION_ERROR` (400), `DUPLICATE_URL` (409), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

## Deployment with Traefik

To deploy behind a Traefik reverse proxy, copy the override example and adjust the hostname:

```bash
cp docker-compose.override.example.yml docker-compose.override.yml
```

Edit `docker-compose.override.yml` and set the `HOSTNAME` variable in your `.env` or replace the host rule directly. Then start as normal:

```bash
docker compose up -d
```

The override file adds Traefik labels and connects the container to the external `proxy` network.

## Content Extraction

When a link is created, Trove asynchronously fetches the page and extracts readable content using [Mozilla Readability](https://github.com/mozilla/readability). If Readability cannot parse the page (e.g. minimal HTML without article structure), it falls back to OpenGraph meta tags (`og:title`, `og:description`, `og:image`).

Favicons are resolved via Google's favicon service. Extracted content is truncated to a configurable maximum length (see environment variables above).

## Import and Export

Trove supports importing and exporting your link library in three formats:

### Import Formats

- **HTML Bookmarks** — standard Netscape bookmark format exported by Chrome, Firefox, and Safari. Folder names become collections, `ADD_DATE` timestamps are preserved, and Firefox `TAGS` attributes are imported.
- **CSV** — comma-separated values with a header row. Required column: `url`. Optional columns: `title`, `description`, `tags` (comma-separated), `collection`.
- **JSON** — either Trove's own `{ links: [...] }` format or a plain JSON array of objects. Each item must have a `url` field; `title`, `description`, `tags`, `collection`, and `createdAt` are optional.

### Export Formats

- **JSON** — pretty-printed Trove format with `exportedAt` timestamp and version, importable back into Trove.
- **CSV** — RFC 4180 compliant with proper quoting. Tags are joined with semicolons to avoid CSV comma ambiguity.
- **HTML Bookmarks** — Netscape bookmark format importable by any browser. Links are grouped by collection as folders.

All three formats support round-trip: exporting and re-importing preserves URLs, titles, collections, and timestamps.

## Plugin System

Trove includes a plugin system that lets you extend link management with external services. Plugins can provide two capabilities:

- **Execute actions** — perform an operation on a saved link (e.g. send it to a read-later service or create a task). These appear as action buttons on link cards and in the detail panel.
- **Ingest links** — receive links from external automation tools via webhook, automatically saving them to Trove with tags and collection assignment.

Plugins are configured per-user through the **Plugin Settings** screen in the UI (accessible from the sidebar). Each plugin defines its own configuration schema — fill in the required fields to activate a plugin for your account.

### Shipped Plugins

#### Readwise Reader

Sends a link to [Readwise Reader](https://readwise.io/read) for reading later. Tags from Trove are forwarded to Reader automatically.

**Configuration:**

| Field              | Required | Description                                                                 |
| ------------------ | -------- | --------------------------------------------------------------------------- |
| `READWISE_TOKEN`   | Yes      | Your Readwise API token (find it at https://readwise.io/access_token)       |

**Action:** Click the Reader button on any link to send it to your Reader library.

#### Things

Creates a task in [Things](https://culturedcode.com/things/) from a link. The link title becomes the task name and the URL is added to the task notes, tagged with `trove`. This plugin uses the Things URL scheme, so it works on macOS and iOS where Things is installed.

**Configuration:** None required — this plugin works without any API keys.

**Action:** Click the Things button on any link to open Things with a pre-filled task.

#### n8n Webhook

Receives links from [n8n](https://n8n.io) automation workflows via a webhook endpoint. Use this to pipe RSS feeds, email newsletters, or any other n8n data source into Trove.

**Configuration:** None required.

**Webhook endpoint:** `POST /api/plugins/n8n/webhook`

**Authentication:** The webhook requires a Bearer token in the `Authorization` header, the same as all other API endpoints. The links are created under the user account that owns the token.

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

All fields except `url` are optional. The `collection` field matches by name — if no matching collection is found, the link goes to the inbox. Duplicate URLs are silently skipped.

**Response:**

```json
{
  "created": 2,
  "skipped": 1,
  "errors": []
}
```

## MCP Server

Trove includes a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets AI assistants (Claude, etc.) interact with your link library directly. The server runs as a standalone process communicating over stdio.

### Setup

Set the `TROVE_API_TOKEN` environment variable to a valid user API token, then start the server:

```bash
TROVE_API_TOKEN=your-token TROVE_DB_PATH=./data/trove.db bun run mcp
```

### Available Tools

| Tool               | Description                                                |
| ------------------ | ---------------------------------------------------------- |
| `search_links`     | Full-text search across saved links                        |
| `get_link`         | Get a single link by ID with full content and metadata     |
| `list_links`       | Browse links with filters (collection, tag, domain)        |
| `list_collections` | List all collections with link counts                      |
| `list_tags`        | List all tags with link counts                             |
| `add_link`         | Save a new link with optional collection and tags          |
| `execute_action`   | Run a plugin action on a link (e.g. send to Reader/Things) |

### Claude Desktop Configuration

Add the following to your Claude Desktop MCP settings (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "trove": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/TroveLinkManager",
      "env": {
        "TROVE_API_TOKEN": "your-token",
        "TROVE_DB_PATH": "/path/to/TroveLinkManager/data/trove.db"
      }
    }
  }
}
```

## Capture Methods

Trove supports several ways to save links:

- **Web UI** — use the "Add Link" button in the top bar to paste a URL manually.
- **Bookmarklet** — drag the bookmarklet to your bookmarks bar to save links in one click from any page (see [Bookmarklet](#bookmarklet) below).
- **API** — `POST /api/links` with `{ "url": "..." }` from any HTTP client, script, or automation tool.
- **n8n Webhook** — pipe links from n8n workflows via `POST /api/plugins/n8n/webhook` (see [n8n Webhook plugin](#n8n-webhook) above).
- **iOS Shortcut** — save links directly from the iOS Share Sheet. See the [iOS Shortcut setup guide](docs/ios-shortcut.md) for step-by-step instructions.
- **Browser Extension** — Chrome and Safari extension with popup, context menu, and keyboard shortcut (see [Browser Extension](#browser-extension) below).
- **MCP** — AI assistants can search, browse, and save links via the MCP server (see [MCP Server](#mcp-server) above).

## Browser Extension

Trove includes a cross-platform browser extension (Chrome + Safari) for saving links directly from any page. The extension lives in `extension/shared/` and uses Manifest V3 with vanilla HTML/CSS/JS — no build step required.

### Features

- **Popup** — click the toolbar icon (or press `Cmd+Shift+L` / `Ctrl+Shift+L`) to save the current page with a title, collection, and tags.
- **Context menu** — right-click any page or link and select "Save to Trove".
- **Badge feedback** — green "OK" badge on success, red "!" on error.
- **Options page** — configure your Trove server URL and API token with a connection test.

### Chrome Installation

1. Open `chrome://extensions/` and enable Developer mode.
2. Click "Load unpacked" and select the `extension/shared/` directory.
3. Click the extension icon, then open Settings to enter your server URL and API token.

### Safari Installation

Safari requires wrapping the extension in an Xcode project using `xcrun safari-web-extension-converter`. See [extension/safari/README.md](extension/safari/README.md) for full build instructions covering both macOS and iOS.

For detailed setup guides covering all platforms, see the [extension documentation](extension/README.md).

## Bookmarklet

Save any page to Trove with one click using a browser bookmarklet. Create a new bookmark in your browser and set the URL to:

```
javascript:void(window.open('https://YOUR_TROVE_URL/?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'trove','width=600,height=500'))
```

Replace `YOUR_TROVE_URL` with the URL of your Trove instance (e.g. `trove.example.com`). When clicked, it opens a small popup with the Add Link modal pre-filled with the current page's URL and title.

The bookmarklet works by passing `url` and `title` query parameters to Trove. If you are already logged in, the Add Link modal opens immediately. If not, you will be prompted to log in first.

## Keyboard Shortcuts

The following keyboard shortcuts are available when no input field is focused:

| Key     | Action                                    |
| ------- | ----------------------------------------- |
| `/`     | Focus the search bar                      |
| `Escape`| Clear selection / close detail panel      |
| `j`     | Move focus down in the link list          |
| `k`     | Move focus up in the link list            |
| `o`     | Open the focused link's detail panel      |
| `Enter` | Open the focused link's detail panel      |
| `x`     | Toggle bulk selection on the focused link |
| `⌘K`    | Focus the search bar                      |

## CI/CD

### Continuous Integration

Every push and pull request triggers the CI workflow (`.github/workflows/ci.yml`), which runs:

- Backend type-checking (`bun run lint`)
- Frontend type-checking (`npx tsc --noEmit`)
- Tests (`bun test`)

### Release

Pushes to `main` trigger the release workflow (`.github/workflows/release.yml`), which builds and pushes a Docker image to the GitHub Container Registry at `ghcr.io/jaydenk/trovelinkmanager`.

Images are tagged with `latest` and the short commit SHA.

## Project Structure

```
TroveLinkManager/
├── src/
│   ├── lib/
│   │   ├── id.ts             # nanoid wrapper for ID generation
│   │   └── errors.ts         # Error classes (TroveError, NotFoundError, etc.)
│   ├── middleware/
│   │   ├── auth.ts           # Bearer token authentication middleware
│   │   ├── logger.ts         # Pino-based request logging middleware
│   │   └── rateLimit.ts      # In-memory sliding-window rate limiter
│   ├── routes/
│   │   ├── health.ts         # GET /health — status and link count
│   │   ├── user.ts           # GET/PATCH /api/me — user profile
│   │   ├── admin.ts          # Admin-only user management routes
│   │   ├── collections.ts    # Collection CRUD routes
│   │   ├── tags.ts           # Tag CRUD routes
│   │   ├── links.ts          # Link CRUD, search, archive, extraction routes
│   │   ├── importExport.ts   # Import/export routes (HTML, CSV, JSON)
│   │   ├── plugins.ts        # Plugin config, actions, and webhook routes
│   │   └── __tests__/        # Route-level tests
│   ├── plugins/
│   │   ├── index.ts          # Barrel file that registers all shipped plugins
│   │   ├── types.ts          # Plugin system type definitions (TrovePlugin, PluginInfo, etc.)
│   │   ├── registry.ts       # Plugin registry (register, lookup, list, config status)
│   │   ├── reader.ts         # Readwise Reader plugin (send links for reading later)
│   │   ├── things.ts         # Things plugin (create tasks via URL scheme)
│   │   ├── n8n.ts            # n8n webhook ingest plugin (receive links from n8n workflows)
│   │   └── __tests__/        # Plugin-level tests
│   ├── mcp/
│   │   ├── server.ts         # MCP server (stdio transport, 7 tools)
│   │   └── __tests__/        # MCP tool logic tests
│   ├── services/
│   │   ├── extractor.ts      # Content extraction (Readability + OG fallback)
│   │   ├── importer.ts       # Import parsers (HTML bookmarks, CSV, JSON)
│   │   ├── exporter.ts       # Export generators (JSON, CSV, HTML bookmarks)
│   │   └── __tests__/        # Service-level tests
│   ├── server.ts             # Hono app assembly, route mounting, static file serving
│   ├── seed.ts               # CLI script to create the first admin user
│   └── db/
│       ├── connection.ts     # SQLite connection (singleton + test helper)
│       ├── schema.ts         # DDL migrations (WAL, FK, FTS5)
│       └── queries/
│           ├── users.ts      # User CRUD + token lookup
│           ├── collections.ts# Collection CRUD + default seeding
│           ├── links.ts      # Link CRUD, FTS search, pagination
│           ├── tags.ts       # Tag CRUD + link tagging
│           ├── pluginConfig.ts  # Per-user plugin configuration storage
│           └── linkActions.ts   # Plugin action log (record + list)
├── frontend/                 # React + Vite frontend
│   ├── src/
│   │   ├── api.ts            # Typed API client with fetch wrapper
│   │   ├── hooks/
│   │   │   ├── useAuth.ts         # Auth state hook (token validation, login/logout)
│   │   │   ├── useCollections.ts  # Fetches collections from the API
│   │   │   ├── useLinks.ts        # Fetches paginated/filtered links from the API
│   │   │   ├── usePlugins.ts      # Fetches registered plugins from the API
│   │   │   └── useTags.ts         # Fetches tags from the API
│   │   ├── components/
│   │   │   ├── LoginScreen.tsx         # Token login screen
│   │   │   ├── CollectionSidebar.tsx   # Left sidebar with collections, archive, and tags
│   │   │   ├── CollectionManager.tsx   # Settings view for CRUD management of collections
│   │   │   ├── SearchBar.tsx           # Debounced search input with Cmd+K shortcut
│   │   │   ├── LinkCard.tsx            # Link list item with favicon, title, domain, tags, plugin actions
│   │   │   ├── LinkDetail.tsx          # Right-side detail panel with editing, plugin actions, and history
│   │   │   ├── PluginSettings.tsx      # Plugin configuration screen with per-user settings
│   │   │   ├── ImportExportSettings.tsx # Import/export UI with file upload and download
│   │   │   ├── AddLinkModal.tsx        # Modal for adding links with extraction preview and bookmarklet support
│   │   │   ├── BulkActionBar.tsx      # Floating bar for bulk archive, delete, and move actions
│   │   │   └── MobileNav.tsx          # Top nav bar for mobile screens with hamburger menu
│   │   ├── App.tsx           # Root component with three-column layout
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   └── vite.config.ts
├── extension/                # Browser extension (Chrome + Safari)
│   └── shared/
│       ├── manifest.json     # Manifest V3 extension config
│       ├── background.js     # Service worker (context menu + badge)
│       ├── lib/
│       │   └── api.js        # Trove API client with storage-based config
│       ├── popup/            # Toolbar popup (save link with collection + tags)
│       ├── options/          # Settings page (server URL + API token)
│       └── icons/            # Extension icons (16, 48, 128px)
├── Dockerfile                # Single-stage Bun-based container build
├── docker-compose.yml        # Portable compose file (no Traefik)
├── docker-compose.override.example.yml  # Traefik deployment template
├── data/                     # SQLite database (gitignored)
├── env.example
├── package.json
└── tsconfig.json
```

## Database

Trove uses SQLite via Bun's built-in `bun:sqlite` driver with WAL mode and foreign keys enabled. The schema includes:

- **users** — API token-based authentication
- **links** — Saved URLs with metadata, FTS5 full-text search
- **collections** — User-defined groupings (5 defaults seeded per user)
- **tags** / **link_tags** — Many-to-many tagging
- **link_actions** — Plugin action log
- **plugin_config** — Per-user plugin settings

Set `TROVE_DB_PATH` in your `.env` to configure the database file location.

## Licence

Private — all rights reserved.
