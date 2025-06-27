# Fiori Test Automation System - Browser Extension

🎯 **The First Step to Killing Fiori: Capture Everything, Then Eliminate the UI**

> "The ideal system is one that doesn't exist but its function is performed." - TRIZ

## 🚀 The Vision: From 23 Clicks to Zero

Article:
 - [I killed Fiori](https://www.linkedin.com/pulse/i-killed-fiori-id-do-again-alice-vinogradova-tbnjc/)
 - [I killed Fiori](I%20Killed%20Fiori.md)


This extension is the first phase in eliminating the Fiori UI layer entirely. By capturing every interaction, UI5 context, and OData request, we're building the foundation for direct AI-to-OData communication. 

**Current Reality**: User → Clicks → UI → OData → Backend  
**Our Future**: User → Natural Language → OData → Backend

The extension proves that 80% of Fiori interactions are pure UI overhead. Once we capture the patterns, we can bypass the UI entirely.

## ✅ Current Status: Fully Functional

This extension is **production-ready** with all major issues resolved:
- ✅ Service worker installation and manifest compliance
- ✅ Event capture with proper synchronization  
- ✅ Screenshot system with semantic filenames and rate limiting
- ✅ Bundle export (JSON + Markdown + Screenshots in ZIP)
- ✅ Clean semantic filename format across all exports
- ✅ Enhanced SAPUI5/Fiori app detection
- ✅ Request filtering for business-focused captures
- ✅ Audio recording with voice narration support
- ✅ Single source of truth for filename generation

---

## 🎯 Why This Extension Exists

After analyzing hundreds of Fiori sessions, we discovered:
- **80% waste**: Most interactions are just translating clicks to OData calls
- **10 clicks, 27 seconds** for simple updates that should take 1 second
- **23 @UI annotations** just to display fields that already exist in the backend

This extension captures the patterns needed to build the ultimate solution: an MCP-OData bridge that lets AI talk directly to SAP backends, eliminating the UI entirely.

### The Master Plan
1. **Phase 1** (This Extension): Capture all interactions, understand the patterns
2. **Phase 2** (Coming Soon): Build parametrized automations from captured sessions  
3. **Phase 3** (The Kill Shot): MCP-OData Bridge - Natural language directly to backend

---

## 🚀 Quick Start

### Installation
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the project folder
5. Pin the extension to your toolbar

### Basic Usage
1. **Navigate** to any SAP Fiori application
2. **Click** the extension icon and select "Start Recording"
3. **Interact** with the Fiori app (clicks, forms, navigation)
4. **Stop** recording when finished
5. **Export** your session as JSON or Bundle (recommended)

### What to Capture (For Maximum Impact)
Focus on capturing sessions that show:
- **Repetitive tasks** you do daily (these are prime automation candidates)
- **Multi-step processes** that should be simple (expose the UI complexity)
- **Data updates** that require navigating through multiple screens
- **Search and filter operations** that could be natural language queries
- **Any workflow where you think** "there must be a better way"

Each captured session helps map the OData services behind the UI curtain.

---

## 📋 Features

### Core Capabilities (Building Blocks for UI Elimination)
- **Universal Capture**: Records all user interactions to understand how humans navigate the UI maze
- **OData Correlation**: The key insight - every UI action eventually triggers OData calls (this is what we'll use directly)
- **SAPUI5 Context**: Extracts the business logic hidden behind @UI annotations and control hierarchies
- **Screenshot Capture**: Documents the visual overhead we're about to eliminate
- **Real-time Analysis**: Shows exactly how much time is wasted on UI navigation
- **Session Management**: Build a library of patterns for direct OData access

### Advanced Features
- **Network Request Interception**: Captures all HTTP requests with intelligent filtering
- **Business Process Flow**: Clean mermaid diagrams showing meaningful operations only
- **Visual Documentation**: Screenshots automatically embedded in markdown exports
- **Request Filtering**: Smart filtering of JS/CSS/assets to focus on business operations
- **Semantic Filenames**: Clean, sortable filenames for all exports
- **Audio Recording**: Optional voice narration during sessions
- **Bundle Export**: Single ZIP containing JSON, Markdown, and all screenshots
- **Enhanced App Detection**: Uses UI5 models, About Dialog, and Fiori Apps Library integration

### Export Options

#### 1. **Save JSON** - Session Data Only
- File: `fs-YYYY-MM-DD-HHMM-app-name.json`
- Complete session data with metadata
- Application intelligence summary
- Screenshot references
- OData correlation analysis

#### 2. **Save Bundle** - Complete Package (Recommended)
- File: `fs-YYYY-MM-DD-HHMM-app-name.zip`
- Contains: JSON + Markdown + All Screenshots
- Ready for sharing and documentation
- All files use consistent naming scheme

#### 3. **Export Audio** (if recorded)
- File: `fs-YYYY-MM-DD-HHMM-app-name-audio.webm`
- Voice narration recorded during session
- Normal quality, opus codec

---

## 🛠️ Technical Details

### Architecture
- **Manifest V3** Chrome extension with proper service worker
- **Content Script**: Captures DOM events and UI5 context
- **Background Script**: Manages sessions, screenshots, and exports
- **Injected Scripts**: Deep access to page context and UI5 internals

### Filename Format
All exports use a consistent semantic naming pattern:
```
fs-YYYY-MM-DD-HHMM-app-name.{extension}
```

Examples:
- `fs-2025-06-10-1430-manage-detection-methods.json`
- `fs-2025-06-10-1430-manage-detection-methods.zip`
- `fs-2025-06-10-1430-manage-detection-methods-0001-click.png`

### Screenshot System
- **Rate Limited**: Maximum 2 screenshots per second
- **Semantic IDs**: Sequential numbering (0001, 0002, etc.)
- **Event Correlation**: Each screenshot linked to specific user action
- **Quality**: Full viewport capture with element highlighting

### SAPUI5 Detection Methods
1. **UI5 Model Data** (AppInfo, SysInfo JSONModels)
2. **About Dialog** pattern detection
3. **Direct API** access to `sap.ui.getCore()`
4. **DOM Heuristics** for Fiori patterns
5. **URL Analysis** for app component patterns
6. **Fiori Apps Library** correlation

---

## 🧪 Testing & Debugging

### Installation Verification
1. Check extension loads without errors in `chrome://extensions/`
2. Verify all files present: `manifest.json`, `background.js`, `content.js`, etc.
3. Test popup interface opens correctly

### Recording Test
1. Navigate to any Fiori application
2. Open browser DevTools Console
3. Start recording and look for debug messages:
   ```
   [Fiori] Recording started - isRecording = true
   [Fiori] Click captured and sent to background
   ```

### Export Test  
1. Record a short session (2-3 clicks)
2. Stop recording
3. Open Sessions page and test "Save Bundle"
4. Verify ZIP contains JSON + MD + PNG files

### Debug Mode
Enable debug logging:
1. Open browser console
2. Run: `localStorage.setItem('fiori-debug', 'true')`
3. Reload page - you'll see detailed logging

---

## 📁 File Structure

```
fiori_automator/
├── manifest.json           # Extension configuration
├── popup.html/js/css       # Extension popup interface
├── background.js           # Service worker (main logic)
├── content.js             # Page interaction capture
├── sessions.html/js/css    # Session management UI
├── injected.js            # Deep page context access
├── ui5-detector.js        # SAPUI5 detection engine
├── zip-utils.js           # ZIP file creation utility
├── icons/                 # Extension icons (16,32,48,128px)
└── README.md              # This file
```

---

## 🐛 Troubleshooting

### Common Issues

**Extension won't install**
- Check Chrome version (requires Manifest V3 support)
- Ensure all files present in directory
- Check for syntax errors in manifest.json

**No events captured**
- Verify content script loaded (check console)
- Check if page has CSP restrictions
- Enable debug mode for detailed logging

**Screenshots not working**
- Check chrome.tabs permission in manifest
- Verify tab is active and visible
- Check rate limiting (max 2/second)

**Bundle export empty**
- Check if session has events
- Verify screenshots were captured during recording
- Enable debug logging to see screenshot collection

### Support
For issues or questions:
1. Enable debug mode and check console logs
2. Check the Sessions page for detailed session data
3. Verify all extension files are present and loaded

---

## 🔧 Development

### Building from Source
1. Clone repository
2. No build step required - load directly as unpacked extension
3. Modify files and reload extension to test changes

### Key Files to Modify
- `background.js` - Core logic, session management, exports
- `content.js` - Event capture, UI5 detection
- `popup.js` - User interface logic
- `sessions.js` - Session viewer and export interface

### Testing Changes
1. Make modifications
2. Go to `chrome://extensions/`
3. Click reload button for the extension
4. Test functionality in Fiori applications

---

## 🔮 The Endgame: Life After Fiori

When this project succeeds, here's what changes:

### Before (Fiori Way)
```
User: "Update purchase order 4500123456 delivery date to next Friday"
Steps: Open Fiori → Find App → Click Tile → Wait → Search PO → Click Edit → 
       Change Date → Save → Confirm → Close
Time: 4 minutes, 23 clicks
```

### After (Direct OData)
```
User: "Update purchase order 4500123456 delivery date to next Friday"
AI: Done. Delivery date updated to July 3, 2025.
Time: 2 seconds, 0 clicks
```

The extension you're using today is capturing the data to make this future possible. Every session recorded brings us closer to eliminating the 80% waste in enterprise software.

---

**Version**: 1.1 (The UI Killer)  
**Last Updated**: June 2025  
**Chrome Manifest**: V3 Compatible  
**Next Phase**: MCP-OData Bridge (Coming Soon)