// Browser namespace polyfill
const browser = globalThis.browser || globalThis.chrome;

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
