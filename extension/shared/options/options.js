// Browser namespace polyfill
const browser = globalThis.browser || globalThis.chrome;

const serverUrlInput = document.getElementById('serverUrl');
const apiTokenInput = document.getElementById('apiToken');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const statusDiv = document.getElementById('status');

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = 'status';
  if (type) {
    statusDiv.classList.add(`status-${type}`);
  }
}

async function loadSettings() {
  const data = await browser.storage.sync.get(['serverUrl', 'apiToken']);
  if (data.serverUrl) serverUrlInput.value = data.serverUrl;
  if (data.apiToken) apiTokenInput.value = data.apiToken;
}

async function saveSettings() {
  const serverUrl = serverUrlInput.value.trim();
  const apiToken = apiTokenInput.value.trim();

  if (!serverUrl) {
    showStatus('Server URL is required.', 'error');
    serverUrlInput.focus();
    return false;
  }

  try {
    new URL(serverUrl);
  } catch {
    showStatus('Please enter a valid URL.', 'error');
    serverUrlInput.focus();
    return false;
  }

  if (!apiToken) {
    showStatus('API token is required.', 'error');
    apiTokenInput.focus();
    return false;
  }

  await browser.storage.sync.set({ serverUrl, apiToken });
  return true;
}

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  try {
    const saved = await saveSettings();
    if (saved) {
      showStatus('Settings saved.', 'success');
    }
  } catch (err) {
    showStatus(`Failed to save: ${err.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

testBtn.addEventListener('click', async () => {
  testBtn.disabled = true;
  showStatus('Saving and testing connection\u2026', 'loading');
  try {
    const saved = await saveSettings();
    if (!saved) {
      testBtn.disabled = false;
      return;
    }

    const result = await troveApi('/me');
    const name = result?.data?.name || result?.data?.role || 'Unknown user';
    showStatus(`Connected successfully as ${name}.`, 'success');
  } catch (err) {
    showStatus(`Connection failed: ${err.message}`, 'error');
  } finally {
    testBtn.disabled = false;
  }
});

document.addEventListener('DOMContentLoaded', loadSettings);
