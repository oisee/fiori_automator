# Fiori Automator - Complete Testing Guide

## 🔧 What Was Fixed

### ✅ Critical Fixes Applied
1. **Service Worker Registration** - Fixed syntax errors preventing extension installation
2. **Event Capture Synchronization** - Fixed empty events array by properly coordinating background and content scripts
3. **Screenshot Rate Limiting** - Fixed Chrome API quota errors with proper queue system
4. **Markdown Export** - Fixed TypeErrors in request body processing
5. **SAPUI5 Detection** - Enhanced detection with 6 different methods
6. **Request Filtering** - Added smart filtering to reduce noise from static assets

---

## 🧪 Step-by-Step Testing Instructions

### Step 1: Install and Verify Extension

1. **Remove Old Version**:
   - Go to `chrome://extensions/`
   - Remove any existing Fiori Automator extension

2. **Install Updated Version**:
   - Click "Load unpacked" 
   - Select this directory: `/home/alice/dev/fiori_automator/`
   - **Expected**: Extension loads without errors
   - **If Error**: Check console for specific error messages

3. **Verify Installation**:
   - Extension icon should appear in toolbar
   - No error messages in `chrome://extensions/`
   - Service worker should show "Active" status

### Step 2: Basic Functionality Test

1. **Navigate to any website** (start with a simple site like Google)

2. **Open Extension Popup**:
   - Click the extension icon
   - **Expected**: Popup opens without errors
   - **Check**: "Ready" status indicator should be visible

3. **Test Recording Start**:
   - Enter session name: "Test Basic Recording"
   - Ensure all checkboxes are checked
   - Click "Start Recording"
   - **Expected**: 
     - Status changes to "Recording" (red dot)
     - Timer starts (00:00, 00:01, etc.)
     - Success message appears

4. **Perform Test Interactions**:
   - Click various elements on the page
   - Type in any input fields
   - Submit any forms (if available)
   - **Expected**: 
     - Action count increases in popup
     - No error messages in console

5. **Test Recording Stop**:
   - Click "Stop" in popup
   - **Expected**:
     - Status returns to "Ready"
     - Success message appears
     - Session appears in "Recent Sessions"

### Step 3: Advanced Feature Testing

#### Test 1: Screenshot Capture System
1. Start recording with "Capture screenshots" enabled
2. Perform 5-10 quick clicks in succession
3. Stop recording
4. Export as "Screenshots" 
5. **Expected**: Multiple PNG files download without quota errors

#### Test 2: Event Capture Verification
1. Start recording
2. Open browser console
3. Load the diagnostic script:
   ```javascript
   // Paste contents of test_event_capture.js
   ```
4. **Expected**: All diagnostic tests should pass
5. Use `testRealClick()` function to verify real-time capture

#### Test 3: Request Filtering
1. Navigate to a complex website (like GitHub or Stack Overflow)
2. Start recording with "Filter JS/CSS/assets" **checked**
3. Interact with the page
4. Stop and export JSON
5. **Expected**: Network requests should focus on API calls, not static assets

6. Repeat with filtering **unchecked**
7. **Expected**: Many more requests including .js, .css, images

#### Test 4: Markdown Export
1. Complete a recording session with several interactions
2. Click "Export MD" 
3. **Expected**: 
   - Markdown file downloads
   - No error messages
   - File contains readable session summary

### Step 4: Fiori Application Testing

#### If you have access to a Fiori/SAPUI5 application:

1. **Navigate to Fiori Launchpad or Fiori App**

2. **Test SAPUI5 Detection**:
   - Open popup
   - **Expected**: Should show "✅ SAPUI5 Application Detected"
   - App details should show version and theme info

3. **Test Complete Workflow**:
   - Start recording
   - Navigate between tiles/apps
   - Perform business operations (search, filter, edit)
   - Generate some OData traffic
   - Stop recording

4. **Verify Rich Data Capture**:
   - Export markdown
   - **Expected**: Should contain:
     - OData analysis section
     - UI5 context information
     - Semantic event descriptions
     - Network request correlation

### Step 5: Error Handling Testing

#### Test Error Recovery:

1. **Tab Closing During Recording**:
   - Start recording
   - Close the tab
   - Open extension in new tab
   - **Expected**: No hanging sessions, clean state

2. **Background Script Communication**:
   - Start recording
   - In console, run: `chrome.runtime.reload()`
   - Continue interactions
   - **Expected**: Content script should handle communication failures gracefully

3. **Large Session Testing**:
   - Start recording
   - Perform 50+ interactions rapidly
   - Include multiple file uploads if possible
   - **Expected**: No memory issues, smooth performance

---

## 🐛 Troubleshooting Common Issues

### Issue: "Events array is empty" despite interactions

**Diagnosis**:
1. Run the diagnostic script: `/home/alice/dev/fiori_automator/test_event_capture.js`
2. Check console for content script messages
3. Verify recording state synchronization

**Solutions**:
- Reload the page and restart recording
- Check if content script is properly injected
- Try manual event test from diagnostic script

### Issue: "Screenshot quota exceeded"

**Diagnosis**: Look for `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` errors

**Solutions**:
- This should now be fixed with rate limiting
- If still occurring, reduce screenshot frequency in settings

### Issue: "Markdown export fails"

**Diagnosis**: Check console for specific error messages

**Solutions**:
- Ensure session has some data before exporting
- Check if background script is responding to export requests

### Issue: "SAPUI5 not detected"

**Diagnosis**: 
1. Check if page actually uses SAPUI5
2. Look for UI5 resources in network tab
3. Run UI5 detection manually in console

**Solutions**:
- Wait for page to fully load before opening popup
- Some UI5 apps may not be detectable (this is normal)

---

## 📊 Success Criteria

### ✅ All Tests Pass When:

1. **Installation**: Extension loads without service worker errors
2. **Basic Recording**: Can start/stop recording, see events captured
3. **Screenshots**: Multiple screenshots captured without quota errors  
4. **Events**: Diagnostic script shows all tests passing
5. **Filtering**: Clear difference between filtered and unfiltered requests
6. **Export**: All export formats (JSON, Markdown, Screenshots) work
7. **SAPUI5**: Proper detection on UI5 applications
8. **Error Handling**: Graceful recovery from common failure scenarios

### 🎯 Expected Performance:

- **Session Start**: < 2 seconds
- **Event Capture**: < 100ms per event
- **Screenshot Capture**: < 1 second (with rate limiting)
- **Export Generation**: < 5 seconds for typical session
- **Memory Usage**: No significant leaks during extended sessions

---

## 🚀 Advanced Testing (Optional)

### Load Testing:
- Record session with 200+ events
- Test on complex SPAs (single page applications)
- Multiple simultaneous recording sessions

### Integration Testing:
- Test with various Chrome extensions enabled
- Test on different websites (React, Angular, Vue.js)
- Test with different network conditions

### Accessibility Testing:
- Test with screen readers
- Test keyboard-only navigation
- Test with high contrast themes

---

## 📞 If Issues Persist

1. **Collect Debug Information**:
   - Run diagnostic script and save output
   - Export chrome extension logs
   - Note specific error messages

2. **Check Extension Console**:
   - Go to `chrome://extensions/`
   - Click "background page" or "service worker"
   - Look for error messages

3. **Browser Console**:
   - Check both page console and extension popup console
   - Look for network request failures

Remember: The extension should now work reliably with all critical issues fixed!