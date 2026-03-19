# Self-Hosting & Deployment

## Docker Compose

The simplest way to run Trove in production:

```bash
git clone https://github.com/jaydenk/TroveLinkManager.git
cd TroveLinkManager
cp env.example .env
# Edit .env — set TROVE_ADMIN_PASSWORD
docker compose up -d
docker compose exec trove bun run seed
```

The container exposes port 3737 and stores all data in `./data/`.

## Traefik Reverse Proxy

To deploy behind Traefik, copy the override template:

```bash
cp docker-compose.override.example.yml docker-compose.override.yml
```

Edit `docker-compose.override.yml` and set the hostname. The override file adds Traefik labels and connects the container to the external `proxy` network:

```yaml
services:
  trove:
    networks:
      - proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.trove.rule=Host(`trove.${HOSTNAME}`)"
      - "traefik.http.routers.trove.entrypoints=web-secure"
      - "traefik.http.routers.trove.tls.certresolver=myresolver"
      - "traefik.http.services.trove.loadbalancer.server.port=3737"
networks:
  proxy:
    external: true
```

Set `HOSTNAME` in your `.env` or replace the host rule directly. Then start as normal:

```bash
docker compose up -d
```

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `TROVE_DB_PATH` | Yes | `./data/trove.db` | Path to the SQLite database file |
| `PORT` | No | `3737` | Server listening port |
| `TROVE_ADMIN_PASSWORD` | Seed | — | Password for the admin user (used by `bun run seed`) |
| `TROVE_ADMIN_TOKEN` | Seed | — | **Deprecated.** Legacy raw API token (use `TROVE_ADMIN_PASSWORD` instead) |
| `TROVE_API_TOKEN` | MCP | — | User API token for the MCP server process |
| `TROVE_EXTRACTION_TIMEOUT_MS` | No | `10000` | Content extraction fetch timeout in milliseconds |
| `TROVE_MAX_CONTENT_LENGTH_CHARS` | No | `50000` | Maximum character length for stored page content |

## Database

Trove uses SQLite via Bun's built-in `bun:sqlite` driver with WAL mode and foreign keys enabled.

The database file is stored at the path specified by `TROVE_DB_PATH` (default `./data/trove.db`). The schema is applied automatically on first run.

### Backups

The database is a single file. To back up:

```bash
# While the container is running (SQLite WAL mode supports concurrent reads)
cp ./data/trove.db ./data/trove-backup-$(date +%Y%m%d).db
```

For automated backups, consider a cron job or use SQLite's `.backup` command:

```bash
docker compose exec trove sqlite3 /app/data/trove.db ".backup /app/data/backup.db"
```

Store backups off-server. Test restoring from a backup periodically.

## CI/CD

### Continuous Integration

Every push and pull request triggers the CI workflow (`.github/workflows/ci.yml`):

- Backend type-checking (`bun run lint`)
- Frontend type-checking (`npx tsc --noEmit`)
- Tests (`bun test`)

### Release

Pushes to `main` trigger the release workflow (`.github/workflows/release.yml`), which builds and pushes a Docker image to the GitHub Container Registry:

```
ghcr.io/jaydenk/trovelinkmanager:latest
ghcr.io/jaydenk/trovelinkmanager:<short-sha>
```

## Updating

To pull the latest image and restart:

```bash
docker compose pull
docker compose up -d
```

Database migrations are applied automatically on startup. Back up your database before updating.

## Health Check

The container includes a built-in health check that polls `GET /health` every 30 seconds. You can verify the health endpoint externally:

```bash
curl http://localhost:3737/health
```

Returns `{ "status": "ok", "links": <count> }`.
