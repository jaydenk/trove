// browser polyfill is loaded from ../lib/api.js

const mainDiv = document.getElementById('main');
const notConfiguredDiv = document.getElementById('notConfigured');
const openOptionsLink = document.getElementById('openOptions');
const faviconImg = document.getElementById('favicon');
const urlText = document.getElementById('urlText');
const titleInput = document.getElementById('titleInput');
const collectionSelect = document.getElementById('collectionSelect');
const tagsContainer = document.getElementById('tagsContainer');
const tagsPills = document.getElementById('tagsPills');
const tagInput = document.getElementById('tagInput');
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');

let currentUrl = '';
const tags = [];

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = 'status';
  if (type) {
    statusDiv.classList.add(`status-${type}`);
  }
}

function renderTags() {
  // Clear existing pills
  while (tagsPills.firstChild) {
    tagsPills.removeChild(tagsPills.firstChild);
  }

  for (let i = 0; i < tags.length; i++) {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';

    const text = document.createElement('span');
    text.textContent = tags[i];
    pill.appendChild(text);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-pill-remove';
    removeBtn.type = 'button';
    removeBtn.textContent = '\u00d7';
    removeBtn.setAttribute('aria-label', `Remove tag ${tags[i]}`);
    const idx = i;
    removeBtn.addEventListener('click', () => {
      tags.splice(idx, 1);
      renderTags();
      tagInput.focus();
    });
    pill.appendChild(removeBtn);

    tagsPills.appendChild(pill);
  }
}

function addTag(value) {
  const tag = value.trim().toLowerCase();
  if (tag && !tags.includes(tag)) {
    tags.push(tag);
    renderTags();
  }
  tagInput.value = '';
}

tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(tagInput.value);
  } else if (e.key === 'Backspace' && tagInput.value === '' && tags.length > 0) {
    tags.pop();
    renderTags();
  }
});

// Also handle comma in input value (e.g. paste)
tagInput.addEventListener('input', () => {
  if (tagInput.value.includes(',')) {
    const parts = tagInput.value.split(',');
    for (const part of parts) {
      addTag(part);
    }
  }
});

// Focus tag input when clicking container
tagsContainer.addEventListener('click', () => {
  tagInput.focus();
});

openOptionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

async function init() {
  // Check if configured
  const { serverUrl, apiToken } = await getSettings();
  if (!serverUrl || !apiToken) {
    mainDiv.hidden = true;
    notConfiguredDiv.hidden = false;
    return;
  }

  // Get active tab
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  currentUrl = tab.url || '';
  titleInput.value = tab.title || '';

  // Show URL and favicon
  urlText.textContent = currentUrl;
  urlText.title = currentUrl;
  if (tab.favIconUrl) {
    faviconImg.src = tab.favIconUrl;
    faviconImg.alt = 'Favicon';
  } else {
    faviconImg.style.display = 'none';
  }

  // Fetch collections
  try {
    const collections = await troveApi('/collections') || [];
    for (const col of collections) {
      const option = document.createElement('option');
      option.value = col.id;
      option.textContent = col.name;
      collectionSelect.appendChild(option);
    }
  } catch (err) {
    // Collections are optional — fail silently
    console.warn('Failed to load collections:', err.message);
  }
}

async function extractPageContent(tabId) {
  try {
    const [{ result }] = await browser.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title,
        description:
          document.querySelector('meta[name="description"]')?.content ||
          document.querySelector('meta[property="og:description"]')?.content ||
          '',
        content: (document.body.innerText || '').substring(0, 50000),
        rawHtml: document.documentElement.outerHTML,
        domain: window.location.hostname,
      }),
    });
    return result;
  } catch (err) {
    // Extraction may fail on restricted pages (chrome://, about:, etc.)
    // Fall back to no pre-extracted content — server will extract instead
    console.warn('Content extraction failed:', err.message);
    return null;
  }
}

saveBtn.addEventListener('click', async () => {
  if (!currentUrl) return;

  saveBtn.disabled = true;
  showStatus('Extracting content\u2026', 'loading');

  // Extract content from the active tab
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const extracted = tab ? await extractPageContent(tab.id) : null;

  showStatus('Saving\u2026', 'loading');

  try {
    const body = {
      url: currentUrl,
      title: titleInput.value.trim() || undefined,
      source: 'extension',
    };

    // Add pre-extracted content if available
    if (extracted) {
      body.description = extracted.description || undefined;
      body.content = extracted.content || undefined;
      body.rawHtml = extracted.rawHtml || undefined;
    }

    const collectionId = collectionSelect.value;
    if (collectionId) {
      body.collectionId = collectionId;
    }

    if (tags.length > 0) {
      body.tags = [...tags];
    }

    await troveApi('/links', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    showStatus('\u2713 Saved to Trove', 'success');

    // Auto-close popup after success
    setTimeout(() => {
      window.close();
    }, 1500);
  } catch (err) {
    showStatus(err.message, 'error');
    saveBtn.disabled = false;
  }
});

document.addEventListener('DOMContentLoaded', init);
