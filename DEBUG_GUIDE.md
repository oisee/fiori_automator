# 🐛 Debugging Guide - Fiori Test Automation Extension

## Issue: Recording Not Starting

### 1. Reload the Extension
After making changes:
1. Go to `edge://extensions/`
2. Click the **Refresh** button on the extension card
3. **Important**: Refresh the Fiori page (F5) to reload content scripts

### 2. Check Extension Logs

#### Popup Console (Right-click extension icon → Inspect popup)
You should see:
```
Starting recording...
Recording config: {sessionName: "Session...", ...}
Background response: {success: true}
Content script notified
```

#### Background Script Console
1. Go to `edge://extensions/`
2. Click "service worker" link under the extension
3. Look for:
```
[Fiori BG] Received message: start-recording
```

#### Page Console (F12 on the Fiori page)
Enable debug mode first:
```javascript
localStorage.setItem('fiori-debug', 'true')
```
Then refresh the page and look for:
```
🎯 Fiori Test Capture: Debug mode enabled
```

### 3. Common Issues & Fixes

#### Issue: Popup closes when clicking
This is normal browser behavior. The extension continues working in the background.

#### Issue: "Cannot read properties" error
1. The content script might not be injected
2. **Solution**: Refresh the Fiori page after installing/updating the extension

#### Issue: No response from background script
1. Check if service worker is active in `edge://extensions/`
2. If "Inactive", click the extension icon to wake it up

### 4. Manual Testing

#### Test Background Script:
```javascript
// In background script console
chrome.storage.local.get(null, console.log)
```

#### Test Content Script Injection:
```javascript
// In page console
console.log('Content script loaded:', typeof FioriTestCapture !== 'undefined')
```

#### Test Message Passing:
```javascript
// In page console
chrome.runtime.sendMessage({type: 'get-sessions'}, console.log)
```

### 5. Enable Full Debug Logging

In **three different consoles**:

1. **Page Console** (F12):
```javascript
localStorage.setItem('fiori-debug', 'true')
localStorage.setItem('fiori-trace-events', 'true')
```

2. **Background Console** (service worker):
```javascript
chrome.storage.local.set({'debug-mode': true})
```

3. **Popup Console** (right-click icon):
Check console.log outputs

### 6. Recording Indicator

When recording starts successfully, you should see:
- A red "🔴 Recording Fiori Session" indicator in the top-left of the page
- The popup UI should change to show pause/stop buttons
- Console logs showing captured events

### 7. Quick Fix Checklist

✅ Extension reloaded after changes  
✅ Fiori page refreshed after extension reload  
✅ Debug mode enabled in page console  
✅ Service worker is active  
✅ No errors in any of the three consoles  

### 8. Test on Simple Page First

Create a test HTML file:
```html
<!DOCTYPE html>
<html>
<head><title>Extension Test</title></head>
<body>
    <h1>Test Page</h1>
    <button onclick="console.log('clicked')">Test Button</button>
    <input type="text" placeholder="Test input">
</body>
</html>
```

1. Open this file in Edge
2. Try recording on this simple page
3. If it works here but not on Fiori, it's likely a content script injection issue

### 9. Force Content Script Injection

If content script isn't loading on Fiori:
```javascript
// In background console
chrome.tabs.query({active: true}, (tabs) => {
  chrome.scripting.executeScript({
    target: {tabId: tabs[0].id},
    files: ['content.js']
  });
});
```

### 10. Check Permissions

Ensure the Fiori URL matches the extension's host permissions:
- Check the URL pattern
- Verify it's not blocked by enterprise policies
- Try on a non-HTTPS site to test

---

**Still not working?** 
1. Check all three consoles for specific error messages
2. The SAP errors you see are from the Fiori app itself, not the extension
3. Focus on extension-specific errors that mention "Fiori Test" or "chrome.runtime"