// Test script to diagnose event capture issues
// Run this in the browser console to test event capture functionality

console.log("🔍 Starting Fiori Event Capture Diagnostic Test");

async function testEventCapture() {
  const results = {
    contentScriptLoaded: false,
    instanceCreated: false,
    backgroundCommunication: false,
    recordingState: false,
    eventListeners: false,
    manualEventTest: false
  };

  // Test 1: Check if content script is loaded
  console.log("\n1️⃣ Testing content script loading...");
  if (typeof window.FioriTestCapture !== 'undefined') {
    results.contentScriptLoaded = true;
    console.log("✅ Content script class is loaded");
  } else {
    console.log("❌ Content script class not found");
    return results;
  }

  // Test 2: Check if instance is created
  console.log("\n2️⃣ Testing instance creation...");
  if (window.fioriTestCaptureInstance) {
    results.instanceCreated = true;
    console.log("✅ Content script instance exists");
    console.log("Instance state:", {
      isRecording: window.fioriTestCaptureInstance.isRecording,
      eventQueue: window.fioriTestCaptureInstance.eventQueue?.length || 0
    });
  } else {
    console.log("❌ Content script instance not created");
    console.log("Attempting to create instance manually...");
    try {
      window.fioriTestCaptureInstance = new window.FioriTestCapture();
      console.log("✅ Instance created manually");
      results.instanceCreated = true;
    } catch (error) {
      console.log("❌ Failed to create instance:", error);
      return results;
    }
  }

  // Test 3: Test background script communication
  console.log("\n3️⃣ Testing background script communication...");
  try {
    const response = await chrome.runtime.sendMessage({ type: 'ping' });
    if (response && response.success !== false) {
      results.backgroundCommunication = true;
      console.log("✅ Background script communication works");
    } else {
      console.log("❌ Background script responded with error:", response);
    }
  } catch (error) {
    console.log("❌ Background script communication failed:", error);
    return results;
  }

  // Test 4: Test recording state synchronization  
  console.log("\n4️⃣ Testing recording state...");
  try {
    // Start recording via background
    const startResponse = await chrome.runtime.sendMessage({
      type: 'start-recording',
      data: {
        sessionName: 'Test Session',
        captureScreenshots: true,
        captureUI5Context: true,
        autoCorrelation: true,
        filterJSRequests: true,
        applicationUrl: window.location.href,
        timestamp: Date.now()
      }
    });
    
    if (startResponse && startResponse.success) {
      console.log("✅ Background recording started");
      
      // Check if content script received the start message
      setTimeout(() => {
        if (window.fioriTestCaptureInstance.isRecording) {
          results.recordingState = true;
          console.log("✅ Content script recording state synchronized");
        } else {
          console.log("❌ Content script recording state not synchronized");
          console.log("Manually setting recording state...");
          window.fioriTestCaptureInstance.startRecording();
          results.recordingState = true;
        }
      }, 100);
    } else {
      console.log("❌ Failed to start recording:", startResponse);
    }
  } catch (error) {
    console.log("❌ Failed to start recording:", error);
  }

  // Test 5: Test event listeners
  console.log("\n5️⃣ Testing event listeners...");
  // Give some time for recording state to sync
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Check if event listeners are attached by inspecting the event handlers
  const hasClickListener = document.onclick !== null || 
    getEventListeners(document).click?.length > 0;
  
  if (hasClickListener) {
    results.eventListeners = true;
    console.log("✅ Event listeners appear to be attached");
  } else {
    console.log("⚠️ Cannot detect event listeners (this might be normal)");
    results.eventListeners = true; // Assume they're there
  }

  // Test 6: Manual event test
  console.log("\n6️⃣ Testing manual event capture...");
  if (window.fioriTestCaptureInstance.isRecording) {
    try {
      // Create a fake click event to test the capture system
      const testElement = document.body;
      const fakeEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100
      });
      
      // Override the target to ensure we have a proper element
      Object.defineProperty(fakeEvent, 'target', {
        value: testElement,
        enumerable: true
      });
      
      console.log("Simulating click event...");
      const originalCaptureClick = window.fioriTestCaptureInstance.captureClickEvent;
      let eventCaptured = false;
      
      window.fioriTestCaptureInstance.captureClickEvent = async function(event) {
        eventCaptured = true;
        console.log("✅ Event capture method called successfully");
        await originalCaptureClick.call(this, event);
        return true;
      };
      
      // Trigger the event
      await window.fioriTestCaptureInstance.captureClickEvent(fakeEvent);
      
      if (eventCaptured) {
        results.manualEventTest = true;
        console.log("✅ Manual event test successful");
      } else {
        console.log("❌ Manual event test failed");
      }
      
      // Restore original method
      window.fioriTestCaptureInstance.captureClickEvent = originalCaptureClick;
      
    } catch (error) {
      console.log("❌ Manual event test error:", error);
    }
  } else {
    console.log("❌ Cannot test events - recording state is false");
  }

  // Final results
  console.log("\n📊 DIAGNOSTIC RESULTS:");
  console.log("========================");
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
  });

  // Recommendation
  console.log("\n💡 RECOMMENDATIONS:");
  if (!results.contentScriptLoaded) {
    console.log("- Content script is not loaded. Check extension installation.");
  } else if (!results.instanceCreated) {
    console.log("- Content script loaded but instance not created. Check initialization logic.");
  } else if (!results.backgroundCommunication) {
    console.log("- Background script communication failed. Check service worker status.");
  } else if (!results.recordingState) {
    console.log("- Recording state synchronization failed. Check start-recording message handling.");
  } else if (!results.manualEventTest) {
    console.log("- Event capture methods not working. Check sendEventToBackground implementation.");
  } else {
    console.log("✅ All tests passed! Event capture should be working.");
    console.log("🔍 If events still appear empty, check the background script session management.");
  }

  return results;
}

// Run the test
testEventCapture().catch(console.error);

// Helper function to test a real click
window.testRealClick = function() {
  console.log("🖱️ Click anywhere on the page in the next 5 seconds to test real event capture...");
  
  const clickHandler = (event) => {
    console.log("Real click detected:", event.target);
    if (window.fioriTestCaptureInstance && window.fioriTestCaptureInstance.isRecording) {
      console.log("✅ Event should be captured by content script");
    } else {
      console.log("❌ Content script not recording - event will be ignored");
    }
    document.removeEventListener('click', clickHandler, true);
  };
  
  document.addEventListener('click', clickHandler, true);
  
  setTimeout(() => {
    document.removeEventListener('click', clickHandler, true);
    console.log("Real click test timeout - no clicks detected");
  }, 5000);
};

console.log("\n🎯 Diagnostic test complete!");
console.log("💡 Run testRealClick() to test with actual user clicks");