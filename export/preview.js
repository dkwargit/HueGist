/**
 * HueGist - Export Preview Studio Logic
 * Handles interactive center-aligned document editing,
 * vector PDF printing, clipboard rich-text copying, and Markdown generation.
 */

import { getDocHighlights, getAllDocs, hexToRgba, normalizeUrl } from '../utils/storage.js';
import { groupHighlights, formatFilename, downloadFile } from '../utils/exporter.js';

let currentDoc = null;
let originalDoc = null;
let userHasEdited = false;

const editableContainer = document.getElementById('editable-content');
const printPdfBtn = document.getElementById('print-pdf-btn');
const copyDocsBtn = document.getElementById('copy-docs-btn');
const downloadMdBtn = document.getElementById('download-md-btn');
const resetBtn = document.getElementById('reset-btn');
const toastEl = document.getElementById('toast');

function showToast(msg, duration = 2500) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), duration);
}

// Track user edits
editableContainer.addEventListener('input', () => {
  userHasEdited = true;
});

// Load Document on Page Load
async function loadDocument() {
  const params = new URLSearchParams(window.location.search);
  const targetUrl = params.get('url');

  if (targetUrl) {
    currentDoc = await getDocHighlights(targetUrl);
  }

  // Fallback to most recently updated document with highlights
  if (!currentDoc || !currentDoc.highlights || currentDoc.highlights.length === 0) {
    const all = await getAllDocs();
    const docList = Object.values(all);
    const sorted = docList.filter(d => d.highlights && d.highlights.length > 0)
                          .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    if (sorted.length > 0) {
      currentDoc = sorted[0];
    }
  }

  if (!currentDoc || !currentDoc.highlights) {
    currentDoc = {
      title: 'Sample Highlights Document',
      url: targetUrl || 'https://example.com/article',
      highlights: [],
      lastModified: Date.now()
    };
  }

  const targetFilter = params.get('filter');
  if (targetFilter && targetFilter !== 'all' && currentDoc.highlights) {
    currentDoc.highlights = currentDoc.highlights.filter(h =>
      h.color === targetFilter || h.colorLabel === targetFilter
    );
  }

  originalDoc = JSON.parse(JSON.stringify(currentDoc));
  renderDocumentPaper();
}

// Render Document Inside Center-Aligned Editable Paper
function renderDocumentPaper() {
  const doc = currentDoc;
  const title = doc.title || 'Untitled Document';
  const url = doc.url || '';
  const dateStr = new Date(doc.lastModified || Date.now()).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  let html = `<h1 class="doc-main-title">Highlights: ${escapeHtml(title)}</h1>`;
  html += `<div class="doc-metadata-bar">`;
  html += `Source: <a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a> &bull; Extracted with <strong>HueGist</strong> &bull; ${dateStr}`;
  html += `</div>`;

  const groups = groupHighlights(doc.highlights, 'color');
  const groupKeys = Object.keys(groups);

  if (doc.highlights && doc.highlights.length > 0) {
    html += `<div class="doc-summary-metrics" contenteditable="false">`;
    html += `<span class="metric-pill">Total: ${doc.highlights.length} Highlights</span>`;
    groupKeys.forEach(groupName => {
      const items = groups[groupName];
      const colorHex = items[0]?.colorHex || '#fde047';
      html += `<span class="metric-pill" style="border-left: 3px solid ${colorHex};">${escapeHtml(groupName)}: ${items.length}</span>`;
    });
    html += `</div>`;
  }

  if (groupKeys.length === 0) {
    html += `<p style="color: #64748b; font-style: italic; padding: 24px 0;">No highlights detected for this document yet. Start highlighting text on the webpage or PDF to generate summaries.</p>`;
  } else {
    groupKeys.forEach(groupName => {
      const items = groups[groupName];
      const colorHex = items[0]?.colorHex || '#fde047';

      html += `<div class="category-block">`;
      html += `<h2 class="category-heading">`;
      html += `<span class="category-indicator" style="background-color: ${colorHex};"></span>`;
      html += `${escapeHtml(groupName)} (${items.length})</h2>`;

      html += `<ul class="highlights-list">`;
      items.forEach(item => {
        const itemColor = hexToRgba(item.colorHex || '#fde047', 0.4);
        const pageTag = item.pageNumber > 1 ? ` <span class="page-tag">(Page ${item.pageNumber})</span>` : '';

        html += `<li class="highlight-entry">`;
        html += `<span class="highlight-snippet" style="background-color: ${itemColor};">&ldquo;${escapeHtml(item.text)}&rdquo;</span>${pageTag}`;

        if (item.note && item.note.trim()) {
          html += `<div class="note-box">Note: ${escapeHtml(item.note.trim())}</div>`;
        }
        html += `</li>`;
      });
      html += `</ul></div>`;
    });
  }

  editableContainer.innerHTML = html;
  document.title = `${formatFilename(title, 'pdf')} – HueGist`;
}

// Convert Currently Edited HTML to Plain Markdown
function parseEditedHtmlToMarkdown() {
  const titleEl = editableContainer.querySelector('.doc-main-title');
  const title = titleEl ? titleEl.innerText.replace(/^Highlights:\s*/, '').trim() : 'Document';
  const metaEl = editableContainer.querySelector('.doc-metadata-bar');
  const metaText = metaEl ? metaEl.innerText : '';

  let md = `# Highlights: ${title}\n\n`;
  if (metaText) {
    md += `> ${metaText}\n\n---\n\n`;
  }

  const blocks = editableContainer.querySelectorAll('.category-block');
  blocks.forEach(block => {
    const headingEl = block.querySelector('.category-heading');
    if (headingEl) {
      md += `## ${headingEl.innerText.trim()}\n\n`;
    }

    const items = block.querySelectorAll('.highlight-entry');
    items.forEach(li => {
      const snippet = li.querySelector('.highlight-snippet');
      const text = snippet ? snippet.innerText.trim() : li.innerText.trim();
      const pageTag = li.querySelector('.page-tag');
      const pageText = pageTag ? ` *${pageTag.innerText.trim()}*` : '';

      md += `- **${text}**${pageText}\n`;

      const noteBox = li.querySelector('.note-box');
      if (noteBox && noteBox.innerText.trim()) {
        md += `  - ${noteBox.innerText.trim()}\n`;
      }
    });
    md += `\n`;
  });

  return md;
}

// Print to PDF
printPdfBtn.addEventListener('click', () => {
  window.print();
});

// Copy Rich HTML to Clipboard (Preserving User Edits)
copyDocsBtn.addEventListener('click', async () => {
  const editedHtml = editableContainer.innerHTML;
  const plainMarkdown = parseEditedHtmlToMarkdown();

  const wrappedHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #0f172a;">${editedHtml}</div>`;

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const textBlob = new Blob([plainMarkdown], { type: 'text/plain' });
      const htmlBlob = new Blob([wrappedHtml], { type: 'text/html' });
      const item = new ClipboardItem({
        'text/plain': textBlob,
        'text/html': htmlBlob
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(plainMarkdown);
    }
    showToast('Copied edited document! Ready to paste in Google Docs or Word.');
  } catch (err) {
    console.error('Failed to copy rich text:', err);
    await navigator.clipboard.writeText(plainMarkdown);
    showToast('Copied plain text to clipboard');
  }
});

// Download Markdown (Preserving User Edits)
downloadMdBtn.addEventListener('click', () => {
  const md = parseEditedHtmlToMarkdown();
  const filename = formatFilename(currentDoc.title || 'Document', 'md');
  downloadFile(md, filename, 'text/markdown');
  showToast(`Downloaded ${filename}`);
});

// Reset Document to Original
resetBtn.addEventListener('click', () => {
  if (confirm('Revert all document edits back to original highlights?')) {
    currentDoc = JSON.parse(JSON.stringify(originalDoc));
    userHasEdited = false;
    renderDocumentPaper();
    showToast('Reverted to original');
  }
});

// Auto-refresh if new highlights are saved while preview is open (unless user is actively typing)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.huegist_docs && !userHasEdited) {
    loadDocument();
  }
});

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', loadDocument);
