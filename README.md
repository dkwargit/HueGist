# 🌈 HueGist – Smart Highlight Extractor

**HueGist** is a browser extension that captures all text highlighted by a user while reading PDF documents or web-based files in the browser. It then compiles the highlights into a neatly organized export file (either Google Docs or PDF), preserving color-based groupings and page structure if needed.

---

## 🚀 Key Features

- ✅ Real-time monitoring of highlights on any document (browser-based PDFs, webpages)
- 🖍️ Multiple color highlight support (can be toggled on/off)
- 📄 Export highlights as:
  - Google Docs (auto-uploaded)
  - Downloadable PDF (locally saved)
- 🧠 Clean bullet-pointed formatting for highlights
- 📁 File name format: `<original_file_name>_<HueGist>.<ext>`
- 🌐 Browser-first focus (Chrome, Edge, Firefox)
- 📱 Future support planned for mobile/desktop apps

---

## 📦 Project Structure

HueGist/
- ├── manifest.json                # Chrome Extension manifest (V3)
- ├── background.js                # Handles persistent logic / Google Docs export
- ├── content.js                   # Injected into browser to detect highlights
- ├── popup.html                   # Popup UI for user control
- ├── popup.js                     # Popup logic and event handling
- ├── popup.css                    # Popup styling
- ├── utils/
- │ └── highlightParser.js         # Custom logic for extracting & formatting highlights
- ├── icons/                       # Extension icons (128px, 64px, etc.)
- └── README.md                    # Project documentation

---

## 🧰 Tech Stack

- JavaScript (ES6+)
- Chrome Extensions API (Manifest V3)
- Google Docs API (for cloud export)
- PDF.js (optional, for PDF parsing if needed)
- html2pdf.js (for PDF export from HTML format)

---

## 🔐 Permissions Used

```json
"permissions": [
  "activeTab",
  "scripting",
  "storage",
  "downloads",
  "tabs"
],
"host_permissions": [
  "*://*/*"
]
