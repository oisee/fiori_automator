// Debug script to test content script functionality
// This script can be run in the browser console to test if content script is working

console.log('[Debug] Testing Fiori content script functionality...');

// Check if content script is loaded
if (window.FioriTestCapture) {
  console.log('✅ FioriTestCapture class is available');
  
  if (window.fioriTestCaptureInstance) {
    console.log('✅ Content script instance exists');
    console.log('Instance state:', {
      isRecording: window.fioriTestCaptureInstance.isRecording,
      ui5Context: window.fioriTestCaptureInstance.ui5Context
    });
  } else {
    console.log('❌ Content script instance not found');
    console.log('Attempting to create instance...');
    try {
      window.fioriTestCaptureInstance = new window.FioriTestCapture();
      console.log('✅ Instance created successfully');
    } catch (error) {
      console.error('❌ Failed to create instance:', error);
    }
  }
} else {
  console.log('❌ FioriTestCapture class not found');
  console.log('Content script may not be loaded or there may be an error');
}

// Check SAPUI5 detection
console.log('\n[Debug] Testing SAPUI5 detection...');

// Direct detection
if (window.sap && window.sap.ui) {
  console.log('✅ SAP UI5 is available');
  console.log('UI5 Version:', window.sap.ui.version);
  
  try {
    const core = window.sap.ui.getCore();
    console.log('✅ UI5 Core is accessible');
    console.log('Theme:', core?.getConfiguration()?.getTheme());
    console.log('Locale:', core?.getConfiguration()?.getLocale()?.toString());
    console.log('Libraries:', Object.keys(core?.getLoadedLibraries() || {}));
  } catch (error) {
    console.warn('⚠️ Error accessing UI5 Core:', error);
  }
} else {
  console.log('❌ SAP UI5 not detected via window.sap.ui');
}

// Check for UI5 indicators in DOM
console.log('\n[Debug] Checking DOM for UI5 indicators...');

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

console.log('DOM Indicators:', indicators);

const confidence = Object.values(indicators).filter(Boolean).length / Object.keys(indicators).length;
console.log('Detection confidence:', Math.round(confidence * 100) + '%');

// Test event listener setup
console.log('\n[Debug] Testing event listeners...');

let testEventCaptured = false;

// Add temporary test listener
const testListener = (event) => {
  testEventCaptured = true;
  console.log('✅ Test event captured:', event.type);
  document.removeEventListener('click', testListener, true);
};

document.addEventListener('click', testListener, true);

console.log('Click anywhere to test event capture...');

// Wait and check
setTimeout(() => {
  if (!testEventCaptured) {
    console.log('⚠️ No test events captured yet. Try clicking on the page.');
  }
}, 1000);

// Test background script communication
console.log('\n[Debug] Testing background script communication...');

if (chrome && chrome.runtime) {
  chrome.runtime.sendMessage({
    type: 'ping'
  }).then(response => {
    console.log('✅ Background script communication working:', response);
  }).catch(error => {
    console.error('❌ Background script communication failed:', error);
  });
} else {
  console.log('❌ Chrome runtime not available');
}

console.log('\n[Debug] Debug script completed. Check the results above.');
console.log('If you see issues, copy this output and the developer tools console for debugging.');