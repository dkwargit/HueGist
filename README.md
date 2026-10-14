# HueGist – Smart Highlight Extractor

**HueGist** is a browser extension that captures all text highlighted by a user while reading PDF documents or web-based files in the browser. It then compiles the highlights into a neatly organized export file (either Google Docs or PDF), preserving color-based groupings and page structure if needed.

---

## Key Features

- Real-time monitoring of highlights on any document (browser-based PDFs, webpages)
- Multiple color highlight support with user-customizable tags and palette colors
- Real-time Companion Side Panel (`Alt+Shift+S`) with live search, tags manager, and notes
- Interactive Center-Aligned Export Studio to preview and edit summaries before export
- Export highlights as:
  - Google Docs (auto-uploaded or rich-text formatted)
  - Downloadable PDF (locally saved with interactive preview and vector print)
  - Clean Markdown
- Clean bullet-pointed formatting for highlights
- File name format: `<original_file_name>_<HueGist>.<ext>`
- Browser-first focus (Chrome, Brave, Edge, Firefox)

---

## Project Structure

```text
HueGist/
├── manifest.json                # Chrome Extension Manifest (V3)
├── background/
│   └── service-worker.js        # Background worker: context menus, side panel, badge counts
├── content/
│   ├── content.js               # Injected selection detector & Shadow DOM highlighter
│   └── content.css              # In-page highlight marks & focus animation
├── popup/
│   ├── popup.html               # Extension action popup
│   ├── popup.js                 # Popup logic, color statistics & quick actions
│   └── popup.css                # Popup styling
├── sidepanel/
│   ├── sidepanel.html           # Real-time Companion Side Panel
│   ├── sidepanel.js             # Live highlight feed, tags manager, search & export
│   └── sidepanel.css            # Side panel dark theme styling
├── viewer/
│   ├── viewer.html              # Dedicated PDF reader interface
│   ├── viewer.js                # PDF.js text layer selection & highlight engine
│   ├── viewer.css               # PDF reader styling
│   ├── pdf.min.js               # Mozilla PDF.js core library
│   └── pdf.worker.min.js        # Mozilla PDF.js worker
├── export/
│   ├── preview.html             # Center-aligned interactive export preview studio
│   ├── preview.js               # Preview logic, live edits, print and export bindings
│   └── preview.css              # Center-aligned document styling and print CSS
├── utils/
│   ├── storage.js               # Chrome storage manager for highlights, custom tags & palette
│   └── exporter.js              # Markdown, PDF, and Google Docs rich-text generator
├── test/
│   ├── demo.html                # Sample web article for testing in-page highlighting
│   └── sample.pdf               # Sample PDF document for testing PDF reader
├── icons/                       # Extension icons (16px, 32px, 48px, 128px)
├── .gitignore                   # Git ignore patterns
└── README.md                    # Project documentation
```

---

## How to Install & Test (Unpacked Extension)

1. Open **Brave** or **Google Chrome** and navigate to `brave://extensions` or `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select this directory (`HueGist/`).
4. On the HueGist card, click **Details** and enable **"Allow access to file URLs"** (required for testing local `file:///` articles like `demo.html`).
5. Pin the **HueGist** icon to your toolbar.
6. **Testing on Webpages:**
   - Open [test/demo.html](file:///home/udit/Code/HueGist/test/demo.html) or any web article.
   - Select text to reveal the floating color toolbar or press `Alt+Shift+S` to open the **Companion Side Panel**.
   - Highlights immediately save, appear in the Side Panel feed, and update the extension badge counter in real-time.
7. **Customizing Tags & Colors:**
   - Open the Side Panel (`Alt+Shift+S`) and click the palette icon at the top right to open **Tags & Colors**.
   - Add custom colors with your choice of label, or delete existing tags.
   - The floating highlighter toolbar, filter pills, and export studio immediately update to reflect your custom tags.
8. **Testing on PDFs:**
   - Click the extension icon or open `viewer/viewer.html`.
   - Drop [test/sample.pdf](file:///home/udit/Code/HueGist/test/sample.pdf) into the reader to highlight text across pages.
9. **Interactive Export Studio:**
   - Click **PDF Export** in the Side Panel to open the center-aligned **Export Studio** (`export/preview.html`).
   - Click anywhere in the preview document to edit or refine sentences directly before saving.
   - Click **Save as PDF** to generate clean, vector-printed PDF notes, or click **Copy for Docs** / **Markdown** to export.

---

## Permissions Used

```json
"permissions": [
  "storage",
  "unlimitedStorage",
  "activeTab",
  "scripting",
  "sidePanel",
  "contextMenus",
  "tabs"
]
```

---

## Tech Stack

- Chrome Extensions API (Manifest V3)
- JavaScript (ES6+ / ES Modules)
- CSS3 & Modern Web Components (Shadow DOM)
- Mozilla PDF.js
- Chrome Storage API (`chrome.storage.local`, `chrome.storage.sync`)
- Google Docs REST API
- Web Clipboard API & Native Vector Print Engine


