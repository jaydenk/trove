# MCP Server

Trove includes a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets AI assistants interact with your link library. The server runs as a standalone process communicating over stdio.

## Setup for Claude Desktop

Add the following to your Claude Desktop MCP configuration at `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "trove": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/TroveLinkManager",
      "env": {
        "TROVE_API_TOKEN": "your-api-token",
        "TROVE_DB_PATH": "/path/to/TroveLinkManager/data/trove.db"
      }
    }
  }
}
```

Replace `/path/to/TroveLinkManager` with the absolute path to your Trove installation, and `your-api-token` with a valid API token.

## Setup for Claude Code

Add to your Claude Code MCP settings (`.claude/mcp.json`):

```json
{
  "mcpServers": {
    "trove": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/TroveLinkManager",
      "env": {
        "TROVE_API_TOKEN": "your-api-token",
        "TROVE_DB_PATH": "/path/to/TroveLinkManager/data/trove.db"
      }
    }
  }
}
```

## Available Tools

The MCP server exposes 7 tools:

### search_links

Full-text search across all saved links.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | `string` | Yes | Search query |
| `limit` | `number` | No | Max results (default 10) |
| `collection` | `string` | No | Filter by collection name |
| `tag` | `string` | No | Filter by tag name |

**Example:** "Search my links for articles about Rust programming"

### get_link

Get a single link by ID with full content and metadata.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes | The link ID |

**Example:** "Show me the full content of link abc123"

### list_links

Browse saved links with optional filters and pagination.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `collection` | `string` | No | Filter by collection name |
| `tag` | `string` | No | Filter by tag name |
| `domain` | `string` | No | Filter by domain |
| `limit` | `number` | No | Max results (default 20) |
| `offset` | `number` | No | Results to skip (default 0) |

**Example:** "List my recent links tagged 'design'"

### list_collections

List all collections with their link counts. Takes no parameters.

**Example:** "What collections do I have?"

### list_tags

List all tags with their link counts. Takes no parameters.

**Example:** "Show me all my tags"

### add_link

Save a new link to Trove. Content is extracted automatically in the background.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | `string` | Yes | The URL to save |
| `title` | `string` | No | Optional title override |
| `collection` | `string` | No | Collection name (defaults to inbox) |
| `tags` | `string[]` | No | Tags to apply |

**Example:** "Save this URL to my reading collection with the tag 'ai'"

### execute_action

Run a plugin action on a saved link (e.g. send to Readwise Reader or Things).

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `link_id` | `string` | Yes | The link ID to act on |
| `plugin_id` | `string` | Yes | The plugin ID to execute |

**Example:** "Send link abc123 to Readwise Reader"

## Troubleshooting

**"TROVE_API_TOKEN environment variable is not set"** — ensure the `env` block in your MCP config includes `TROVE_API_TOKEN` with a valid token.

**"TROVE_API_TOKEN is invalid"** — the token does not match any user. Check the token value or regenerate it from Settings in the Trove web UI.

**Server not connecting** — verify that `bun` is available in your PATH and that the `cwd` path is correct. The MCP server requires direct access to the SQLite database file specified by `TROVE_DB_PATH`.

**Plugin actions failing** — ensure the plugin is enabled for your user account and all required configuration fields are filled in (Settings > Plugins in the web UI).
