# Stash — Personal Link Library
## Claude Code Specification v1.0

---

## Overview

Stash is a self-hosted personal link library and routing tool. It is not a read-it-later app — Readwise Reader handles that role. Stash is a **permanent, searchable catalogue** of links, references, manuals, and saved resources, with the ability to route items outward to Reader or Things, and inward from RSS (via n8n) or the web. It also exposes an MCP server so Claude can query the library directly.

**Core use cases:**
1. Save a link from a browser or iOS and have it live in Stash permanently
2. Browse, search (by title or full text), filter, and tag saved links
3. Send a link from Stash to Readwise Reader (for reading) or Things (as a task)
4. Receive links from n8n via webhook (e.g. starred Inoreader articles)
5. Allow Claude to search and query Stash via MCP

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | **Bun** | Fast, TypeScript-native, built-in bundler |
| API framework | **Hono** | Lightweight, Bun-native, excellent TypeScript support |
| Database | **SQLite via Bun's built-in SQLite** | Zero extra services, fits homelab, FTS5 for full-text search |
| Frontend | **React (Vite)** | Single-page app, served by Hono as static files |
| Content extraction | **@mozilla/readability + node-fetch** | Same engine as Firefox Reader View |
| MCP server | **@modelcontextprotocol/sdk** | Official SDK, stdio transport |
| Deployment | **Docker Compose** | Consistent with existing homelab stack |
| Auth | **Single static API token** (env var) | Personal tool, Tailscale handles network security |

---

## Project Structure

```
stash/
├── src/
│   ├── server.ts           # Hono app entry point
│   ├── db/
│   │   ├── schema.ts       # SQLite schema + migrations
│   │   └── queries.ts      # All DB query functions
│   ├── routes/
│   │   ├── links.ts        # CRUD for links
│   │   ├── ingest.ts       # Webhook ingest endpoint (n8n)
│   │   ├── actions.ts      # Push to Reader / Things
│   │   └── search.ts       # Full-text search endpoint
│   ├── services/
│   │   ├── extractor.ts    # URL content + metadata extraction
│   │   ├── reader.ts       # Readwise Reader API integration
│   │   └── things.ts       # Things URL scheme builder
│   └── mcp/
│       └── server.ts       # MCP server (stdio transport)
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── LinkCard.tsx
│   │   │   ├── LinkDetail.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   ├── TagFilter.tsx
│   │   │   ├── CollectionFilter.tsx
│   │   │   └── AddLinkModal.tsx
│   │   └── hooks/
│   │       ├── useLinks.ts
│   │       └── useSearch.ts
│   └── index.html
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

---

## Database Schema

```sql
-- Links table
CREATE TABLE links (
  id          TEXT PRIMARY KEY,           -- nanoid
  url         TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT,
  content     TEXT,                       -- full extracted text (Readability)
  favicon_url TEXT,
  image_url   TEXT,                       -- og:image
  domain      TEXT,                       -- extracted from URL
  collection  TEXT DEFAULT 'inbox',       -- top-level grouping
  status      TEXT DEFAULT 'saved',       -- saved | archived
  source      TEXT DEFAULT 'manual',      -- manual | rss | webhook | extension
  source_feed TEXT,                       -- feed name if source=rss
  reader_sent INTEGER DEFAULT 0,          -- boolean, pushed to Reader
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- Tags (many-to-many)
CREATE TABLE tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE link_tags (
  link_id TEXT REFERENCES links(id) ON DELETE CASCADE,
  tag_id  TEXT REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (link_id, tag_id)
);

-- Collections (predefined groupings beyond just folders)
-- Examples: 'inbox', 'reference', 'tools', 'manuals', 'inspiration', 'archive'
CREATE TABLE collections (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  icon  TEXT,                 -- emoji or SF Symbol name
  color TEXT                  -- hex colour for UI
);

-- Full-text search virtual table
CREATE VIRTUAL TABLE links_fts USING fts5(
  id UNINDEXED,
  title,
  description,
  content,
  url UNINDEXED,
  domain UNINDEXED,
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

---

## API Endpoints

All endpoints require `Authorization: Bearer <STASH_API_TOKEN>` header except `/health`.

### Links

```
GET    /api/links                 # List links (with filtering, pagination)
POST   /api/links                 # Create a link (triggers extraction)
GET    /api/links/:id             # Get single link with full content
PATCH  /api/links/:id             # Update title, collection, tags, status
DELETE /api/links/:id             # Delete link

GET    /api/links?q=              # Search (delegates to FTS)
GET    /api/links?collection=     # Filter by collection
GET    /api/links?tag=            # Filter by tag
GET    /api/links?domain=         # Filter by domain
GET    /api/links?status=         # Filter by status (saved|archived)
GET    /api/links?source=         # Filter by source
GET    /api/links?page=&limit=    # Pagination (default limit: 50)
```

### Ingest (for n8n webhooks)

```
POST   /api/ingest                # Batch ingest from n8n
```

Request body:
```json
{
  "items": [
    {
      "url": "https://...",
      "title": "Optional override",
      "collection": "reference",
      "tags": ["rss", "tech"],
      "source": "rss",
      "source_feed": "Inoreader / Feed Name"
    }
  ]
}
```

### Search

```
GET    /api/search?q=&limit=      # Full-text search across title, description, content
```

Returns matches with highlighted snippets (SQLite FTS `snippet()` function).

### Actions

```
POST   /api/links/:id/send-to-reader   # Push to Readwise Reader
POST   /api/links/:id/send-to-things   # Generate Things URL and return it
POST   /api/links/:id/archive          # Move to archived status
```

**Send to Reader** calls the Readwise Reader Document API:
```
POST https://readwise.io/api/v3/save/
Authorization: Token <READWISE_TOKEN>
{ "url": "...", "tags": [...] }
```
Sets `reader_sent = 1` on the link and records the timestamp.

**Send to Things** returns a `things:///add` deep link:
```
things:///add?title={title}&notes={url}&tags=stash
```
On macOS this can be opened directly via `open` command. On iOS the frontend uses `window.location.href`.

### Collections & Tags

```
GET    /api/collections           # List all collections with counts
POST   /api/collections           # Create collection
GET    /api/tags                  # List all tags with counts
POST   /api/tags                  # Create tag
```

### Health

```
GET    /health                    # Returns { status: "ok", links: <count> }
```

---

## Content Extraction Service

On every new link save, run extraction asynchronously (don't block the response):

```typescript
// src/services/extractor.ts
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export async function extractContent(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Stash/1.0 (personal link library)' }
  });
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  return {
    title: article?.title ?? extractOgTitle(dom),
    description: article?.excerpt ?? extractOgDescription(dom),
    content: article?.textContent ?? '',
    image_url: extractOgImage(dom),
    favicon_url: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`,
    domain: new URL(url).hostname,
  };
}
```

Return the link immediately with the URL and a pending extraction status. Update the record once extraction completes. This means the UI shows the link instantly, with content populating shortly after.

---

## Frontend UI

Single-page React app. Visual style: clean, minimal, functional — not a consumer app. Similar density to Linear or a well-designed admin UI.

### Layout

```
┌─────────────────────────────────────────────────┐
│  🔗 Stash          [Search...........] [+ Add]  │
├──────────────┬──────────────────────────────────┤
│ Collections  │  [Sort: Date ▾] [Filters]        │
│              │                                   │
│ ○ Inbox (12) │  ┌─────────────────────────────┐ │
│ ○ Reference  │  │ Title of link               │ │
│ ○ Tools      │  │ domain.com · saved 2d ago   │ │
│ ○ Manuals    │  │ tag1  tag2                  │ │
│ ○ Archive    │  │ [→ Reader] [→ Things] [···] │ │
│              │  └─────────────────────────────┘ │
│ Tags         │  ┌─────────────────────────────┐ │
│ #rss         │  │ ...                         │ │
│ #tools       │  └─────────────────────────────┘ │
│ #reference   │                                   │
└──────────────┴──────────────────────────────────┘
```

### Key UI behaviours

- **Search** is live (debounced 300ms), queries `/api/search`, shows FTS snippets under each result
- **Add link modal**: URL field → triggers extraction preview → user can edit title, pick collection, add tags before saving
- **Link card actions**: inline buttons for → Reader and → Things. On macOS, → Things opens the URL directly. On iOS, opens via `window.location`.
- **Bulk actions**: select multiple links → assign collection, add tags, send to Reader, archive
- **Keyboard shortcut**: `Cmd+K` opens search; `Cmd+N` opens add modal
- **Link detail panel**: clicking a card opens a right-side panel showing extracted content, full metadata, and action history

---

## MCP Server

The MCP server runs as a separate process via stdio transport, connecting to the same SQLite database. It's registered in Claude's MCP config and allows Claude to query Stash directly during conversations.

```typescript
// src/mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'stash',
  version: '1.0.0',
});
```

### MCP Tools

**`search_links`** — Full-text search across title, description, and content
```typescript
server.tool('search_links', {
  query: z.string().describe('Search query'),
  limit: z.number().optional().default(10),
  collection: z.string().optional(),
  tag: z.string().optional(),
}, async ({ query, limit, collection, tag }) => {
  // Queries links_fts, returns matches with snippets
});
```

**`get_link`** — Retrieve a single link by ID with full content
```typescript
server.tool('get_link', {
  id: z.string(),
}, async ({ id }) => {
  // Returns full link record including extracted content
});
```

**`list_links`** — Browse links with filters
```typescript
server.tool('list_links', {
  collection: z.string().optional(),
  tag: z.string().optional(),
  domain: z.string().optional(),
  limit: z.number().optional().default(20),
  offset: z.number().optional().default(0),
}, async (params) => {
  // Returns paginated list
});
```

**`list_collections`** — Get all collections with counts
```typescript
server.tool('list_collections', {}, async () => {
  // Returns [{ name, count }]
});
```

**`list_tags`** — Get all tags with counts
```typescript
server.tool('list_tags', {}, async () => {
  // Returns [{ name, count }]
});
```

**`add_link`** — Save a new link (triggers extraction)
```typescript
server.tool('add_link', {
  url: z.string().url(),
  title: z.string().optional(),
  collection: z.string().optional().default('inbox'),
  tags: z.array(z.string()).optional(),
}, async (params) => {
  // Creates link, triggers async extraction, returns id
});
```

### Claude Desktop MCP Config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stash": {
      "command": "bun",
      "args": ["/path/to/stash/src/mcp/server.ts"],
      "env": {
        "STASH_DB_PATH": "/path/to/stash/data/stash.db"
      }
    }
  }
}
```

---

## Environment Variables

```bash
# .env
STASH_API_TOKEN=your-secret-token-here
STASH_DB_PATH=./data/stash.db
PORT=3737

# Integrations
READWISE_TOKEN=your-readwise-api-token

# Optional
STASH_EXTRACTION_TIMEOUT_MS=10000
STASH_MAX_CONTENT_LENGTH_CHARS=50000
```

---

## Docker Compose

```yaml
version: '3.8'

services:
  stash:
    build: .
    container_name: stash
    restart: unless-stopped
    ports:
      - "3737:3737"
    volumes:
      - ./data:/app/data
    env_file:
      - .env
    networks:
      - proxy  # Your existing Traefik network

networks:
  proxy:
    external: true
```

```dockerfile
FROM oven/bun:1

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build:frontend

EXPOSE 3737
CMD ["bun", "src/server.ts"]
```

---

## iOS Capture (Shortcut)

Rather than a custom iOS share extension, use an iOS Shortcut:

1. **Shortcut trigger**: Share Sheet → accepts URLs
2. **Action**: Get contents of URL → POST to `https://stash.your-tailscale-domain/api/links`
3. **Body**: `{ "url": "<shared URL>", "collection": "inbox", "source": "manual" }`
4. **Auth header**: `Authorization: Bearer <STASH_API_TOKEN>`
5. **On success**: show notification "Saved to Stash"

This appears in the iOS share sheet for any app that shares URLs (Safari, Reeder, etc.).

---

## Browser Extension (Minimal)

A simple manifest v3 extension with a single popup:

- **Popup**: shows current tab URL and title (pre-filled), collection picker, tag input, Save button
- **Keyboard shortcut**: `Cmd+Shift+S` to open popup
- **On save**: POST to Stash API, close popup
- Alternatively: use the **Stash web UI** directly for saving from a browser if extension complexity isn't warranted

---

## n8n Integration

Inoreader → Stash webhook flow:

1. **Inoreader rule**: when article is starred (or matches filter), trigger Inoreader webhook
2. **n8n workflow**: receives Inoreader webhook → transforms payload → POSTs to `/api/ingest`
3. **Payload mapping**:
   ```
   Inoreader article.url        → url
   Inoreader article.title      → title
   Inoreader feed.title         → source_feed
   "rss"                        → source
   (user-defined)               → collection, tags
   ```

This means you can set up Inoreader rules like "articles tagged `#save` → Stash inbox" or "anything from feed X → Stash / Reference" without touching the Stash app directly.

---

## Default Collections

Seed these on first run:

| Collection | Icon | Purpose |
|---|---|---|
| inbox | 📥 | Unprocessed saves |
| reference | 📚 | Things to keep and return to |
| tools | 🛠️ | Apps, services, utilities |
| manuals | 📖 | Docs, guides, how-tos |
| inspiration | ✨ | Design, photography, ideas |
| archive | 🗄️ | No longer active but preserved |

---

## Build Phases

**Phase 1 — Core (MVP)**
- SQLite schema + migrations
- Hono API: CRUD for links, collections, tags
- Content extraction service (async)
- React frontend: list, search, add modal, collection sidebar

**Phase 2 — Integrations**
- Send to Reader action
- Send to Things action
- `/api/ingest` webhook endpoint
- iOS Shortcut

**Phase 3 — MCP Server**
- MCP server with all 6 tools
- Claude Desktop config
- Test all tools end-to-end

**Phase 4 — Polish**
- Browser extension popup
- Bulk actions
- Keyboard shortcuts
- Link detail panel with full content view
- Docker Compose + Traefik labels

---

## Notes for Claude Code

- Use **Bun's native SQLite** (`import { Database } from 'bun:sqlite'`) — do not add a separate SQLite package
- FTS5 triggers must be created after the main table; run all DDL in a single migration function called on startup
- The MCP server process reads from the same SQLite file as the API server; SQLite's WAL mode handles concurrent reads safely — enable with `PRAGMA journal_mode=WAL`
- Content extraction should never block the POST /api/links response — use `Promise.resolve().then(() => extract(...))` to defer
- The frontend is served as static files from the Hono server at `/` — no separate server needed
- Things URL scheme on macOS: `open things:///add?...` via a redirect; on iOS return the URL to the frontend and use `window.location.href`
- All IDs should be nanoid (21 chars), not UUID — add `nanoid` as a dependency
