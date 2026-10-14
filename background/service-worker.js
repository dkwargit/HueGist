/**
 * HueGist - Background Service Worker (Manifest V3)
 * Handles context menus, keyboard shortcuts, side panel routing,
 * badge counters, and storage synchronization.
 */

import { getDocHighlights, getPalette, normalizeUrl } from '../utils/storage.js';

// Setup Context Menus
async function rebuildContextMenus() {
  chrome.contextMenus.removeAll(async () => {
    chrome.contextMenus.create({
      id: 'huegist-root',
      title: 'HueGist: Highlight Selection',
      contexts: ['selection']
    });

    const palette = await getPalette();
    Object.entries(palette).forEach(([colorKey, data]) => {
      chrome.contextMenus.create({
        id: `huegist-color-${colorKey}`,
        parentId: 'huegist-root',
        title: `${data.label} (${data.hex})`,
        contexts: ['selection']
      });
    });

    chrome.contextMenus.create({
      id: 'huegist-open-sidepanel',
      title: 'Open HueGist Companion Panel',
      contexts: ['all']
    });

    chrome.contextMenus.create({
      id: 'huegist-open-pdf',
      title: 'Open in HueGist PDF Reader',
      contexts: ['link'],
      targetUrlPatterns: ['*://*/*.pdf*', 'file://*/*.pdf*']
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  rebuildContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  rebuildContextMenus();
});

// Context Menu Action Handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === 'huegist-open-sidepanel') {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
    return;
  }

  if (info.menuItemId === 'huegist-open-pdf' && info.linkUrl) {
    const viewerUrl = chrome.runtime.getURL(`viewer/viewer.html?file=${encodeURIComponent(info.linkUrl)}`);
    chrome.tabs.create({ url: viewerUrl });
    return;
  }

  if (info.menuItemId.startsWith('huegist-color-')) {
    const color = info.menuItemId.replace('huegist-color-', '');
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'HUEGIST_TRIGGER_HIGHLIGHT',
        color,
        selectionText: info.selectionText
      });
    } catch (err) {
      console.warn('Could not send highlight message to tab:', err);
    }
  }
});

// Handle Keyboard Shortcuts
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-sidepanel') {
    if (tab && tab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  }
});

// Update Badge Count for Active Tab
async function updateBadge(tabId, url) {
  if (!url || /^(chrome|chrome-extension|edge|brave|about|view-source):/i.test(url)) {
    try {
      await chrome.action.setBadgeText({ tabId, text: '' });
    } catch (e) {}
    return;
  }

  try {
    const doc = await getDocHighlights(url);
    const count = doc && doc.highlights ? doc.highlights.length : 0;
    const badgeText = count > 0 ? String(count) : '';

    await chrome.action.setBadgeText({ tabId, text: badgeText });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#F59E0B' });
  } catch (err) {
    console.warn('Failed to update badge:', err);
  }
}

// Tab Listeners
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      await updateBadge(activeInfo.tabId, tab.url);
    }
  } catch (e) {
    // Tab closing
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab && tab.url) {
    await updateBadge(tabId, tab.url);
  }
});

// Native Storage Watcher for Real-Time Synchronization
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local') {
    if (changes.huegist_docs) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id && tab.url) {
          await updateBadge(tab.id, tab.url);
        }
      } catch (err) {
        console.warn('Badge refresh error:', err);
      }
    }
    if (changes.huegist_palette) {
      await rebuildContextMenus();
    }
  }
});

// Unified Message Bus
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'HUEGIST_HIGHLIGHT_CHANGED': {
          const tabId = sender.tab ? sender.tab.id : null;
          if (tabId && message.url) {
            await updateBadge(tabId, message.url);
          }
          sendResponse({ success: true });
          break;
        }

        case 'HUEGIST_OPEN_SIDEPANEL': {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab && activeTab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
            await chrome.sidePanel.open({ windowId: activeTab.windowId });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false });
          }
          break;
        }

        default:
          sendResponse({ received: true });
          break;
      }
    } catch (err) {
      console.error('Error handling message in service-worker:', err);
      sendResponse({ error: err.message });
    }
  })();

  return true;
});
