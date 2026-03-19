# Trove Browser Extension

Save links to your Trove library directly from any browser. The extension provides a toolbar popup, right-click context menu, and keyboard shortcut for quick saving — no need to switch tabs or copy-paste URLs.

## Supported Platforms

| Platform      | Status      | Install Method       |
| ------------- | ----------- | -------------------- |
| Chrome        | Supported   | Load unpacked        |
| Safari macOS  | Supported   | Xcode build          |
| Safari iOS    | Supported   | Xcode build          |

## Features

- **Popup save** — click the toolbar icon to save the current page with a title, collection, and tags. Collections and tags are fetched from your Trove instance for quick selection.
- **Context menu** — right-click any page or link and select "Save to Trove" to save it instantly with your default settings. (Not available on iOS Safari.)
- **Keyboard shortcut** — press `Cmd+Shift+L` (macOS) or `Ctrl+Shift+L` (Windows/Linux) to open the popup without reaching for the mouse.
- **Badge feedback** — a green "OK" badge confirms a successful save; a red "!" badge indicates an error.
- **Options page** — configure your Trove server URL and API token, with a built-in connection test to verify everything works.

## Configuration

After installing the extension on any platform, you need to configure it with your Trove server details:

1. Open the extension's **Settings** (options) page.
2. Enter your **Trove server URL** (e.g. `https://trove.your-tailscale-domain`). Do not include a trailing slash.
3. Enter your **API token** — the same token you use to log in to the Trove web UI.
4. Click **Test Connection** to verify the extension can reach your server.
5. Save your settings.

## Architecture

The extension source lives in `extension/shared/` and uses **Manifest V3** with vanilla HTML, CSS, and JavaScript — no build step required. The same source is used for both Chrome and Safari.

```
extension/
├── shared/               # Cross-platform extension source
│   ├── manifest.json     # Manifest V3 config
│   ├── background.js     # Service worker (context menu + badge)
│   ├── lib/
│   │   └── api.js        # Trove API client with storage-based config
│   ├── popup/            # Toolbar popup (save with collection + tags)
│   ├── options/          # Settings page (server URL + API token)
│   └── icons/            # Extension icons (16, 48, 128px)
├── chrome/
│   └── README.md         # Chrome setup guide
└── safari/
    └── README.md         # Safari macOS + iOS setup guide
```

## Platform Setup Guides

- **Chrome** — see [chrome/README.md](chrome/README.md) for installation steps.
- **Safari (macOS + iOS)** — see [safari/README.md](safari/README.md) for Xcode project generation and build instructions.
