# Build and Deployment Guide

This guide explains how to build and deploy the Fiori Test Automation extension for development and testing.

## 🚀 Quick Start

```bash
# Build and copy to Windows (most common workflow)
make build

# Or use the build script directly
./build.sh
```

## Available Commands

| Command | Description |
|---------|-------------|
| `make build` | Build extension and copy to Windows (`C:\bin\fiori_automator\`) |
| `make deploy` | Same as build |
| `make clean` | Remove all build artifacts and Windows files |
| `make install` | Set permissions and build |
| `make validate` | Check manifest.json validity |
| `make test` | Show manual testing instructions |
| `make help` | Show help message |

## Windows Installation

1. **Build the extension:**
   ```bash
   make build
   ```

2. **Load in browser:**
   - Open Chrome/Edge
   - Go to `chrome://extensions/` or `edge://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Navigate to `C:\bin\fiori_automator\`
   - Select the folder

3. **Ready to use!** The extension will appear in your browser toolbar.

## 🛠️ Build Process (Optional)

### Create Production Build

```bash
# Create build script
cat > build.sh << 'EOF'
#!/bin/bash

# Clean previous builds
rm -rf dist/
mkdir -p dist/

# Copy extension files
cp -r icons dist/
cp manifest.json dist/
cp *.js dist/
cp *.html dist/
cp *.css dist/

# Create icons if missing
if [ ! -f "dist/icons/icon128.png" ]; then
    echo "⚠️  Warning: Icon files missing. Using placeholder."
    mkdir -p dist/icons
    # Create placeholder icons (you should replace with actual icons)
    for size in 16 32 48 128; do
        echo "🎯" > "dist/icons/icon${size}.png"
    done
fi

# Package for distribution
cd dist/
zip -r ../fiori-test-automation-edge.zip .
cd ..

echo "✅ Build complete! Extension packaged as fiori-test-automation-edge.zip"
EOF

chmod +x build.sh
./build.sh
```

## 🐛 Debug Mode

### Enable Debug Logging

The extension includes comprehensive debug logging. Enable it in **three ways**:

#### 1. Via Browser Console (Recommended)
```javascript
// Enable debug mode
localStorage.setItem('fiori-debug', 'true');

// Check debug status
localStorage.getItem('fiori-debug');

// Disable debug mode
localStorage.removeItem('fiori-debug');
```

#### 2. Via Extension Popup
1. Click extension icon
2. Press `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac)
3. Debug mode indicator will appear

#### 3. Via Background Script
```javascript
// In Edge DevTools for extension
chrome.storage.local.set({ 'debug-mode': true });
```

### Debug Features When Enabled

- **Verbose Console Logging**: All events, correlations, and network requests
- **Performance Timing**: Execution time for each operation
- **Network Request Details**: Full request/response payloads
- **UI5 Context Dumps**: Complete SAPUI5 control trees
- **Correlation Confidence**: Detailed scoring information
- **Error Stack Traces**: Full error details with line numbers

## 📊 Edge Developer Tools

### 1. Extension Background Page
1. Go to `edge://extensions/`
2. Find "Fiori Test Automation System"
3. Click "background page" link
4. Opens dedicated DevTools for background script

### 2. Content Script Debugging
1. Open any website
2. Press `F12` to open DevTools
3. Go to "Sources" tab
4. Find extension files under `extension://[extension-id]/`

### 3. Popup Debugging
1. Right-click extension icon
2. Select "Inspect popup"
3. Opens DevTools for popup window

## 🔍 Trace Mode

### Enable Network Trace
```javascript
// In background script console
window.TRACE_NETWORK = true;
```

### Enable Event Trace
```javascript
// In content script console
window.TRACE_EVENTS = true;
```

### Enable UI5 Trace
```javascript
// In page console
window.TRACE_UI5 = true;
```

## 🎯 Testing the Extension

### Basic Functionality Test

1. **Load Test Page**
   ```html
   <!-- Save as test.html and open in Edge -->
   <!DOCTYPE html>
   <html>
   <head>
       <title>Extension Test</title>
   </head>
   <body>
       <h1>Fiori Test Extension - Test Page</h1>
       <button id="testButton">Click Me</button>
       <input type="text" id="testInput" placeholder="Type here">
       <form id="testForm">
           <input type="text" name="field1" placeholder="Field 1">
           <button type="submit">Submit</button>
       </form>
       
       <script>
           // Simulate OData-like requests
           document.getElementById('testButton').addEventListener('click', () => {
               fetch('/api/test/odata/service?$format=json')
                   .then(r => r.json())
                   .catch(e => console.log('Expected error:', e));
           });
       </script>
   </body>
   </html>
   ```

2. **Start Recording**
   - Click extension icon
   - Click "Start Recording"
   - Interact with test elements
   - Check console for debug output

### Advanced Testing with SAPUI5

```html
<!-- Save as test-ui5.html -->
<!DOCTYPE html>
<html>
<head>
    <title>SAPUI5 Test Page</title>
    <script id="sap-ui-bootstrap"
            src="https://openui5.hana.ondemand.com/resources/sap-ui-core.js"
            data-sap-ui-theme="sap_fiori_3"
            data-sap-ui-libs="sap.m">
    </script>
</head>
<body class="sapUiBody">
    <div id="content"></div>
    <script>
        sap.ui.getCore().attachInit(function() {
            new sap.m.Button({
                text: "SAP Button",
                press: function() {
                    sap.m.MessageToast.show("Button pressed!");
                }
            }).placeAt("content");
        });
    </script>
</body>
</html>
```

## 🔧 Troubleshooting

### Extension Not Loading
```bash
# Check manifest syntax
python3 -m json.tool manifest.json

# Verify file permissions
ls -la *.js *.html *.css
```

### Debug Output Not Showing
```javascript
// Force debug mode
console.log('Debug status:', localStorage.getItem('fiori-debug'));

// Check if content script is injected
console.log('Fiori extension loaded:', typeof FioriTestCapture !== 'undefined');
```

### Network Requests Not Captured
1. Check permissions in manifest.json
2. Verify URL patterns in host_permissions
3. Check Edge settings for extension permissions

## 📈 Performance Monitoring

### Enable Performance Metrics
```javascript
// In extension console
performance.mark('fiori-start');
// ... operations ...
performance.mark('fiori-end');
performance.measure('fiori-operation', 'fiori-start', 'fiori-end');

// View all metrics
performance.getEntriesByType('measure').forEach(entry => {
    console.log(`${entry.name}: ${entry.duration}ms`);
});
```

### Memory Profiling
1. Open extension background page DevTools
2. Go to "Memory" tab
3. Take heap snapshot before/after recording
4. Compare snapshots for memory leaks

## 🚦 Debug Commands Reference

### Console Commands
```javascript
// View all captured events
chrome.storage.local.get(['fioriSessions'], console.log);

// Clear all sessions
chrome.storage.local.clear();

// Export current session
chrome.runtime.sendMessage({type: 'get-session-data'}, console.log);

// Simulate events
chrome.runtime.sendMessage({
    type: 'capture-event',
    data: {type: 'test', description: 'Debug test event'}
});

// Check extension state
chrome.runtime.sendMessage({type: 'get-state'}, console.log);
```

### Debug Flags
```javascript
// Set multiple debug flags
const debugFlags = {
    'fiori-debug': 'true',
    'fiori-trace-network': 'true',
    'fiori-trace-events': 'true',
    'fiori-trace-ui5': 'true',
    'fiori-verbose': 'true'
};

Object.entries(debugFlags).forEach(([key, value]) => {
    localStorage.setItem(key, value);
});
```

## 🎨 Icon Creation (Optional)

If you need to create proper icons:

```bash
# Install ImageMagick
# Ubuntu/Debian: sudo apt-get install imagemagick
# macOS: brew install imagemagick
# Windows: download from imagemagick.org

# Create icons from a source image (logo.png)
for size in 16 32 48 128; do
    convert logo.png -resize ${size}x${size} icons/icon${size}.png
done
```

## 📦 Publishing to Edge Add-ons (Future)

When ready for production:

1. Create Microsoft Partner Center account
2. Package extension: `zip -r extension.zip dist/`
3. Upload to Edge Add-ons developer dashboard
4. Complete store listing information
5. Submit for review

## 🔐 Security Considerations

### Development Mode
- Extension has broad permissions in dev mode
- Only install on trusted sites during development
- Disable when not actively testing

### Production Deployment
- Review and minimize permissions
- Implement content security policy
- Add domain allowlisting for enterprise use

---

**Happy Debugging! 🐛**