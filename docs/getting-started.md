# Getting Started

## Prerequisites

- **Docker** and **Docker Compose** for deployment, OR
- **[Bun](https://bun.sh)** v1.0+ for local development

## Docker Deployment

1. Clone the repository and create your environment file:

   ```bash
   git clone https://github.com/jaydenk/trove.git
   cd trove
   cp env.example .env
   ```

2. Edit `.env` and set a secure admin password:

   ```
   TROVE_ADMIN_PASSWORD=your-secure-password-here
   ```

3. Start the container:

   ```bash
   docker compose up -d
   ```

4. Seed the admin user:

   ```bash
   docker compose exec trove bun run seed
   ```

   The seed command prints the admin's auto-generated API token. Save this — you will need it for the browser extension and API access.

5. Open [http://localhost:3737](http://localhost:3737) and sign in with username `admin` and the password you set.

## First Login

After signing in, you will see a three-column layout:

- **Left sidebar** — collections and tags for filtering
- **Centre** — your link list (empty to start)
- **Right** — link detail panel (appears when you select a link)

Five default collections are created for each new user. You can rename, recolour, or delete them from Settings.

## Adding Your First Link

Click the **Add** button in the top bar. Paste a URL and click Save. Trove will:

1. Create the link immediately
2. Fetch the page in the background
3. Extract the title, description, content, and favicon automatically

The link will appear in your Inbox collection within a few seconds.

## Setting Up the Browser Extension

The browser extension lets you save links with one click from any page. It supports Chrome and Safari (macOS and iOS). See the [Browser Extension Guide](browser-extension.md) for full installation steps.

You will need your Trove server URL and API token. To find your API token:

1. Go to **Settings > Account** in the Trove web UI
2. Your API token is displayed in the API Token section
3. Click **Show** to reveal it, then **Copy** to copy it
4. Click **Regenerate Token** if you need a new one

### Chrome

1. Open `chrome://extensions/` and enable **Developer mode**
2. Click **Load unpacked** and select the `extension/shared/` directory
3. Click the extension icon and go to Settings to enter your server URL and API token

### Safari (macOS and iOS)

Safari requires wrapping the extension in a native Xcode app container. See [Browser Extension Guide](browser-extension.md) for the full Xcode setup. Once installed:

- **macOS:** Enable the extension in Safari > Settings > Extensions
- **iOS:** Enable in Settings > Apps > Safari > Extensions. In Safari, tap the puzzle piece icon to access the popup.

## Setting Up the iOS Share Extension

The Safari extension also works as an iOS share extension, allowing you to save links from any app's Share Sheet. Alternatively, you can use an Apple Shortcut — see the [iOS Shortcut setup guide](ios-shortcut.md) for step-by-step instructions.

## Configuring Plugins

Trove ships with three built-in plugins. Go to **Settings > Plugins** to enable and configure them:

### Readwise Reader

Sends links to [Readwise Reader](https://readwise.io/read) for reading later. Tags from Trove are forwarded automatically.

1. Enable the **Readwise Reader** plugin
2. Expand it and enter your Readwise access token (find it at [readwise.io/access_token](https://readwise.io/access_token))
3. Click **Save**

### Things

Creates a task in [Things](https://culturedcode.com/things/) from a link. Uses the Things URL scheme — works on macOS and iOS where Things is installed. No configuration required — just enable it.

### n8n Webhook

Receives links from [n8n](https://n8n.io) automation workflows. Enable it, then send payloads to `POST /api/plugins/n8n/webhook` with your API token. Useful for piping RSS feeds, email newsletters, or other data sources into Trove.

## Next Steps

- Read the [User Guide](user-guide.md) to learn about collections, tags, search, triage mode, and keyboard shortcuts
- Create [custom plugins](plugin-development.md) to send links to any service
- Connect [Claude](mcp-server.md) to your link library via the MCP server
- Review [self-hosting options](self-hosting.md) for Traefik, backups, and CI/CD
