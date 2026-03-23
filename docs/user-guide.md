# User Guide

## Saving Links

Trove provides several ways to save links:

| Method | Description |
| --- | --- |
| **Web UI** | Click the **Add** button in the top bar, paste a URL |
| **Browser extension** | Click the toolbar icon or press `Cmd+Shift+L` / `Ctrl+Shift+L` |
| **Context menu** | Right-click any page or link and select "Save to Trove" (desktop browsers) |
| **iOS share extension** | Save from the iOS Share Sheet via the Safari extension (see [Browser Extension](browser-extension.md)) |
| **Bookmarklet** | One-click save from the bookmarks bar (see [Bookmarklet](#bookmarklet) below) |
| **API** | `POST /api/links` with `{ "url": "..." }` (see [API Reference](api-reference.md)) |
| **Webhooks** | Pipe links from automation workflows via ingest plugins (see [Plugin Development](plugin-development.md)) |
| **MCP** | AI assistants can save links via the MCP server (see [MCP Server](mcp-server.md)) |

When a link is saved, Trove automatically fetches the page and extracts the title, description, readable content, and favicon. If the link is saved via the browser extension, content is extracted from the rendered DOM — capturing JavaScript-rendered content and pages behind authentication.

## Collections

Collections are groups for organising your links. Each collection has a name, icon, and colour.

- **Inbox** — the default collection. New links land here unless a different collection is specified. The sidebar defaults to the Inbox view on login.
- **Viewing a collection** — click a collection in the left sidebar to filter links.
- **Creating a collection** — go to **Settings > Collections** and add a new one.
- **Editing a collection** — change the name, icon, or colour from **Settings > Collections**.
- **Deleting a collection** — removes the collection and moves its links back to the Inbox.
- **Archive** — a virtual entry in the sidebar that shows all archived links across every collection. It is always visible below your collections.
- **All Links** — a sidebar entry below Archive that shows every link regardless of collection or status.

Every link belongs to exactly one collection. Links without a collection are placed in the Inbox.

## Tags

Tags provide flexible cross-collection categorisation. A link can have any number of tags.

- **Adding tags** — add tags when saving a link (extension popup, Add Link modal) or edit them in the link detail panel.
- **Filtering by tag** — click a tag in the left sidebar to show all links with that tag.
- **Hidden when empty** — tags with zero links are automatically hidden from the sidebar. They still exist and can be managed in Settings.
- **Managing tags** — create, rename, or delete tags from **Settings > Tags**. You can also bulk-delete all empty tags (tags with zero linked items) in one click.

Deleting a tag removes it from all linked items.

## Search

Trove uses SQLite FTS5 for full-text search across link titles, descriptions, and extracted content.

- **Basic search** — type in the search bar or press `/` to focus it.
- **Prefix matching** — partial words match automatically (e.g. "prog" matches "programming").
- **Highlighted snippets** — search results show matching text excerpts with bold highlighting below the link card.
- **Combined filters** — search can be combined with collection, tag, domain, or status filters.

Press `Cmd+K` or `/` to focus the search bar from anywhere in the app.

## Archive

Archiving moves a link out of your active view without deleting it.

- **Archiving** — click the archive button on a link card, use bulk actions, swipe on mobile, or press `a` on a focused link.
- **Viewing archived links** — click **Archive** in the left sidebar.
- **Difference from deleting** — archived links are preserved and searchable; deleted links are permanently removed.

## Context Menu (Desktop)

Right-click any link card to open a context menu with quick actions:

- **Archive / Unarchive** — toggle the link's archived state.
- **Delete** — permanently delete the link (with confirmation).
- **Plugin actions** — send to configured export plugins (e.g. "Send to Reader", "Send to Things").
- **Copy URL** — copy the link URL to your clipboard.

## Link Detail Panel

Click a link (or press `o` / `Enter` on a focused link) to open the detail panel on the right side.

The detail panel shows:

- Title and URL (editable)
- Extracted description and readable content
- Collection assignment (changeable via dropdown)
- Tags (editable — type and press Enter to add)
- Plugin actions (e.g. Send to Reader, Send to Things)
- Action history (log of plugin executions and their outcomes)

## Keyboard Shortcuts

The following shortcuts are available when no input field is focused:

| Key | Action |
| --- | --- |
| `/` | Focus the search bar |
| `Cmd+K` | Focus the search bar |
| `Escape` | Clear selection / close detail panel / exit triage |
| `j` | Move focus down in the link list |
| `k` | Move focus up in the link list |
| `o` or `Enter` | Open the focused link's detail panel |
| `x` | Toggle bulk selection on the focused link |
| `a` | Archive (or unarchive) the focused link |
| `d` | Delete the focused link (with confirmation) |
| `1`–`9` | Send the focused link to the corresponding plugin |
| `t` | Enter triage mode |

When a link is focused, a hint bar appears at the bottom of the link list showing available plugin shortcuts (e.g. "1 Send to Things", "2 Send to Reader"). A brief feedback toast confirms the action.

### Triage Mode Shortcuts

| Key | Action |
| --- | --- |
| `1`–`9` | Send to the corresponding configured export plugin |
| `A` | Archive the current link |
| `D` | Delete the current link |
| `S` or `Right Arrow` | Skip — move to the next link without taking action |
| `K` or `Left Arrow` | Go back to the previous link |
| `Escape` | Exit triage mode |

## Bulk Actions

Select multiple links to perform actions in bulk. There are several ways to enter bulk selection mode:

- **Desktop:** Click the **Select** button in the header (between the Triage button and Add).
- **Mobile:** Tap the checkbox icon in the navigation bar, or **long-press** a link card (500 ms) to enter bulk mode and select that card.
- **Keyboard:** Press `x` on a focused link to toggle its selection.

Once in bulk mode, all link cards display checkboxes. The floating action bar at the bottom provides:

- **Select All** / **Deselect All** — selects or clears all links in the current filtered view.
- **Move to Collection** — move selected links to a different collection.
- **Archive** — archive all selected links.
- **Delete** — delete all selected links (with confirmation).

Click **Cancel** in the header/nav or press `Escape` to exit bulk mode and clear the selection.

## Triage Mode

Triage mode is a focused flow for rapidly processing links one at a time — like flipping through a card deck. It is ideal for clearing your inbox after links accumulate.

### Entering Triage Mode

- **Desktop:** Click the **Triage** button (lightning bolt icon) in the header, next to Select and Add.
- **Mobile:** Tap the lightning bolt icon in the navigation bar.
- **Keyboard:** Press `T` when not in an input field.

Triage mode is only available when the current view contains links.

### How It Works

When triage mode is active, the normal link list is replaced with a focused single-card view:

1. The first link is displayed as a large, prominent card showing the title, URL, domain, description excerpt, tags, collection, and extraction status.
2. An action bar at the bottom shows all available actions with their keyboard shortcuts.
3. Press a key or tap a button to perform an action on the current link.
4. The link animates out and the next link automatically appears.
5. A progress indicator shows how many links remain.

### Mobile Usage

On mobile, all actions are presented as buttons below the focused card. Plugin buttons, archive, delete, and skip actions are all accessible via touch.

### Completion

When all links have been processed, a completion screen is displayed with an option to exit triage mode. Triage mode also exits automatically when you change collections, tags, or navigate elsewhere.

## Import and Export

Trove supports importing and exporting your link library. Access import/export from **Settings > Import / Export**.

### Import

Select a file to upload and click **Preview** to scan its contents. Trove auto-detects the format:

| Format | Description |
| --- | --- |
| **HTML Bookmarks** | Standard Netscape bookmark format from Chrome, Firefox, Safari. Folder names become collections. |
| **JSON** | Any JSON structure with nested collections — Trove's own format, arrays of objects, or objects with `links`/`data`/`bookmarks`/`items` wrappers. Field names are matched flexibly (e.g. `href`/`link`/`uri` for URL, `name`/`label` for title, `labels`/`categories`/`keywords` for tags). |
| **CSV / TSV** | Header row required. Flexible column name matching — `url` column required; `title`, `description`, `tags`, `collection` and common variations are recognised. |
| **Plain text** | URLs are extracted automatically from any text — one per line, embedded in paragraphs, or mixed with other content. |

After scanning, a preview table shows all detected items. You can:

- **Select/deselect individual items** — click the checkbox next to each item.
- **Select All / Deselect All** — bulk toggle at the top.
- **Include/exclude tags** — toggle the "Include tags" checkbox to control whether tags from the source file are imported.
- **Review collections** — collection badges are shown above the preview list so you can see what will be created.

Click **Import N items** to import the selected items. A progress bar tracks the import. Duplicate URLs are silently skipped.

### Export

Download your entire link library in any of three formats:

| Format | Description |
| --- | --- |
| **JSON** | Pretty-printed Trove format with all metadata, importable back into Trove. |
| **CSV** | RFC 4180 compliant. Tags joined with semicolons. |
| **HTML Bookmarks** | Netscape format importable by any browser. Links grouped by collection. |

All three formats support round-trip: export and re-import preserves URLs, titles, collections, and timestamps.

## Swipe Actions (Mobile)

On mobile devices, you can swipe link cards left or right to perform quick actions. The default actions are:

- **Swipe left** — Delete
- **Swipe right** — Archive

You can customise what each swipe direction does in **Settings > Appearance > Swipe Actions**. Options include:

- Archive
- Delete
- None (disable swipe)
- Any configured export plugin (e.g. "Send to Reader", "Send to Things")

## Bookmarklet

Save any page to Trove with one click using a browser bookmarklet. Create a new bookmark and set the URL to:

```
javascript:void(window.open('https://YOUR_TROVE_URL/?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'trove','width=600,height=500'))
```

Replace `YOUR_TROVE_URL` with your Trove instance URL. When clicked, it opens a popup with the Add Link modal pre-filled with the current page's URL and title.

## Dark Mode

Trove supports light, dark, and system colour schemes. Toggle the theme from **Settings > Appearance**. The preference is stored on the server and syncs across devices.

## Link Card Layout

Trove supports two link card layouts, configurable in **Settings > Appearance**:

- **Condensed** (default) — compact single-line cards showing title, domain, and tags.
- **Expanded** — taller cards that show a 2-line text excerpt (from the page description or extracted content) and optional image thumbnails where available.

The preference is stored per user and syncs across devices.

## Installing as a Standalone App (PWA)

Trove can be installed as a standalone app on supported platforms, removing the browser chrome and giving it a dedicated icon.

- **macOS** — open Trove in Safari, then choose **File > Add to Dock**.
- **iOS** — open Trove in Safari, tap the Share button, then tap **Add to Home Screen**.

Once installed, Trove opens in its own window without the browser toolbar.

## Plugins

Trove uses a declarative JSON plugin system. Plugins can do two things:

- **Export** — perform an action on a saved link (e.g. send to a read-later service, create a task in a task manager). These appear as action buttons in the link detail panel, context menu, and triage mode.
- **Ingest** — receive links from external tools via a webhook endpoint, automatically saving them to Trove.

Each plugin has a `direction` field: `export`, `ingest`, or `both`.

### Managing Plugins

Go to **Settings > Plugins** to view, enable/disable, and configure plugins.

- **Enable/disable** — toggle the switch next to each plugin. Disabled plugins do not appear in action menus.
- **Configure** — expand a plugin to fill in required configuration fields (e.g. API tokens).
- **Upload** — admins can upload new plugin manifests (JSON) via the Upload Plugin button.
- **Delete** — admins can delete non-system plugins.

Five system plugins ship with Trove: **Readwise Reader**, **Things**, **Obsidian**, **Apple Reminders**, and **n8n Webhook**. See the [Plugin Development Guide](plugin-development.md) for full details on each, and for creating custom plugins.

## User Management (Admin)

Admin users can manage other users from **Settings > Users**:

- **Create user** — set a name, username, and password. The new user's API token is shown once upon creation.
- **Delete user** — permanently removes the user and all their data (links, collections, tags, plugin configs).

## Account Settings

Manage your account from **Settings > Account**:

- **Profile** — view your name, username, and email.
- **Change password** — set a new password (minimum 8 characters).
- **API token** — view, copy, show/hide, or regenerate your API token. The token is used by the browser extension, iOS share extension, and other API clients for authentication.
