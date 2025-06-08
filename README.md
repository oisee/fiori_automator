# Fiori Test Automation System - Browser Extension

🎯 **Intelligent test automation system for SAP Fiori applications with AI-powered analysis and OData correlation**

## Features

### Core Capabilities
- **Universal Capture**: Records all user interactions (clicks, inputs, form submissions, drag & drop, file uploads)
- **OData Correlation**: Automatically links UI actions with backend OData requests
- **SAPUI5 Context**: Deep extraction of Fiori app context and control metadata
- **Screenshot Capture**: High-quality screenshots with element highlighting
- **Real-time Analysis**: Live feedback during recording sessions
- **Session Management**: Save, export, and replay recorded sessions

### Advanced Features
- **Network Request Interception**: Captures all HTTP requests with full payloads
- **Intelligent Correlation**: AI-powered matching of UI events to network calls
- **Visual Validation**: Element highlighting and click point indicators
- **Cross-browser Support**: Universal extension compatible with Chrome, Edge, and Firefox
- **Enterprise Ready**: Built for SAP environments with security best practices

## Installation

### From Source
1. Clone or download this repository
2. Open your browser's extension management page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Firefox: `about:addons`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory
5. The Fiori Test Automation icon should appear in your browser toolbar

### Browser Compatibility
- ✅ Chrome 88+
- ✅ Edge 88+
- ✅ Firefox 85+ (with manifest v2 compatibility)

## Usage

### Starting a Recording Session
1. Navigate to your SAP Fiori application
2. Click the Fiori Test Automation extension icon
3. Configure recording options:
   - Session name (optional)
   - Screenshot capture (recommended)
   - SAPUI5 context extraction (for Fiori apps)
   - Auto-correlation of OData requests
4. Click "Start Recording"
5. Perform your test scenario in the application
6. Click "Stop Recording" when finished

### Recording Controls
- 🔴 **Start**: Begin capturing interactions
- ⏸️ **Pause**: Temporarily pause recording
- ⏹️ **Stop**: End recording and save session
- 💾 **Export**: Download session data as JSON

### What Gets Captured
- **UI Interactions**: Clicks, inputs, form submissions, keyboard shortcuts
- **Network Requests**: All OData calls with request/response data
- **Screenshots**: Visual snapshots at each interaction point
- **SAPUI5 Context**: Control types, properties, data binding information
- **Timing Data**: Precise timestamps for correlation and replay

## Architecture

### Extension Components
```
fiori_automator/
├── manifest.json          # Extension manifest (v3)
├── background.js           # Service worker for network interception
├── content.js             # DOM interaction capture
├── injected.js            # Page context access for SAPUI5
├── popup.html/css/js      # Recording control interface
├── screenshot.js          # Screenshot capture utilities
└── icons/                 # Extension icons
```

### Data Flow
1. **Content Script** captures DOM interactions
2. **Background Script** intercepts network requests
3. **Correlation Engine** matches UI events with OData calls
4. **Storage Manager** persists session data
5. **Popup Interface** provides user controls and feedback

## Configuration

### Recording Options
- **Session Name**: Custom identifier for the recording
- **Screenshot Capture**: Enable/disable visual documentation
- **SAPUI5 Context**: Extract Fiori-specific metadata
- **Auto-correlation**: Automatic UI-to-OData matching
- **Correlation Window**: Time window for event correlation (default: 5 seconds)

### Advanced Settings
Access via extension popup → Settings:
- Correlation confidence threshold
- Screenshot quality and compression
- Network request filtering
- Storage and retention policies

## Data Structure

### Session Format
```json
{
  "sessionId": "uuid",
  "metadata": {
    "sessionName": "Purchase Order Creation",
    "applicationUrl": "https://...",
    "ui5Version": "1.108.0",
    "startTime": 1703123456789,
    "endTime": 1703123556789
  },
  "events": [
    {
      "eventId": "uuid",
      "type": "click",
      "timestamp": 1703123460000,
      "coordinates": { "x": 150, "y": 200 },
      "element": {
        "selector": "#button1",
        "tagName": "BUTTON",
        "ui5Context": { "controlType": "sap.m.Button" }
      },
      "screenshot": "data:image/png;base64,...",
      "correlatedRequests": [...]
    }
  ]
}
```

### OData Request Format
```json
{
  "requestId": "uuid",
  "url": "/sap/opu/odata/...",
  "method": "POST",
  "timestamp": 1703123461000,
  "payload": {...},
  "response": {...},
  "correlation": {
    "uiEventId": "uuid",
    "confidence": 95,
    "timeDifference": 1200
  }
}
```

## Development

### Prerequisites
- Node.js 16+ (for development tools)
- Modern browser with extension development support
- Access to SAP Fiori applications for testing

### Setup
```bash
# Clone repository
git clone <repository-url>
cd fiori_automator

# Install development dependencies (optional)
npm install

# Load extension in browser
# See installation instructions above
```

### Testing
1. Load extension in development mode
2. Navigate to a Fiori application
3. Test recording functionality
4. Verify data capture and correlation
5. Check console for any errors

### Browser Permissions
The extension requires these permissions:
- `activeTab`: Access to current tab content
- `storage`: Save session data locally
- `scripting`: Inject content scripts
- `webRequest`: Intercept network requests
- `host_permissions`: Access to all websites

## Security & Privacy

### Data Handling
- All data is stored locally in browser storage
- No data is transmitted to external servers
- Session data can be manually exported/imported
- Automatic cleanup of old sessions (configurable)

### Enterprise Considerations
- Respects SAP authorization frameworks
- Compatible with corporate proxy settings
- No modification of application data
- Read-only capture of interactions

### Best Practices
- Avoid recording sensitive data entry
- Use session names without personal information
- Regularly export and backup important sessions
- Review captured data before sharing

## API Integration

### Background Script API
```javascript
// Start recording
chrome.runtime.sendMessage({
  type: 'start-recording',
  data: { sessionName: 'My Test' }
});

// Get session data
chrome.runtime.sendMessage({
  type: 'get-session-data'
}, response => {
  console.log(response.data);
});
```

### Content Script API
```javascript
// Capture custom event
chrome.runtime.sendMessage({
  type: 'capture-event',
  data: {
    type: 'custom',
    description: 'Custom action performed'
  }
});
```

## Troubleshooting

### Common Issues

**Recording doesn't start**
- Check if extension has necessary permissions
- Verify the tab is not in incognito mode (if not enabled)
- Refresh the page and try again

**OData correlation missing**
- Ensure auto-correlation is enabled
- Check network request filtering settings
- Verify requests are actually OData calls

**Screenshots not captured**
- Check if screenshot capture is enabled
- Verify browser permissions for tab capture
- Try refreshing the page

**SAPUI5 context not detected**
- Confirm the application is actually a Fiori app
- Check browser console for injection errors
- Verify SAPUI5 version compatibility

### Debug Mode
Enable debug logging in browser console:
```javascript
localStorage.setItem('fiori-debug', 'true');
```

### Support
- Check browser console for error messages
- Export session data for analysis
- Review extension permissions and settings

## Roadmap

### Version 1.1
- [ ] Visual regression testing
- [ ] Advanced replay capabilities  
- [ ] Batch session processing
- [ ] Enhanced AI analysis

### Version 1.2
- [ ] ABAP system integration
- [ ] Performance metrics
- [ ] Test scenario generation
- [ ] Custom assertion support

## Contributing

Contributions are welcome! Please read the contributing guidelines and ensure:
- Code follows existing patterns
- All features are tested
- Documentation is updated
- Security best practices are followed

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Built for SAP Fiori developers and testers** 🚀