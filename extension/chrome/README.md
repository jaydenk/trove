# Trove Extension — Chrome Setup

Install the Save to Trove extension in Chrome (or any Chromium-based browser such as Arc, Brave, or Edge) using developer mode.

## Installation

1. Open `chrome://extensions` in your browser.
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/shared` directory from this repository.
5. The **Save to Trove** extension appears in the toolbar. You may need to click the puzzle piece icon and pin it for easy access.

## Configuration

1. Click the **Save to Trove** extension icon in the toolbar, then click the gear icon to open Settings. Alternatively, find the extension on `chrome://extensions` and click **Details → Extension options**.
2. Enter your **Trove server URL** (e.g. `https://trove.your-tailscale-domain`). Do not include a trailing slash.
3. Enter your **API token** — the same token you use to log in to the Trove web UI.
4. Click **Test Connection** to verify the extension can reach your server.
5. Click **Save**.

## Usage

Once configured, you have three ways to save links:

- **Toolbar popup** — click the extension icon on any page. The popup pre-fills the page title and URL, and lets you pick a collection and tags before saving.
- **Context menu** — right-click on any page or link and select **Save to Trove**. The link is saved immediately using your default settings.
- **Keyboard shortcut** — press `Cmd+Shift+L` (macOS) or `Ctrl+Shift+L` (Windows/Linux) to open the popup.

A green **OK** badge on the extension icon confirms a successful save. A red **!** badge indicates an error — check that your server URL and token are correct.

## Updating

When the extension source changes (e.g. after a `git pull`), go to `chrome://extensions` and click the refresh icon on the Save to Trove card to reload the updated files.

## Troubleshooting

| Problem | Solution |
| ------- | -------- |
| Extension does not appear after loading | Ensure you selected the `extension/shared` directory (the one containing `manifest.json`), not the parent `extension/` directory. |
| "Test Connection" fails | Verify the server URL is correct and accessible from your machine. Check that the API token is valid. |
| Context menu item missing | Restart the browser. Chrome occasionally fails to register context menus on first install. |
| Keyboard shortcut not working | Check `chrome://extensions/shortcuts` to confirm the shortcut is assigned and does not conflict with another extension. |
