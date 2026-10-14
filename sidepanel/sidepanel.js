/**
 * HueGist - Side Panel Logic
 * Real-time companion reader that renders, filters, searches,
 * annotates, customizes tags/colors, and exports highlights from the active webpage.
 */

import {
  getDocHighlights,
  deleteHighlight,
  updateHighlight,
  clearDocHighlights,
  getPalette,
  addCustomColor,
  removeColor,
  resetPalette,
  hexToRgba,
  normalizeUrl,
  exportAllDataJson,
  importDataJson
} from '../utils/storage.js';
import { copyToClipboard, generateMarkdown, downloadFile, formatFilename } from '../utils/exporter.js';

let currentTab = null;
let currentDoc = null;
let activePalette = {};
let activeFilter = 'all';
let searchQuery = '';

// DOM Elements
const docTitleEl = document.getElementById('doc-title');
const docLinkEl = document.getElementById('doc-link');
const containerEl = document.getElementById('highlights-container');
const emptyStateEl = document.getElementById('empty-state');
const totalCountEl = document.getElementById('total-count');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const filterPillsContainer = document.getElementById('color-filter-pills');
const refreshBtn = document.getElementById('refresh-btn');
const manageTagsBtn = document.getElementById('manage-tags-btn');
const copyDocsBtn = document.getElementById('copy-docs-btn');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const exportMdBtn = document.getElementById('export-md-btn');
const clearDocBtn = document.getElementById('clear-doc-btn');
const toastEl = document.getElementById('toast');

// Drawer Elements
const tagsDrawer = document.getElementById('tags-drawer');
const closeTagsBtn = document.getElementById('close-tags-btn');
const tagsListEl = document.getElementById('tags-list');
const newTagColorInput = document.getElementById('new-tag-color');
const newTagLabelInput = document.getElementById('new-tag-label');
const addTagBtn = document.getElementById('add-tag-btn');
const resetTagsBtn = document.getElementById('reset-tags-btn');

function showToast(message, duration = 2500) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), duration);
}

// Load Active Tab & Highlights
async function loadCurrentTab() {
  try {
    activePalette = await getPalette();
    renderFilterPills();
    renderTagsDrawerList();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      docTitleEl.textContent = 'No Active Webpage';
      docLinkEl.textContent = '';
      return;
    }

    currentTab = tab;
    const isSpecialUrl = tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('brave://') || tab.url.startsWith('about:');

    if (isSpecialUrl) {
      docTitleEl.textContent = 'Browser System Page';
      docLinkEl.textContent = tab.url;
      renderEmptyState('Highlights are not supported on browser internal settings pages.');
      return;
    }

    docTitleEl.textContent = tab.title || 'Untitled Document';
    docLinkEl.textContent = tab.url;
    docLinkEl.href = tab.url;

    await refreshHighlights();
  } catch (err) {
    console.error('Failed to load active tab:', err);
  }
}

// Fetch & Render Highlights
async function refreshHighlights() {
  if (!currentTab || !currentTab.url) return;

  currentDoc = await getDocHighlights(currentTab.url);
  renderFeed();
}

// Render Filter Pills from Active Palette
function renderFilterPills() {
  const currentSelection = activeFilter;
  filterPillsContainer.innerHTML = '';

  // All button
  const allBtn = document.createElement('button');
  allBtn.className = `pill-btn ${currentSelection === 'all' ? 'active' : ''}`;
  allBtn.dataset.filter = 'all';
  allBtn.innerHTML = `All (<span id="total-count">${currentDoc?.highlights?.length || 0}</span>)`;
  filterPillsContainer.appendChild(allBtn);

  // Each color pill
  Object.entries(activePalette).forEach(([colorKey, data]) => {
    const pill = document.createElement('button');
    pill.className = `pill-btn ${currentSelection === colorKey ? 'active' : ''}`;
    pill.dataset.filter = colorKey;
    pill.textContent = data.label;
    pill.style.borderColor = data.hex;
    if (currentSelection === colorKey) {
      pill.style.backgroundColor = data.bg || hexToRgba(data.hex, 0.3);
      pill.style.color = '#ffffff';
    }
    filterPillsContainer.appendChild(pill);
  });
}

// Render Tags in Drawer
function renderTagsDrawerList() {
  if (!tagsListEl) return;
  tagsListEl.innerHTML = '';

  const entries = Object.entries(activePalette);
  entries.forEach(([colorKey, data]) => {
    const row = document.createElement('div');
    row.className = 'tag-row';

    const info = document.createElement('div');
    info.className = 'tag-info';

    const circle = document.createElement('span');
    circle.className = 'tag-color-circle';
    circle.style.backgroundColor = data.hex;

    const label = document.createElement('span');
    label.textContent = data.label;

    info.appendChild(circle);
    info.appendChild(label);

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-tag-btn';
    delBtn.title = 'Remove this tag';
    delBtn.innerHTML = '&times;';

    // Prevent removing if only 1 tag remains
    if (entries.length <= 1) {
      delBtn.disabled = true;
      delBtn.style.opacity = '0.3';
    } else {
      delBtn.addEventListener('click', async () => {
        activePalette = await removeColor(colorKey);
        renderTagsDrawerList();
        renderFilterPills();
        showToast(`Removed tag: ${data.label}`);
      });
    }

    row.appendChild(info);
    row.appendChild(delBtn);
    tagsListEl.appendChild(row);
  });
}

// Filter and Render Cards
function renderFeed() {
  const highlights = currentDoc ? currentDoc.highlights || [] : [];
  const countEl = document.getElementById('total-count');
  if (countEl) countEl.textContent = String(highlights.length);

  if (highlights.length === 0) {
    renderEmptyState();
    return;
  }

  let filtered = highlights;

  if (activeFilter !== 'all') {
    filtered = filtered.filter(h => h.color === activeFilter || h.colorLabel === activePalette[activeFilter]?.label);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(h =>
      (h.text && h.text.toLowerCase().includes(q)) ||
      (h.note && h.note.toLowerCase().includes(q)) ||
      (h.colorLabel && h.colorLabel.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    renderEmptyState('No highlights match your current search or color filter.');
    return;
  }

  containerEl.innerHTML = '';
  filtered.forEach(item => {
    const card = createHighlightCard(item);
    containerEl.appendChild(card);
  });
}

function renderEmptyState(customMessage = null) {
  containerEl.innerHTML = '';
  const empty = emptyStateEl.cloneNode(true);
  empty.style.display = 'flex';
  if (customMessage) {
    empty.querySelector('p').textContent = customMessage;
  }
  containerEl.appendChild(empty);
}

// Build Highlight Card
function createHighlightCard(item) {
  const card = document.createElement('div');
  card.className = 'highlight-card';
  card.dataset.id = item.id;

  const colorMeta = activePalette[item.color] || {
    hex: item.colorHex || '#FDE047',
    label: item.colorLabel || 'Highlight',
    bg: hexToRgba(item.colorHex || '#FDE047', 0.4)
  };

  card.addEventListener('click', async (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;

    if (currentTab && currentTab.id) {
      try {
        await chrome.tabs.sendMessage(currentTab.id, {
          type: 'HUEGIST_SCROLL_TO_HIGHLIGHT',
          highlightId: item.id
        });
      } catch (err) {
        console.warn('Could not scroll to highlight on tab:', err);
      }
    }
  });

  const cardTop = document.createElement('div');
  cardTop.className = 'card-top';

  const categoryTag = document.createElement('div');
  categoryTag.className = 'category-tag';
  categoryTag.style.backgroundColor = colorMeta.bg || hexToRgba(colorMeta.hex, 0.4);
  categoryTag.style.color = '#ffffff';

  const dot = document.createElement('span');
  dot.className = 'color-dot';
  dot.style.backgroundColor = colorMeta.hex;

  const tagLabel = document.createElement('span');
  tagLabel.textContent = item.colorLabel || colorMeta.label;

  categoryTag.appendChild(dot);
  categoryTag.appendChild(tagLabel);

  const cardActions = document.createElement('div');
  cardActions.className = 'card-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'card-btn';
  copyBtn.title = 'Copy text';
  copyBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;
  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(item.text);
    showToast('Quote copied to clipboard!');
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'card-btn delete-btn';
  deleteBtn.title = 'Delete highlight';
  deleteBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteHighlight(currentTab.url, item.id);
    await refreshHighlights();
    if (currentTab && currentTab.id) {
      chrome.tabs.sendMessage(currentTab.id, {
        type: 'HUEGIST_HIGHLIGHT_DELETED',
        highlightId: item.id
      }).catch(() => {});
    }
  });

  cardActions.appendChild(copyBtn);
  cardActions.appendChild(deleteBtn);

  cardTop.appendChild(categoryTag);
  cardTop.appendChild(cardActions);

  const textEl = document.createElement('div');
  textEl.className = 'highlight-text';
  textEl.style.borderLeftColor = colorMeta.hex;
  textEl.textContent = `“${item.text}”`;

  const noteSection = document.createElement('div');
  noteSection.className = 'note-section';

  const noteInput = document.createElement('input');
  noteInput.type = 'text';
  noteInput.className = 'note-input';
  noteInput.placeholder = 'Add a quick note...';
  noteInput.value = item.note || '';

  noteInput.addEventListener('change', async (e) => {
    const val = e.target.value.trim();
    await updateHighlight(currentTab.url, item.id, { note: val });
  });

  noteSection.appendChild(noteInput);

  card.appendChild(cardTop);
  card.appendChild(textEl);
  card.appendChild(noteSection);

  return card;
}

// Filter Tabs Listener
filterPillsContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.pill-btn');
  if (!btn) return;

  filterPillsContainer.querySelectorAll('.pill-btn').forEach(b => {
    b.classList.remove('active');
    b.style.backgroundColor = '';
    b.style.color = '';
  });
  btn.classList.add('active');
  activeFilter = btn.dataset.filter;

  if (activeFilter !== 'all' && activePalette[activeFilter]) {
    btn.style.backgroundColor = activePalette[activeFilter].bg || hexToRgba(activePalette[activeFilter].hex, 0.3);
    btn.style.color = '#ffffff';
  }

  renderFeed();
});

// Tags Drawer Handlers
manageTagsBtn.addEventListener('click', () => {
  const isShown = tagsDrawer.style.display !== 'none';
  tagsDrawer.style.display = isShown ? 'none' : 'flex';
  if (!isShown) renderTagsDrawerList();
});

closeTagsBtn.addEventListener('click', () => {
  tagsDrawer.style.display = 'none';
});

addTagBtn.addEventListener('click', async () => {
  const label = newTagLabelInput.value.trim();
  const hex = newTagColorInput.value;
  if (!label) {
    showToast('Please enter a tag name');
    return;
  }

  activePalette = await addCustomColor(label, hex);
  newTagLabelInput.value = '';
  renderTagsDrawerList();
  renderFilterPills();
  showToast(`Added custom tag: ${label}`);
});

resetTagsBtn.addEventListener('click', async () => {
  if (confirm('Reset all highlight tags and colors back to defaults?')) {
    activePalette = await resetPalette();
    renderTagsDrawerList();
    renderFilterPills();
    showToast('Reset to default tags');
  }
});

// Backup & Restore Handlers
const exportBackupBtn = document.getElementById('export-backup-btn');
const importBackupFile = document.getElementById('import-backup-file');

if (exportBackupBtn) {
  exportBackupBtn.addEventListener('click', async () => {
    try {
      const json = await exportAllDataJson();
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(json, `HueGist_Backup_${date}.json`, 'application/json');
      showToast('Exported backup JSON');
    } catch (e) {
      showToast('Backup export failed');
    }
  });
}

if (importBackupFile) {
  importBackupFile.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      await importDataJson(text);
      await loadCurrentTab();
      showToast('Backup restored successfully');
    } catch (err) {
      showToast('Failed to import backup: ' + err.message);
    }
    importBackupFile.value = '';
  });
}

// Search Handlers
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
  renderFeed();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  clearSearchBtn.style.display = 'none';
  renderFeed();
});

refreshBtn.addEventListener('click', () => {
  loadCurrentTab();
  showToast('Refreshed');
});

// Export Action Handlers (Filter-Aware)
copyDocsBtn.addEventListener('click', async () => {
  if (!currentDoc || !currentDoc.highlights || currentDoc.highlights.length === 0) {
    showToast('No highlights to copy');
    return;
  }
  let docToCopy = currentDoc;
  if (activeFilter && activeFilter !== 'all') {
    docToCopy = {
      ...currentDoc,
      highlights: currentDoc.highlights.filter(h => h.color === activeFilter || h.colorLabel === activePalette[activeFilter]?.label)
    };
  }
  await copyToClipboard(docToCopy, 'color');
  showToast('Copied to clipboard for Google Docs or Word.');
});

exportPdfBtn.addEventListener('click', () => {
  if (!currentDoc || !currentDoc.highlights || currentDoc.highlights.length === 0) {
    showToast('No highlights to export');
    return;
  }
  let previewUrl = `export/preview.html?url=${encodeURIComponent(currentTab.url)}`;
  if (activeFilter && activeFilter !== 'all') {
    previewUrl += `&filter=${encodeURIComponent(activeFilter)}`;
  }
  chrome.tabs.create({ url: chrome.runtime.getURL(previewUrl) });
});

exportMdBtn.addEventListener('click', () => {
  if (!currentDoc || !currentDoc.highlights || currentDoc.highlights.length === 0) {
    showToast('No highlights to export');
    return;
  }
  let docToExport = currentDoc;
  if (activeFilter && activeFilter !== 'all') {
    docToExport = {
      ...currentDoc,
      highlights: currentDoc.highlights.filter(h => h.color === activeFilter || h.colorLabel === activePalette[activeFilter]?.label)
    };
  }
  const mdContent = generateMarkdown(docToExport, 'color');
  const filename = formatFilename(docToExport.title, 'md');
  downloadFile(mdContent, filename, 'text/markdown');
  showToast(`Downloaded ${filename}`);
});

clearDocBtn.addEventListener('click', async () => {
  if (!currentDoc || !currentDoc.highlights || currentDoc.highlights.length === 0) return;
  const ok = confirm('Clear all highlights for this page?');
  if (ok) {
    await clearDocHighlights(currentTab.url);
    await refreshHighlights();
    showToast('Cleared page highlights');
  }
});

// Real-Time Storage Listener
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.huegist_docs) {
      refreshHighlights();
    }
    if (changes.huegist_palette) {
      activePalette = changes.huegist_palette.newValue || {};
      renderFilterPills();
      renderTagsDrawerList();
    }
  }
});

chrome.tabs.onActivated.addListener(() => {
  loadCurrentTab();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (currentTab && tabId === currentTab.id && changeInfo.status === 'complete') {
    loadCurrentTab();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  loadCurrentTab();
});
