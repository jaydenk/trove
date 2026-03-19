# API Reference

## Authentication

All API routes under `/api/*` require a Bearer token in the `Authorization` header, except for `POST /api/auth/login` and `GET /health` which are public.

```
Authorization: Bearer <your-api-token>
```

To obtain a token:

1. **Login** — `POST /api/auth/login` with username and password, which returns a token
2. **Seed** — the `bun run seed` command prints the admin user's token
3. **Settings** — view or regenerate your token from the Settings page in the web UI

## Error Format

All errors return a structured JSON body:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Not found"
  }
}
```

| Code | HTTP Status | Description |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid input |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `DUPLICATE_URL` | 409 | URL already exists for this user |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Pagination

List endpoints return paginated results with this envelope:

```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 123,
    "totalPages": 3
  }
}
```

## Endpoints

### Auth

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | No | Authenticate with username + password |

**POST /api/auth/login**

Request:

```json
{ "username": "admin", "password": "your-password" }
```

Response:

```json
{
  "token": "abc123...",
  "user": { "id": "...", "name": "...", "username": "admin", "email": null, "isAdmin": true }
}
```

Rate limited to 10 attempts per minute per IP.

---

### Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Returns status and link count |

---

### SSE Events

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/events` | Query param | Server-Sent Events stream for real-time link changes |

**GET /api/events?token=\<apiToken\>**

Authentication is via query parameter (EventSource does not support custom headers). The stream emits events filtered to the authenticated user:

| Event | Description |
| --- | --- |
| `link:created` | A new link was saved |
| `link:updated` | A link was modified |
| `link:deleted` | A link was removed |
| `link:archived` | A link was archived |

Each event includes `{ linkId, timestamp }` as JSON data. A heartbeat is sent every 30 seconds.

---

### User Profile

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/me` | Yes | Get current user (includes username) |
| `PATCH` | `/api/me` | Yes | Update name, email, username, or password |
| `POST` | `/api/me/regenerate-token` | Yes | Generate a new API token |

---

### Admin

Requires admin role.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/admin/users` | Admin | List all users (tokens excluded) |
| `POST` | `/api/admin/users` | Admin | Create user (returns token once) |
| `DELETE` | `/api/admin/users/:id` | Admin | Delete user and all related data |

---

### Links

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/links` | Yes | List links with pagination and filtering |
| `POST` | `/api/links` | Yes | Create link (triggers async content extraction) |
| `GET` | `/api/links/:id` | Yes | Get a single link with tags, content, and action history |
| `PATCH` | `/api/links/:id` | Yes | Update title, collection, status, or replace tags |
| `DELETE` | `/api/links/:id` | Yes | Delete link |
| `POST` | `/api/links/:id/archive` | Yes | Set link status to archived |
| `POST` | `/api/links/:id/extract` | Yes | Retry content extraction |
| `POST` | `/api/links/:id/actions/:pluginId` | Yes | Execute a plugin action on a link |

#### GET /api/links — Query Parameters

| Parameter | Default | Description |
| --- | --- | --- |
| `q` | — | Full-text search query (FTS5, returns snippets) |
| `collection_id` | — | Filter by collection ID |
| `tag` | — | Filter by tag name |
| `domain` | — | Filter by domain |
| `status` | — | Filter by status (`saved`, `archived`) |
| `source` | — | Filter by source (`manual`, `mcp`, `plugin:*`, etc.) |
| `page` | `1` | Page number |
| `limit` | `50` | Results per page (max 200) |

#### POST /api/links — Request Body

```json
{
  "url": "https://example.com",
  "title": "Optional title",
  "description": "Optional description",
  "content": "Optional pre-extracted content",
  "rawHtml": "Optional raw HTML",
  "collectionId": "optional-collection-id",
  "tags": ["tag1", "tag2"],
  "source": "manual",
  "sourceFeed": "optional-feed-url"
}
```

Only `url` is required. Returns `409` with `DUPLICATE_URL` if the URL already exists for the user.

When `content` is provided, server-side extraction is skipped — this is used by the browser extension to send pre-extracted DOM content.

#### PATCH /api/links/:id — Request Body

```json
{
  "title": "New title",
  "collectionId": "collection-id",
  "status": "saved",
  "tags": ["tag1", "tag2"]
}
```

All fields are optional. When `tags` is provided, it fully replaces the link's existing tags.

---

### Collections

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/collections` | Yes | List collections with link counts |
| `POST` | `/api/collections` | Yes | Create collection (name required, icon/colour optional) |
| `PATCH` | `/api/collections/:id` | Yes | Update name, icon, or colour |
| `DELETE` | `/api/collections/:id` | Yes | Delete collection (moves links to inbox first) |

---

### Tags

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/tags` | Yes | List tags with link counts |
| `POST` | `/api/tags` | Yes | Create tag (name required, unique per user) |
| `PATCH` | `/api/tags/:id` | Yes | Rename tag |
| `DELETE` | `/api/tags/:id` | Yes | Delete tag (removes from all linked items) |

---

### Plugins

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/plugins` | Yes | List all plugins with user's enabled state and config |
| `POST` | `/api/plugins` | Admin | Upload a new plugin manifest (JSON) |
| `DELETE` | `/api/plugins/:id` | Admin | Delete a non-system plugin |
| `PUT` | `/api/plugins/:id/enable` | Yes | Enable a plugin for the current user |
| `PUT` | `/api/plugins/:id/disable` | Yes | Disable a plugin for the current user |
| `GET` | `/api/plugins/:id/config` | Yes | Get plugin config and schema for current user |
| `PUT` | `/api/plugins/:id/config` | Yes | Set plugin config values |
| `POST` | `/api/plugins/:id/webhook` | Yes | Inbound webhook for ingest plugins |

**POST /api/plugins** — accepts a JSON plugin manifest body. Validates and stores the manifest. Admin only.

**PUT /api/plugins/:id/config** — accepts a flat `Record<string, string>` body. Returns the updated config.

**POST /api/plugins/:id/webhook** — accepts the plugin-specific ingest payload. Returns `{ created, skipped, errors }`.

**POST /api/links/:id/actions/:pluginId** — executes the plugin's action on the link and records the result. Returns `{ type: "success"|"redirect"|"error", message|url }`.

---

### Import / Export

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/import` | Yes | Import links from HTML, CSV, or JSON data |
| `GET` | `/api/export/json` | Yes | Export all links as JSON |
| `GET` | `/api/export/csv` | Yes | Export all links as CSV |
| `GET` | `/api/export/html` | Yes | Export all links as HTML bookmarks |

#### POST /api/import — Request Body

```json
{
  "format": "html",
  "data": "<!DOCTYPE NETSCAPE-Bookmark-file-1>..."
}
```

`format` must be `"html"`, `"csv"`, or `"json"`. `data` is the file contents as a string.

Response:

```json
{ "imported": 15, "skipped": 2, "errors": [] }
```

#### Export Endpoints

All export endpoints return the file with appropriate `Content-Type` and `Content-Disposition` headers for browser download.
