# Trove

Trove is a self-hosted personal link library for saving, organising, and searching web pages. It extracts readable content and metadata automatically, supports full-text search across your saved links, and provides a clean three-column interface for browsing by collection, tag, or domain. Built with Bun, Hono, React, and SQLite — it runs as a single container with no external dependencies.

## Features

- **Save and organise links** into collections with colour-coded icons
- **Automatic content extraction** via Mozilla Readability with OpenGraph fallback
- **Full-text search** powered by SQLite FTS5 with highlighted snippets
- **Tagging system** for flexible cross-collection categorisation
- **Archive support** to keep links without cluttering your active view
- **Filtering** by collection, tag, domain, status, or source
- **Multi-user** with token-based authentication and admin management
- **Rate limiting** on write operations (60 requests/minute per token)
- **Structured logging** via Pino with pretty-printing in development
- **Single-container deployment** with Docker and healthcheck support
- **Responsive UI** built with React 19, Tailwind CSS 4, and Vite 6

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

## Environment Variables

| Variable                         | Required | Default          | Description                                       |
| -------------------------------- | -------- | ---------------- | ------------------------------------------------- |
| `TROVE_DB_PATH`                  | Yes      | `./data/trove.db`| Path to the SQLite database file                  |
| `PORT`                           | No       | `3737`           | Server listening port                             |
| `TROVE_ADMIN_TOKEN`              | Seed     | —                | Token for the admin user (used by `bun run seed`) |
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
| GET    | `/api/links/:id`         | Yes  | Get a single link with tags and full content           |
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
│   │   ├── plugins.ts        # Plugin config, actions, and webhook routes
│   │   └── __tests__/        # Route-level tests
│   ├── plugins/
│   │   ├── types.ts          # Plugin system type definitions (TrovePlugin, PluginInfo, etc.)
│   │   ├── registry.ts       # Plugin registry (register, lookup, list, config status)
│   │   ├── reader.ts         # Readwise Reader plugin (send links for reading later)
│   │   ├── things.ts         # Things plugin (create tasks via URL scheme)
│   │   ├── n8n.ts            # n8n webhook ingest plugin (receive links from n8n workflows)
│   │   └── __tests__/        # Plugin-level tests
│   ├── services/
│   │   ├── extractor.ts      # Content extraction (Readability + OG fallback)
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
│   │   │   └── useTags.ts         # Fetches tags from the API
│   │   ├── components/
│   │   │   ├── LoginScreen.tsx         # Token login screen
│   │   │   ├── CollectionSidebar.tsx   # Left sidebar with collections, archive, and tags
│   │   │   ├── CollectionManager.tsx   # Settings view for CRUD management of collections
│   │   │   ├── SearchBar.tsx           # Debounced search input with Cmd+K shortcut
│   │   │   ├── LinkCard.tsx            # Link list item with favicon, title, domain, tags
│   │   │   ├── LinkDetail.tsx          # Right-side detail panel with editing and actions
│   │   │   └── AddLinkModal.tsx        # Modal for adding links with extraction preview
│   │   ├── App.tsx           # Root component with three-column layout
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   └── vite.config.ts
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
