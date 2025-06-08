// Background script for Fiori Test Automation System
// Handles network request interception, storage management, and session coordination

class FioriTestBackground {
  constructor() {
    this.sessions = new Map();
    this.networkRequests = new Map();
    this.debug = false;
    this.init();
  }

  init() {
    this.setupDebugMode();
    this.setupNetworkInterception();
    this.setupMessageHandling();
    this.setupStorageHandling();
  }

  setupDebugMode() {
    chrome.storage.local.get(['debug-mode'], (result) => {
      this.debug = result['debug-mode'] === true;
      if (this.debug) {
        console.log('🎯 Fiori Background: Debug mode enabled');
        window.FIORI_BG_DEBUG = true;
      }
    });

    // Listen for debug mode changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes['debug-mode']) {
        this.debug = changes['debug-mode'].newValue === true;
        console.log('Debug mode changed:', this.debug);
      }
    });
  }

  log(...args) {
    if (this.debug) {
      console.log('[Fiori BG]', new Date().toISOString(), ...args);
    }
  }

  logError(...args) {
    console.error('[Fiori BG Error]', new Date().toISOString(), ...args);
  }

  setupNetworkInterception() {
    // Intercept all network requests
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => this.handleBeforeRequest(details),
      { urls: ["<all_urls>"] },
      ["requestBody"]
    );

    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => this.handleBeforeSendHeaders(details),
      { urls: ["<all_urls>"] },
      ["requestHeaders"]
    );

    chrome.webRequest.onResponseStarted.addListener(
      (details) => this.handleResponseStarted(details),
      { urls: ["<all_urls>"] },
      ["responseHeaders"]
    );

    chrome.webRequest.onCompleted.addListener(
      (details) => this.handleRequestCompleted(details),
      { urls: ["<all_urls>"] },
      ["responseHeaders"]
    );
  }

  setupMessageHandling() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep channel open for async response
    });
  }

  setupStorageHandling() {
    // Initialize storage structure
    chrome.storage.local.get(['fioriSessions'], (result) => {
      if (!result.fioriSessions) {
        chrome.storage.local.set({ fioriSessions: {} });
      }
    });
  }

  handleBeforeRequest(details) {
    if (this.isODataRequest(details.url)) {
      const requestData = {
        requestId: this.generateUUID(),
        tabId: details.tabId,
        url: details.url,
        method: details.method,
        timestamp: Date.now(),
        requestBody: details.requestBody
      };

      this.log('OData request intercepted:', {
        url: details.url,
        method: details.method,
        requestId: requestData.requestId
      });

      this.networkRequests.set(details.requestId, requestData);
      this.notifyContentScript(details.tabId, 'odata-request-started', requestData);
    }
  }

  handleBeforeSendHeaders(details) {
    const requestData = this.networkRequests.get(details.requestId);
    if (requestData) {
      requestData.requestHeaders = details.requestHeaders;
      this.networkRequests.set(details.requestId, requestData);
    }
  }

  handleResponseStarted(details) {
    const requestData = this.networkRequests.get(details.requestId);
    if (requestData) {
      requestData.responseHeaders = details.responseHeaders;
      requestData.statusCode = details.statusCode;
      this.networkRequests.set(details.requestId, requestData);
    }
  }

  handleRequestCompleted(details) {
    const requestData = this.networkRequests.get(details.requestId);
    if (requestData && this.isODataRequest(details.url)) {
      requestData.endTime = Date.now();
      requestData.duration = requestData.endTime - requestData.timestamp;
      
      // Try to get response body
      this.getResponseBody(details.requestId).then(responseBody => {
        requestData.responseBody = responseBody;
        this.notifyContentScript(details.tabId, 'odata-request-completed', requestData);
      });

      // Clean up after processing
      setTimeout(() => {
        this.networkRequests.delete(details.requestId);
      }, 30000); // Keep for 30 seconds for correlation
    }
  }

  async getResponseBody(requestId) {
    try {
      // Note: Chrome doesn't provide direct access to response body
      // This would need to be captured via content script or devtools API
      return null;
    } catch (error) {
      console.warn('Could not capture response body:', error);
      return null;
    }
  }

  isODataRequest(url) {
    return url.includes('$metadata') || 
           url.includes('sap/opu/odata') ||
           url.includes('$batch') ||
           url.includes('$format=json') ||
           /\/odata\//.test(url);
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'start-recording':
          await this.startRecording(sender.tab.id, message.data);
          sendResponse({ success: true });
          break;

        case 'stop-recording':
          await this.stopRecording(sender.tab.id);
          sendResponse({ success: true });
          break;

        case 'get-session-data':
          const sessionData = await this.getSessionData(sender.tab.id);
          sendResponse({ success: true, data: sessionData });
          break;

        case 'save-session':
          await this.saveSession(message.data);
          sendResponse({ success: true });
          break;

        case 'get-sessions':
          const sessions = await this.getAllSessions();
          sendResponse({ success: true, data: sessions });
          break;

        case 'capture-event':
          await this.captureEvent(sender.tab.id, message.data);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background message handling error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async startRecording(tabId, sessionData) {
    const sessionId = this.generateUUID();
    const session = {
      sessionId,
      tabId,
      startTime: Date.now(),
      metadata: {
        ...sessionData,
        userAgent: navigator.userAgent
      },
      events: [],
      networkRequests: [],
      isRecording: true
    };

    this.sessions.set(tabId, session);
    
    // Update popup with recording state
    this.updatePopupState(tabId, 'recording');
  }

  async stopRecording(tabId) {
    const session = this.sessions.get(tabId);
    if (session) {
      session.isRecording = false;
      session.endTime = Date.now();
      session.duration = session.endTime - session.startTime;

      // Save session to storage
      await this.saveSession(session);
      
      // Update popup state
      this.updatePopupState(tabId, 'stopped');
    }
  }

  async captureEvent(tabId, eventData) {
    const session = this.sessions.get(tabId);
    if (session && session.isRecording) {
      const event = {
        eventId: this.generateUUID(),
        timestamp: Date.now(),
        ...eventData
      };

      session.events.push(event);
      
      // Correlate with recent network requests
      this.correlateNetworkRequests(event, session);
    }
  }

  correlateNetworkRequests(event, session) {
    const correlationWindow = 5000; // 5 seconds
    const eventTime = event.timestamp;
    
    // Find network requests within correlation window
    const correlatedRequests = [];
    
    for (const [requestId, requestData] of this.networkRequests) {
      if (requestData.tabId === session.tabId) {
        const timeDiff = Math.abs(requestData.timestamp - eventTime);
        if (timeDiff <= correlationWindow) {
          const confidence = Math.max(0, 100 - (timeDiff / correlationWindow * 50));
          correlatedRequests.push({
            ...requestData,
            correlation: {
              confidence,
              timeDifference: timeDiff
            }
          });
        }
      }
    }

    if (correlatedRequests.length > 0) {
      event.correlatedRequests = correlatedRequests;
    }
  }

  async saveSession(session) {
    const result = await chrome.storage.local.get(['fioriSessions']);
    const sessions = result.fioriSessions || {};
    sessions[session.sessionId] = session;
    await chrome.storage.local.set({ fioriSessions: sessions });
  }

  async getAllSessions() {
    const result = await chrome.storage.local.get(['fioriSessions']);
    return result.fioriSessions || {};
  }

  async getSessionData(tabId) {
    return this.sessions.get(tabId) || null;
  }

  notifyContentScript(tabId, type, data) {
    chrome.tabs.sendMessage(tabId, { type, data }).catch(() => {
      // Ignore errors if content script is not ready
    });
  }

  updatePopupState(tabId, state) {
    // Send message to popup if it's open
    chrome.runtime.sendMessage({
      type: 'update-recording-state',
      tabId,
      state
    }).catch(() => {
      // Popup might not be open
    });
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Initialize background script
new FioriTestBackground();