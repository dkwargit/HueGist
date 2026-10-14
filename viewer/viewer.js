/**
 * HueGist - Dedicated PDF Reader
 * Powered by Mozilla PDF.js. Renders vector canvas + HTML textLayer
 * allowing full text selection and real-time highlight capture on PDFs.
 */

import { saveHighlight, getPalette } from '../utils/storage.js';

// Setup PDF.js Worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
}

let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let currentScale = 1.25;
let currentDocName = 'Document.pdf';
let currentDocUrl = window.location.href;
let activeSelection = null;
let activePalette = {};

// Elements
const docNameEl = document.getElementById('doc-name');
const pageNumEl = document.getElementById('page-num');
const pageCountEl = document.getElementById('page-count');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomLevelEl = document.getElementById('zoom-level');
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const pagesContainer = document.getElementById('pages-container');
const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');
const textLayerEl = document.getElementById('text-layer');
const viewerToolbar = document.getElementById('viewer-toolbar');
const openCompanionBtn = document.getElementById('open-companion-btn');

async function renderViewerPalette() {
  activePalette = await getPalette();
  viewerToolbar.innerHTML = '';
  Object.entries(activePalette).forEach(([colorKey, data]) => {
    const btn = document.createElement('button');
    btn.className = 'color-btn';
    btn.style.backgroundColor = data.hex;
    btn.dataset.color = colorKey;
    btn.title = data.label;
    viewerToolbar.appendChild(btn);
  });
}

// Load PDF from File/Buffer
async function loadPdfData(data, name = 'Document.pdf') {
  try {
    currentDocName = name;
    docNameEl.textContent = name;
    document.title = `${name} – HueGist Reader`;

    try {
      history.replaceState(null, '', `?doc=${encodeURIComponent(name)}`);
      currentDocUrl = window.location.href;
    } catch (e) {}

    dropZone.style.display = 'none';
    pagesContainer.style.display = 'flex';

    const loadingTask = window.pdfjsLib.getDocument({ data });
    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;
    currentPage = 1;

    pageCountEl.textContent = String(totalPages);
    await renderPage(currentPage);
  } catch (err) {
    console.error('Failed to load PDF:', err);
    alert('Failed to parse PDF document.');
  }
}

// Render Specific Page (Canvas + TextLayer)
async function renderPage(num) {
  if (!pdfDoc) return;

  const page = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: currentScale });

  // Size Canvas
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  // Size Text Layer
  textLayerEl.style.height = `${viewport.height}px`;
  textLayerEl.style.width = `${viewport.width}px`;
  textLayerEl.innerHTML = '';

  // Render Canvas
  const renderContext = {
    canvasContext: ctx,
    viewport: viewport
  };
  await page.render(renderContext).promise;

  // Render Text Layer for Selection
  const textContent = await page.getTextContent();
  renderTextLayer(textContent, viewport);

  pageNumEl.textContent = String(num);
  prevPageBtn.disabled = num <= 1;
  nextPageBtn.disabled = num >= totalPages;
}

// Build Text Spans for Text Layer
function renderTextLayer(textContent, viewport) {
  textContent.items.forEach(item => {
    const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);

    const span = document.createElement('span');
    span.textContent = item.str;
    span.style.fontFamily = item.fontName || 'sans-serif';
    span.style.fontSize = `${fontHeight}px`;
    span.style.left = `${tx[4]}px`;
    span.style.top = `${tx[5] - fontHeight}px`;

    textLayerEl.appendChild(span);
  });
}

// Page Navigation
prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    renderPage(currentPage);
  }
});

nextPageBtn.addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage++;
    renderPage(currentPage);
  }
});

// Zoom Handling
zoomInBtn.addEventListener('click', () => {
  currentScale = Math.min(3.0, currentScale + 0.2);
  zoomLevelEl.textContent = `${Math.round(currentScale * 80)}%`;
  renderPage(currentPage);
});

zoomOutBtn.addEventListener('click', () => {
  currentScale = Math.max(0.6, currentScale - 0.2);
  zoomLevelEl.textContent = `${Math.round(currentScale * 80)}%`;
  renderPage(currentPage);
});

// Open Side Panel
openCompanionBtn.addEventListener('click', async () => {
  try {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (currentTab && currentTab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ windowId: currentTab.windowId });
    }
  } catch (e) {
    console.warn(e);
  }
});

// File Chooser
const chooseFileBtn = document.getElementById('choose-file-btn');
if (chooseFileBtn) {
  chooseFileBtn.addEventListener('click', () => {
    fileInput.click();
  });
}

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const arrayBuffer = await file.arrayBuffer();
  loadPdfData(arrayBuffer, file.name);
});

// Drag and Drop
document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
    const file = e.dataTransfer.files[0];
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      loadPdfData(arrayBuffer, file.name);
    }
  }
});

// Selection & Highlighting
document.addEventListener('mouseup', () => {
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      viewerToolbar.classList.remove('visible');
      return;
    }

    const text = sel.toString().trim();
    if (text.length < 2) {
      viewerToolbar.classList.remove('visible');
      return;
    }

    activeSelection = {
      text,
      pageNumber: currentPage
    };

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    viewerToolbar.style.top = `${Math.max(10, rect.top - 46)}px`;
    viewerToolbar.style.left = `${Math.max(10, rect.left + (rect.width / 2) - 80)}px`;
    viewerToolbar.classList.add('visible');
  }, 10);
});

// Color Button Click
viewerToolbar.addEventListener('mousedown', async (e) => {
  const btn = e.target.closest('.color-btn');
  if (!btn || !activeSelection) return;

  e.preventDefault();
  e.stopPropagation();

  const color = btn.dataset.color || 'yellow';
  const colorMeta = activePalette[color] || { hex: '#FDE047', label: 'Highlight' };

  const highlight = {
    text: activeSelection.text,
    color,
    colorHex: colorMeta.hex,
    colorLabel: colorMeta.label,
    pageNumber: activeSelection.pageNumber,
    timestamp: Date.now()
  };

  await saveHighlight(currentDocUrl, currentDocName, highlight);

  chrome.runtime.sendMessage({
    type: 'HUEGIST_HIGHLIGHT_CHANGED',
    url: currentDocUrl
  }).catch(() => {});

  viewerToolbar.classList.remove('visible');
  window.getSelection()?.removeAllRanges();
});

// Watch for palette updates
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.huegist_palette) {
    renderViewerPalette();
  }
});

// Check URL Params for Direct PDF Loading (?file=https://...)
window.addEventListener('DOMContentLoaded', async () => {
  await renderViewerPalette();

  const params = new URLSearchParams(window.location.search);
  const fileUrl = params.get('file');
  if (fileUrl) {
    try {
      const res = await fetch(fileUrl);
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const name = fileUrl.split('/').pop().split('?')[0] || 'Remote_Document.pdf';
      currentDocUrl = fileUrl;
      loadPdfData(arrayBuffer, name);
    } catch (err) {
      console.warn('Could not load remote PDF parameter:', err);
    }
  }
});

// Keyboard Shortcuts for PDF Navigation & Highlighting
document.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    viewerToolbar.classList.remove('visible');
    return;
  }

  // Number shortcuts (1-9) for quick highlighting if toolbar is visible
  if (viewerToolbar.classList.contains('visible') && activeSelection) {
    const num = parseInt(e.key, 10);
    const colorKeys = Object.keys(activePalette);
    if (!isNaN(num) && num >= 1 && num <= colorKeys.length) {
      const color = colorKeys[num - 1];
      const colorMeta = activePalette[color] || { hex: '#FDE047', label: 'Highlight' };
      const highlight = {
        text: activeSelection.text,
        color,
        colorHex: colorMeta.hex,
        colorLabel: colorMeta.label,
        pageNumber: activeSelection.pageNumber,
        timestamp: Date.now()
      };
      await saveHighlight(currentDocUrl, currentDocName, highlight);
      chrome.runtime.sendMessage({
        type: 'HUEGIST_HIGHLIGHT_CHANGED',
        url: currentDocUrl
      }).catch(() => {});
      viewerToolbar.classList.remove('visible');
      window.getSelection()?.removeAllRanges();
      return;
    }
  }

  // Page turning and zoom shortcuts
  if (pdfDoc && !viewerToolbar.classList.contains('visible')) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      if (currentPage < totalPages) {
        currentPage++;
        renderPage(currentPage);
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      if (currentPage > 1) {
        currentPage--;
        renderPage(currentPage);
      }
    } else if (e.key === '=' || e.key === '+') {
      currentScale = Math.min(3.0, currentScale + 0.2);
      zoomLevelEl.textContent = `${Math.round(currentScale * 80)}%`;
      renderPage(currentPage);
    } else if (e.key === '-') {
      currentScale = Math.max(0.6, currentScale - 0.2);
      zoomLevelEl.textContent = `${Math.round(currentScale * 80)}%`;
      renderPage(currentPage);
    }
  }
});

