// Background script for Fiori Test Automation System
// Handles network request interception, storage management, and session coordination

class FioriTestBackground {
  constructor() {
    this.sessions = new Map();
    this.networkRequests = new Map();
    this.screenshots = new Map(); // Store screenshots by ID
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
    if (this.isRelevantRequest(details.url, details.method)) {
      const requestData = {
        requestId: this.generateUUID(),
        tabId: details.tabId,
        url: details.url,
        method: details.method,
        timestamp: Date.now(),
        requestBody: this.extractRequestBody(details.requestBody),
        type: this.classifyRequestType(details.url, details.method)
      };

      this.log('Request intercepted:', {
        url: details.url,
        method: details.method,
        type: requestData.type,
        requestId: requestData.requestId
      });

      this.networkRequests.set(details.requestId, requestData);
      this.notifyContentScript(details.tabId, 'request-started', requestData);
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
    if (requestData && this.isRelevantRequest(details.url, details.method)) {
      requestData.endTime = Date.now();
      requestData.duration = requestData.endTime - requestData.timestamp;
      
      // Try to get response body
      this.getResponseBody(details.requestId).then(responseBody => {
        requestData.responseBody = responseBody;
        
        // Add to session's network requests
        this.addNetworkRequestToSession(details.tabId, requestData);
        
        this.notifyContentScript(details.tabId, 'request-completed', requestData);
      });

      // Clean up after processing
      setTimeout(() => {
        this.networkRequests.delete(details.requestId);
      }, 30000); // Keep for 30 seconds for correlation
    }
  }

  async getResponseBody(requestId) {
    try {
      // Chrome extensions can't directly access response bodies from webRequest API
      // But we can use fetch API to re-request the data if it's a GET request
      // For now, we'll indicate that response capture is attempted
      return { 
        captured: false, 
        reason: 'Response body capture requires content script integration',
        note: 'Will be implemented via fetch interception'
      };
    } catch (error) {
      console.warn('Could not capture response body:', error);
      return null;
    }
  }

  isRelevantRequest(url, method) {
    // Capture ALL requests for SAP applications and OData
    const isOData = this.isODataRequest(url);
    const isSAPRequest = this.isSAPRequest(url);
    const isDataModifying = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const isAuthOrToken = this.isAuthRequest(url);
    
    // Record all SAP-related requests, OData, and authentication/token requests
    return isOData || isSAPRequest || isAuthOrToken || (isDataModifying && this.isWebAppRequest(url));
  }

  isAuthRequest(url) {
    // Capture authentication and token requests
    return url.includes('/csrf') ||
           url.includes('/token') ||
           url.includes('/auth') ||
           url.includes('/login') ||
           url.includes('/saml') ||
           url.includes('/oauth') ||
           url.includes('x-csrf-token') ||
           url.includes('SecurityToken');
  }

  isWebAppRequest(url) {
    // Basic check for web application requests (not static assets)
    const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf'];
    const hasStaticExtension = staticExtensions.some(ext => url.includes(ext));
    
    return !hasStaticExtension && (
      url.includes('/api/') ||
      url.includes('/service/') ||
      url.includes('/data/') ||
      url.includes('.json') ||
      url.includes('?') // Query parameters often indicate dynamic requests
    );
  }

  isODataRequest(url) {
    return url.includes('$metadata') || 
           url.includes('sap/opu/odata') ||
           url.includes('$batch') ||
           url.includes('$format=json') ||
           /\/odata\//.test(url) ||
           url.includes('/odata/');
  }

  isSAPRequest(url) {
    return url.includes('/sap/') || 
           url.includes('sap-client=') ||
           url.includes('.sap.com') ||
           url.includes('sapsb') ||
           url.includes('sapui5');
  }

  classifyRequestType(url, method) {
    if (this.isODataRequest(url)) {
      if (url.includes('$batch')) return 'odata-batch';
      if (url.includes('$metadata')) return 'odata-metadata';
      return 'odata';
    }
    
    if (this.isAuthRequest(url)) {
      if (url.includes('/csrf')) return 'csrf-token';
      if (url.includes('/token')) return 'auth-token';
      if (url.includes('/auth') || url.includes('/login')) return 'authentication';
      return 'auth-request';
    }
    
    if (this.isSAPRequest(url)) {
      return `sap-${method.toLowerCase()}`;
    }
    
    if (this.isWebAppRequest(url)) {
      return `webapp-${method.toLowerCase()}`;
    }
    
    return `${method.toLowerCase()}`;
  }

  extractRequestBody(requestBody) {
    if (!requestBody) return null;
    
    try {
      if (requestBody.raw && requestBody.raw.length > 0) {
        const decoder = new TextDecoder();
        const combined = requestBody.raw.map(item => {
          if (item.bytes) {
            return decoder.decode(item.bytes);
          }
          return '';
        }).join('');
        
        // Try to parse as JSON
        try {
          return JSON.parse(combined);
        } catch {
          return combined; // Return as string if not JSON
        }
      }
      
      if (requestBody.formData) {
        return { formData: requestBody.formData };
      }
      
      return requestBody;
    } catch (error) {
      this.log('Error extracting request body:', error);
      return null;
    }
  }

  addNetworkRequestToSession(tabId, requestData) {
    const session = this.sessions.get(tabId);
    if (session && session.isRecording) {
      // Clean the request data before adding
      const cleanedRequest = this.cleanNetworkData(requestData);
      session.networkRequests.push(cleanedRequest);
      
      this.log(`Network request added to session: ${requestData.method} ${requestData.url}`);
      
      // Auto-save session periodically
      if (session.networkRequests.length % 5 === 0) {
        this.autoSaveSession(session);
      }
      
      // Broadcast session update
      this.broadcastSessionUpdate(tabId);
    }
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
          const tabId = sender.tab?.id || message.tabId;
          this.log('Received capture-event message from tab:', tabId, 'Event type:', message.data?.type);
          await this.captureEvent(tabId, message.data);
          this.log('Event processed successfully');
          sendResponse({ success: true });
          break;

        case 'capture-screenshot':
          const screenshot = await this.captureTabScreenshot(
            sender.tab?.id || message.tabId, 
            message.elementInfo, 
            message.eventType || 'manual',
            message.eventId
          );
          sendResponse({ success: true, screenshot });
          break;

        case 'export-session-markdown':
          const exportResult = await this.exportSessionAsMarkdown(message.sessionId || sender.tab?.id || message.tabId);
          sendResponse({ 
            success: true, 
            zipData: exportResult.content, 
            filename: exportResult.filename 
          });
          break;

        case 'export-session-screenshots':
          const screenshotResult = await this.exportSessionScreenshots(message.sessionId || sender.tab?.id || message.tabId);
          sendResponse({ 
            success: true, 
            screenshots: screenshotResult.screenshots,
            sessionData: screenshotResult.sessionData,
            filename: screenshotResult.filename
          });
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
    
    // Generate an improved session name immediately
    const improvedSessionName = this.generateImprovedSessionNameFromUrl(sessionData.applicationUrl || '');
    
    const session = {
      sessionId,
      tabId,
      startTime: Date.now(),
      metadata: {
        ...sessionData,
        sessionName: improvedSessionName || sessionData.sessionName,
        originalSessionName: sessionData.sessionName,
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
    this.log(`captureEvent called for tab ${tabId}:`, {
      hasSession: !!session,
      isRecording: session?.isRecording,
      isPaused: session?.isPaused,
      eventType: eventData?.type
    });
    
    if (session && session.isRecording && !session.isPaused) {
      // Update session semantics from UI5 context if available
      if (eventData.ui5Context?.appSemantics) {
        session.metadata.appSemantics = eventData.ui5Context.appSemantics;
      }
      
      const event = {
        eventId: this.generateSequentialEventId(session),
        timestamp: Date.now(),
        ...eventData
      };

      // Check if this is the first meaningful event that should update session name
      await this.updateSessionNameIfNeeded(session, event, eventData);

      // Apply input event coalescing
      this.addEventWithCoalescing(session, event);
      
      // Capture screenshot after event is processed and has proper ID
      if (this.shouldCaptureScreenshotForEvent(event)) {
        try {
          const screenshot = await this.captureTabScreenshot(
            tabId, 
            eventData.element, 
            event.type, 
            event.eventId
          );
          
          if (screenshot) {
            // Update the event with screenshot reference
            const eventIndex = session.events.findIndex(e => e.eventId === event.eventId);
            if (eventIndex !== -1) {
              session.events[eventIndex].screenshot = {
                id: screenshot.id,
                filename: `${screenshot.id}.png`,
                timestamp: screenshot.timestamp,
                eventType: screenshot.eventType
              };
            }
          }
        } catch (screenshotError) {
          this.logError('Failed to capture screenshot for event:', screenshotError);
        }
      }
      
      // Correlate with recent network requests
      this.correlateNetworkRequests(event, session);
      
      // Auto-save session periodically
      if (session.events.length % 10 === 0) {
        await this.autoSaveSession(session);
      }
      
      this.log(`Event captured: ${event.type}, Total events: ${session.events.length}`);
      
      // Broadcast updated session state
      this.broadcastSessionUpdate(tabId);
    } else {
      // Log why event was rejected
      if (!session) {
        this.log(`Event rejected: No session found for tab ${tabId}`);
      } else if (!session.isRecording) {
        this.log(`Event rejected: Session not recording for tab ${tabId}`);
      } else if (session.isPaused) {
        this.log(`Event rejected: Session is paused for tab ${tabId}`);
      }
    }
  }

  shouldCaptureScreenshotForEvent(event) {
    // Capture screenshots for visual events (not for every input keystroke)
    const screenshotEvents = [
      'click', 
      'editing_start', 
      'editing_end', 
      'submit', 
      'keyboard', // Only for important key presses
      'file_upload'
    ];
    
    return screenshotEvents.includes(event.type);
  }

  generateSequentialEventId(session) {
    // Generate sequential event ID (001, 002, 003, etc.)
    const eventNumber = (session.events?.length || 0) + 1;
    return eventNumber.toString().padStart(3, '0');
  }

  async updateSessionNameIfNeeded(session, event, eventData) {
    // Only update name if we're still using the default/launchpad name
    const currentName = session.metadata.sessionName || '';
    const isDefaultName = currentName.includes('Launchpad') || 
                         currentName.includes('Session ') ||
                         currentName === session.metadata.originalSessionName;

    if (!isDefaultName) {
      return; // User has already navigated to a specific app
    }

    // Check if this event indicates navigation to a specific app
    const meaningfulAppName = this.extractMeaningfulAppName(event, eventData);
    
    if (meaningfulAppName && meaningfulAppName !== currentName) {
      this.log(`Updating session name from "${currentName}" to "${meaningfulAppName}"`);
      session.metadata.sessionName = meaningfulAppName;
      session.metadata.nameUpdatedAt = Date.now();
      session.metadata.nameUpdatedReason = 'first-meaningful-event';
    }
  }

  extractMeaningfulAppName(event, eventData) {
    // Method 1: From current page URL
    if (eventData.pageUrl) {
      const appName = this.generateImprovedSessionNameFromUrl(eventData.pageUrl);
      if (appName && !appName.includes('Launchpad')) {
        return appName;
      }
    }

    // Method 2: From UI5 app semantics
    if (eventData.ui5Context?.appSemantics?.appType && 
        eventData.ui5Context.appSemantics.appType !== 'unknown') {
      return this.formatAppNameFromSemantics(eventData.ui5Context.appSemantics);
    }

    // Method 3: From page title if available
    if (eventData.pageTitle && 
        !eventData.pageTitle.includes('Launchpad') && 
        !eventData.pageTitle.includes('Home')) {
      return eventData.pageTitle.slice(0, 50); // Limit length
    }

    // Method 4: From DOM context (e.g., clicked on specific app tile)
    if (event.type === 'click' && eventData.element) {
      const appName = this.extractAppNameFromElement(eventData.element);
      if (appName) {
        return appName;
      }
    }

    return null;
  }

  formatAppNameFromSemantics(semantics) {
    if (semantics.appType === 'manage-alerts') {
      return 'Manage Alerts';
    } else if (semantics.appType === 'manage-detection-methods') {
      return 'Manage Detection Methods';
    } else if (semantics.businessObject) {
      return `Manage ${semantics.businessObject}`;
    } else {
      return semantics.appType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  }

  extractAppNameFromElement(element) {
    // Look for app tile clicks
    if (element.className?.includes('sapUshellTile') || 
        element.className?.includes('sapMTile')) {
      
      // Try to find title in the element or its children
      const titleElement = element.querySelector?.('.sapMTileTitle, .sapUshellTileTitle') ||
                          element.closest?.('.sapUshellTile')?.querySelector('.sapMTileTitle');
      
      if (titleElement?.textContent) {
        return titleElement.textContent.trim();
      }
      
      // Fallback to element text content
      if (element.textContent && element.textContent.length < 100) {
        return element.textContent.trim();
      }
    }

    return null;
  }

  addEventWithCoalescing(session, newEvent) {
    // Configuration for coalescing
    const COALESCING_TIME_THRESHOLD = 1500; // 1.5 seconds
    const COALESCING_ENABLED = true;

    if (!COALESCING_ENABLED || newEvent.type !== 'input') {
      // No coalescing needed, add event normally
      session.events.push(newEvent);
      return;
    }

    // Check if we can coalesce with the last event
    const lastEvent = session.events[session.events.length - 1];
    
    if (this.canCoalesceInputEvents(lastEvent, newEvent, COALESCING_TIME_THRESHOLD)) {
      // Update the last event instead of adding a new one
      this.coalesceInputEvent(lastEvent, newEvent);
      this.log(`Input event coalesced: ${newEvent.element?.id} -> "${newEvent.value}"`);
    } else {
      // Cannot coalesce, add as new event
      session.events.push(newEvent);
    }
  }

  canCoalesceInputEvents(lastEvent, newEvent, timeThreshold) {
    if (!lastEvent || lastEvent.type !== 'input' || newEvent.type !== 'input') {
      return false;
    }

    // Check if targeting same element
    const sameElement = lastEvent.element?.id === newEvent.element?.id;
    if (!sameElement) {
      return false;
    }

    // Check time threshold
    const timeDelta = newEvent.timestamp - lastEvent.timestamp;
    if (timeDelta > timeThreshold) {
      return false;
    }

    // Check if the new value is a logical progression
    return this.isProgressiveInput(lastEvent.value || '', newEvent.value || '');
  }

  isProgressiveInput(oldValue, newValue) {
    // Both should be strings
    if (typeof oldValue !== 'string' || typeof newValue !== 'string') {
      return false;
    }

    // New value should be either:
    // 1. An extension of old value (typing)
    // 2. A truncation of old value (backspace)
    // 3. Similar with small character changes (typo correction)
    
    const lengthDiff = newValue.length - oldValue.length;
    
    // Simple append case (typing)
    if (lengthDiff > 0 && newValue.startsWith(oldValue)) {
      return true;
    }
    
    // Simple truncation case (backspace)
    if (lengthDiff < 0 && oldValue.startsWith(newValue)) {
      return true;
    }
    
    // Small edits (character replacements, insertions in middle)
    if (Math.abs(lengthDiff) <= 3) {
      const similarity = this.calculateStringSimilarity(oldValue, newValue);
      return similarity > 0.7; // 70% similarity threshold
    }
    
    return false;
  }

  calculateStringSimilarity(str1, str2) {
    // Simple similarity calculation using Levenshtein distance
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;
    
    return (maxLength - matrix[str2.length][str1.length]) / maxLength;
  }

  coalesceInputEvent(lastEvent, newEvent) {
    // Update the existing event with new information
    lastEvent.endTime = newEvent.timestamp;
    lastEvent.duration = lastEvent.endTime - lastEvent.timestamp;
    lastEvent.value = newEvent.value;
    lastEvent.finalValue = newEvent.value;
    
    // Track intermediate values for analysis
    if (!lastEvent.intermediateValues) {
      lastEvent.intermediateValues = [lastEvent.initialValue || lastEvent.value];
    }
    lastEvent.intermediateValues.push(newEvent.value);
    
    // Update metadata
    lastEvent.editCount = (lastEvent.editCount || 1) + 1;
    lastEvent.isCoalesced = true;
    
    // Keep initial value for reference
    if (!lastEvent.initialValue) {
      lastEvent.initialValue = lastEvent.intermediateValues[0];
    }
    
    // Analysis flags
    lastEvent.hadBackspace = this.detectBackspace(lastEvent.intermediateValues);
    lastEvent.hadPause = (newEvent.timestamp - lastEvent.timestamp) > 500; // 500ms pause
    
    this.log(`Coalesced: "${lastEvent.initialValue}" -> "${lastEvent.finalValue}" (${lastEvent.editCount} edits)`);
  }

  detectBackspace(values) {
    for (let i = 1; i < values.length; i++) {
      if (values[i].length < values[i - 1].length) {
        return true;
      }
    }
    return false;
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
      const baseEvent = {
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
        })) || [],
        screenshot: event.screenshot ? {
          id: event.screenshot.id,
          filename: event.screenshot.filename,
          timestamp: event.screenshot.timestamp,
          eventType: event.screenshot.eventType
        } : null
      };

      // Add coalescing-specific fields if present
      if (event.isCoalesced) {
        baseEvent.isCoalesced = true;
        baseEvent.editCount = event.editCount;
        baseEvent.initialValue = event.initialValue;
        baseEvent.finalValue = event.finalValue;
        baseEvent.endTime = event.endTime;
        baseEvent.duration = event.duration;
        baseEvent.hadBackspace = event.hadBackspace;
        baseEvent.hadPause = event.hadPause;
        
        // Optionally include intermediate values (can be large)
        if (event.intermediateValues && event.intermediateValues.length < 50) {
          baseEvent.intermediateValues = event.intermediateValues;
        }
      }

      return baseEvent;
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
        type: request.type,
        timestamp: request.timestamp,
        endTime: request.endTime,
        duration: request.duration,
        statusCode: request.statusCode,
        requestHeaders: this.cleanHeaders(request.requestHeaders),
        responseHeaders: this.cleanHeaders(request.responseHeaders),
        requestBody: this.cleanBody(request.requestBody),
        responseBody: this.cleanBody(request.responseBody),
        correlation: request.correlation
      };
    } catch (error) {
      return {
        requestId: request.requestId,
        url: request.url,
        method: request.method,
        type: request.type || 'unknown',
        timestamp: request.timestamp
      };
    }
  }

  cleanHeaders(headers) {
    if (!headers || !Array.isArray(headers)) return [];
    
    // Filter out sensitive headers and keep relevant ones
    const relevantHeaders = [
      'content-type', 'content-length', 'accept', 'accept-language',
      'x-csrf-token', 'x-sap-request-id', 'sap-contextid', 'sap-cancel-on-close'
    ];
    
    return headers.filter(header => {
      const name = header.name?.toLowerCase();
      return relevantHeaders.includes(name) && !name.includes('authorization');
    });
  }

  cleanBody(body) {
    if (!body) return null;
    
    try {
      // If it's already an object, stringify and limit size
      if (typeof body === 'object') {
        const jsonString = JSON.stringify(body);
        return jsonString.length > 10000 ? jsonString.substring(0, 10000) + '...[truncated]' : body;
      }
      
      // If it's a string, limit size
      if (typeof body === 'string') {
        return body.length > 10000 ? body.substring(0, 10000) + '...[truncated]' : body;
      }
      
      return body;
    } catch (error) {
      return '[Error serializing body]';
    }
  }

  correlateNetworkRequests(event, session) {
    const correlationWindow = 10000; // Increased to 10 seconds for better causation detection
    const eventTime = event.timestamp;
    
    // Find network requests within correlation window (before and after event)
    const correlatedRequests = [];
    
    for (const [requestId, requestData] of this.networkRequests) {
      if (requestData.tabId === session.tabId) {
        const timeDiff = requestData.timestamp - eventTime; // Allow negative (requests after clicks)
        const absTimeDiff = Math.abs(timeDiff);
        
        if (absTimeDiff <= correlationWindow) {
          // Enhanced confidence calculation considering causation patterns
          let confidence = Math.max(0, 100 - (absTimeDiff / correlationWindow * 40));
          
          // Boost confidence for likely causation patterns
          if (this.isLikelyCausationPattern(event, requestData, timeDiff)) {
            confidence = Math.min(95, confidence + 25);
          }
          
          // Reduce confidence for requests that happened before the click (unlikely causation)
          if (timeDiff < 0) {
            confidence = confidence * 0.7;
          }
          
          correlatedRequests.push({
            ...requestData,
            correlation: {
              confidence: Math.round(confidence * 100) / 100,
              timeDifference: absTimeDiff,
              causationDirection: timeDiff >= 0 ? 'after-click' : 'before-click',
              pattern: this.detectCausationPattern(event, requestData)
            }
          });
        }
      }
    }

    // Sort by confidence and time proximity
    correlatedRequests.sort((a, b) => {
      if (Math.abs(a.correlation.confidence - b.correlation.confidence) < 5) {
        return a.correlation.timeDifference - b.correlation.timeDifference;
      }
      return b.correlation.confidence - a.correlation.confidence;
    });

    if (correlatedRequests.length > 0) {
      event.correlatedRequests = correlatedRequests;
    }
  }

  isLikelyCausationPattern(event, requestData, timeDiff) {
    // Pattern 1: Button clicks followed by OData requests
    if (event.element?.tagName === 'BUTTON' || 
        event.element?.className?.includes('Btn') ||
        event.element?.id?.includes('Button') ||
        event.element?.id?.includes('Btn')) {
      if (timeDiff >= 0 && timeDiff <= 3000 && requestData.type?.includes('odata')) {
        return true;
      }
    }

    // Pattern 2: "Go" button specifically
    if (event.element?.textContent?.includes('Go') || 
        event.element?.id?.includes('btnGo')) {
      if (timeDiff >= 0 && timeDiff <= 5000 && requestData.type?.includes('odata')) {
        return true;
      }
    }

    // Pattern 3: Assign button specifically
    if (event.element?.textContent?.includes('Assign') || 
        event.element?.id?.includes('assign') ||
        event.element?.id?.includes('Assign')) {
      if (timeDiff >= 0 && timeDiff <= 3000 && 
          (requestData.requestBody?.includes('SetMeAsResponsiblePerson') ||
           requestData.url?.includes('SetMeAsResponsiblePerson'))) {
        return true;
      }
    }

    // Pattern 4: Link clicks followed by detail requests
    if (event.element?.tagName === 'A' || event.element?.className?.includes('Link')) {
      if (timeDiff >= 0 && timeDiff <= 4000 && requestData.type?.includes('odata')) {
        return true;
      }
    }

    // Pattern 5: Filter selection followed by data requests
    if (event.element?.id?.includes('filter') || 
        event.element?.id?.includes('Filter') ||
        event.element?.className?.includes('Filter')) {
      if (timeDiff >= 0 && timeDiff <= 4000 && requestData.type?.includes('odata')) {
        return true;
      }
    }

    return false;
  }

  detectCausationPattern(event, requestData) {
    if (event.element?.textContent?.includes('Go')) {
      return 'filter-execution';
    }
    if (event.element?.textContent?.includes('Assign')) {
      return 'assignment-action';
    }
    if (event.element?.tagName === 'A') {
      return 'navigation-action';
    }
    if (event.element?.id?.includes('filter')) {
      return 'filter-selection';
    }
    if (requestData.type?.includes('odata-batch')) {
      return 'data-retrieval';
    }
    return 'generic-interaction';
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


  async captureTabScreenshot(tabId, elementInfo, eventType = null, eventId = null) {
    try {
      // Get the current tab info
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        throw new Error('Tab not found');
      }

      // Get current session for context
      const session = this.sessions.get(tabId);

      const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
        quality: 90
      });
      
      // Generate semantic screenshot ID
      const screenshotId = this.generateScreenshotId(eventType, eventId, session, elementInfo);
      
      const screenshotData = {
        id: screenshotId,
        dataUrl: screenshot,
        timestamp: Date.now(),
        tabId: tabId,
        elementInfo: elementInfo || null,
        eventType: eventType,
        eventId: eventId,
        pageInfo: {
          url: tab.url,
          title: tab.title,
          windowId: tab.windowId
        },
        viewport: {
          width: elementInfo?.viewportWidth || null,
          height: elementInfo?.viewportHeight || null
        }
      };

      // Store screenshot in memory for session export
      this.screenshots.set(screenshotId, screenshotData);
      
      // Clean up old screenshots (keep last 100 per tab)
      this.cleanupOldScreenshots(tabId);
      
      return screenshotData;
    } catch (error) {
      this.logError('Failed to capture screenshot:', error);
      return null;
    }
  }

  generateScreenshotId(eventType = 'manual', eventId = null, session = null, elementInfo = null) {
    // Generate semantic screenshot name: 001_click_manage-alerts_button-save
    const parts = [];
    
    // Part 1: Sequential event ID (001, 002, 003...)
    if (eventId) {
      parts.push(eventId);
    } else {
      const timestamp = Date.now();
      parts.push(timestamp.toString());
    }
    
    // Part 2: Event type
    parts.push(eventType || 'event');
    
    // Part 3: App context (if available)
    if (session?.metadata?.appSemantics?.appType) {
      parts.push(session.metadata.appSemantics.appType);
    } else if (session?.metadata?.sessionName) {
      const appSlug = session.metadata.sessionName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 20);
      parts.push(appSlug);
    }
    
    // Part 4: Element semantics (if available)
    if (elementInfo) {
      const elementSemantics = this.generateElementSemantics(elementInfo);
      if (elementSemantics) {
        parts.push(elementSemantics);
      }
    }
    
    return parts.join('_');
  }

  generateElementSemantics(elementInfo) {
    if (!elementInfo) return null;
    
    // Button semantics
    if (elementInfo.tagName === 'BUTTON' || 
        elementInfo.className?.includes('Btn') ||
        elementInfo.className?.includes('Button')) {
      
      const buttonText = elementInfo.textContent?.trim()?.toLowerCase();
      if (buttonText) {
        if (buttonText.includes('save')) return 'button-save';
        if (buttonText.includes('cancel')) return 'button-cancel';
        if (buttonText.includes('delete')) return 'button-delete';
        if (buttonText.includes('edit')) return 'button-edit';
        if (buttonText.includes('create')) return 'button-create';
        if (buttonText.includes('go')) return 'button-go';
        if (buttonText.includes('search')) return 'button-search';
        if (buttonText.includes('assign')) return 'button-assign';
        
        // Generic button with text
        const cleanText = buttonText.replace(/[^a-z0-9]/g, '').slice(0, 10);
        return `button-${cleanText}`;
      }
      
      return 'button';
    }
    
    // Input field semantics
    if (elementInfo.tagName === 'INPUT') {
      if (elementInfo.id) {
        const idLower = elementInfo.id.toLowerCase();
        if (idLower.includes('name')) return 'input-name';
        if (idLower.includes('email')) return 'input-email';
        if (idLower.includes('search')) return 'input-search';
        if (idLower.includes('filter')) return 'input-filter';
        if (idLower.includes('amount')) return 'input-amount';
        if (idLower.includes('date')) return 'input-date';
        
        // Generic input with ID
        const cleanId = idLower.replace(/[^a-z0-9]/g, '').slice(0, 10);
        return `input-${cleanId}`;
      }
      
      return 'input';
    }
    
    // Link/Navigation semantics
    if (elementInfo.tagName === 'A' || elementInfo.className?.includes('Link')) {
      return 'link';
    }
    
    // Table row/cell semantics
    if (elementInfo.tagName === 'TR' || elementInfo.tagName === 'TD') {
      return 'table-row';
    }
    
    // Tile semantics (Fiori specific)
    if (elementInfo.className?.includes('sapUshellTile') || 
        elementInfo.className?.includes('sapMTile')) {
      return 'tile';
    }
    
    // List item semantics
    if (elementInfo.className?.includes('sapMListItem') || 
        elementInfo.tagName === 'LI') {
      return 'list-item';
    }
    
    return null;
  }

  cleanupOldScreenshots(tabId) {
    // Keep only the last 100 screenshots per tab to prevent memory issues
    const tabScreenshots = Array.from(this.screenshots.values())
      .filter(s => s.tabId === tabId)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (tabScreenshots.length > 100) {
      const toDelete = tabScreenshots.slice(100);
      toDelete.forEach(screenshot => {
        this.screenshots.delete(screenshot.id);
      });
      this.log(`Cleaned up ${toDelete.length} old screenshots for tab ${tabId}`);
    }
  }

  async exportSessionAsMarkdown(sessionIdentifier) {
    try {
      // Get session data
      let sessionData;
      if (typeof sessionIdentifier === 'string') {
        // Session ID provided
        const allSessions = await this.getAllSessions();
        sessionData = allSessions[sessionIdentifier];
      } else {
        // Tab ID provided
        sessionData = this.sessions.get(sessionIdentifier);
      }

      if (!sessionData) {
        throw new Error('Session not found');
      }

      // Generate markdown content
      const markdown = this.generateSessionMarkdown(sessionData);
      
      // Generate semantic filename
      const filename = this.generateSemanticFilename(sessionData, 'md');
      
      return {
        content: markdown,
        filename: filename
      };
    } catch (error) {
      this.logError('Failed to export session as markdown:', error);
      throw error;
    }
  }

  async exportSessionScreenshots(sessionIdentifier) {
    try {
      // Get session data
      let sessionData;
      if (typeof sessionIdentifier === 'string') {
        // Session ID provided
        const allSessions = await this.getAllSessions();
        sessionData = allSessions[sessionIdentifier];
      } else {
        // Tab ID provided
        sessionData = this.sessions.get(sessionIdentifier);
      }

      if (!sessionData) {
        throw new Error('Session not found');
      }

      // Generate JSON content with screenshot references
      const jsonData = this.generateSessionJSON(sessionData);
      
      // Collect all screenshots referenced in the session
      const screenshotIds = this.collectScreenshotIds(sessionData);
      const screenshots = [];
      
      for (const screenshotId of screenshotIds) {
        const screenshot = this.screenshots.get(screenshotId);
        if (screenshot) {
          screenshots.push({
            id: screenshotId,
            filename: `${screenshotId}.png`,
            dataUrl: screenshot.dataUrl,
            timestamp: screenshot.timestamp,
            eventType: screenshot.eventType,
            elementInfo: screenshot.elementInfo
          });
        }
      }

      // Generate semantic filename
      const filename = this.generateSemanticFilename(sessionData, 'json');
      
      return {
        screenshots: screenshots,
        sessionData: jsonData,
        filename: filename,
        screenshotCount: screenshots.length
      };
    } catch (error) {
      this.logError('Failed to export session screenshots:', error);
      throw error;
    }
  }

  generateSessionJSON(sessionData) {
    // Create a clean session export with screenshot references
    const cleanSession = this.cleanSessionData(sessionData);
    
    return JSON.stringify({
      formatVersion: '1.0',
      exportedAt: new Date().toISOString(),
      session: cleanSession,
      metadata: {
        screenshotCount: this.countScreenshotsInSession(sessionData),
        eventCount: sessionData.events?.length || 0,
        networkRequestCount: sessionData.networkRequests?.length || 0
      }
    }, null, 2);
  }

  collectScreenshotIds(sessionData) {
    const screenshotIds = new Set();
    
    // Collect from events
    if (sessionData.events) {
      sessionData.events.forEach(event => {
        if (event.screenshot?.id) {
          screenshotIds.add(event.screenshot.id);
        }
      });
    }
    
    return Array.from(screenshotIds);
  }

  countScreenshotsInSession(sessionData) {
    return this.collectScreenshotIds(sessionData).length;
  }

  generateSessionMarkdown(session) {
    const startDate = new Date(session.startTime);
    const endDate = session.endTime ? new Date(session.endTime) : null;
    const duration = session.duration ? Math.round(session.duration / 1000) : 0;

    // Analyze OData operations
    const odataAnalysis = this.analyzeODataOperations(session.networkRequests || []);
    
    // Generate improved session name
    const improvedSessionName = this.generateImprovedSessionName(session);

    let markdown = `# ${improvedSessionName}\n\n`;
    
    markdown += `## Session Overview\n\n`;
    markdown += `- **Session ID**: ${session.sessionId}\n`;
    markdown += `- **Application URL**: ${session.metadata?.applicationUrl || 'Unknown'}\n`;
    markdown += `- **Started**: ${startDate.toLocaleString()}\n`;
    if (endDate) {
      markdown += `- **Ended**: ${endDate.toLocaleString()}\n`;
    }
    markdown += `- **Duration**: ${duration} seconds\n`;
    markdown += `- **Total Events**: ${session.events?.length || 0}\n`;
    markdown += `- **Network Requests**: ${session.networkRequests?.length || 0}\n`;
    markdown += `- **User Agent**: ${session.metadata?.userAgent || 'Unknown'}\n\n`;

    // OData Analysis Section
    if (odataAnalysis.entities.length > 0 || odataAnalysis.operations.length > 0) {
      markdown += `## OData Analysis\n\n`;
      
      if (odataAnalysis.entities.length > 0) {
        markdown += `### Entities Accessed\n\n`;
        odataAnalysis.entities.forEach(entity => {
          markdown += `- **${entity.name}**: ${entity.operations.join(', ')}\n`;
        });
        markdown += `\n`;
      }

      if (odataAnalysis.operations.length > 0) {
        markdown += `### Operations Performed\n\n`;
        odataAnalysis.operations.forEach(op => {
          markdown += `- **${op.type}**: ${op.description}\n`;
        });
        markdown += `\n`;
      }
    }

    // Events Timeline
    markdown += `## Events Timeline\n\n`;
    
    if (session.events && session.events.length > 0) {
      session.events.forEach((event, index) => {
        const timestamp = new Date(event.timestamp);
        const relativeTime = Math.round((event.timestamp - session.startTime) / 1000);
        
        markdown += `### ${index + 1}. ${this.formatEventTitle(event)} (+${relativeTime}s)\n\n`;
        
        if (event.screenshot?.dataUrl) {
          markdown += `![Event Screenshot](screenshots/event-${index + 1}.png)\n\n`;
        }
        
        markdown += `**Details:**\n`;
        markdown += `- **Type**: ${event.type}\n`;
        markdown += `- **Time**: ${timestamp.toLocaleTimeString()}\n`;
        
        if (event.element) {
          markdown += `- **Element**: ${event.element.tagName}`;
          if (event.element.id) markdown += `#${event.element.id}`;
          markdown += `\n`;
          if (event.element.textContent) {
            markdown += `- **Text**: "${event.element.textContent.slice(0, 100)}"\n`;
          }
        }
        
        if (event.coordinates) {
          markdown += `- **Position**: (${event.coordinates.x}, ${event.coordinates.y})\n`;
        }
        
        if (event.value) {
          markdown += `- **Value**: "${event.value}"\n`;
        }
        
        if (event.isCoalesced) {
          markdown += `- **Input Details**: ${event.editCount} edits over ${Math.round(event.duration / 1000)}s\n`;
          if (event.initialValue && event.finalValue) {
            markdown += `- **Change**: "${event.initialValue}" → "${event.finalValue}"\n`;
          }
        }
        
        if (event.correlatedRequests && event.correlatedRequests.length > 0) {
          markdown += `\n**Correlated Network Requests:**\n\n`;
          event.correlatedRequests.forEach(req => {
            markdown += `- **${req.method}** ${req.url.split('/').pop()}\n`;
            markdown += `  - Confidence: ${Math.round(req.correlation.confidence)}%\n`;
            markdown += `  - Time difference: ${req.correlation.timeDifference}ms\n`;
          });
        }
        
        markdown += `\n---\n\n`;
      });
    } else {
      markdown += `No events recorded.\n\n`;
    }

    // Network Requests Section
    if (session.networkRequests && session.networkRequests.length > 0) {
      markdown += `## Network Requests\n\n`;
      
      session.networkRequests.forEach((request, index) => {
        markdown += `### Request ${index + 1}: ${request.method} ${request.type}\n\n`;
        markdown += `- **URL**: ${request.url}\n`;
        markdown += `- **Method**: ${request.method}\n`;
        markdown += `- **Type**: ${request.type}\n`;
        markdown += `- **Status**: ${request.statusCode || 'Unknown'}\n`;
        markdown += `- **Duration**: ${request.duration || 'Unknown'}ms\n`;
        
        if (request.requestBody && typeof request.requestBody === 'string') {
          markdown += `\n**Request Body:**\n\`\`\`\n${request.requestBody.slice(0, 500)}\n\`\`\`\n`;
        }
        
        markdown += `\n`;
      });
    }

    return markdown;
  }

  analyzeODataOperations(networkRequests) {
    const entities = new Map();
    const operations = [];

    networkRequests.forEach(request => {
      if (request.type?.includes('odata')) {
        // Extract entity names from URL
        const urlParts = request.url.split('/');
        const odataIndex = urlParts.findIndex(part => part.includes('odata'));
        
        if (odataIndex !== -1 && urlParts[odataIndex + 1]) {
          const serviceName = urlParts[odataIndex + 1];
          
          // Extract operation from request body or URL
          if (request.requestBody && typeof request.requestBody === 'string') {
            const bodyLines = request.requestBody.split('\n');
            bodyLines.forEach(line => {
              if (line.includes('GET ') || line.includes('POST ') || line.includes('MERGE ')) {
                const match = line.match(/(GET|POST|MERGE)\s+(\w+)/);
                if (match) {
                  const [, method, entityName] = match;
                  if (!entities.has(entityName)) {
                    entities.set(entityName, { name: entityName, operations: [] });
                  }
                  const entity = entities.get(entityName);
                  if (!entity.operations.includes(method)) {
                    entity.operations.push(method);
                  }
                }
              }
            });
          }
        }

        // Classify operation type
        if (request.requestBody?.includes('MERGE')) {
          operations.push({ type: 'UPDATE', description: 'Entity update operation' });
        } else if (request.requestBody?.includes('POST') && !request.url.includes('$batch')) {
          operations.push({ type: 'CREATE', description: 'Entity creation operation' });
        } else if (request.url.includes('$batch')) {
          operations.push({ type: 'BATCH', description: 'Batch operation with multiple requests' });
        } else if (request.method === 'GET') {
          operations.push({ type: 'READ', description: 'Data retrieval operation' });
        }
      }
    });

    return {
      entities: Array.from(entities.values()),
      operations
    };
  }

  generateSemanticFilename(session, extension = 'json') {
    try {
      // Create ISO timestamp
      const timestamp = new Date(session.startTime).toISOString().replace(/[:.]/g, '-').split('T')[0] + 
                       '_' + new Date(session.startTime).toISOString().replace(/[:.]/g, '-').split('T')[1].slice(0, -5);
      
      // Extract semantics
      const semantics = session.metadata?.appSemantics;
      let semanticPart = 'unknown';
      
      if (semantics) {
        if (semantics.appType !== 'unknown') {
          semanticPart = semantics.appType;
          if (semantics.scenario) {
            semanticPart += `-${semantics.scenario}`;
          }
          if (semantics.businessObject) {
            semanticPart += `-${semantics.businessObject.toLowerCase()}`;
          }
        }
      } else {
        // Fallback: Try to infer from session name or URL
        const sessionName = session.metadata?.sessionName || '';
        const url = session.metadata?.applicationUrl || '';
        
        if (sessionName.toLowerCase().includes('manage alerts')) {
          semanticPart = 'manage-alerts';
        } else if (sessionName.toLowerCase().includes('launchpad') || url.includes('Shell-home')) {
          semanticPart = 'fiori-launchpad-home';
        } else if (url.includes('ComplianceAlert-manage')) {
          semanticPart = 'manage-alerts';
        } else if (url.includes('DetectionMethod-manage')) {
          semanticPart = 'manage-detection-methods';
        } else {
          semanticPart = sessionName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20) || 'unknown';
        }
      }
      
      return `fiori-session-${timestamp}-${semanticPart}.${extension}`;
    } catch (error) {
      this.logError('Error generating semantic filename:', error);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      return `fiori-session-${timestamp}-unknown.${extension}`;
    }
  }

  generateImprovedSessionNameFromUrl(url) {
    if (!url) return null;

    // Known Fiori app mappings
    const fioriAppMappings = {
      'DetectionMethod-manageDetectionMethod': 'Manage Detection Methods',
      'Shell-home': 'Fiori Launchpad Home',
      'UserManagement-maintain': 'User Management',
      'Analytics-reporting': 'Analytics & Reporting',
      'WorkflowInbox-displayInbox': 'Workflow Inbox',
      'BusinessPartner-manage': 'Business Partner Management'
    };

    // Extract app name from Fiori launchpad URL
    const fioriMatch = url.match(/#(\w+)-(\w+)/);
    if (fioriMatch) {
      const [, namespace, appId] = fioriMatch;
      const appKey = `${namespace}-${appId}`;
      
      // Check if we have a known mapping
      if (fioriAppMappings[appKey]) {
        return fioriAppMappings[appKey];
      }
      
      // Generate readable name from app ID
      let appName = appId
        .replace(/([A-Z])/g, ' $1')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim();
      
      // Capitalize first letter
      appName = appName.charAt(0).toUpperCase() + appName.slice(1);
      
      return appName;
    }

    // Fallback: extract from page title or domain
    return null;
  }

  generateImprovedSessionName(session) {
    // Try to extract Fiori app name from URL
    const url = session.metadata?.applicationUrl || '';
    let appName = this.generateImprovedSessionNameFromUrl(url) || 'Fiori Session';

    // Add OData context if available
    const networkRequests = session.networkRequests || [];
    const odataServices = new Set();
    
    networkRequests.forEach(request => {
      if (request.type?.includes('odata')) {
        const serviceMatch = request.url.match(/\/([A-Z_]+_SRV)/);
        if (serviceMatch) {
          odataServices.add(serviceMatch[1]);
        }
      }
    });

    if (odataServices.size > 0) {
      const servicesList = Array.from(odataServices).join(', ');
      appName += ` (${servicesList})`;
    }

    return appName;
  }

  formatEventTitle(event) {
    switch (event.type) {
      case 'click':
        return `Click on ${event.element?.tagName?.toLowerCase() || 'element'}`;
      case 'input':
        if (event.isCoalesced) {
          return `Input: "${event.finalValue}" (${event.editCount} edits)`;
        }
        return `Input: "${event.value}"`;
      case 'keyboard':
        return `Key press: ${event.key}`;
      case 'submit':
        return 'Form submission';
      default:
        return `${event.type} event`;
    }
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Utility function to analyze coalesced events in a session
  analyzeCoalescedEvents(session) {
    const stats = {
      totalEvents: session.events.length,
      inputEvents: 0,
      coalescedEvents: 0,
      averageEditCount: 0,
      longestEditSession: 0,
      totalEditingTime: 0,
      elementsEdited: new Set()
    };

    let totalEditCount = 0;
    
    session.events.forEach(event => {
      if (event.type === 'input') {
        stats.inputEvents++;
        
        if (event.isCoalesced) {
          stats.coalescedEvents++;
          const editCount = event.editCount || 1;
          totalEditCount += editCount;
          
          if (editCount > stats.longestEditSession) {
            stats.longestEditSession = editCount;
          }
          
          if (event.duration) {
            stats.totalEditingTime += event.duration;
          }
          
          if (event.element?.id) {
            stats.elementsEdited.add(event.element.id);
          }
        }
      }
    });

    if (stats.coalescedEvents > 0) {
      stats.averageEditCount = totalEditCount / stats.coalescedEvents;
    }

    stats.elementsEditedCount = stats.elementsEdited.size;
    delete stats.elementsEdited; // Convert Set to count

    return stats;
  }
}

// Initialize background script
new FioriTestBackground();