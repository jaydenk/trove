# Trove Phase 1 — Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational Trove application — multi-user link library with CRUD, full-text search, content extraction, a React frontend, CI/CD, and Docker deployment.

**Architecture:** Bun + Hono API serving a React (Vite) SPA as static files. SQLite database with FTS5 for search. Multi-user with per-user API token auth. Content extraction runs async via fire-and-forget after link creation. Single Docker container for deployment.

**Tech Stack:** Bun, Hono, SQLite (bun:sqlite), React, Vite, Tailwind CSS, pino, nanoid, @mozilla/readability, jsdom, Docker, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-03-18-trove-design.md`

---

## File Map

### Backend (`src/`)

| File | Responsibility |
|---|---|
| `src/server.ts` | Hono app entry, mounts routes, serves static frontend, starts listening |
| `src/db/schema.ts` | SQLite DDL: all CREATE TABLE/INDEX/TRIGGER statements, migration runner |
| `src/db/connection.ts` | Opens SQLite DB, enables WAL + foreign keys, exports singleton |
| `src/db/queries/users.ts` | User CRUD: findByToken, create, list, delete, seedAdmin |
| `src/db/queries/links.ts` | Link CRUD: create, getById, list (with filters/FTS/pagination), update, delete, archive, updateExtraction |
| `src/db/queries/collections.ts` | Collection CRUD: create, list (with counts), update, delete, seedDefaults |
| `src/db/queries/tags.ts` | Tag CRUD: create, list (with counts), update, delete, addToLink, removeFromLink |
| `src/middleware/auth.ts` | Hono middleware: extracts Bearer token, looks up user, sets `c.set('user', user)`, returns 401 on failure |
| `src/middleware/logger.ts` | Hono middleware: pino request logging (method, path, status, duration) |
| `src/middleware/rateLimit.ts` | In-memory rate limiter: per-token for writes, per-IP for auth failures |
| `src/routes/links.ts` | Hono router: GET/POST/PATCH/DELETE /api/links, POST archive/extract |
| `src/routes/collections.ts` | Hono router: GET/POST/PATCH/DELETE /api/collections |
| `src/routes/tags.ts` | Hono router: GET/POST/PATCH/DELETE /api/tags |
| `src/routes/admin.ts` | Hono router: GET/POST/DELETE /api/admin/users (admin-only) |
| `src/routes/user.ts` | Hono router: GET/PATCH /api/me |
| `src/routes/health.ts` | Hono router: GET /health |
| `src/services/extractor.ts` | Fetches URL, runs Readability, extracts OG metadata, updates DB |
| `src/lib/id.ts` | Thin wrapper: `export const newId = () => nanoid()` |
| `src/lib/errors.ts` | Error classes + Hono error handler for consistent JSON error responses |
| `src/seed.ts` | CLI script: creates first admin user from TROVE_ADMIN_TOKEN env var |

### Frontend (`frontend/`)

| File | Responsibility |
|---|---|
| `frontend/index.html` | Vite entry HTML |
| `frontend/vite.config.ts` | Vite config: React plugin, proxy to Hono dev server, build output to `dist/` |
| `frontend/tailwind.config.ts` | Tailwind config: custom colours for warm light/dark theme |
| `frontend/src/main.tsx` | React entry: renders App |
| `frontend/src/App.tsx` | Root layout: sidebar + main + detail panel, router-like state |
| `frontend/src/api.ts` | API client: fetch wrapper with auth token, error handling, types |
| `frontend/src/components/SearchBar.tsx` | Live search input, debounced 300ms |
| `frontend/src/components/AddLinkModal.tsx` | Modal: URL input, extraction preview, collection/tag pickers, save |
| `frontend/src/components/LinkCard.tsx` | Card: title, domain, relative time, tags, action buttons |
| `frontend/src/components/LinkDetail.tsx` | Panel: full content, metadata, extraction status, retry button |
| `frontend/src/components/CollectionSidebar.tsx` | Sidebar: collections with counts, Archive virtual entry, tags list |
| `frontend/src/components/CollectionManager.tsx` | Settings screen: CRUD for collections |
| `frontend/src/components/LoginScreen.tsx` | Simple token input screen, stores token in localStorage |
| `frontend/src/hooks/useLinks.ts` | Hook: fetches links with filters, pagination, search |
| `frontend/src/hooks/useCollections.ts` | Hook: fetches collections with counts |
| `frontend/src/hooks/useTags.ts` | Hook: fetches tags with counts |

### Infrastructure

| File | Responsibility |
|---|---|
| `package.json` | Dependencies, scripts (dev, build, seed, test) |
| `tsconfig.json` | TypeScript config for backend |
| `frontend/tsconfig.json` | TypeScript config for frontend |
| `Dockerfile` | Build + runtime image |
| `docker-compose.yml` | Production compose (clean, no Traefik) |
| `docker-compose.override.example.yml` | Traefik labels template |
| `env.example` | Example environment variables |
| `.gitignore` | Ignores: node_modules, data/, dist/, .env, docker-compose.override.yml, TODO.md |
| `.github/workflows/ci.yml` | Lint, type-check, test on push/PR |
| `.github/workflows/release.yml` | Build + push Docker image to GHCR on push to main |
| `README.md` | Setup, usage, deployment docs |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/tailwind.config.ts`, `frontend/postcss.config.js`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css`, `.gitignore`, `env.example`, `TODO.md`

- [ ] **Step 1: Initialise git repository**

Run: `git init`

- [ ] **Step 2: Create root package.json with Bun/Hono/pino/nanoid/readability/jsdom dependencies and dev/build/seed/test scripts**

- [ ] **Step 3: Create root tsconfig.json targeting ESNext with bundler module resolution, strict mode, bun-types**

- [ ] **Step 4: Create .gitignore** (node_modules, dist, data, .env, docker-compose.override.yml, TODO.md, .superpowers, frontend/node_modules, frontend/dist)

- [ ] **Step 5: Create env.example** with TROVE_DB_PATH, PORT, TROVE_ADMIN_TOKEN, TROVE_EXTRACTION_TIMEOUT_MS, TROVE_MAX_CONTENT_LENGTH_CHARS

- [ ] **Step 6: Create frontend/package.json** with React 19, Vite 6, Tailwind CSS 4 (uses CSS-first `@theme` config — no `tailwind.config.ts`), TypeScript

- [ ] **Step 7: Create frontend/vite.config.ts** with React plugin and proxy to localhost:3737 for /api and /health

- [ ] **Step 8: Create frontend/tsconfig.json** targeting ESNext with react-jsx

- [ ] **Step 9: Configure Tailwind CSS 4 via CSS `@theme` directive**

Tailwind v4 uses CSS-first configuration — no `tailwind.config.ts` or `postcss.config.js` needed. Instead, define custom theme values in `frontend/src/index.css` using `@import "tailwindcss"` and `@theme { }` blocks for custom surface/dark colour palette (warm light #fafaf8 / warm charcoal #1c1b1a), system font stack. Dark mode is automatic via `prefers-color-scheme` in Tailwind v4.

- [ ] **Step 10: Create frontend entry files** (index.html, src/main.tsx with StrictMode, src/index.css with Tailwind directives, src/App.tsx placeholder)

- [ ] **Step 11: Install dependencies** (`bun install` in root and frontend/)

- [ ] **Step 12: Create TODO.md** with phase tasks (gitignored)

- [ ] **Step 13: Verify frontend dev server starts** (`cd frontend && bun run dev` — should serve on port 5173)

- [ ] **Step 14: Commit**

Message: `feat: project scaffolding with Bun, Hono, React, Vite, Tailwind`

---

## Task 2: CI/CD Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`

- [ ] **Step 1: Create CI workflow** (`.github/workflows/ci.yml`)

Triggers on push to any branch and PRs to main. Steps: checkout, setup-bun, install deps (`bun install && cd frontend && bun install`), type-check backend (`bun run lint`), type-check frontend (`cd frontend && npx tsc --noEmit`), run tests (`bun test`).

- [ ] **Step 2: Create release workflow** (`.github/workflows/release.yml`)

Triggers on push to main. Steps: checkout, login to GHCR, extract docker metadata (tags: latest + short SHA), build and push Docker image.

- [ ] **Step 3: Commit**

Message: `ci: add CI and release workflows for GHCR`

---

## Task 3: Database Layer

**Files:**
- Create: `src/lib/id.ts`, `src/db/connection.ts`, `src/db/schema.ts`, `src/db/queries/users.ts`, `src/db/queries/links.ts`, `src/db/queries/collections.ts`, `src/db/queries/tags.ts`
- Test: `src/db/__tests__/schema.test.ts`, `src/db/__tests__/users.test.ts`, `src/db/__tests__/links.test.ts`, `src/db/__tests__/collections.test.ts`, `src/db/__tests__/tags.test.ts`

- [ ] **Step 1: Create `src/lib/id.ts`** — thin wrapper exporting `newId()` using nanoid

- [ ] **Step 2: Create `src/db/connection.ts`**

Opens SQLite DB from TROVE_DB_PATH env var, enables WAL and foreign keys, runs migrations, exports singleton `getDb()`. Also exports `createTestDb()` that returns an in-memory DB with migrations applied (for tests).

- [ ] **Step 3: Create `src/db/schema.ts`**

Single `runMigrations(db)` function containing all DDL from the spec: users, links (with user_id FK, UNIQUE(user_id, url)), tags (with UNIQUE(user_id, name)), link_tags, collections (with UNIQUE(user_id, name)), link_actions (with CHECK constraint), plugin_config, links_fts virtual table, and all triggers (FTS sync: links_ai/au/ad, updated_at: links_updated_at). Uses `CREATE TABLE IF NOT EXISTS` for idempotency.

**Important: `collection_id` is nullable with `ON DELETE SET NULL`.** Since collection IDs are nanoids, a static default like `'inbox'` can't work. Instead, `collection_id = NULL` means "inbox" at the application layer. When creating a link without a collection, the API sets `collection_id` to the user's inbox collection ID. When a collection is deleted, the FK cascade sets `collection_id = NULL`, and the frontend/API treats these as inbox links.

- [ ] **Step 4: Write schema test** (`src/db/__tests__/schema.test.ts`)

Tests: creates all expected tables (users, links, tags, link_tags, collections, link_actions, plugin_config, links_fts), creates all expected triggers (links_ai, links_au, links_ad, links_updated_at), migrations are idempotent (running twice doesn't crash).

- [ ] **Step 5: Run schema test**

Run: `bun test src/db/__tests__/schema.test.ts`
Expected: PASS

- [ ] **Step 6: Create `src/db/queries/users.ts`**

Functions: `findByToken(db, token)`, `createUser(db, { name, email?, apiToken, isAdmin? })`, `listUsers(db)`, `deleteUser(db, id)`.

- [ ] **Step 7: Write users query tests** (`src/db/__tests__/users.test.ts`)

Tests: create user, find by token returns user, find by invalid token returns null, list users, delete user, duplicate token fails.

- [ ] **Step 8: Run users tests** — Expected: PASS

- [ ] **Step 9: Create `src/db/queries/collections.ts`**

Functions: `seedDefaultCollections(db, userId)` (creates 5 defaults), `listCollections(db, userId)` (with link counts via LEFT JOIN), `createCollection(db, userId, { name, icon?, color? })`, `updateCollection(db, userId, id, { name?, icon?, color? })`, `deleteCollection(db, userId, id)` (moves links to user's inbox collection ID).

- [ ] **Step 10: Write collections query tests** (`src/db/__tests__/collections.test.ts`)

Tests: seed creates 5 collections, list returns counts, create, update, delete moves links to inbox, duplicate name per user fails, different users can have same collection name.

- [ ] **Step 11: Run collections tests** — Expected: PASS

- [ ] **Step 12: Create `src/db/queries/links.ts`**

Functions: `createLink(db, userId, { url, title?, collectionId?, source?, sourceFeed? })`, `getLink(db, userId, id)` (includes tags via JOIN), `listLinks(db, userId, filters)` (handles q/FTS with snippet(), collection_id, tag, domain, status, source, page/limit — returns `{ data, pagination }`), `updateLink(db, userId, id, { title?, collectionId?, status? })`, `deleteLink(db, userId, id)`, `archiveLink(db, userId, id)`, `updateExtraction(db, linkId, data)` (updates content fields + extraction_status).

- [ ] **Step 13: Write links query tests** (`src/db/__tests__/links.test.ts`)

Tests: create returns link with pending extraction, get by id includes tags, list with pagination envelope, filter by collection_id, filter by status=archived, FTS search returns results with snippets, update, delete, archive sets status, duplicate URL per user fails (returns specific error), same URL different users succeeds, user A cannot see/get/update/delete user B's links.

- [ ] **Step 14: Run links tests** — Expected: PASS

- [ ] **Step 15: Create `src/db/queries/tags.ts`**

Functions: `createTag(db, userId, name)`, `listTags(db, userId)` (with link counts), `updateTag(db, userId, id, name)`, `deleteTag(db, userId, id)`, `addTagToLink(db, linkId, tagId)`, `removeTagFromLink(db, linkId, tagId)`, `getOrCreateTag(db, userId, name)`.

- [ ] **Step 16: Write tags query tests** (`src/db/__tests__/tags.test.ts`)

Tests: create, list with counts, rename, delete cascades from links, add/remove from link, getOrCreate returns existing, unique name per user.

- [ ] **Step 17: Run tags tests** — Expected: PASS

- [ ] **Step 18: Commit**

Message: `feat: database layer with schema, migrations, and query functions for all tables`

---

## Task 4: Auth, Middleware, Error Handling

**Files:**
- Create: `src/lib/errors.ts`, `src/middleware/auth.ts`, `src/middleware/logger.ts`, `src/middleware/rateLimit.ts`, `src/seed.ts`
- Test: `src/middleware/__tests__/auth.test.ts`, `src/__tests__/seed.test.ts`

- [ ] **Step 1: Create `src/lib/errors.ts`**

Error classes: `TroveError` (base with code, message, status), `NotFoundError` (404), `UnauthorizedError` (401), `ValidationError` (400), `DuplicateUrlError` (409).

- [ ] **Step 2: Create `src/middleware/auth.ts`**

Hono middleware: extracts `Authorization: Bearer <token>`, calls `findByToken(db, token)`, sets `c.set('user', user)`, returns 401 JSON error `{ error: { code: 'UNAUTHORIZED', message: 'Unauthorised' } }` if missing/invalid.

- [ ] **Step 3: Write auth middleware test** (`src/middleware/__tests__/auth.test.ts`)

Tests: valid token sets user on context, missing Authorization header returns 401, invalid token returns 401, malformed header (no Bearer prefix) returns 401.

- [ ] **Step 4: Run auth test** — Expected: PASS

- [ ] **Step 5: Create `src/middleware/logger.ts`** — pino-based request logger logging method, path, status code, response time in ms.

- [ ] **Step 6: Create `src/middleware/rateLimit.ts`** — in-memory rate limiter using a Map. 60 writes/min per token, 10 auth failures/min per IP. Sliding window with cleanup interval.

- [ ] **Step 7: Create `src/seed.ts`**

CLI script: reads TROVE_ADMIN_TOKEN from env, creates admin user (name: "Admin"), seeds default collections for that user, prints confirmation with the token. Skips if a user with that token already exists (idempotent).

- [ ] **Step 8: Write seed test** (`src/__tests__/seed.test.ts`)

Tests: creates admin user with is_admin=1, seeds 5 collections, idempotent (running twice doesn't crash or duplicate).

- [ ] **Step 9: Run seed test** — Expected: PASS

- [ ] **Step 10: Commit**

Message: `feat: auth middleware, error handling, rate limiting, logging, and seed command`

---

## Task 5: API Routes — Health, User Profile, Admin

**Files:**
- Create: `src/routes/health.ts`, `src/routes/user.ts`, `src/routes/admin.ts`
- Test: `src/routes/__tests__/health.test.ts`, `src/routes/__tests__/admin.test.ts`

- [ ] **Step 1: Create `src/routes/health.ts`** — GET /health returns `{ status: "ok", links: <count> }`, no auth required.

- [ ] **Step 2: Create `src/routes/user.ts`** — GET /api/me returns current user profile. PATCH /api/me updates name/email.

- [ ] **Step 3: Create `src/routes/admin.ts`** — Admin-only routes (checks `c.get('user').isAdmin`, returns 403 if false). GET /api/admin/users lists all. POST /api/admin/users creates user (generates nanoid token, seeds collections, returns token). DELETE /api/admin/users/:id deletes user (cannot delete self).

- [ ] **Step 4: Write health test** — Returns 200 with status ok, does not require auth.

- [ ] **Step 5: Write admin tests** — List users, create returns token, delete removes user data, non-admin gets 403, cannot delete self returns 400.

- [ ] **Step 6: Run tests** (`bun test src/routes/__tests__/`) — Expected: PASS

- [ ] **Step 7: Commit**

Message: `feat: health, user profile, and admin API routes`

---

## Task 6: API Routes — Collections

**Files:**
- Create: `src/routes/collections.ts`
- Test: `src/routes/__tests__/collections.test.ts`

- [ ] **Step 1: Create `src/routes/collections.ts`**

All queries scoped by `c.get('user').id`. GET list with counts, POST create (name required), PATCH update, DELETE moves links to inbox.

- [ ] **Step 2: Write tests** — List returns seeded collections with counts, create validates name required, update changes fields, delete moves links to inbox, cannot access another user's collection (404), duplicate name returns error.

- [ ] **Step 3: Run tests** — Expected: PASS

- [ ] **Step 4: Commit**

Message: `feat: collections CRUD API routes`

---

## Task 7: API Routes — Tags

**Files:**
- Create: `src/routes/tags.ts`
- Test: `src/routes/__tests__/tags.test.ts`

- [ ] **Step 1: Create `src/routes/tags.ts`** — GET list with counts, POST create, PATCH rename, DELETE (CASCADE).

- [ ] **Step 2: Write tests** — List, create, rename, delete removes from links, duplicate name returns error, user isolation.

- [ ] **Step 3: Run tests** — Expected: PASS

- [ ] **Step 4: Commit**

Message: `feat: tags CRUD API routes`

---

## Task 8: Content Extraction Service

**Files:**
- Create: `src/services/extractor.ts`
- Test: `src/services/__tests__/extractor.test.ts`

- [ ] **Step 1: Create `src/services/extractor.ts`**

Two exports:
1. `extractContent(url)` — fetches URL with timeout (TROVE_EXTRACTION_TIMEOUT_MS), parses with JSDOM + Readability, falls back to OG tags, truncates content at TROVE_MAX_CONTENT_LENGTH_CHARS, returns ExtractionResult `{ title, description, content, imageUrl, faviconUrl, domain }`.
2. `extractAndUpdate(db, linkId, url)` — fire-and-forget wrapper. Calls extractContent, updates link with results and extraction_status='completed'. On error, sets extraction_status='failed'. Returns void (no await needed by caller).

- [ ] **Step 2: Write tests** (`src/services/__tests__/extractor.test.ts`)

Tests: extracts title from HTML, falls back to OG tags when Readability returns null, truncates content at max length, returns correct domain, handles fetch timeout (mock with AbortController), handles invalid URL gracefully. Use `Bun.serve` to create a local test HTTP server for realistic tests.

- [ ] **Step 3: Run tests** — Expected: PASS

- [ ] **Step 4: Commit**

Message: `feat: content extraction service with Readability, OG fallback, and timeout`

---

## Task 9: API Routes — Links

**Files:**
- Create: `src/routes/links.ts`
- Test: `src/routes/__tests__/links.test.ts`

- [ ] **Step 1: Create `src/routes/links.ts`**

The main route file. Endpoints:
- GET /api/links — list with all filters (q triggers FTS with snippet(), collection_id, tag, domain, status, source, page, limit). Returns paginated envelope `{ data, pagination }`.
- POST /api/links — create `{ url, title?, collectionId?, tags?, source?, sourceFeed? }`. Validates URL format. Fires `extractAndUpdate` async. Returns link with extraction_status='pending'.
- GET /api/links/:id — single link with tags and full content.
- PATCH /api/links/:id — update title, collectionId, status. Accepts `tags` array to replace all tags (getOrCreate each).
- DELETE /api/links/:id — delete.
- POST /api/links/:id/archive — set status='archived'.
- POST /api/links/:id/extract — retry: reset extraction_status to 'pending', fire extractAndUpdate.

All scoped by user. 404 if link belongs to different user.

- [ ] **Step 2: Write tests** (`src/routes/__tests__/links.test.ts`)

Tests: create returns pending extraction, get includes tags, list pagination envelope, filter by collection_id, filter by status=archived, FTS search returns results (create links with known content, search for keywords), update changes fields, delete, archive, retry extract resets status, duplicate URL returns 409, user isolation (user A's links invisible to user B).

- [ ] **Step 3: Run tests** — Expected: PASS

- [ ] **Step 4: Commit**

Message: `feat: links CRUD API with FTS search, pagination, filtering, and async extraction`

---

## Task 10: Hono Server Assembly

**Files:**
- Create: `src/server.ts`
- Test: `src/__tests__/server.test.ts`

- [ ] **Step 1: Create `src/server.ts`**

Assembles the full Hono app:
- Global logger middleware
- Global error handler (catches TroveError, returns JSON envelope)
- Public route: /health (no auth)
- Protected routes under /api/*: rate limit middleware, auth middleware, then links/collections/tags/admin/user routers
- Static file serving: serves `frontend/dist/` for production, with SPA fallback to index.html
- Initialises DB on startup
- Exports Bun server config with port from PORT env var

- [ ] **Step 2: Write server integration test** (`src/__tests__/server.test.ts`)

Tests: health returns 200 without auth, /api/links returns 401 without auth, /api/links returns 200 with valid token, error handler returns correct JSON format.

- [ ] **Step 3: Run full test suite** (`bun test`) — Expected: All PASS

- [ ] **Step 4: Manual smoke test**

Start server (`bun run dev`), seed admin, test curl commands: health, auth, create link, list links, search.

- [ ] **Step 5: Commit**

Message: `feat: assemble Hono server with all routes, middleware, and static file serving`

---

## Task 11: Frontend — API Client and Auth

**Files:**
- Create: `frontend/src/api.ts`, `frontend/src/hooks/useAuth.ts`, `frontend/src/components/LoginScreen.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/src/api.ts`**

TypeScript type definitions for all API types (User, Link, Collection, Tag, PaginatedResponse, etc.). Fetch wrapper that reads token from localStorage, adds Authorization header, parses errors into typed ApiError class. Exports `api` object with typed functions for all endpoints (me, links.list/get/create/update/delete/archive/extract, collections.list/create/update/delete, tags.list/create/update/delete). Exports setToken/clearToken helpers.

- [ ] **Step 2: Create `frontend/src/hooks/useAuth.ts`**

Hook: checks localStorage for token, validates via `api.me()`, returns `{ user, isLoading, isAuthenticated, login(token), logout() }`. login() calls setToken and validates. logout() calls clearToken.

- [ ] **Step 3: Create `frontend/src/components/LoginScreen.tsx`**

Simple centred screen: "Trove" heading, token input field, "Connect" button. Calls login(), shows error on invalid token. Styled with the warm light/dark theme.

- [ ] **Step 4: Update `frontend/src/App.tsx`** — if not authenticated show LoginScreen, otherwise show main layout placeholder.

- [ ] **Step 5: Verify login flow** — Start both dev servers, navigate to localhost:5173, enter admin token, verify it loads past login.

- [ ] **Step 6: Commit**

Message: `feat: frontend API client, auth hook, and login screen`

---

## Task 12: Frontend — Collection Sidebar

**Files:**
- Create: `frontend/src/components/CollectionSidebar.tsx`, `frontend/src/hooks/useCollections.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/src/hooks/useCollections.ts`** — fetches via `api.collections.list()`, returns `{ collections, isLoading, refetch }`.

- [ ] **Step 2: Create `frontend/src/components/CollectionSidebar.tsx`**

Left sidebar (200px desktop, hidden on mobile behind hamburger): "Trove" header, collection list with emoji icon + name + count, "Archive" virtual entry at bottom (styled with muted colour), tags section below. Calls `onSelect(type: 'collection' | 'archive' | 'all', id?: string)`. Active item highlighted. Warm light/dark styling.

- [ ] **Step 3: Update App.tsx** — flex layout with sidebar on the left, main content area. Track selectedCollection state.

- [ ] **Step 4: Verify** — sidebar renders with seeded collections and correct counts.

- [ ] **Step 5: Commit**

Message: `feat: collection sidebar with counts and archive virtual entry`

---

## Task 13: Frontend — Link List and Link Card

**Files:**
- Create: `frontend/src/components/LinkCard.tsx`, `frontend/src/hooks/useLinks.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/src/hooks/useLinks.ts`** — fetches via `api.links.list(params)`, accepts filters `{ q?, collectionId?, tag?, status?, page? }`, returns `{ links, pagination, isLoading, refetch }`, re-fetches on filter change.

- [ ] **Step 2: Create `frontend/src/components/LinkCard.tsx`**

Card: favicon + title (clickable), domain + relative time, tag pills, extraction status indicator (spinner if pending, warning if failed). Warm card styling with subtle shadow (light) / dark-card bg (dark). Hover state.

- [ ] **Step 3: Update App.tsx** — main content shows vertical list of LinkCards filtered by sidebar selection. Pagination at bottom.

- [ ] **Step 4: Verify** — create links via curl, verify they render with correct collection filtering.

- [ ] **Step 5: Commit**

Message: `feat: link list with cards, filtering by collection, and pagination`

---

## Task 14: Frontend — Search

**Files:**
- Create: `frontend/src/components/SearchBar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/src/components/SearchBar.tsx`**

Input at top of main content. Debounced 300ms via setTimeout. When non-empty, passes `q` to useLinks. Shows snippet text below each LinkCard in search mode. Escape clears. Cmd+K focuses (document keydown listener).

- [ ] **Step 2: Wire into App.tsx** — search query flows into useLinks filters.

- [ ] **Step 3: Verify** — create links with content, search by keyword, verify results with snippets.

- [ ] **Step 4: Commit**

Message: `feat: live search with debounce, FTS snippets, and Cmd+K shortcut`

---

## Task 15: Frontend — Add Link Modal

**Files:**
- Create: `frontend/src/components/AddLinkModal.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/src/components/AddLinkModal.tsx`**

Modal overlay: URL input (autofocused). On submit: POST /api/links, then poll GET /api/links/:id every 1s until extraction completes/fails. Shows preview (title, description, favicon, domain). User can edit title, pick collection (dropdown), add tags (comma-separated input that creates pills). Save button PATCHes edits. Cancel deletes the created link.

- [ ] **Step 2: Wire into App.tsx** — "+ Add" button in top bar and Cmd+N shortcut open the modal. On save, refetch link list.

- [ ] **Step 3: Verify** — paste URL, wait for extraction preview, edit, save, verify in list.

- [ ] **Step 4: Commit**

Message: `feat: add link modal with extraction preview, collection picker, and tag input`

---

## Task 16: Frontend — Link Detail Panel

**Files:**
- Create: `frontend/src/components/LinkDetail.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/src/components/LinkDetail.tsx`**

Right panel (desktop: slides from right, min-width 400px) / full-screen overlay (mobile). Shows: title, URL (external link), domain, favicon, extraction status badge + retry button if failed, full extracted content as text, editable tags, editable collection dropdown, metadata (source, dates), archive button, delete button (with confirmation dialog). Closes on Escape.

- [ ] **Step 2: Wire into App.tsx** — clicking LinkCard sets selectedLinkId. Detail panel renders when set. Three-column layout on desktop: sidebar | list | detail.

- [ ] **Step 3: Verify** — click link, view content, edit tags, archive, delete.

- [ ] **Step 4: Commit**

Message: `feat: link detail panel with content view, editing, and actions`

---

## Task 17: Frontend — Collection Manager

**Files:**
- Create: `frontend/src/components/CollectionManager.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/src/components/CollectionManager.tsx`**

Settings screen: list of collections with icon, name, colour swatch. Inline edit (click to edit name, icon as emoji text input, colour as hex input). Add new button. Delete button with confirmation. Replaces main content area when active.

- [ ] **Step 2: Wire into App.tsx** — gear icon in sidebar toggles to CollectionManager view.

- [ ] **Step 3: Verify** — create collection, edit icon, delete one, verify links move to inbox.

- [ ] **Step 4: Commit**

Message: `feat: collection manager settings screen with CRUD`

---

## Task 18: Docker + README

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `docker-compose.override.example.yml`, `README.md`

- [ ] **Step 1: Create Dockerfile**

Single stage: `FROM oven/bun:1`, WORKDIR /app, copy and install root deps, copy and install frontend deps, copy all source, build frontend (`cd frontend && bun run build`), install curl for healthcheck (`apt-get install -y curl`), EXPOSE 3737, CMD `bun src/server.ts`.

- [ ] **Step 2: Create docker-compose.yml** — as spec: build + image, ports 3737, volumes for data + localtime, env_file, healthcheck using curl.

- [ ] **Step 3: Create docker-compose.override.example.yml** — Traefik labels template as spec.

- [ ] **Step 4: Create README.md** — what Trove is, quick start (Docker), development setup (bun install, seed, dev servers), environment variables, API overview, Traefik deployment.

- [ ] **Step 5: Verify Docker build and run**

Run: `docker compose build && docker compose up -d`
Then: `docker compose ps` (should show healthy), `curl http://localhost:3737/health` (should return ok).

- [ ] **Step 6: Commit**

Message: `feat: Docker deployment with healthcheck, compose files, and README`

---

## Task 19: Final Integration Test

- [ ] **Step 1: Run full test suite** (`bun test`) — Expected: All PASS

- [ ] **Step 2: End-to-end manual test**

Full flow in Docker:
1. `docker compose up -d --build`
2. Seed admin: `docker compose exec trove bun run seed`
3. Open http://localhost:3737 in Safari
4. Enter admin token, verify login
5. Verify sidebar shows 5 collections
6. Add a link via modal, wait for extraction
7. Search for the link by keyword
8. Open detail panel, verify content
9. Edit tags and collection
10. Archive the link, verify it appears under Archive
11. Create a new collection via manager
12. Test responsive layout (Safari responsive mode)

- [ ] **Step 3: Verify CI passes** — push to branch, check GitHub Actions

- [ ] **Step 4: Fix any issues found, commit**

- [ ] **Step 5: Merge to main, verify GHCR release**
