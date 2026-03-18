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
│   │   └── id.ts             # nanoid wrapper for ID generation
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
