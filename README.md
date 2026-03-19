<p align="center">
  <img src="icon.png" alt="Trove" width="128" height="128">
</p>

# Trove

A self-hosted link inbox — save links from anywhere, route them to where they need to go.

<!-- TODO: Add screenshot -->

## What is Trove?

Trove is a self-hosted link inbox for people who save links from many sources and need to route them elsewhere. Save a link from your browser, phone, or RSS feed — then send it to Readwise Reader for reading, Things as a task, or any other tool via the plugin system. Trove sits in the middle: it captures, organises, and dispatches links so nothing falls through the cracks. Built with Bun, Hono, React, and SQLite — it runs as a single container with no external dependencies.

## Features

- **Save from anywhere** — browser extension (Chrome + Safari), iOS Shortcut, bookmarklet, API, webhooks
- **Route links outward** — declarative plugin system sends links to Reader, Things, Notion, or any HTTP API
- **Ingest links inward** — receive from n8n, RSS, Zapier, or any automation tool via webhooks
- **Collections and tags** for organising your link inbox
- **Full-text search** powered by SQLite FTS5 with prefix matching and highlighted snippets
- **Automatic content extraction** — browser extension captures rendered pages; server fallback for API saves
- **MCP server** for Claude integration — search, browse, and save links via 7 tools
- **Import/export** — HTML bookmarks, CSV, and JSON for portability
- **Multi-user** with username/password auth, admin management, and API tokens
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
- [User Guide](docs/user-guide.md) — saving links, collections, tags, search, keyboard shortcuts
- [Plugin Development](docs/plugin-development.md) — creating custom JSON plugin manifests
- [API Reference](docs/api-reference.md) — all endpoints, authentication, request/response formats
- [MCP Server](docs/mcp-server.md) — Claude integration setup and available tools
- [Browser Extension](docs/browser-extension.md) — Chrome and Safari installation and usage
- [Self-Hosting & Deployment](docs/self-hosting.md) — Docker, Traefik, environment variables, CI/CD

## Licence

[MIT](LICENCE)
