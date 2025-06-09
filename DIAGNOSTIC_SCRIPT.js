// Fiori Automator Diagnostic Script
// Copy and paste this entire script into the browser console on a Fiori page
// This will help identify why events are not being captured

console.log('🔍 FIORI AUTOMATOR DIAGNOSTIC SCRIPT STARTING...\n');

// Step 1: Check if content script is loaded
console.log('=== STEP 1: CONTENT SCRIPT CHECK ===');
if (window.FioriTestCapture) {
  console.log('✅ FioriTestCapture class is available');
  
  if (window.fioriTestCaptureInstance) {
    console.log('✅ Content script instance exists');
    const instance = window.fioriTestCaptureInstance;
    console.log('Instance state:', {
      isRecording: instance.isRecording,
      hasUI5Context: !!instance.ui5Context,
      ui5Context: instance.ui5Context
    });
  } else {
    console.log('❌ Content script instance not found');
    console.log('Attempting to create instance manually...');
    try {
      window.fioriTestCaptureInstance = new window.FioriTestCapture();
      console.log('✅ Instance created successfully');
    } catch (error) {
      console.error('❌ Failed to create instance:', error);
    }
  }
} else {
  console.log('❌ FioriTestCapture class not found');
  console.log('This means the content script is not loaded properly');
}

// Step 2: Check Chrome extension APIs
console.log('\n=== STEP 2: CHROME EXTENSION API CHECK ===');
if (chrome && chrome.runtime) {
  console.log('✅ Chrome runtime API is available');
  
  // Test background script communication
  chrome.runtime.sendMessage({ type: 'ping' })
    .then(response => {
      console.log('✅ Background script communication working:', response);
    })
    .catch(error => {
      console.error('❌ Background script communication failed:', error);
    });
} else {
  console.log('❌ Chrome runtime API not available');
}

// Step 3: Test recording state
console.log('\n=== STEP 3: RECORDING STATE CHECK ===');
if (chrome && chrome.runtime) {
  chrome.runtime.sendMessage({
    type: 'get-recording-state'
  }).then(response => {
    console.log('Recording state from background:', response);
    if (response?.success) {
      const state = response.data;
      console.log('Current recording state:', {
        isRecording: state.isRecording,
        isPaused: state.isPaused,
        sessionId: state.sessionId,
        sessionName: state.sessionName,
        eventCount: state.eventCount,
        state: state.state
      });
      
      if (!state.isRecording) {
        console.log('⚠️ Extension is not currently recording');
        console.log('Start recording through the extension popup first');
      }
    }
  }).catch(error => {
    console.error('❌ Failed to get recording state:', error);
  });
}

// Step 4: UI5 Detection
console.log('\n=== STEP 4: SAPUI5 DETECTION ===');
if (window.sap && window.sap.ui) {
  console.log('✅ SAP UI5 is available');
  console.log('UI5 Version:', window.sap.ui.version);
  
  try {
    const core = window.sap.ui.getCore();
    if (core) {
      console.log('✅ UI5 Core is accessible');
      console.log('Theme:', core.getConfiguration()?.getTheme());
      console.log('Locale:', core.getConfiguration()?.getLocale()?.toString());
      console.log('Libraries:', Object.keys(core.getLoadedLibraries() || {}));
    } else {
      console.log('❌ UI5 Core not accessible');
    }
  } catch (error) {
    console.warn('⚠️ Error accessing UI5 Core:', error);
  }
} else {
  console.log('❌ SAP UI5 not detected via window.sap.ui');
}

// Check DOM indicators
const indicators = {
  hasApplicationIds: !!document.querySelector('[id^="application-"][id*="component"]'),
  hasViewIds: !!document.querySelector('[id*="--"][id*="component---"]'),
  hasSapClasses: !!document.querySelector('[class*="sap"]'),
  hasFioriShell: !!document.querySelector('.sapUshellShell'),
  hasFioriPage: !!document.querySelector('.sapMPage'),
  hasFioriTiles: !!document.querySelector('.sapUshellTile'),
  hasUI5Controls: !!document.querySelector('[class*="sapM"], [class*="sapUi"]'),
  hasUI5Scripts: !!document.querySelector('script[src*="sap-ui-core"], script[src*="resources/sap-ui"]'),
  hasUI5Bootstrap: !!document.querySelector('#sap-ui-bootstrap')
};

console.log('DOM UI5 Indicators:', indicators);
const confidence = Object.values(indicators).filter(Boolean).length / Object.keys(indicators).length;
console.log('UI5 Detection confidence:', Math.round(confidence * 100) + '%');

// Step 5: Test Event Capture
console.log('\n=== STEP 5: EVENT CAPTURE TEST ===');

let eventsCaptured = 0;
const testResults = {
  contentScriptListeners: false,
  backgroundCommunication: false,
  recording: false
};

// Test content script event listeners
if (window.fioriTestCaptureInstance) {
  console.log('Testing content script event capture...');
  
  // Override the captureClickEvent method temporarily to test
  const originalCaptureClick = window.fioriTestCaptureInstance.captureClickEvent;
  window.fioriTestCaptureInstance.captureClickEvent = function(event) {
    console.log('✅ Content script click event captured!');
    testResults.contentScriptListeners = true;
    eventsCaptured++;
    
    // Call original method
    return originalCaptureClick.call(this, event);
  };
  
  console.log('Content script test listener added - click anywhere to test');
}

// Test basic DOM event listeners
const testDOMListener = (event) => {
  console.log('✅ Basic DOM event listener working - captured:', event.type);
  document.removeEventListener('click', testDOMListener, true);
};
document.addEventListener('click', testDOMListener, true);

// Test background script event recording
if (chrome && chrome.runtime) {
  const testBackgroundEvent = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'capture-event',
        data: {
          type: 'test',
          timestamp: Date.now(),
          test: true
        }
      });
      
      if (response && response.success) {
        console.log('✅ Background script event capture test successful');
        testResults.backgroundCommunication = true;
      } else {
        console.log('❌ Background script rejected test event:', response);
      }
    } catch (error) {
      console.error('❌ Background script event test failed:', error);
    }
  };
  
  testBackgroundEvent();
}

// Step 6: Summary and next steps
setTimeout(() => {
  console.log('\n=== DIAGNOSTIC SUMMARY ===');
  console.log('Events captured during test:', eventsCaptured);
  console.log('Test results:', testResults);
  
  console.log('\n=== RECOMMENDATIONS ===');
  if (!window.FioriTestCapture) {
    console.log('❌ CRITICAL: Content script not loaded');
    console.log('   → Check extension is enabled');
    console.log('   → Refresh the page');
    console.log('   → Check browser console for script errors');
  }
  
  if (!testResults.contentScriptListeners && window.fioriTestCaptureInstance) {
    console.log('❌ Content script listeners not working');
    console.log('   → Check if isRecording is true');
    console.log('   → Check for JavaScript errors in content script');
  }
  
  if (!testResults.backgroundCommunication) {
    console.log('❌ Background script communication failed');
    console.log('   → Extension may not be properly installed');
    console.log('   → Check extension permissions');
  }
  
  if (confidence < 0.5) {
    console.log('⚠️ Low UI5 detection confidence');
    console.log('   → May not be a Fiori application');
    console.log('   → UI5 framework might not be fully loaded');
  }
  
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Copy this entire console output');
  console.log('2. Start recording via extension popup');
  console.log('3. Click on page elements');
  console.log('4. Check if events appear in console with [Fiori] prefix');
  console.log('5. Stop recording and check session data');
  
  console.log('\n🔍 Diagnostic script completed.');
}, 2000);

console.log('\n⏳ Running tests... Click anywhere on the page to test event capture.\n');