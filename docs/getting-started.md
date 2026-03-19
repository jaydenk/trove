# Getting Started

## Prerequisites

- **Docker** and **Docker Compose** for deployment, OR
- **[Bun](https://bun.sh)** v1.0+ for local development

## Docker Deployment

1. Clone the repository and create your environment file:

   ```bash
   git clone https://github.com/jaydenk/TroveLinkManager.git
   cd TroveLinkManager
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

   The seed command prints the admin's auto-generated API token. Save this — you'll need it for the browser extension and API access.

5. Open [http://localhost:3737](http://localhost:3737) and sign in with username `admin` and the password you set.

## First Login

After signing in, you'll see a three-column layout:

- **Left sidebar** — collections and tags for filtering
- **Centre** — your link list (empty to start)
- **Right** — link detail panel (appears when you select a link)

Five default collections are created for each new user. You can rename, recolour, or delete them from Settings.

## Adding Your First Link

Click the **Add Link** button in the top bar. Paste a URL and click Save. Trove will:

1. Create the link immediately
2. Fetch the page in the background
3. Extract the title, description, content, and favicon automatically

The link will appear in your inbox collection within a few seconds.

## Setting Up the Browser Extension

The browser extension lets you save links with one click from any page. See the [Browser Extension Guide](browser-extension.md) for installation steps on Chrome and Safari (macOS + iOS).

You'll need your Trove server URL and API token. To find your API token:

1. Go to **Settings** in the Trove web UI
2. Your API token is displayed on the profile page
3. Click **Regenerate Token** if you need a new one

## Setting Up the iOS Shortcut

Save links directly from the iOS Share Sheet using Apple Shortcuts. See the [iOS Shortcut setup guide](ios-shortcut.md) for step-by-step instructions.

## Next Steps

- Read the [User Guide](user-guide.md) to learn about collections, tags, search, and keyboard shortcuts
- Set up [plugins](plugin-development.md) to send links to Readwise Reader, Things, or n8n
- Connect [Claude](mcp-server.md) to your link library via the MCP server
- Review [self-hosting options](self-hosting.md) for Traefik, backups, and CI/CD
