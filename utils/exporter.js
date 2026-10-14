/**
 * HueGist - Exporter Module
 * Handles formatting and generating export outputs:
 * - Markdown
 * - Formatted HTML / Rich Text for Google Docs & Notion
 * - PDF Export (Client-side clean print document)
 * - Google Docs API Payload
 */

import { hexToRgba } from './storage.js';

/**
 * Sanitizes document title for the required filename format:
 * <original_file_name>_HueGist.<ext>
 */
export function formatFilename(title, ext = 'md') {
  const cleanTitle = (title || 'Document')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);

  return `${cleanTitle || 'Notes'}_HueGist.${ext}`;
}

/**
 * Groups highlights by color category label or by page number
 */
export function groupHighlights(highlights, groupBy = 'color') {
  const groups = {};

  if (groupBy === 'page') {
    highlights.forEach(h => {
      const pageKey = `Page ${h.pageNumber || 1}`;
      if (!groups[pageKey]) groups[pageKey] = [];
      groups[pageKey].push(h);
    });
  } else {
    // Dynamic grouping by custom or standard label
    highlights.forEach(h => {
      const label = h.colorLabel || 'Highlights';
      if (!groups[label]) groups[label] = [];
      groups[label].push(h);
    });
  }

  return groups;
}

/**
 * Generates clean GitHub Flavored Markdown
 */
export function generateMarkdown(doc, groupBy = 'color') {
  const title = doc.title || 'Untitled Document';
  const url = doc.url || '';
  const dateStr = new Date(doc.lastModified || Date.now()).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  let md = `# Highlights: ${title}\n\n`;
  md += `> **Source:** [${url}](${url})\n`;
  md += `> **Extracted with:** HueGist Smart Highlight Extractor\n`;
  md += `> **Date:** ${dateStr} | **Total Highlights:** ${doc.highlights.length}\n\n`;
  md += `---\n\n`;

  const groups = groupHighlights(doc.highlights, groupBy);

  for (const [groupName, items] of Object.entries(groups)) {
    md += `## ${groupName} (${items.length})\n\n`;
    items.forEach(item => {
      const pageInfo = item.pageNumber > 1 ? ` *(Page ${item.pageNumber})*` : '';
      md += `- **"${item.text}"**${pageInfo}\n`;
      if (item.note && item.note.trim()) {
        md += `  - Note: *${item.note.trim()}*\n`;
      }
    });
    md += `\n`;
  }

  return md;
}

/**
 * Generates Rich HTML suitable for clipboard pasting into Google Docs, Word, Notion
 */
export function generateRichHtml(doc, groupBy = 'color') {
  const title = doc.title || 'Untitled Document';
  const url = doc.url || '';
  const dateStr = new Date(doc.lastModified || Date.now()).toLocaleDateString();

  let html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b;">`;
  html += `<h1 style="font-size: 24px; color: #0f172a; margin-bottom: 6px;">Highlights: ${escapeHtml(title)}</h1>`;
  html += `<p style="color: #64748b; font-size: 13px; margin-top: 0; margin-bottom: 16px;">`;
  html += `Source: <a href="${url}" style="color: #2563eb;">${url}</a> &bull; Extracted with <strong>HueGist</strong> &bull; ${dateStr}`;
  html += `</p><hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />`;

  const groups = groupHighlights(doc.highlights, groupBy);

  for (const [groupName, items] of Object.entries(groups)) {
    const colorHex = items[0]?.colorHex || '#fef08a';

    html += `<h2 style="font-size: 18px; color: #1e293b; margin-top: 20px; margin-bottom: 10px;">`;
    html += `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${colorHex}; margin-right: 8px;"></span>`;
    html += `${escapeHtml(groupName)} (${items.length})</h2>`;
    html += `<ul style="padding-left: 24px; margin-top: 6px; margin-bottom: 16px;">`;

    items.forEach(item => {
      const itemBg = hexToRgba(item.colorHex || '#fef08a', 0.4);
      const pageInfo = item.pageNumber > 1 ? ` <span style="color: #94a3b8; font-size: 12px;">(Page ${item.pageNumber})</span>` : '';

      html += `<li style="margin-bottom: 10px;">`;
      html += `<span style="background-color: ${itemBg}; padding: 2px 6px; border-radius: 4px; font-weight: 500;">`;
      html += `&ldquo;${escapeHtml(item.text)}&rdquo;</span>${pageInfo}`;

      if (item.note && item.note.trim()) {
        html += `<div style="color: #64748b; font-size: 13px; margin-top: 4px; padding-left: 10px; border-left: 2px solid #cbd5e1;">`;
        html += `<em>Note: ${escapeHtml(item.note.trim())}</em></div>`;
      }
      html += `</li>`;
    });
    html += `</ul>`;
  }

  html += `</div>`;
  return html;
}

/**
 * Copies rich formatted HTML and plain text to clipboard for direct Google Docs pasting
 */
export async function copyToClipboard(doc, groupBy = 'color') {
  const plainText = generateMarkdown(doc, groupBy);
  const richHtml = generateRichHtml(doc, groupBy);

  if (navigator.clipboard && window.ClipboardItem) {
    const textBlob = new Blob([plainText], { type: 'text/plain' });
    const htmlBlob = new Blob([richHtml], { type: 'text/html' });
    const item = new ClipboardItem({
      'text/plain': textBlob,
      'text/html': htmlBlob
    });
    await navigator.clipboard.write([item]);
    return true;
  } else {
    await navigator.clipboard.writeText(plainText);
    return true;
  }
}

/**
 * Generates a complete standalone HTML document styled for printing/saving to PDF
 */
export function generatePrintablePdfHtml(doc, groupBy = 'color') {
  const title = doc.title || 'Untitled Document';
  const richContent = generateRichHtml(doc, groupBy);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(formatFilename(title, 'pdf'))}</title>
  <style>
    @page {
      margin: 20mm;
      size: A4;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px;
      max-width: 800px;
      margin-left: auto;
      margin-right: auto;
      background: #ffffff;
      color: #0f172a;
    }
    .print-actions {
      position: fixed;
      top: 16px;
      right: 16px;
      background: #0f172a;
      padding: 8px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
    }
    .print-btn {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    @media print {
      .print-actions { display: none !important; }
      body { padding: 0 !important; }
    }
  </style>
</head>
<body>
  <div class="print-actions">
    <button id="print-btn" class="print-btn">Save as PDF</button>
  </div>
  ${richContent}
  <script>
    document.getElementById('print-btn')?.addEventListener('click', () => window.print());
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => { window.print(); }, 400);
    });
  <\/script>
</body>
</html>`;
}

/**
 * Downloads a string payload as a local file with the specified filename
 */
export function downloadFile(content, filename, mimeType = 'text/markdown') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Helper to escape HTML entities
 */
function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
