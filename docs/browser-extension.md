# Browser Extension

The Trove browser extension lets you save links directly from any page. It supports Chrome and Safari (macOS and iOS) and uses Manifest V3 with vanilla HTML/CSS/JS — no build step required.

## Features

- **Popup** — click the toolbar icon to save the current page with a title, collection, and tags
- **Context menu** — right-click any page or link and select "Save to Trove" (not available on iOS)
- **Keyboard shortcut** — `Cmd+Shift+L` (macOS) or `Ctrl+Shift+L` (Windows/Linux) to open the popup
- **Content extraction** — captures the rendered DOM from the active tab, including JavaScript-rendered content and pages behind authentication
- **Badge feedback** — green "OK" badge on success, red "!" on error

## Chrome Installation

1. Open `chrome://extensions/` and enable **Developer mode** (top-right toggle)
2. Click **Load unpacked** and select the `extension/shared/` directory from the Trove repository
3. Click the extension icon in the toolbar to open the popup
4. Click **Settings** to configure your server URL and API token

## Safari Installation

Safari requires wrapping the extension in a native Xcode app container.

### macOS

1. Generate the Xcode project from the repository root:

   ```bash
   xcrun safari-web-extension-converter extension/shared \
     --project-location extension/safari \
     --app-name "Save to Trove" \
     --bundle-identifier com.trove.save-extension \
     --swift
   ```

2. Open the generated project in Xcode: `extension/safari/Save to Trove/Save to Trove.xcodeproj`
3. Select the **macOS** target, configure signing with your development team
4. Build and run (`Cmd+R`)
5. Open **Safari > Settings > Extensions** and enable **Save to Trove**
6. Click the extension icon to configure your server URL and API token

**Free developer account:** You may need to enable unsigned extensions. In Safari, go to **Settings > Advanced**, tick **Show features for web developers**, then select **Developer > Allow Unsigned Extensions** from the menu bar. This resets each time Safari is relaunched.

### iOS

1. Use the same Xcode project generated above
2. Select the **iOS** target and configure signing
3. Connect your iPhone via USB or select a simulator
4. Build and run (`Cmd+R`)
5. On your device, go to **Settings > Apps > Safari > Extensions** and enable **Save to Trove**
6. In Safari, tap the puzzle piece icon in the address bar to access the extension popup

## Configuration

After installing on any platform:

1. Open the extension's **Settings** page
2. Enter your **Trove server URL** (e.g. `https://trove.example.com`) — no trailing slash
3. Enter your **API token** (find it in the Trove web UI under Settings)
4. Click **Test Connection** to verify
5. Save your settings

## Using the Popup

Click the extension icon (or press `Cmd+Shift+L`) to open the save popup:

1. The current page's URL and title are pre-filled
2. Select a collection from the dropdown
3. Add tags by typing and pressing Enter
4. Click **Save**

A green "OK" badge confirms the save was successful.

## Using the Context Menu

Right-click on any page or link and select **Save to Trove**. The link is saved immediately to your inbox using your default settings. A badge indicates success or failure.

Context menus are not available on iOS Safari.

## Content Extraction

When saving via the extension, the rendered DOM content is captured from the active tab using the `scripting` permission. This provides significantly better extraction quality than server-side fetching because it captures:

- JavaScript-rendered content (SPAs, dynamic pages)
- Pages behind authentication (paywalled articles, logged-in dashboards)
- Visible text, meta descriptions, and raw HTML

The pre-extracted content is sent with the save request, and the server skips its own extraction.

## Troubleshooting

| Problem | Solution |
| --- | --- |
| Extension icon missing in Chrome | Check that `extension/shared/` is loaded and enabled in `chrome://extensions/` |
| Extension not appearing in Safari | Run the container app at least once — Safari only registers extensions from launched apps |
| "Allow Unsigned Extensions" not available in Safari | Enable **Show features for web developers** in Safari > Settings > Advanced first |
| Connection test fails | Verify the server URL has no trailing slash and the API token is correct |
| Badge shows red "!" on save | Check the browser console for error details. Common causes: incorrect URL, expired token, server unreachable |
| iOS extension not visible | Go to Settings > Apps > Safari > Extensions on your device and toggle the extension on |
| Extension stops working after Safari restart | With a free developer account, re-enable **Developer > Allow Unsigned Extensions** after each Safari launch |
