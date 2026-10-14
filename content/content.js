/**
 * HueGist - Content Script
 * Responsible for detecting text selection, rendering the floating
 * highlighter toolbar in an isolated Shadow DOM, applying highlights,
 * and syncing with chrome.storage.
 */

(function () {
  // Prevent duplicate execution
  if (window.__HUEGIST_INITIALIZED__) return;
  window.__HUEGIST_INITIALIZED__ = true;

  const DEFAULT_PALETTE = {
    yellow: { id: 'yellow', hex: '#FDE047', label: 'Key Concept', bg: 'rgba(253, 224, 71, 0.45)' },
    green:  { id: 'green',  hex: '#86EFAC', label: 'Fact / Evidence', bg: 'rgba(134, 239, 172, 0.45)' },
    blue:   { id: 'blue',   hex: '#7DD3FC', label: 'Definition', bg: 'rgba(125, 211, 252, 0.45)' },
    pink:   { id: 'pink',   hex: '#F472B6', label: 'Important / Review', bg: 'rgba(244, 114, 182, 0.45)' },
    purple: { id: 'purple', hex: '#C084FC', label: 'Quote / Notable', bg: 'rgba(192, 132, 252, 0.45)' }
  };

  let activePalette = { ...DEFAULT_PALETTE };
  let activeSelection = null;
  let shadowRoot = null;
  let toolbarElement = null;
  let colorButtonsContainer = null;
  let activeHighlightTarget = null;

  // URL normalizer consistent across protocols
  function normalizeUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const parsed = new URL(rawUrl);
      parsed.hash = '';
      return parsed.href;
    } catch {
      return rawUrl.split('#')[0];
    }
  }

  // 1. Shadow DOM Setup for Floating Toolbar
  function initFloatingToolbar() {
    let host = document.getElementById('huegist-highlighter-root');
    if (!host) {
      host = document.createElement('div');
      host.id = 'huegist-highlighter-root';
      host.style.position = 'absolute';
      host.style.top = '0';
      host.style.left = '0';
      host.style.width = '0';
      host.style.height = '0';
      host.style.zIndex = '2147483647';
      document.documentElement.appendChild(host);
    }

    shadowRoot = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      .huegist-toolbar {
        position: fixed;
        display: none;
        align-items: center;
        gap: 6px;
        background: #0f172a;
        padding: 6px 10px;
        border-radius: 9999px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.12);
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        user-select: none;
        transition: opacity 0.15s ease, transform 0.15s ease;
        transform: translateY(-8px);
        opacity: 0;
      }
      .huegist-toolbar.visible {
        display: flex;
        transform: translateY(0);
        opacity: 1;
      }
      .buttons-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .color-btn {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.2);
        cursor: pointer;
        padding: 0;
        transition: transform 0.15s ease, border-color 0.15s ease;
        position: relative;
      }
      .color-btn:hover {
        transform: scale(1.22);
        border-color: #ffffff;
      }
      .divider {
        width: 1px;
        height: 16px;
        background: rgba(255, 255, 255, 0.2);
        margin: 0 2px;
      }
      .action-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        transition: color 0.15s ease, background 0.15s ease;
      }
      .action-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
      }
      .tooltip-bubble {
        position: fixed;
        display: none;
        background: #1e293b;
        color: #f8fafc;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.1);
        z-index: 2147483647;
        align-items: center;
        gap: 8px;
      }
      .tooltip-bubble.visible {
        display: flex;
      }
      .del-btn {
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      .del-btn:hover {
        background: #dc2626;
      }
    `;
    shadowRoot.appendChild(style);

    toolbarElement = document.createElement('div');
    toolbarElement.className = 'huegist-toolbar';

    colorButtonsContainer = document.createElement('div');
    colorButtonsContainer.className = 'buttons-row';
    toolbarElement.appendChild(colorButtonsContainer);

    renderPaletteButtons();

    // Divider
    const div = document.createElement('div');
    div.className = 'divider';
    toolbarElement.appendChild(div);

    // Open Companion Side Panel Button
    const panelBtn = document.createElement('button');
    panelBtn.className = 'action-btn';
    panelBtn.title = 'Open HueGist Side Panel';
    panelBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="15" y1="3" x2="15" y2="21"></line>
      </svg>
    `;
    panelBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'HUEGIST_OPEN_SIDEPANEL' }).catch(() => {});
      hideToolbar();
    });
    toolbarElement.appendChild(panelBtn);

    shadowRoot.appendChild(toolbarElement);

    // Popover for existing marks (Delete)
    const highlightBubble = document.createElement('div');
    highlightBubble.className = 'tooltip-bubble';
    highlightBubble.id = 'huegist-popover';
    highlightBubble.innerHTML = `
      <span>Highlight</span>
      <button class="del-btn" id="popover-delete">Remove</button>
    `;
    shadowRoot.appendChild(highlightBubble);

    highlightBubble.querySelector('#popover-delete').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeHighlightTarget) {
        removeHighlight(activeHighlightTarget);
        highlightBubble.classList.remove('visible');
      }
    });
  }

  // Dynamically render color buttons based on active palette
  function renderPaletteButtons() {
    if (!colorButtonsContainer) return;
    colorButtonsContainer.innerHTML = '';

    Object.entries(activePalette).forEach(([colorKey, info], idx) => {
      const btn = document.createElement('button');
      btn.className = 'color-btn';
      btn.style.backgroundColor = info.hex;
      const shortcutHint = idx < 9 ? ` (Key: ${idx + 1})` : '';
      btn.title = `${info.label}${shortcutHint}`;
      btn.dataset.color = colorKey;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyHighlight(colorKey);
      });
      colorButtonsContainer.appendChild(btn);
    });
  }

  // 2. Selection Event Handling
  function handleSelectionChange() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      hideToolbar();
      return;
    }

    const text = sel.toString().trim();
    if (text.length < 2) {
      hideToolbar();
      return;
    }

    activeSelection = {
      text,
      range: sel.getRangeAt(0).cloneRange()
    };

    const rect = activeSelection.range.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      hideToolbar();
      return;
    }

    showToolbar(rect);
  }

  function showToolbar(rect) {
    if (!toolbarElement) return;

    const tbWidth = toolbarElement.offsetWidth || 230;
    const tbHeight = toolbarElement.offsetHeight || 38;

    let top = rect.top - tbHeight - 8;
    if (top < 10) {
      top = rect.bottom + 8;
    }

    const center = rect.left + (rect.width / 2);
    let left = center - (tbWidth / 2);
    left = Math.max(10, Math.min(window.innerWidth - tbWidth - 10, left));

    toolbarElement.style.top = `${top}px`;
    toolbarElement.style.left = `${left}px`;
    toolbarElement.classList.add('visible');
  }

  function hideToolbar() {
    if (toolbarElement) {
      toolbarElement.classList.remove('visible');
    }
  }

  // 3. Highlight Application & Storage
  async function applyHighlight(colorKey, customRange = null) {
    const rangeToUse = customRange || (activeSelection ? activeSelection.range : null);
    if (!rangeToUse) return;

    const text = rangeToUse.toString().trim();
    if (!text) return;

    const highlightId = `hg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const colorInfo = activePalette[colorKey] || DEFAULT_PALETTE.yellow;

    try {
      wrapRangeResilient(rangeToUse, highlightId, colorInfo.bg || 'rgba(253, 224, 71, 0.45)', colorKey);
    } catch (err) {
      console.warn('Highlight wrapping error:', err);
    }

    window.getSelection()?.removeAllRanges();
    hideToolbar();

    const highlightData = {
      id: highlightId,
      text,
      color: colorKey,
      colorHex: colorInfo.hex,
      colorLabel: colorInfo.label,
      pageNumber: 1,
      timestamp: Date.now()
    };

    await saveHighlightToStorage(highlightData);
  }

  function wrapRangeResilient(range, highlightId, bgColor, colorKey) {
    if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
      const mark = document.createElement('mark');
      mark.className = 'huegist-mark';
      mark.dataset.huegistId = highlightId;
      mark.dataset.huegistColor = colorKey;
      mark.style.backgroundColor = bgColor;

      try {
        range.surroundContents(mark);
        attachMarkListeners(mark);
        return;
      } catch (e) {
        // Fall back to fragment extraction
      }
    }

    try {
      const mark = document.createElement('mark');
      mark.className = 'huegist-mark';
      mark.dataset.huegistId = highlightId;
      mark.dataset.huegistColor = colorKey;
      mark.style.backgroundColor = bgColor;

      const fragment = range.extractContents();
      mark.appendChild(fragment);
      range.insertNode(mark);
      attachMarkListeners(mark);
    } catch (err) {
      wrapCrossBoundaryRange(range, highlightId, bgColor, colorKey);
    }
  }

  function wrapCrossBoundaryRange(range, highlightId, bgColor, colorKey) {
    const root = range.commonAncestorContainer;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (range.intersectsNode(node) && node.nodeValue && node.nodeValue.trim().length > 0) {
        textNodes.push(node);
      }
    }

    textNodes.forEach(node => {
      const nodeRange = document.createRange();
      const startOffset = (node === range.startContainer) ? range.startOffset : 0;
      const endOffset = (node === range.endContainer) ? range.endOffset : node.nodeValue.length;

      if (startOffset < endOffset) {
        nodeRange.setStart(node, startOffset);
        nodeRange.setEnd(node, endOffset);

        const mark = document.createElement('mark');
        mark.className = 'huegist-mark';
        mark.dataset.huegistId = highlightId;
        mark.dataset.huegistColor = colorKey;
        mark.style.backgroundColor = bgColor;

        try {
          nodeRange.surroundContents(mark);
          attachMarkListeners(mark);
        } catch (e) {
          // Cross boundary sub-segment fallback
        }
      }
    });
  }

  function attachMarkListeners(mark) {
    mark.addEventListener('mouseenter', (e) => {
      showHighlightPopover(mark, e);
    });

    mark.addEventListener('mouseleave', () => {
      setTimeout(() => {
        const popover = shadowRoot?.getElementById('huegist-popover');
        if (popover && !popover.matches(':hover')) {
          popover.classList.remove('visible');
        }
      }, 300);
    });
  }

  function showHighlightPopover(mark, e) {
    const popover = shadowRoot?.getElementById('huegist-popover');
    if (!popover) return;

    activeHighlightTarget = mark;
    const rect = mark.getBoundingClientRect();

    popover.style.top = `${Math.max(10, rect.top - 36)}px`;
    popover.style.left = `${Math.max(10, rect.left)}px`;
    popover.classList.add('visible');
  }

  async function removeHighlight(mark) {
    const highlightId = mark.dataset.huegistId;
    const parent = mark.parentNode;
    if (parent) {
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize();
    }

    if (highlightId) {
      await deleteHighlightFromStorage(highlightId);
    }
  }

  // 4. Chrome Storage Integration
  async function saveHighlightToStorage(highlight) {
    const cleanUrl = normalizeUrl(window.location.href);
    const title = document.title || 'Untitled Webpage';

    const data = await chrome.storage.local.get('huegist_docs');
    const docs = data.huegist_docs || {};

    const doc = docs[cleanUrl] || {
      url: cleanUrl,
      title,
      highlights: [],
      createdAt: Date.now()
    };

    doc.title = title;
    doc.highlights.push(highlight);
    doc.lastModified = Date.now();
    docs[cleanUrl] = doc;

    await chrome.storage.local.set({ huegist_docs: docs });

    chrome.runtime.sendMessage({
      type: 'HUEGIST_HIGHLIGHT_CHANGED',
      url: cleanUrl
    }).catch(() => {});
  }

  async function deleteHighlightFromStorage(highlightId) {
    const cleanUrl = normalizeUrl(window.location.href);
    const data = await chrome.storage.local.get('huegist_docs');
    const docs = data.huegist_docs || {};

    if (docs[cleanUrl]) {
      docs[cleanUrl].highlights = docs[cleanUrl].highlights.filter(h => h.id !== highlightId);
      docs[cleanUrl].lastModified = Date.now();
      await chrome.storage.local.set({ huegist_docs: docs });

      chrome.runtime.sendMessage({
        type: 'HUEGIST_HIGHLIGHT_CHANGED',
        url: cleanUrl
      }).catch(() => {});
    }
  }

  // 5. Rehydration (Restore on Page Load)
  async function rehydrateHighlights() {
    try {
      const cleanUrl = normalizeUrl(window.location.href);
      const data = await chrome.storage.local.get('huegist_docs');
      const docs = data.huegist_docs || {};
      let doc = docs[cleanUrl] || docs[window.location.href];

      if (!doc) {
        const decoded = decodeURIComponent(cleanUrl);
        for (const key of Object.keys(docs)) {
          if (decodeURIComponent(key) === decoded || (key.startsWith('null/') && cleanUrl.endsWith(key.replace('null', '')))) {
            doc = docs[key];
            break;
          }
        }
      }

      if (!doc || !doc.highlights || doc.highlights.length === 0) return;

      const bodyText = document.body.innerText;

      doc.highlights.forEach(h => {
        if (document.querySelector(`mark[data-huegist-id="${h.id}"]`)) return;

        if (h.text && bodyText.includes(h.text.substring(0, 40))) {
          highlightTextInNode(document.body, h.text, h.id, h.color, h.colorHex);
        }
      });
    } catch (err) {
      console.warn('Rehydration warning:', err);
    }
  }

  function highlightTextInNode(root, targetText, id, colorKey, colorHex) {
    if (!targetText || targetText.length < 3) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const cleanTarget = targetText.trim();

    while ((node = walker.nextNode())) {
      const idx = node.nodeValue.indexOf(cleanTarget);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + cleanTarget.length);

        const colorInfo = activePalette[colorKey] || DEFAULT_PALETTE.yellow;
        const mark = document.createElement('mark');
        mark.className = 'huegist-mark';
        mark.dataset.huegistId = id;
        mark.dataset.huegistColor = colorKey;
        mark.style.backgroundColor = colorInfo.bg || 'rgba(253, 224, 71, 0.45)';

        try {
          range.surroundContents(mark);
          attachMarkListeners(mark);
        } catch (e) {
          // Boundary crossing
        }
        break;
      }
    }
  }

  // 6. External Message & Storage Listeners
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'HUEGIST_TRIGGER_HIGHLIGHT') {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        applyHighlight(message.color || 'yellow');
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, reason: 'No selection' });
      }
    } else if (message.type === 'HUEGIST_SCROLL_TO_HIGHLIGHT') {
      const mark = document.querySelector(`mark[data-huegist-id="${message.highlightId}"]`);
      if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        mark.classList.add('huegist-focused');
        setTimeout(() => mark.classList.remove('huegist-focused'), 2000);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, reason: 'Highlight not found on page' });
      }
    }
    return true;
  });

  // Watch for palette changes in storage
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.huegist_palette) {
      activePalette = changes.huegist_palette.newValue || DEFAULT_PALETTE;
      renderPaletteButtons();
    }
  });

  // 7. Initialization & Event Listeners
  initFloatingToolbar();

  // Load custom palette
  chrome.storage.local.get('huegist_palette', (data) => {
    if (data && data.huegist_palette) {
      activePalette = data.huegist_palette;
      renderPaletteButtons();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (e.target && e.target.closest && e.target.closest('#huegist-highlighter-root')) return;
    setTimeout(handleSelectionChange, 10);
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') hideToolbar();
    if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      setTimeout(handleSelectionChange, 10);
    }

    // Number shortcuts (1-9) to highlight when toolbar is active
    if (toolbarElement && toolbarElement.classList.contains('visible') && activeSelection) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        return;
      }
      const num = parseInt(e.key, 10);
      const paletteKeys = Object.keys(activePalette);
      if (!isNaN(num) && num >= 1 && num <= paletteKeys.length) {
        const colorKey = paletteKeys[num - 1];
        if (colorKey) {
          applyHighlight(colorKey);
        }
      }
    }
  });

  if (document.readyState === 'complete') {
    rehydrateHighlights();
  } else {
    window.addEventListener('load', rehydrateHighlights);
  }
})();
