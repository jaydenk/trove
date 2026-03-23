# Trove — Project Instructions

## Versioning

Current version: **1.2.0**

Version is defined in both `package.json` (root) and `frontend/package.json`. Both must be updated together. The frontend reads the version at build time via Vite's `define` (see `frontend/vite.config.ts`).

Versioning scheme (semver):
- **Bug fixes:** increment patch — `1.1.x` (e.g. 1.1.0 → 1.1.1)
- **New features:** increment minor — `1.x.0` (e.g. 1.1.0 → 1.2.0)
- **Breaking changes:** increment major — `x.0.0`

When committing a version bump, update both `package.json` files in the same commit.

## Tech Stack

- **Backend:** Bun runtime, Hono HTTP framework, SQLite (with FTS5 full-text search)
- **Frontend:** React 18, TypeScript, Tailwind CSS, Vite
- **Browser Extensions:** Chrome and Safari
- **Deployment:** Single Docker container via Docker Compose
- **CI/CD:** GitHub Actions → GHCR (multi-arch: AMD64 + ARM64)

## Key Architecture Decisions

- **Plugin system** is declarative JSON manifests, not code-based. Three execute types: `api-call`, `url-redirect`, `file-write`. Template interpolation with `{{link.*}}` and `{{config.*}}` variables.
- **Preferences** are stored server-side in `user_preferences` table (key-value per user). The API returns snake_case keys but the frontend `api.request()` wrapper runs `cameliseKeys()` — always use camelCase when reading preference values in frontend code.
- **Infinite scroll** replaces pagination. The `useLinks` hook accumulates results with `loadMore`/`hasMore`. `IntersectionObserver` sentinel triggers loading 200px before viewport end, 20 links per batch.
- **SSE** provides real-time updates. Data is refetched on reconnection and tab visibility change.

## Running

```bash
# Development
bun run dev              # Backend (port 3737)
cd frontend && bun run dev  # Frontend (port 5173, proxies /api to 3737)

# Docker
docker compose up -d --build

# Tests
bun test                 # Backend tests (from root)
cd frontend && npx tsc --noEmit  # Frontend type check
```

## Testing

Tests use `bun:test`. Backend tests are in `src/**/__tests__/`. No frontend component tests — verify UI changes via build + manual testing or Playwright.
