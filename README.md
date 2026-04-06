<p align="center">
  <img src="icon.png" alt="Trove" width="128" height="128">
</p>

# Trove

A self-hosted link inbox — save links from anywhere, route them to where they need to go.

<!-- TODO: Add screenshot -->

## What is Trove?

Trove is a self-hosted link inbox for people who save links from many sources and need to route them elsewhere. Save a link from your browser, phone, or RSS feed — then send it to Readwise Reader for reading, Things as a task, or any other tool via the plugin system. Trove sits in the middle: it captures, organises, and dispatches links so nothing falls through the cracks. Built with Bun, Hono, React, and SQLite — it runs as a single container with no external dependencies.

## Features

- **Save from anywhere** — browser extension (Chrome + Safari), iOS share extension, bookmarklet, API, webhooks
- **Triage mode** — focused card-by-card flow for rapid inbox processing with keyboard shortcuts (`T` to enter, `1`-`9` for plugins, `A` archive, `D` delete, `S` skip)
- **Route links outward** — declarative plugin system sends links to Reader, Things, Notion, or any HTTP API
- **Ingest links inward** — receive from n8n, RSS, Zapier, or any automation tool via webhooks
- **Collections and tags** — organise your link inbox with collections (inbox default, archive virtual entry) and tags (hidden when empty, sidebar filtering)
- **Full-text search** — SQLite FTS5 with prefix matching and highlighted snippets
- **Bulk actions** — Select button, long-press on mobile, Select All, keyboard shortcut (`x`), move/archive/delete
- **Customisable swipe actions** — two-tier swipe on mobile (partial reveal shows two actions, full swipe triggers outer action)
- **Sort order toggle** — switch between newest-first and oldest-first, persisted per user
- **Right-click context menu** — archive, delete, send to plugin, or copy URL on desktop
- **Automatic content extraction** — browser extension captures rendered DOM; server fallback for API saves
- **Smart import/export** — auto-detects HTML bookmarks, JSON (any structure), CSV/TSV, or plain text; preview and select items before importing; include/exclude tags
- **Expanded view** — switch between condensed (default) and expanded layouts in Appearance settings; expanded shows a 2-line text excerpt and optional image thumbnails
- **Dark mode** — light, dark, or system theme in Appearance settings
- **PWA** — install Trove as a standalone app via Safari's "Add to Dock" (macOS) or "Add to Home Screen" (iOS)
- **MCP server** — Claude integration via 7 tools for search, browse, and save
- **Multi-user** — username/password auth, admin management, API tokens
- **Keyboard shortcuts** — full navigation, actions, and triage mode from the keyboard
- **Single-container Docker deployment** with CI/CD to GHCR

## Quick Start

```bash
git clone https://github.com/jaydenk/trove.git
cd trove
cp env.example .env
# Edit .env and set TROVE_ADMIN_PASSWORD
docker compose up -d
docker compose exec trove bun run seed
```

Open [http://localhost:3737](http://localhost:3737) and sign in with username `admin` and the password you set.

## Development

**Prerequisites:** [Bun](https://bun.sh) v1.0+

```bash
git clone https://github.com/jaydenk/trove.git
cd trove
bun install && cd frontend && bun install && cd ..
cp env.example .env
TROVE_ADMIN_PASSWORD=your-password bun run seed
bun run dev              # Backend (port 3737)
bun run dev:frontend     # Frontend (port 5173, proxies to backend)
```

## Documentation

Full documentation is available in the [`docs/`](docs/) directory:

- [Getting Started](docs/getting-started.md) — installation, first login, initial setup
- [User Guide](docs/user-guide.md) — saving links, collections, tags, search, triage mode, keyboard shortcuts
- [Plugin Development](docs/plugin-development.md) — creating custom JSON plugin manifests
- [API Reference](docs/api-reference.md) — all endpoints, authentication, request/response formats
- [MCP Server](docs/mcp-server.md) — Claude integration setup and available tools
- [Browser Extension](docs/browser-extension.md) — Chrome and Safari installation and usage
- [Self-Hosting & Deployment](docs/self-hosting.md) — Docker, Traefik, environment variables, CI/CD

## Releases

### 1.2.2

- Fix triage mode showing "All done!" after processing a single link (refetch failed silently when already on page 1)
- Fix triage mode only loading the first 20 links instead of the full inbox — now loads all remaining pages on entry
- Remove duplicate mobile header during triage mode (MobileNav was rendering above TriageMode's own header)
- Centre section heading in mobile navigation bar
- Replace dense checklist select icon with a cleaner outlined checkbox
- Lowercase "archive" collection name for consistency with user-defined collections

### 1.2.1

- Fix description text overflowing horizontally on Safari mobile
- Fix swipe container height inflation on Safari (position: relative + overflow: hidden sizing bug)
- Fix loading flash and scroll position reset during infinite scroll pagination
- Add memory limits to Docker container

### 1.2.0

- Plugin health checks — plugins can define a `healthCheck` block to verify external service connectivity
- Plugin test button — test plugin execution from settings without affecting real links
- Dropdown config fields — plugins can define `options` arrays for config values
- New shipped plugins: Obsidian and Reminders
- Template engine enhancements: array interpolation, filter chaining, default filter

### 1.1.0

- Bump to project CLAUDE.md

### 1.0.0

- Infinite scroll replacing pagination
- Triage mode for rapid inbox processing with keyboard shortcuts
- PWA support (Add to Dock / Add to Home Screen)
- Expanded view with text excerpts and image thumbnails
- Dark mode (light, dark, system)
- Full-text search with FTS5 and highlighted snippets
- Bulk actions (select, archive, delete, move)
- Two-tier customisable swipe actions on mobile
- Sort order toggle (newest/oldest first)
- Right-click context menu on desktop
- Plugin system with Reader and Things plugins
- Browser extensions (Chrome + Safari)
- MCP server for Claude integration
- Multi-user auth with API tokens
- Single-container Docker deployment with CI/CD to GHCR

## Licence

[MIT](LICENCE)
