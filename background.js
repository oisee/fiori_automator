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
      this.log('Received message:', message.type);
      
      switch (message.type) {
        case 'start-recording':
          const tabId = sender.tab?.id || message.tabId;
          if (!tabId) {
            throw new Error('No tab ID available');
          }
          await this.startRecording(tabId, message.data);
          sendResponse({ success: true });
          break;

        case 'stop-recording':
          await this.stopRecording(sender.tab?.id || message.tabId);
          sendResponse({ success: true });
          break;

        case 'get-session-data':
          const sessionData = await this.getSessionData(sender.tab?.id || message.tabId);
          sendResponse({ success: true, data: sessionData });
          break;

        case 'get-recording-state':
          const recordingState = await this.getRecordingState(sender.tab?.id || message.tabId);
          sendResponse({ success: true, data: recordingState });
          break;

        case 'pause-recording':
          await this.pauseRecording(sender.tab?.id || message.tabId);
          sendResponse({ success: true });
          break;

        case 'resume-recording':
          await this.resumeRecording(sender.tab?.id || message.tabId);
          sendResponse({ success: true });
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
          await this.captureEvent(sender.tab?.id || message.tabId, message.data);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      this.logError('Background message handling error:', error);
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
      isRecording: true,
      isPaused: false,
      pausedTime: 0,
      lastPauseStart: null
    };

    this.sessions.set(tabId, session);
    
    // Broadcast state change
    this.broadcastStateChange(tabId, 'recording');
  }

  async stopRecording(tabId) {
    const session = this.sessions.get(tabId);
    if (session) {
      // If paused, add final pause duration
      if (session.isPaused && session.lastPauseStart) {
        session.pausedTime += Date.now() - session.lastPauseStart;
      }

      session.isRecording = false;
      session.isPaused = false;
      session.endTime = Date.now();
      session.duration = session.endTime - session.startTime - session.pausedTime;

      // Save session to storage
      await this.saveSession(session);
      
      // Broadcast state change
      this.broadcastStateChange(tabId, 'stopped');
      
      // Clean up session from memory after saving
      this.sessions.delete(tabId);
    }
  }

  async pauseRecording(tabId) {
    const session = this.sessions.get(tabId);
    if (session && session.isRecording && !session.isPaused) {
      session.isPaused = true;
      session.lastPauseStart = Date.now();
      
      this.broadcastStateChange(tabId, 'paused');
      this.log('Recording paused for tab:', tabId);
    }
  }

  async resumeRecording(tabId) {
    const session = this.sessions.get(tabId);
    if (session && session.isRecording && session.isPaused) {
      // Add paused time to total
      session.pausedTime += Date.now() - session.lastPauseStart;
      session.isPaused = false;
      session.lastPauseStart = null;
      
      this.broadcastStateChange(tabId, 'recording');
      this.log('Recording resumed for tab:', tabId);
    }
  }

  async getRecordingState(tabId) {
    const session = this.sessions.get(tabId);
    
    if (!session) {
      return {
        isRecording: false,
        isPaused: false,
        sessionId: null,
        sessionName: null,
        startTime: null,
        duration: 0,
        eventCount: 0,
        networkRequestCount: 0,
        state: 'idle'
      };
    }

    // Calculate current duration
    let currentDuration = 0;
    if (session.isRecording) {
      const now = Date.now();
      const totalElapsed = now - session.startTime;
      const pausedTime = session.pausedTime + (session.isPaused && session.lastPauseStart ? now - session.lastPauseStart : 0);
      currentDuration = totalElapsed - pausedTime;
    } else {
      currentDuration = session.duration || 0;
    }

    return {
      isRecording: session.isRecording,
      isPaused: session.isPaused,
      sessionId: session.sessionId,
      sessionName: session.metadata?.sessionName || 'Unnamed Session',
      startTime: session.startTime,
      endTime: session.endTime,
      duration: currentDuration,
      eventCount: session.events?.length || 0,
      networkRequestCount: session.networkRequests?.length || 0,
      lastEvent: session.events?.[session.events.length - 1] || null,
      state: session.isRecording ? (session.isPaused ? 'paused' : 'recording') : 'stopped'
    };
  }

  async captureEvent(tabId, eventData) {
    const session = this.sessions.get(tabId);
    if (session && session.isRecording && !session.isPaused) {
      const event = {
        eventId: this.generateUUID(),
        timestamp: Date.now(),
        ...eventData
      };

      session.events.push(event);
      
      // Correlate with recent network requests
      this.correlateNetworkRequests(event, session);
      
      // Auto-save session periodically
      if (session.events.length % 10 === 0) {
        await this.autoSaveSession(session);
      }
      
      this.log(`Event captured: ${event.type}, Total events: ${session.events.length}`);
      
      // Broadcast updated session state
      this.broadcastSessionUpdate(tabId);
    }
  }

  broadcastStateChange(tabId, state) {
    // Broadcast recording state change to all listeners
    chrome.runtime.sendMessage({
      type: 'recording-state-changed',
      tabId,
      state
    }).catch(() => {
      // No listeners, that's fine
    });
  }

  broadcastSessionUpdate(tabId) {
    // Broadcast session update to all listeners
    chrome.runtime.sendMessage({
      type: 'session-updated',
      tabId
    }).catch(() => {
      // No listeners, that's fine
    });
  }

  async autoSaveSession(session) {
    try {
      const result = await chrome.storage.local.get(['fioriSessions']);
      const sessions = result.fioriSessions || {};
      
      // Clean session data to prevent circular references
      const cleanSession = this.cleanSessionData(session);
      sessions[session.sessionId] = cleanSession;
      
      await chrome.storage.local.set({ fioriSessions: sessions });
      this.log('Session auto-saved');
    } catch (error) {
      this.logError('Auto-save failed:', error);
    }
  }

  cleanSessionData(session) {
    try {
      // Create a clean copy without circular references
      const cleanSession = {
        sessionId: session.sessionId,
        tabId: session.tabId,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration,
        isRecording: session.isRecording,
        isPaused: session.isPaused,
        pausedTime: session.pausedTime,
        metadata: { ...session.metadata },
        events: session.events?.map(event => this.cleanEventData(event)) || [],
        networkRequests: session.networkRequests?.map(req => this.cleanNetworkData(req)) || []
      };
      
      return cleanSession;
    } catch (error) {
      this.logError('Error cleaning session data:', error);
      // Return minimal session data as fallback
      return {
        sessionId: session.sessionId,
        tabId: session.tabId,
        startTime: session.startTime,
        isRecording: session.isRecording,
        isPaused: false,
        pausedTime: 0,
        metadata: session.metadata || {},
        events: [],
        networkRequests: []
      };
    }
  }

  cleanEventData(event) {
    try {
      return {
        eventId: event.eventId,
        timestamp: event.timestamp,
        type: event.type,
        coordinates: event.coordinates,
        element: event.element ? {
          tagName: event.element.tagName,
          id: event.element.id,
          className: event.element.className,
          textContent: event.element.textContent?.slice(0, 200),
          selector: event.element.selector,
          xpath: event.element.xpath
        } : null,
        ui5Context: event.ui5Context ? {
          controlType: event.ui5Context.controlType,
          controlId: event.ui5Context.controlId,
          properties: event.ui5Context.properties
        } : null,
        value: event.value,
        key: event.key,
        correlatedRequests: event.correlatedRequests?.map(req => ({
          requestId: req.requestId,
          url: req.url,
          method: req.method,
          correlation: req.correlation
        })) || []
      };
    } catch (error) {
      return {
        eventId: event.eventId,
        timestamp: event.timestamp,
        type: event.type
      };
    }
  }

  cleanNetworkData(request) {
    try {
      return {
        requestId: request.requestId,
        tabId: request.tabId,
        url: request.url,
        method: request.method,
        timestamp: request.timestamp,
        endTime: request.endTime,
        duration: request.duration,
        statusCode: request.statusCode,
        correlation: request.correlation
      };
    } catch (error) {
      return {
        requestId: request.requestId,
        url: request.url,
        method: request.method,
        timestamp: request.timestamp
      };
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
    try {
      const result = await chrome.storage.local.get(['fioriSessions']);
      const sessions = result.fioriSessions || {};
      
      // Clean session data before saving
      const cleanSession = this.cleanSessionData(session);
      sessions[session.sessionId] = cleanSession;
      
      await chrome.storage.local.set({ fioriSessions: sessions });
      this.log('Session saved successfully');
    } catch (error) {
      this.logError('Failed to save session:', error);
    }
  }

  async getAllSessions() {
    const result = await chrome.storage.local.get(['fioriSessions']);
    return result.fioriSessions || {};
  }

  async getSessionData(tabId) {
    const sessionData = this.sessions.get(tabId) || null;
    this.log(`Getting session data for tab ${tabId}:`, sessionData ? 'Found' : 'Not found');
    return sessionData;
  }

  async notifyContentScript(tabId, type, data) {
    try {
      // First, ensure content script is injected
      await this.ensureContentScriptInjected(tabId);
      
      // Then send the message with retry logic
      await this.sendMessageWithRetry(tabId, { type, data });
    } catch (error) {
      this.log('Could not notify content script:', error.message);
    }
  }

  async ensureContentScriptInjected(tabId) {
    try {
      // Check if content script is already injected by sending a ping
      await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    } catch (error) {
      // Content script not injected, inject it now
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        
        // Wait a bit for the script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        this.log('Content script injected for tab:', tabId);
      } catch (injectionError) {
        throw new Error(`Failed to inject content script: ${injectionError.message}`);
      }
    }
  }

  async sendMessageWithRetry(tabId, message, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await chrome.tabs.sendMessage(tabId, message);
        return; // Success
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, attempt * 200));
      }
    }
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