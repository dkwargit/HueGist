/**
 * HueGist - Popup Logic
 * Provides quick active-tab overview, color breakdown statistics,
 * fast export buttons, and triggers the Companion Side Panel.
 */

import { getDocHighlights, getPalette } from '../utils/storage.js';
import { copyToClipboard, generateMarkdown, downloadFile, formatFilename } from '../utils/exporter.js';

let activeTab = null;
let currentDoc = null;
let activePalette = {};

// Elements
const docTitleEl = document.getElementById('active-doc-title');
const countBadgeEl = document.getElementById('page-highlight-count');
const openSidepanelBtn = document.getElementById('open-sidepanel-btn');
const openSidepanelIconBtn = document.getElementById('open-sidepanel-icon-btn');
const popupCopyDocsBtn = document.getElementById('popup-copy-docs');
const popupExportPdfBtn = document.getElementById('popup-export-pdf');
const popupExportMdBtn = document.getElementById('popup-export-md');
const toastEl = document.getElementById('popup-toast');
const breakdownContainer = document.getElementById('color-breakdown');
const distributionBar = document.getElementById('distribution-bar');

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2000);
}

async function initPopup() {
  try {
    activePalette = await getPalette();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      docTitleEl.textContent = 'No Active Tab';
      return;
    }

    activeTab = tab;
    docTitleEl.textContent = tab.title || tab.url;

    currentDoc = await getDocHighlights(tab.url);
    renderStats();
  } catch (err) {
    console.error('Failed to initialize popup:', err);
  }
}

function renderStats() {
  const highlights = currentDoc ? currentDoc.highlights || [] : [];
  const total = highlights.length;

  countBadgeEl.textContent = `${total} Highlight${total === 1 ? '' : 's'}`;

  // Count by color label or color key
  const counts = {};
  Object.keys(activePalette).forEach(k => { counts[k] = 0; });

  highlights.forEach(h => {
    if (counts[h.color] !== undefined) {
      counts[h.color]++;
    } else {
      counts[h.color] = (counts[h.color] || 0) + 1;
    }
  });

  // Dynamically render distribution bar segments
  distributionBar.innerHTML = '';
  if (total > 0) {
    Object.entries(counts).forEach(([colorKey, count]) => {
      if (count > 0) {
        const seg = document.createElement('div');
        seg.className = 'dist-segment';
        seg.style.width = `${(count / total) * 100}%`;
        seg.style.backgroundColor = activePalette[colorKey]?.hex || '#FDE047';
        distributionBar.appendChild(seg);
      }
    });
  }

  // Dynamically render breakdown dots
  breakdownContainer.innerHTML = '';
  Object.entries(activePalette).forEach(([colorKey, data]) => {
    const pill = document.createElement('span');
    pill.className = 'color-pill';

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.backgroundColor = data.hex;

    const countSpan = document.createElement('span');
    countSpan.textContent = String(counts[colorKey] || 0);

    pill.appendChild(dot);
    pill.appendChild(countSpan);
    pill.title = data.label;
    breakdownContainer.appendChild(pill);
  });
}

// Side Panel Opener
async function openSidePanel() {
  if (activeTab && activeTab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
    await chrome.sidePanel.open({ windowId: activeTab.windowId });
    window.close();
  } else {
    chrome.runtime.sendMessage({ type: 'HUEGIST_OPEN_SIDEPANEL' });
    window.close();
  }
}

openSidepanelBtn.addEventListener('click', openSidePanel);
openSidepanelIconBtn.addEventListener('click', openSidePanel);

// Export Actions
popupCopyDocsBtn.addEventListener('click', async () => {
  if (!currentDoc || !currentDoc.highlights || currentDoc.highlights.length === 0) {
    showToast('No highlights yet');
    return;
  }
  await copyToClipboard(currentDoc, 'color');
  showToast('Copied for Google Docs');
});

popupExportPdfBtn.addEventListener('click', () => {
  if (!currentDoc || !currentDoc.highlights || currentDoc.highlights.length === 0) {
    showToast('No highlights yet');
    return;
  }
  const previewUrl = chrome.runtime.getURL(`export/preview.html?url=${encodeURIComponent(activeTab.url)}`);
  chrome.tabs.create({ url: previewUrl });
  window.close();
});

popupExportMdBtn.addEventListener('click', () => {
  if (!currentDoc || !currentDoc.highlights || currentDoc.highlights.length === 0) {
    showToast('No highlights yet');
    return;
  }
  const md = generateMarkdown(currentDoc, 'color');
  const filename = formatFilename(currentDoc.title, 'md');
  downloadFile(md, filename, 'text/markdown');
  showToast(`Downloaded ${filename}`);
});

// Watch for real-time changes
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && (changes.huegist_docs || changes.huegist_palette)) {
    if (activeTab && activeTab.url) {
      activePalette = await getPalette();
      currentDoc = await getDocHighlights(activeTab.url);
      renderStats();
    }
  }
});

document.addEventListener('DOMContentLoaded', initPopup);
