# User Guide

## Saving Links

Trove provides several ways to save links:

| Method | Description |
| --- | --- |
| **Web UI** | Click "Add Link" in the top bar, paste a URL |
| **Browser extension** | Click the toolbar icon or press `Cmd+Shift+L` / `Ctrl+Shift+L` |
| **Context menu** | Right-click any page or link and select "Save to Trove" |
| **Bookmarklet** | One-click save from the bookmarks bar (see [Bookmarklet](#bookmarklet) below) |
| **iOS Shortcut** | Save from the iOS Share Sheet (see [iOS Shortcut guide](ios-shortcut.md)) |
| **API** | `POST /api/links` with `{ "url": "..." }` (see [API Reference](api-reference.md)) |
| **MCP** | AI assistants can save links via the MCP server (see [MCP Server](mcp-server.md)) |
| **n8n Webhook** | Pipe links from automation workflows (see [Plugin Development](plugin-development.md)) |

When a link is saved, Trove automatically fetches the page and extracts the title, description, readable content, and favicon. If the link is saved via the browser extension, content is extracted from the rendered DOM — capturing JavaScript-rendered content and pages behind authentication.

## Collections

Collections are groups for organising your links. Each collection has a name, icon, and colour. Five default collections are created for each new user.

- **Viewing a collection** — click a collection in the left sidebar to filter links
- **Creating a collection** — go to Settings and use the collection manager
- **Editing a collection** — change the name, icon, or colour from the collection manager
- **Deleting a collection** — removes the collection and moves its links to the inbox

Every link belongs to exactly one collection. Links without a collection are placed in the inbox.

## Tags

Tags provide flexible cross-collection categorisation. A link can have any number of tags.

- **Adding tags** — add tags when saving a link (extension popup, Add Link modal) or edit them in the link detail panel
- **Filtering by tag** — click a tag in the left sidebar to show all links with that tag
- **Managing tags** — create, rename, or delete tags from Settings

Deleting a tag removes it from all linked items.

## Search

Trove uses SQLite FTS5 for full-text search across link titles, descriptions, and extracted content.

- **Basic search** — type in the search bar or press `/` to focus it
- **Prefix matching** — partial words match automatically (e.g. "prog" matches "programming")
- **Highlighted snippets** — search results show matching text excerpts
- **Combined filters** — search can be combined with collection, tag, domain, or status filters

Press `Cmd+K` or `/` to focus the search bar from anywhere in the app.

## Archive

Archiving moves a link out of your active view without deleting it.

- **Archiving** — click the archive button on a link card, or use bulk actions
- **Viewing archived links** — click "Archive" in the left sidebar
- **Difference from deleting** — archived links are preserved and searchable; deleted links are permanently removed

## Context Menu

Right-click any link card to open a context menu with quick actions:

- **Archive / Unarchive** — toggle the link's archived state
- **Delete** — permanently delete the link (with confirmation)
- **Plugin actions** — send to configured export plugins (e.g. "Send to Reader", "Send to Things")
- **Copy URL** — copy the link URL to your clipboard

## Link Detail Panel

Click a link (or press `o` / `Enter` on a focused link) to open the detail panel on the right side.

The detail panel shows:

- Title and URL (editable)
- Extracted description and readable content
- Collection assignment (changeable)
- Tags (editable)
- Plugin actions (e.g. Send to Reader, Send to Things)
- Action history

## Keyboard Shortcuts

The following shortcuts are available when no input field is focused:

| Key | Action |
| --- | --- |
| `/` | Focus the search bar |
| `Escape` | Clear selection / close detail panel |
| `j` | Move focus down in the link list |
| `k` | Move focus up in the link list |
| `o` | Open the focused link's detail panel |
| `Enter` | Open the focused link's detail panel |
| `x` | Toggle bulk selection on the focused link |
| `Cmd+K` | Focus the search bar |

## Bulk Actions

Select multiple links to perform actions in bulk:

1. Press `x` on a focused link to toggle its selection, or click the checkbox on a link card
2. A floating action bar appears at the bottom of the screen
3. Available bulk actions: **Archive**, **Delete**, **Move to Collection**

Press `Escape` to clear the selection.

## Import and Export

Trove supports importing and exporting your link library in three formats. Access import/export from **Settings**.

### Import Formats

| Format | Description |
| --- | --- |
| **HTML Bookmarks** | Standard Netscape bookmark format from Chrome, Firefox, Safari. Folder names become collections. |
| **CSV** | Header row required. `url` column required; `title`, `description`, `tags`, `collection` optional. |
| **JSON** | Trove's `{ links: [...] }` format or a plain array of objects with a `url` field. |

Duplicate URLs are silently skipped during import.

### Export Formats

| Format | Description |
| --- | --- |
| **JSON** | Pretty-printed Trove format with metadata, importable back into Trove |
| **CSV** | RFC 4180 compliant. Tags joined with semicolons. |
| **HTML Bookmarks** | Netscape format importable by any browser. Links grouped by collection. |

All three formats support round-trip: export and re-import preserves URLs, titles, collections, and timestamps.

## Bookmarklet

Save any page to Trove with one click using a browser bookmarklet. Create a new bookmark and set the URL to:

```
javascript:void(window.open('https://YOUR_TROVE_URL/?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'trove','width=600,height=500'))
```

Replace `YOUR_TROVE_URL` with your Trove instance URL. When clicked, it opens a popup with the Add Link modal pre-filled with the current page's URL and title.

## Dark Mode

Trove supports light, dark, and system colour schemes. Toggle the theme from **Settings > Appearance**. The preference is stored locally in the browser.
