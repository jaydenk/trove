# Trove

A self-hosted personal link library web application.

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Backend:** [Hono](https://hono.dev) (TypeScript)
- **Frontend:** React 19 + Vite 6 + Tailwind CSS 4
- **Database:** SQLite via `bun:sqlite`

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later

### Setup

1. Clone the repository
2. Copy the example environment file and configure it:
   ```bash
   cp env.example .env
   ```
3. Install dependencies:
   ```bash
   bun install
   cd frontend && bun install
   ```

### Development

Start the backend server (with hot reload):

```bash
bun run dev
```

Start the frontend dev server (Vite on port 5173, proxies API requests to port 3737):

```bash
bun run dev:frontend
```

### Available Scripts

| Script              | Description                              |
| ------------------- | ---------------------------------------- |
| `bun run dev`       | Start backend with hot reload            |
| `bun run dev:frontend` | Start Vite frontend dev server        |
| `bun run build:frontend` | Build frontend for production       |
| `bun run seed`      | Create the first admin user              |
| `bun run test`      | Run tests                                |
| `bun run lint`      | Type-check with TypeScript               |
| `bun run start`     | Start backend (production)               |

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
│   │   └── __tests__/        # Route-level tests
│   ├── seed.ts               # CLI script to create the first admin user
│   └── db/
│       ├── connection.ts     # SQLite connection (singleton + test helper)
│       ├── schema.ts         # DDL migrations (WAL, FK, FTS5)
│       ├── queries/
│       │   ├── users.ts      # User CRUD + token lookup
│       │   ├── collections.ts# Collection CRUD + default seeding
│       │   ├── links.ts      # Link CRUD, FTS search, pagination
│       │   └── tags.ts       # Tag CRUD + link tagging
│       └── __tests__/        # Database layer tests
├── frontend/                 # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   └── vite.config.ts
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

## Authentication and Middleware

### Authentication

All API routes are protected by Bearer token authentication. Include an `Authorization: Bearer <token>` header with every request. Tokens are stored in the `users` table and looked up on each request.

### Seeding the Admin User

Before using the API, create the first admin user:

```bash
TROVE_ADMIN_TOKEN=your-secure-token bun run seed
```

This is idempotent — running it again with the same token will not create duplicates.

### Rate Limiting

Write operations (POST, PATCH, DELETE, PUT) are rate-limited to **60 requests per minute** per API token using an in-memory sliding window. Exceeding the limit returns a `429 Too Many Requests` response.

### Request Logging

All requests are logged via [Pino](https://getpino.io/) with method, path, status code, and response duration. In development, logs are pretty-printed via `pino-pretty`.

### Error Handling

The API returns structured JSON errors:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Not found"
  }
}
```

Error codes: `NOT_FOUND` (404), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `VALIDATION_ERROR` (400), `DUPLICATE_URL` (409), `RATE_LIMITED` (429).

## API Endpoints

### Health

| Method | Path      | Auth | Description                    |
| ------ | --------- | ---- | ------------------------------ |
| GET    | `/health` | No   | Returns status and link count  |

### User Profile

| Method | Path      | Auth | Description            |
| ------ | --------- | ---- | ---------------------- |
| GET    | `/api/me` | Yes  | Get current user       |
| PATCH  | `/api/me` | Yes  | Update name and/or email |

### Admin (requires admin)

| Method | Path                    | Auth  | Description                              |
| ------ | ----------------------- | ----- | ---------------------------------------- |
| GET    | `/api/admin/users`      | Admin | List all users (tokens excluded)         |
| POST   | `/api/admin/users`      | Admin | Create user (returns token once)         |
| DELETE  | `/api/admin/users/:id` | Admin | Delete user and all related data         |

### Collections

| Method | Path                      | Auth | Description                                              |
| ------ | ------------------------- | ---- | -------------------------------------------------------- |
| GET    | `/api/collections`        | Yes  | List collections with link counts                        |
| POST   | `/api/collections`        | Yes  | Create collection (name required, icon/colour optional)  |
| PATCH  | `/api/collections/:id`    | Yes  | Update collection name, icon, or colour                  |
| DELETE | `/api/collections/:id`    | Yes  | Delete collection (moves links to inbox first)           |

## CI/CD

### Continuous Integration

Every push and pull request triggers the CI workflow (`.github/workflows/ci.yml`), which runs:

- Backend type-checking (`bun run lint`)
- Frontend type-checking (`npx tsc --noEmit`)
- Tests (`bun test`)

### Release

Pushes to `main` trigger the release workflow (`.github/workflows/release.yml`), which builds and pushes a Docker image to the GitHub Container Registry at `ghcr.io/jaydenk/trovelinkmanager`.

Images are tagged with `latest` and the short commit SHA.

## Licence

Private — all rights reserved.
