// Browser namespace polyfill
const browser = globalThis.browser || globalThis.chrome;

// API functions duplicated here because MV3 service workers cannot reliably
// use importScripts across all browsers.

async function getSettings() {
  const data = await browser.storage.sync.get(['serverUrl', 'apiToken']);
  return { serverUrl: data.serverUrl || '', apiToken: data.apiToken || '' };
}

async function troveApi(path, options = {}) {
  const { serverUrl, apiToken } = await getSettings();
  if (!serverUrl || !apiToken) {
    throw new Error('Trove is not configured. Open extension settings to set your server URL and API token.');
  }
  const url = `${serverUrl.replace(/\/+$/, '')}/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  return body;
}

// Badge feedback

function showBadge(text, color) {
  browser.action.setBadgeText({ text });
  browser.action.setBadgeBackgroundColor({ color });
  setTimeout(() => browser.action.setBadgeText({ text: '' }), 2000);
}

// Context menu setup

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'save-to-trove',
    title: 'Save to Trove',
    contexts: ['page', 'link'],
  });
});

// Context menu handler

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-to-trove') return;

  let url;
  let title;

  if (info.linkUrl) {
    // Right-clicked on a link
    url = info.linkUrl;
    title = info.selectionText || undefined;
  } else {
    // Right-clicked on the page
    url = info.pageUrl || (tab && tab.url) || '';
    title = (tab && tab.title) || undefined;
  }

  if (!url) {
    showBadge('!', '#ef4444');
    return;
  }

  try {
    await troveApi('/links', {
      method: 'POST',
      body: JSON.stringify({
        url,
        title,
        source: 'extension',
      }),
    });
    showBadge('OK', '#22c55e');
  } catch (err) {
    console.error('Save to Trove failed:', err.message);
    showBadge('!', '#ef4444');
  }
});
