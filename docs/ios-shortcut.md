# iOS Shortcut — Save to Trove

Save links to Trove directly from the iOS Share Sheet using Apple Shortcuts. This uses the standard `POST /api/links` endpoint — no special shortcut-specific API is needed.

## Prerequisites

- Trove running and accessible from your device (e.g. via Tailscale)
- Your Trove API token (see [Finding your API token](#finding-your-api-token) below)
- The **Shortcuts** app on iOS (pre-installed on iOS 13 and later)

## Step-by-Step Setup

### 1. Open the Shortcuts App

Open the **Shortcuts** app on your iPhone or iPad.

### 2. Create a New Shortcut

Tap the **+** button in the top-right corner to create a new shortcut.

### 3. Set the Share Sheet Trigger

Tap **Shortcut Details** (the info icon or the dropdown at the top), then:

- Enable **Show in Share Sheet**
- Under **Share Sheet Types**, select **URLs** (deselect everything else)

This ensures the shortcut only appears when sharing a URL from Safari, Chrome, or any other app.

### 4. Add the "Get Contents of URL" Action

Search for and add the **Get Contents of URL** action. Configure it as follows:

| Setting         | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| **URL**         | `https://trove.your-tailscale-domain/api/links`              |
| **Method**      | `POST`                                                       |

Under **Headers**, add:

| Header           | Value                          |
| ---------------- | ------------------------------ |
| `Authorization`  | `Bearer <your-api-token>`      |
| `Content-Type`   | `application/json`             |

Under **Request Body**, select **JSON** and add a single key:

| Key      | Type   | Value              |
| -------- | ------ | ------------------ |
| `url`    | Text   | *Shortcut Input*   |
| `source` | Text   | `manual`           |

To set the `url` value to the Shortcut Input, tap the value field and select **Shortcut Input** from the variables list.

### 5. Add a Notification

Search for and add the **Show Notification** action after the URL request. Set the notification text to:

> Saved to Trove

This gives you a visual confirmation that the link was saved successfully.

### 6. Name the Shortcut

Tap the shortcut name at the top and rename it to **Save to Trove**. Optionally, choose a custom icon and colour.

## Usage

1. Open any webpage in Safari (or another app with a URL)
2. Tap the **Share** button
3. Scroll down and tap **Save to Trove**
4. A notification confirms the link was saved

The link will appear in your Trove inbox with automatic content extraction.

## Finding Your API Token

You can find your API token in one of two ways:

- **Admin panel** — if you are an admin user, navigate to the admin user management section in the Trove UI. Tokens are displayed when creating new users.
- **Seed command** — the token you set as `TROVE_ADMIN_TOKEN` in your `.env` file (or passed to `bun run seed`) is your admin API token. You can also create additional users via the admin API and use their tokens.

## Troubleshooting

- **"Could not connect to the server"** — ensure Trove is reachable from your device. If you are using Tailscale, confirm the Tailscale VPN is active on your iPhone or iPad.
- **No notification appears** — check that the `Authorization` header has the correct token and that the URL format is `Bearer <token>` (with a space after `Bearer`).
- **Duplicate links** — Trove returns a `409` response for duplicate URLs. The shortcut will still complete, but the notification may show an error. You can add an **If** action to check the response status if you want to handle duplicates gracefully.

## Optional Enhancements

- **Add tags** — include a `"tags": ["shortcut"]` field in the JSON body to automatically tag all links saved via the shortcut.
- **Choose a collection** — add a `"collectionId"` field to save directly to a specific collection instead of the inbox.
- **Ask for tags** — add an **Ask for Input** action before the URL request to prompt for tags each time you save a link.
