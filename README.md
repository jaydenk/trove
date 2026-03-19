# Trove

A self-hosted personal link library.

<!-- TODO: Add screenshot -->

## What is Trove?

Trove is a self-hosted web application for saving, organising, and searching web links. It extracts readable content and metadata automatically, supports full-text search, and provides a clean interface for browsing by collection, tag, or domain. Built with Bun, Hono, React, and SQLite — it runs as a single container with no external dependencies.

## Features

- **Collections and tags** for organising links with colour-coded icons
- **Full-text search** powered by SQLite FTS5 with highlighted snippets
- **Automatic content extraction** via Mozilla Readability with OpenGraph fallback
- **Browser extension** for Chrome and Safari (macOS + iOS) with DOM content capture
- **Declarative plugin system** — JSON manifests for extending Trove (Reader, Things, n8n shipped)
- **MCP server** for Claude integration (search, browse, save links)
- **Import/export** in HTML bookmarks, CSV, and JSON formats
- **Multi-user auth** with admin management, API tokens, and rate limiting
- **Keyboard shortcuts**, bulk actions, and responsive mobile layout
- **Real-time updates** via Server-Sent Events
- **Single-container Docker deployment** with CI/CD to GHCR

## Quick Start

```bash
git clone https://github.com/jaydenk/TroveLinkManager.git
cd TroveLinkManager
cp env.example .env
# Edit .env and set TROVE_ADMIN_PASSWORD
docker compose up -d
docker compose exec trove bun run seed
```

Open [http://localhost:3737](http://localhost:3737) and sign in with username `admin` and the password you set.

## Development

**Prerequisites:** [Bun](https://bun.sh) v1.0+

```bash
git clone https://github.com/jaydenk/TroveLinkManager.git
cd TroveLinkManager
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

Private — all rights reserved.
