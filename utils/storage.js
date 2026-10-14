/**
 * HueGist - Storage Management Module
 * Manages highlights, documents, custom color tags, and settings via chrome.storage.local
 */

export const DEFAULT_PALETTE = {
  yellow: { id: 'yellow', hex: '#FDE047', label: 'Key Concept', bg: 'rgba(253, 224, 71, 0.45)' },
  green:  { id: 'green',  hex: '#86EFAC', label: 'Fact / Evidence', bg: 'rgba(134, 239, 172, 0.45)' },
  blue:   { id: 'blue',   hex: '#7DD3FC', label: 'Definition', bg: 'rgba(125, 211, 252, 0.45)' },
  pink:   { id: 'pink',   hex: '#F472B6', label: 'Important / Review', bg: 'rgba(244, 114, 182, 0.45)' },
  purple: { id: 'purple', hex: '#C084FC', label: 'Quote / Notable', bg: 'rgba(192, 132, 252, 0.45)' }
};

// Backwards compatibility export
export const COLOR_PALETTE = DEFAULT_PALETTE;

/**
 * Converts a hex color (#RRGGBB or #RGB) to an rgba string
 */
export function hexToRgba(hex, alpha = 0.45) {
  if (!hex || typeof hex !== 'string') return `rgba(253, 224, 71, ${alpha})`;
  let cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return `rgba(253, 224, 71, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Gets the active palette (custom + default colors)
 */
export async function getPalette() {
  const data = await chrome.storage.local.get('huegist_palette');
  return data.huegist_palette || DEFAULT_PALETTE;
}

/**
 * Adds or updates a custom highlight color tag
 */
export async function addCustomColor(label, hex) {
  const palette = await getPalette();
  const cleanLabel = (label || 'Custom Highlight').trim();
  const id = `col_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const bg = hexToRgba(hex, 0.45);

  palette[id] = {
    id,
    hex: hex || '#FDE047',
    label: cleanLabel,
    bg
  };

  await chrome.storage.local.set({ huegist_palette: palette });
  return palette;
}

/**
 * Removes a color tag from the active palette
 */
export async function removeColor(colorId) {
  const palette = await getPalette();
  if (palette[colorId]) {
    // Keep at least one color in palette
    if (Object.keys(palette).length > 1) {
      delete palette[colorId];
      await chrome.storage.local.set({ huegist_palette: palette });
    }
  }
  return palette;
}

/**
 * Resets palette to the default colors
 */
export async function resetPalette() {
  await chrome.storage.local.set({ huegist_palette: DEFAULT_PALETTE });
  return DEFAULT_PALETTE;
}

/**
 * Normalizes URL consistently across web, PDF, and local file protocols
 */
export function normalizeUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = ''; // Remove hash/fragment
    return parsed.href;
  } catch {
    return rawUrl.split('#')[0];
  }
}

/**
 * Retrieves all stored documents
 */
export async function getAllDocs() {
  const data = await chrome.storage.local.get('huegist_docs');
  return data.huegist_docs || {};
}

/**
 * Retrieves document record and its highlights for a specific URL
 */
export async function getDocHighlights(rawUrl) {
  if (!rawUrl) return { url: '', title: '', highlights: [], lastModified: Date.now() };

  const url = normalizeUrl(rawUrl);
  const docs = await getAllDocs();

  // Primary match
  if (docs[url]) return docs[url];

  // Fallbacks for query params or trailing slash differences
  if (docs[rawUrl]) return docs[rawUrl];
  const simpleUrl = rawUrl.split('#')[0];
  if (docs[simpleUrl]) return docs[simpleUrl];

  // Case-insensitive, decodeURI, or legacy null-prefixed key fallback
  const decoded = decodeURIComponent(url);
  for (const key of Object.keys(docs)) {
    if (decodeURIComponent(key) === decoded) {
      return docs[key];
    }
    if (key.startsWith('null/') && url.endsWith(key.replace('null', ''))) {
      return docs[key];
    }
  }

  return { url: url || rawUrl, title: '', highlights: [], lastModified: Date.now() };
}

/**
 * Saves a new highlight to a document
 */
export async function saveHighlight(rawUrl, title, highlightData) {
  const url = normalizeUrl(rawUrl);
  const docs = await getAllDocs();
  const palette = await getPalette();

  const doc = docs[url] || {
    url,
    title: title || 'Untitled Document',
    highlights: [],
    createdAt: Date.now()
  };

  if (title && (!doc.title || doc.title === 'Untitled Document')) {
    doc.title = title;
  }

  const colorMeta = palette[highlightData.color] || DEFAULT_PALETTE[highlightData.color] || {
    hex: highlightData.colorHex || '#FDE047',
    label: highlightData.colorLabel || 'Highlight',
    bg: hexToRgba(highlightData.colorHex || '#FDE047', 0.45)
  };

  const highlight = {
    id: highlightData.id || `hg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    text: highlightData.text.trim(),
    color: highlightData.color || 'yellow',
    colorHex: colorMeta.hex,
    colorLabel: colorMeta.label,
    pageNumber: highlightData.pageNumber || 1,
    note: highlightData.note || '',
    selector: highlightData.selector || null,
    timestamp: highlightData.timestamp || Date.now()
  };

  doc.highlights.push(highlight);
  doc.lastModified = Date.now();
  docs[url] = doc;

  await chrome.storage.local.set({ huegist_docs: docs });
  return { doc, highlight };
}

/**
 * Deletes a single highlight from a document
 */
export async function deleteHighlight(rawUrl, highlightId) {
  const url = normalizeUrl(rawUrl);
  const docs = await getAllDocs();

  let targetKey = docs[url] ? url : (docs[rawUrl] ? rawUrl : null);
  if (!targetKey) {
    const simple = rawUrl ? rawUrl.split('#')[0] : '';
    if (docs[simple]) targetKey = simple;
  }

  if (!targetKey || !docs[targetKey]) return null;

  docs[targetKey].highlights = docs[targetKey].highlights.filter(h => h.id !== highlightId);
  docs[targetKey].lastModified = Date.now();

  await chrome.storage.local.set({ huegist_docs: docs });
  return docs[targetKey];
}

/**
 * Updates a highlight's note or color
 */
export async function updateHighlight(rawUrl, highlightId, updates) {
  const url = normalizeUrl(rawUrl);
  const docs = await getAllDocs();
  const palette = await getPalette();

  let targetKey = docs[url] ? url : (docs[rawUrl] ? rawUrl : null);
  if (!targetKey) {
    const simple = rawUrl ? rawUrl.split('#')[0] : '';
    if (docs[simple]) targetKey = simple;
  }

  if (!targetKey || !docs[targetKey]) return null;

  const item = docs[targetKey].highlights.find(h => h.id === highlightId);
  if (item) {
    if (updates.note !== undefined) item.note = updates.note;
    if (updates.color !== undefined) {
      item.color = updates.color;
      const colorMeta = palette[updates.color] || DEFAULT_PALETTE[updates.color];
      if (colorMeta) {
        item.colorHex = colorMeta.hex;
        item.colorLabel = colorMeta.label;
      }
    }
    docs[targetKey].lastModified = Date.now();
    await chrome.storage.local.set({ huegist_docs: docs });
  }
  return docs[targetKey];
}

/**
 * Clears all highlights for a document
 */
export async function clearDocHighlights(rawUrl) {
  const url = normalizeUrl(rawUrl);
  const docs = await getAllDocs();
  let changed = false;

  [url, rawUrl, rawUrl ? rawUrl.split('#')[0] : null].forEach(k => {
    if (k && docs[k]) {
      delete docs[k];
      changed = true;
    }
  });

  if (changed) {
    await chrome.storage.local.set({ huegist_docs: docs });
  }
  return true;
}

/**
 * Exports all highlights and custom palettes as a JSON string
 */
export async function exportAllDataJson() {
  const data = await chrome.storage.local.get(['huegist_docs', 'huegist_palette']);
  return JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    huegist_docs: data.huegist_docs || {},
    huegist_palette: data.huegist_palette || DEFAULT_PALETTE
  }, null, 2);
}

/**
 * Imports and merges highlights and palettes from a JSON string
 */
export async function importDataJson(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup file');
  }

  const updates = {};
  if (parsed.huegist_docs && typeof parsed.huegist_docs === 'object') {
    const existing = await getAllDocs();
    updates.huegist_docs = { ...existing, ...parsed.huegist_docs };
  }
  if (parsed.huegist_palette && typeof parsed.huegist_palette === 'object') {
    const existingPal = await getPalette();
    updates.huegist_palette = { ...existingPal, ...parsed.huegist_palette };
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
    return true;
  }
  throw new Error('No valid HueGist data found in backup file');
}

