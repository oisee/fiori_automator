# 🚀 Installing Fiori Test Automation Extension in Microsoft Edge

## Quick Installation Guide

### Step 1: Open Edge Extensions Page
1. Open Microsoft Edge browser
2. Type `edge://extensions/` in the address bar and press Enter
3. Or navigate via: Menu (•••) → Extensions → Manage extensions

### Step 2: Enable Developer Mode
1. Look for the **"Developer mode"** toggle (usually in the bottom-left corner)
2. Turn it **ON** - the toggle should become blue
   
   ![Developer Mode Location]
   ```
   [Extensions page]
   ┌─────────────────────────────────────────┐
   │ Extensions                              │
   │                                         │
   │ [Your extensions will appear here]     │
   │                                         │
   └─────────────────────────────────────────┘
   Developer mode: [ON]  ← Turn this on
   ```

### Step 3: Load the Extension
1. Click the **"Load unpacked"** button that appears after enabling Developer mode
2. Navigate to the `fiori_automator` folder on your computer
3. Select the folder (don't go inside it, just select the folder itself)
4. Click **"Select Folder"**

### Step 4: Verify Installation
✅ You should see:
- "Fiori Test Automation System" in your extensions list
- The extension icon (🎯) in your browser toolbar
- Status showing as "Enabled"

### Step 5: Pin the Extension (Recommended)
1. Click the puzzle piece icon in Edge toolbar
2. Find "Fiori Test Automation System"
3. Click the pin icon to keep it visible

## 🐛 Debug/Trace Mode

### Method 1: Quick Enable via Console (Easiest)

1. Open any website
2. Press `F12` to open Developer Tools
3. Go to the **Console** tab
4. Type this command and press Enter:
   ```javascript
   localStorage.setItem('fiori-debug', 'true')
   ```
5. Refresh the page (`F5`)
6. You'll see debug messages in the console starting with `[Fiori Content]`

### Method 2: Extension-Wide Debug

1. Go to `edge://extensions/`
2. Find "Fiori Test Automation System"
3. Click **"background page"** link
4. In the console that opens, type:
   ```javascript
   chrome.storage.local.set({ 'debug-mode': true })
   ```
5. This enables debug mode for all components

### Method 3: Keyboard Shortcut (In Popup)

1. Click the extension icon
2. Press `Ctrl+Shift+D` (Windows) or `Cmd+Shift+D` (Mac)
3. Debug indicator will appear

## 📊 Viewing Debug Output

### Background Script Logs
1. Go to `edge://extensions/`
2. Click "background page" under the extension
3. Console shows:
   - Network request interception
   - Session management
   - Storage operations

### Content Script Logs
1. Open any webpage
2. Press `F12` for DevTools
3. Console shows:
   - DOM event captures
   - Click coordinates
   - UI5 context extraction

### Popup Logs
1. Right-click extension icon
2. Select "Inspect popup"
3. Console shows:
   - UI interactions
   - Recording state changes

## 🧪 Testing the Extension

### Quick Test
1. Click the extension icon
2. You should see:
   - Ready status
   - Application detection info
   - Recording controls

### Full Test
1. Navigate to any web application
2. Click extension icon
3. Click "Start Recording"
4. Perform these actions:
   - Click a button
   - Type in a text field
   - Submit a form
5. Click "Stop Recording"
6. Check debug console for captured events

### Debug Output Examples

When debug mode is enabled, you'll see:

```javascript
// Click capture
[Fiori Content] Click captured: {
  type: 'click',
  coordinates: { x: 150, y: 200 },
  element: { tagName: 'BUTTON', id: 'submit-btn' }
}

// Network request
[Fiori BG] 2024-01-15T10:30:45.123Z OData request intercepted: {
  url: '/sap/opu/odata/service',
  method: 'GET',
  requestId: 'abc-123'
}

// UI5 Context
[Fiori Content] UI5 Context detected: {
  version: '1.108.0',
  theme: 'sap_fiori_3',
  control: 'sap.m.Button'
}
```

## 🔧 Troubleshooting

### Extension Not Appearing
- Ensure you selected the correct folder (containing manifest.json)
- Check for error messages in `edge://extensions/`
- Try reloading the extension

### No Debug Output
```javascript
// Verify debug is enabled
console.log('Debug enabled:', localStorage.getItem('fiori-debug'))
// Should output: Debug enabled: true
```

### Icons Not Showing
- The extension includes placeholder icons
- This won't affect functionality
- Custom icons can be added later

### Permission Errors
1. Click extension icon
2. If you see "Cannot read properties", refresh the page
3. Edge might need page reload after installation

## 🎯 Next Steps

1. **Test on a Fiori App**: Navigate to an SAP Fiori application for best results
2. **Record a Session**: Try recording a simple workflow
3. **Export Data**: Use the export button to save session data
4. **Review Debug Logs**: Check console for detailed capture information

## 📝 Debug Commands Reference

```javascript
// Enable verbose logging
localStorage.setItem('fiori-debug', 'true')
localStorage.setItem('fiori-trace-network', 'true')
localStorage.setItem('fiori-trace-events', 'true')

// View all sessions
chrome.storage.local.get(null, console.log)

// Clear all data
chrome.storage.local.clear()

// Check extension version
chrome.runtime.getManifest().version
```

---

**Ready to start recording! 🎬**