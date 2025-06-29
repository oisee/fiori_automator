// Background script for Fiori Test Automation System
// Handles network request interception, storage management, and session coordination

class FioriTestBackground {
  constructor() {
    this.sessions = new Map();
    this.networkRequests = new Map();
    this.capturedResponses = new Map(); // Store captured response bodies by URL and timestamp
    this.screenshots = new Map(); // Store screenshots by ID
    this.audioRecordings = new Map(); // Store audio recordings by session ID
    this.debug = false;
    this.lastScreenshotTime = 0; // Track last screenshot time for rate limiting
    this.screenshotQueue = []; // Queue for pending screenshots
    this.processingScreenshots = false;
    this.eventVerbosity = 'default'; // 'summary', 'default', 'verbose'
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
    if (this.isRelevantRequest(details.url, details.method, details.tabId)) {
      const requestBody = this.extractRequestBody(details.requestBody);
      const requestData = {
        requestId: this.generateUUID(),
        tabId: details.tabId,
        url: details.url,
        method: details.method,
        timestamp: Date.now(),
        requestBody: requestBody,
        type: this.classifyRequestType(details.url, details.method)
      };

      // Enhanced OData analysis
      if (this.isODataRequest(details.url)) {
        requestData.odataAnalysis = this.analyzeODataRequest(details.url, details.method, requestBody);
        
        // Handle $batch requests - unwrap and analyze individual operations
        if (requestData.odataAnalysis.isBatch) {
          requestData.batchOperations = this.unwrapBatchRequest(requestBody);
          this.log('$batch request unwrapped:', requestData.batchOperations);
        }
      }

      this.log('Request intercepted:', {
        url: details.url,
        method: details.method,
        type: requestData.type,
        requestId: requestData.requestId,
        odataType: requestData.odataAnalysis?.requestType || 'non-odata'
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
    if (requestData && this.isRelevantRequest(details.url, details.method, details.tabId)) {
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
    const requestData = this.networkRequests.get(requestId);
    if (!requestData) {
      return { captured: false, reason: 'Request not found' };
    }

    // Check if we have a captured response for this request
    const responseKey = this.generateResponseKey(requestData.url, requestData.timestamp);
    const capturedResponse = this.capturedResponses.get(responseKey);
    
    if (capturedResponse) {
      this.log('Found captured response for request:', requestData.url);
      return {
        captured: true,
        data: capturedResponse.responseData,
        contentType: capturedResponse.contentType,
        status: capturedResponse.status,
        headers: capturedResponse.headers
      };
    }

    // Try to find response by URL matching within a time window (±5 seconds)
    const timeWindow = 5000;
    for (const [key, response] of this.capturedResponses.entries()) {
      if (response.url === requestData.url && 
          Math.abs(response.startTime - requestData.timestamp) < timeWindow) {
        this.log('Found captured response by time matching for:', requestData.url);
        return {
          captured: true,
          data: response.responseData,
          contentType: response.contentType,
          status: response.status,
          headers: response.headers
        };
      }
    }

    return { 
      captured: false, 
      reason: 'Response body not captured via content script interception'
    };
  }

  handleCapturedResponse(responseData, tabId) {
    const responseKey = this.generateResponseKey(responseData.url, responseData.startTime);
    
    // Store the captured response
    this.capturedResponses.set(responseKey, responseData);
    
    // Clean up old responses (keep only last 100)
    if (this.capturedResponses.size > 100) {
      const keys = Array.from(this.capturedResponses.keys());
      const toDelete = keys.slice(0, keys.length - 100);
      toDelete.forEach(key => this.capturedResponses.delete(key));
    }

    this.log('Captured response for:', responseData.url, 'Status:', responseData.status);
  }

  generateResponseKey(url, timestamp) {
    return `${url}:${timestamp}`;
  }

  isRelevantRequest(url, method, tabId) {
    // Check if filtering is enabled for this session
    const session = this.sessions.get(tabId);
    const filterJSRequests = session?.metadata?.filterJSRequests !== false; // Default to true
    
    // Always capture these important request types regardless of filtering
    const isOData = this.isODataRequest(url);
    const isSAPRequest = this.isSAPRequest(url);
    const isDataModifying = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const isAuthOrToken = this.isAuthRequest(url);
    
    // If it's a critical request type, always capture
    if (isOData || isAuthOrToken || isDataModifying) {
      return true;
    }
    
    // If filtering is enabled, filter out static assets
    if (filterJSRequests && this.isStaticAssetRequest(url)) {
      return false;
    }
    
    // Check for other SAP-related requests
    if (isSAPRequest) {
      return true;
    }
    
    // Check for web app requests (non-static)
    return this.isWebAppRequest(url);
  }
  
  isStaticAssetRequest(url) {
    // Extended list of static assets to filter out
    const staticExtensions = [
      '.js', '.css', '.map', // JavaScript and CSS
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', // Images
      '.woff', '.woff2', '.ttf', '.eot', // Fonts
      '.mp4', '.mp3', '.avi', '.wav', // Media
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', // Documents
      '.zip', '.tar', '.gz' // Archives
    ];
    
    // Check for common static asset patterns
    const staticPatterns = [
      /\/resources\/.*\.(js|css)/, // UI5 resources
      /\/static\//, // Static folder
      /\/assets\//, // Assets folder
      /\/dist\//, // Distribution folder
      /\/build\//, // Build folder
      /\/node_modules\//, // Node modules
      /\/vendors?\//, // Vendor files
      /\/libs?\//, // Library files
      /cache-buster/, // Cache buster files
      /\.min\.(js|css)/, // Minified files
      /jquery.*\.js/, // jQuery files
      /bootstrap.*\.(js|css)/, // Bootstrap files
      /font-awesome/, // Font awesome
      /favicon\.ico/ // Favicon
    ];
    
    // Check extensions
    const hasStaticExtension = staticExtensions.some(ext => url.toLowerCase().includes(ext));
    
    // Check patterns
    const matchesStaticPattern = staticPatterns.some(pattern => pattern.test(url));
    
    return hasStaticExtension || matchesStaticPattern;
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
      if (url.includes('$count')) return 'odata-count';
      if (url.includes('$filter')) return 'odata-filter';
      if (url.includes('$search')) return 'odata-search';
      if (url.includes('$expand')) return 'odata-expand';
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

  analyzeODataRequest(url, method, requestBody) {
    const analysis = {
      isBatch: url.includes('$batch'),
      isMetadata: url.includes('$metadata'),
      isCount: url.includes('$count'),
      requestType: 'unknown',
      operations: [],
      queryParams: {},
      entitySet: null,
      serviceRoot: null
    };

    // Extract service root
    analysis.serviceRoot = this.extractODataServiceRoot(url);

    // Parse URL parameters
    try {
      const urlObj = new URL(url);
      const params = urlObj.searchParams;
      
      // Extract common OData query parameters
      const odataParams = [
        '$filter', '$search', '$select', '$expand', '$orderby', 
        '$top', '$skip', '$format', '$inlinecount', '$skiptoken'
      ];
      
      odataParams.forEach(param => {
        if (params.has(param)) {
          analysis.queryParams[param] = params.get(param);
        }
      });
      
      // Extract entity set from URL path
      if (analysis.serviceRoot) {
        const serviceRootPath = new URL(analysis.serviceRoot).pathname;
        const fullPath = urlObj.pathname;
        const pathAfterService = fullPath.substring(serviceRootPath.length);
        const pathParts = pathAfterService.split('/').filter(p => p && !p.startsWith('$'));
        if (pathParts.length > 0) {
          analysis.entitySet = pathParts[0].split('(')[0]; // Remove key predicates
        }
      }
      
    } catch (e) {
      this.log('Error parsing OData URL:', e);
    }

    // Determine request type based on URL and method
    analysis.requestType = this.determineODataRequestType(url, method, analysis);

    return analysis;
  }

  determineODataRequestType(url, method, analysis) {
    // Handle special OData endpoints
    if (analysis.isMetadata) return 'metadata';
    if (analysis.isBatch) return 'batch';
    if (analysis.isCount) return 'count';

    // Check for system query options to determine intent
    const queryParams = analysis.queryParams;
    
    if (queryParams['$filter']) {
      return 'filter-query';
    }
    
    if (queryParams['$search']) {
      return 'search-query';
    }
    
    if (queryParams['$expand']) {
      return 'expand-query';
    }
    
    if (queryParams['$top'] || queryParams['$skip']) {
      return 'paging-query';
    }
    
    if (queryParams['$orderby']) {
      return 'sort-query';
    }
    
    // Fallback to HTTP method-based classification
    switch (method) {
      case 'GET':
        return analysis.entitySet ? 'entity-read' : 'collection-read';
      case 'POST':
        return analysis.entitySet ? 'entity-create' : 'function-call';
      case 'PUT':
      case 'PATCH':
        return 'entity-update';
      case 'DELETE':
        return 'entity-delete';
      default:
        return 'unknown';
    }
  }

  unwrapBatchRequest(requestBody) {
    if (!requestBody || typeof requestBody !== 'string') {
      return [];
    }

    const operations = [];
    
    try {
      // Parse multipart/mixed batch format
      const lines = requestBody.split('\n');
      let currentOperation = null;
      let inRequestHeaders = false;
      let inRequestBody = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Detect batch boundary
        if (line.startsWith('--batch_') || line.startsWith('--changeset_')) {
          if (currentOperation) {
            operations.push(currentOperation);
          }
          currentOperation = {
            type: 'unknown',
            method: null,
            url: null,
            headers: {},
            body: null
          };
          inRequestHeaders = false;
          inRequestBody = false;
          continue;
        }
        
        // Parse HTTP request line (e.g., "GET EntitySet HTTP/1.1")
        if (line.match(/^(GET|POST|PUT|PATCH|DELETE|MERGE)\s+/)) {
          const match = line.match(/^(\w+)\s+([^\s]+)/);
          if (match && currentOperation) {
            currentOperation.method = match[1];
            currentOperation.url = match[2];
            currentOperation.type = this.classifyBatchOperation(match[1], match[2]);
            inRequestHeaders = true;
            inRequestBody = false;
          }
          continue;
        }
        
        // Parse headers
        if (inRequestHeaders && line.includes(':')) {
          const [key, ...valueParts] = line.split(':');
          if (currentOperation) {
            currentOperation.headers[key.trim()] = valueParts.join(':').trim();
          }
          continue;
        }
        
        // Empty line indicates end of headers, start of body
        if (inRequestHeaders && line === '') {
          inRequestHeaders = false;
          inRequestBody = true;
          continue;
        }
        
        // Collect request body
        if (inRequestBody && line && currentOperation) {
          if (!currentOperation.body) {
            currentOperation.body = '';
          }
          currentOperation.body += line + '\n';
        }
      }
      
      // Add the last operation
      if (currentOperation) {
        operations.push(currentOperation);
      }
      
    } catch (error) {
      this.log('Error unwrapping batch request:', error);
    }
    
    return operations.filter(op => op.method && op.url);
  }

  classifyBatchOperation(method, url) {
    if (url.includes('$metadata')) return 'metadata';
    if (url.includes('$count')) return 'count';
    if (url.includes('$filter')) return 'filter';
    if (url.includes('$search')) return 'search';
    
    switch (method) {
      case 'GET': return 'read';
      case 'POST': return 'create';
      case 'PUT':
      case 'PATCH':
      case 'MERGE': return 'update';
      case 'DELETE': return 'delete';
      default: return 'unknown';
    }
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
        case 'start-recording': {
          const tabId = sender.tab?.id || message.tabId;
          if (!tabId) {
            throw new Error('No tab ID available');
          }
          await this.startRecording(tabId, message.data);
          sendResponse({ success: true });
          break;
        }

        case 'stop-recording':
          await this.stopRecording(sender.tab?.id || message.tabId);
          sendResponse({ success: true });
          break;

        case 'get-session-data': {
          const sessionData = await this.getSessionData(sender.tab?.id || message.tabId);
          sendResponse({ success: true, data: sessionData });
          break;
        }

        case 'get-recording-state': {
          const recordingState = await this.getRecordingState(sender.tab?.id || message.tabId);
          sendResponse({ success: true, data: recordingState });
          break;
        }

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

        case 'get-sessions': {
          const sessions = await this.getAllSessions();
          sendResponse({ success: true, data: sessions });
          break;
        }

        case 'capture-event': {
          const eventTabId = sender.tab?.id || message.tabId;
          this.log('Received capture-event message from tab:', eventTabId, 'Event type:', message.data?.type);
          await this.captureEvent(eventTabId, message.data);
          this.log('Event processed successfully');
          sendResponse({ success: true });
          break;
        }

        case 'capture-screenshot': {
          const screenshot = await this.captureTabScreenshot(
            sender.tab?.id || message.tabId, 
            message.elementInfo, 
            message.eventType || 'manual',
            message.eventId
          );
          sendResponse({ success: true, screenshot });
          break;
        }

        case 'export-session-markdown': {
          try {
            const exportResult = await this.exportSessionAsMarkdown(message.sessionId || sender.tab?.id || message.tabId);
            sendResponse({ 
              success: true, 
              zipData: exportResult.content, 
              filename: exportResult.filename 
            });
          } catch (error) {
            this.logError('Markdown export failed:', error);
            sendResponse({ 
              success: false, 
              error: `Markdown export failed: ${error.message}` 
            });
          }
          break;
        }

        case 'export-session-json': {
          try {
            const exportResult = await this.exportSessionAsJSON(message.sessionId || sender.tab?.id || message.tabId);
            sendResponse({ 
              success: true, 
              sessionData: exportResult.content, 
              filename: exportResult.filename 
            });
          } catch (error) {
            this.logError('JSON export failed:', error);
            sendResponse({ 
              success: false, 
              error: `JSON export failed: ${error.message}` 
            });
          }
          break;
        }

        case 'export-session-screenshots': {
          const screenshotResult = await this.exportSessionScreenshots(message.sessionId || sender.tab?.id || message.tabId);
          sendResponse({ 
            success: true, 
            screenshots: screenshotResult.screenshots,
            sessionData: screenshotResult.sessionData,
            filename: screenshotResult.filename
          });
          break;
        }

        case 'store-audio-chunk': {
          const tabId = sender.tab?.id || message.tabId;
          await this.storeAudioChunk(tabId, message.audioData, message.timestamp);
          sendResponse({ success: true });
          break;
        }

        case 'start-audio-recording': {
          const tabId = sender.tab?.id || message.tabId;
          await this.startAudioRecording(tabId);
          sendResponse({ success: true });
          break;
        }

        case 'stop-audio-recording': {
          const tabId = sender.tab?.id || message.tabId;
          const audioData = await this.stopAudioRecording(tabId);
          sendResponse({ success: true, audioData });
          break;
        }

        case 'export-session-audio': {
          const audioResult = await this.exportSessionAudio(message.sessionId || sender.tab?.id || message.tabId);
          sendResponse({ 
            success: true, 
            audioData: audioResult
          });
          break;
        }

        case 'export-session-zip': {
          const zipResult = await this.exportSessionAsZipPackage(message.sessionId || sender.tab?.id || message.tabId);
          sendResponse({ 
            success: true, 
            zipData: zipResult
          });
          break;
        }

        case 'response-captured': {
          this.handleCapturedResponse(message.data, sender.tab?.id);
          sendResponse({ success: true });
          break;
        }

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
        userAgent: navigator.userAgent,
        audioRecording: sessionData.recordAudio || false,
        eventVerbosity: sessionData.eventVerbosity || 'default'
      },
      events: [],
      networkRequests: [],
      isRecording: true,
      isPaused: false,
      pausedTime: 0,
      lastPauseStart: null
    };

    this.sessions.set(tabId, session);
    
    // Set verbosity level for this recording session
    this.eventVerbosity = sessionData.eventVerbosity || 'default';
    this.log(`Recording started with verbosity level: ${this.eventVerbosity}`);
    
    // Start audio recording if enabled
    if (sessionData.recordAudio) {
      try {
        await this.startAudioRecording(tabId);
        this.log('Audio recording started with session');
      } catch (error) {
        this.logError('Failed to start audio recording:', error);
        // Continue with session even if audio fails
      }
    }
    
    // Notify content script to start recording (including audio if enabled)
    await this.notifyContentScript(tabId, 'start-recording', sessionData);
    
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

      // Stop audio recording if it was enabled
      let audioData = null;
      try {
        audioData = await this.stopAudioRecording(tabId);
        if (audioData) {
          this.log('Audio recording stopped with session');
          // Attach audio data to session before saving
          session.audioData = audioData;
        }
      } catch (error) {
        this.logError('Failed to stop audio recording:', error);
      }

      // Notify content script to stop recording
      await this.notifyContentScript(tabId, 'stop-recording');

      // Save session to storage (now includes audio data)
      await this.saveSession(session);
      
      // Broadcast state change
      this.broadcastStateChange(tabId, 'stopped');
      
      // Clean up session from memory after saving
      this.sessions.delete(tabId);
      
      // Clean up audio recording from memory
      if (session.sessionId && this.audioRecordings.has(session.sessionId)) {
        this.audioRecordings.delete(session.sessionId);
        this.log('Audio recording cleaned up from memory');
      }
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

      // Filter out redundant or meaningless events first
      if (this.isRedundantEvent(event, session)) {
        this.log(`Event filtered out as redundant:`, event.type, event.value || '');
        return;
      }
      
      // Apply verbosity filtering and input event coalescing
      if (this.shouldIncludeEventByVerbosity(event, session)) {
        this.addEventWithCoalescing(session, event);
      } else {
        this.log(`Event filtered out by verbosity (${this.eventVerbosity}):`, event.type, event.element?.tagName);
        return; // Skip further processing for filtered events
      }
      
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
    // Generate sequential event ID (0001, 0002, 0003, etc.)
    const eventNumber = (session.events?.length || 0) + 1;
    return eventNumber.toString().padStart(4, '0');
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
      
      // Reset stable session name to allow it to be recomputed with the new name
      if (session.metadata.stableSessionName && 
          (session.metadata.stableSessionName.includes('launchpad') || 
           session.metadata.stableSessionName.includes('session'))) {
        this.log(`Clearing cached stable name "${session.metadata.stableSessionName}" due to meaningful name update`);
        delete session.metadata.stableSessionName;
      }
    }
  }

  extractMeaningfulAppName(event, eventData) {
    // Method 1: Extract from UI5 context - highest priority for Fiori apps
    const ui5AppInfo = this.extractFioriAppIdFromUI5Context(eventData.ui5Context);
    if (ui5AppInfo) {
      // Store detailed app info in session metadata for later use
      if (event && event.sessionId) {
        const session = this.sessions.get(event.tabId);
        if (session) {
          session.metadata.fioriAppId = ui5AppInfo.appId;
          session.metadata.fioriAppTitle = ui5AppInfo.appTitle;
          session.metadata.technicalComponentId = ui5AppInfo.technicalComponentId;
        }
      }
      return ui5AppInfo.sessionName;
    }

    // Method 2: From current page URL
    if (eventData.pageUrl) {
      const appName = this.generateImprovedSessionNameFromUrl(eventData.pageUrl);
      if (appName && !appName.includes('Launchpad')) {
        return appName;
      }
    }

    // Method 3: From UI5 app semantics (legacy method)
    if (eventData.ui5Context?.appSemantics?.appType && 
        eventData.ui5Context.appSemantics.appType !== 'unknown') {
      return this.formatAppNameFromSemantics(eventData.ui5Context.appSemantics);
    }

    // Method 4: From page title if available
    if (eventData.pageTitle && 
        !eventData.pageTitle.includes('Launchpad') && 
        !eventData.pageTitle.includes('Home')) {
      return eventData.pageTitle.slice(0, 50); // Limit length
    }

    // Method 5: From DOM context (e.g., clicked on specific app tile)
    if (event.type === 'click' && eventData.element) {
      const appName = this.extractAppNameFromElement(eventData.element);
      if (appName) {
        return appName;
      }
    }

    return null;
  }

  extractFioriAppIdFromUI5Context(ui5Context) {
    if (!ui5Context || !ui5Context.globalUI5Context) {
      return null;
    }

    // Look for AppInfo model in the global UI5 context
    const globalContext = ui5Context.globalUI5Context;
    
    // Method 1: Check if AppInfo model is directly available in UI5 context
    if (globalContext.models && Array.isArray(globalContext.models)) {
      const appInfoModel = globalContext.models.find(model => 
        model.name === 'AppInfo' && 
        model.type === 'sap.ui.model.json.JSONModel' &&
        model.data
      );
      
      if (appInfoModel && appInfoModel.data) {
        const appData = appInfoModel.data;
        const appInfo = {
          appId: appData.appId?.text || null,
          appTitle: appData.appTitle?.text || null,
          appVersion: appData.appVersion?.text || null,
          technicalComponentId: appData.technicalAppComponentId?.text || null,
          supportInfo: appData.appSupportInfo?.text || null,
          frameworkId: appData.appFrameworkId?.text || null,
          frameworkVersion: appData.appFrameworkVersion?.text || null
        };
        
        // Generate session name from app title or technical component
        let sessionName = appInfo.appTitle || 'Unknown App';
        
        // Clean up common prefixes/suffixes
        sessionName = sessionName
          .replace(/^Manage\s+/i, '')
          .replace(/\s+Management$/i, '')
          .trim();
        
        // Convert to filename-friendly format
        sessionName = this.cleanNameForFilename(sessionName);
        
        this.log('Extracted Fiori App Info from AppInfo model:', appInfo);
        
        return {
          ...appInfo,
          sessionName: sessionName,
          source: 'AppInfo-model'
        };
      }
    }
    
    // Method 2: Check element UI5 info for component information
    if (ui5Context.elementUI5Info) {
      const elementInfo = ui5Context.elementUI5Info;
      
      // Look for component ID patterns
      if (elementInfo.controlId) {
        const componentMatch = elementInfo.controlId.match(/application-([^-]+)-([^-]+)/);
        if (componentMatch) {
          const appInfo = {
            appId: componentMatch[1] || null,
            appTitle: this.formatAppNameFromComponentId(componentMatch[2]),
            technicalComponentId: elementInfo.controlType || null,
            sessionName: this.formatAppNameFromComponentId(componentMatch[2]),
            source: 'element-component-id'
          };
          
          this.log('Extracted Fiori App Info from element component ID:', appInfo);
          return appInfo;
        }
      }
    }
    
    // Method 3: Check global UI5 context for app information
    if (globalContext.appInfo) {
      const appInfo = {
        appId: globalContext.appInfo.appId || null,
        appTitle: globalContext.appInfo.appTitle || null,
        appVersion: globalContext.appInfo.appVersion || null,
        technicalComponentId: globalContext.appInfo.technicalComponentId || null,
        supportInfo: globalContext.appInfo.supportInfo || null,
        sessionName: this.cleanNameForFilename(
          globalContext.appInfo.appTitle || 
          globalContext.appInfo.technicalComponentId || 
          'Unknown App'
        ),
        source: 'global-ui5-appInfo'
      };
      
      this.log('Extracted Fiori App Info from global UI5 context:', appInfo);
      return appInfo;
    }
    
    return null;
  }

  formatAppNameFromComponentId(componentId) {
    // Convert component IDs like "manageDetectionMethod" to "Manage Detection Method"
    return componentId
      .replace(/([A-Z])/g, ' $1')
      .replace(/^manage/i, 'Manage')
      .trim();
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

  isRedundantEvent(event, session) {
    // Filter out completely empty input events
    if (event.type === 'input' && (!event.value || event.value.trim() === '')) {
      // Check if this is the first input in the field (clearing existing value)
      const lastInputToSameField = session.events.findLast(e => 
        e.type === 'input' && 
        e.element?.id === event.element?.id
      );
      
      // If there was a previous non-empty value, this clear action is significant
      if (lastInputToSameField && lastInputToSameField.value && lastInputToSameField.value.trim() !== '') {
        return false; // Keep the clearing event
      }
      
      return true; // Filter out empty inputs
    }
    
    // Filter out redundant editing_start with no corresponding editing_end
    if (event.type === 'editing_start') {
      // Check if there's already an editing_start for the same element without an end
      const hasUnfinishedEdit = session.events.some(e => 
        e.type === 'editing_start' && 
        e.element?.id === event.element?.id &&
        !session.events.some(endEvent => 
          endEvent.type === 'editing_end' && 
          endEvent.element?.id === e.element?.id &&
          endEvent.timestamp > e.timestamp
        )
      );
      
      if (hasUnfinishedEdit) {
        return true; // Filter out duplicate editing_start
      }
    }
    
    // Filter out keydown events that don't represent meaningful actions
    if (event.type === 'keydown') {
      const key = event.key?.toLowerCase();
      const meaninglessKeys = ['shift', 'control', 'alt', 'meta', 'capslock'];
      
      if (meaninglessKeys.includes(key)) {
        return true;
      }
    }
    
    // Filter out rapid repeated clicks on the same element (double/triple clicks)
    if (event.type === 'click') {
      const recentClicks = session.events.filter(e => 
        e.type === 'click' && 
        e.element?.id === event.element?.id &&
        event.timestamp - e.timestamp < 500 // Within 500ms
      );
      
      if (recentClicks.length > 0) {
        this.log('Filtering rapid repeated click');
        return true;
      }
    }
    
    return false;
  }

  consolidateEditingEvents(session, endEvent) {
    // Find the corresponding editing_start event
    const startEvent = session.events.findLast(e => 
      e.type === 'editing_start' && 
      e.element?.id === endEvent.element?.id
    );
    
    if (!startEvent) {
      return null;
    }
    
    const duration = endEvent.timestamp - startEvent.timestamp;
    const initialValue = startEvent.initialValue || '';
    const finalValue = endEvent.finalValue || '';
    const hasChanged = initialValue !== finalValue;
    
    // Don't consolidate if no actual change occurred and duration was very short
    if (!hasChanged && duration < 1000) {
      return null; // Will remove both events via verbosity filtering
    }
    
    // Create a consolidated "field_edit" event
    const consolidatedEvent = {
      eventId: startEvent.eventId, // Keep the original event ID
      timestamp: startEvent.timestamp,
      type: 'field_edit',
      element: startEvent.element,
      initialValue: initialValue,
      finalValue: finalValue,
      duration: duration,
      hasChanged: hasChanged,
      ui5Context: endEvent.ui5Context || startEvent.ui5Context,
      screenshot: endEvent.screenshot || startEvent.screenshot, // Prefer end screenshot
      // Include both screenshots if different
      screenshots: [
        startEvent.screenshot,
        endEvent.screenshot
      ].filter(s => s && s.id).filter((s, i, arr) => 
        arr.findIndex(s2 => s2.id === s.id) === i
      )
    };
    
    return consolidatedEvent;
  }

  addEventWithCoalescing(session, newEvent) {
    // Configuration for coalescing
    const COALESCING_TIME_THRESHOLD = 1500; // 1.5 seconds
    const COALESCING_ENABLED = true;

    if (!COALESCING_ENABLED) {
      session.events.push(newEvent);
      return;
    }

    // Handle editing_start/editing_end consolidation
    if (newEvent.type === 'editing_end') {
      const consolidatedEvent = this.consolidateEditingEvents(session, newEvent);
      if (consolidatedEvent) {
        // Replace the editing_start event with consolidated event
        const startEventIndex = session.events.findIndex(e => 
          e.type === 'editing_start' && 
          e.element?.id === newEvent.element?.id
        );
        
        if (startEventIndex !== -1) {
          session.events[startEventIndex] = consolidatedEvent;
          this.log(`Consolidated editing events for element: ${newEvent.element?.id}`);
          return; // Don't add the editing_end event
        }
      }
    }

    // Handle input event coalescing
    if (newEvent.type !== 'input') {
      // No coalescing needed for non-input events, add normally
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

  shouldIncludeEventByVerbosity(event, session) {
    // Always include navigation and major state changes regardless of verbosity
    const criticalEventTypes = ['navigation', 'page_load', 'form_submit', 'click'];
    
    if (criticalEventTypes.includes(event.type)) {
      return true;
    }

    const verbosityLevel = this.eventVerbosity;
    
    switch (verbosityLevel) {
      case 'summary':
        return this.isSummaryLevelEvent(event, session);
      
      case 'default':
        return this.isDefaultLevelEvent(event, session);
      
      case 'verbose':
        return true; // Include everything
      
      default:
        return this.isDefaultLevelEvent(event, session);
    }
  }

  isSummaryLevelEvent(event, session) {
    // Summary mode: Only major navigation and meaningful actions
    const summaryTypes = ['navigation', 'page_load', 'form_submit'];
    
    if (summaryTypes.includes(event.type)) {
      return true;
    }
    
    // Include clicks on buttons and links (meaningful UI interactions)
    if (event.type === 'click') {
      const tagName = event.element?.tagName?.toLowerCase();
      const meaningfulElements = ['button', 'a', 'input'];
      return meaningfulElements.includes(tagName);
    }
    
    // Include inputs with substantial content changes (> 5 characters)
    if (event.type === 'input') {
      const value = event.value || '';
      return value.length > 5;
    }
    
    // Include field edits that resulted in changes
    if (event.type === 'field_edit') {
      return event.hasChanged === true;
    }
    
    return false;
  }

  isDefaultLevelEvent(event, session) {
    // Default mode: Major actions + meaningful inputs, filter out noise
    const defaultTypes = ['navigation', 'page_load', 'form_submit', 'click', 'field_edit'];
    
    if (defaultTypes.includes(event.type)) {
      return true;
    }
    
    // Filter out editing_start/editing_end in default mode (they should be consolidated)
    if (event.type === 'editing_start' || event.type === 'editing_end') {
      return false;
    }
    
    // Include input events but filter out trivial ones
    if (event.type === 'input') {
      const value = event.value || '';
      
      // Skip empty inputs
      if (value.trim().length === 0) {
        return false;
      }
      
      // Skip very short inputs (< 2 characters) unless they're in important fields
      if (value.length < 2) {
        const isImportantField = this.isImportantField(event.element);
        return isImportantField;
      }
      
      return true;
    }
    
    // Include keyboard shortcuts and important key events
    if (event.type === 'keydown') {
      const key = event.key?.toLowerCase();
      const shortcuts = ['enter', 'escape', 'tab', 'f1', 'f2', 'f3', 'f4', 'f5'];
      const hasModifiers = event.modifiers?.ctrlKey || event.modifiers?.altKey || event.modifiers?.metaKey;
      
      return shortcuts.includes(key) || hasModifiers;
    }
    
    return false;
  }

  isImportantField(element) {
    if (!element) return false;
    
    const importantTypes = ['email', 'password', 'search', 'tel', 'url'];
    const importantNames = ['username', 'password', 'email', 'search', 'query'];
    const importantIds = ['username', 'password', 'email', 'search', 'query', 'login'];
    
    const type = element.type?.toLowerCase() || '';
    const name = element.name?.toLowerCase() || '';
    const id = element.id?.toLowerCase() || '';
    
    return importantTypes.includes(type) || 
           importantNames.some(n => name.includes(n)) ||
           importantIds.some(n => id.includes(n));
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
      const bodyString = typeof requestData.requestBody === 'string' ? requestData.requestBody : 
                        (requestData.requestBody ? JSON.stringify(requestData.requestBody) : '');
      if (timeDiff >= 0 && timeDiff <= 3000 && 
          (bodyString.includes('SetMeAsResponsiblePerson') ||
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
      
      // Enhance session with Fiori App ID detection
      const fioriAppId = this.extractFioriAppId(session);
      if (fioriAppId) {
        session.metadata.fioriAppId = fioriAppId;
        session.metadata.fioriAppsLibraryInfo = await this.queryFioriAppsLibraryAPI(fioriAppId);
        this.log('Enhanced session with Fiori App ID:', fioriAppId);
      }

      // Extract additional app metadata from UI5 models
      const additionalMetadata = this.extractAdditionalAppMetadata(session);
      if (additionalMetadata) {
        session.metadata.ui5ModelData = additionalMetadata;
        this.log('Enhanced session with UI5 model metadata:', Object.keys(additionalMetadata));
      }
      
      // Correlate OData services with potential Fiori apps
      const odataCorrelations = await this.correlateODataServicesWithApps(session);
      if (odataCorrelations.length > 0) {
        session.metadata.odataServiceCorrelations = odataCorrelations;
        this.log('Added OData service correlations:', odataCorrelations.length, 'services');
      }
      
      // Clean session data before saving
      const cleanSession = this.cleanSessionData(session);
      sessions[session.sessionId] = cleanSession;
      
      await chrome.storage.local.set({ fioriSessions: sessions });
      this.log('Session saved successfully with enhanced metadata');
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
    // Queue the screenshot request to handle rate limiting
    return new Promise((resolve, reject) => {
      this.screenshotQueue.push({
        tabId,
        elementInfo,
        eventType,
        eventId,
        resolve,
        reject
      });
      
      // Process queue if not already processing
      if (!this.processingScreenshots) {
        this.processScreenshotQueue();
      }
    });
  }
  
  async processScreenshotQueue() {
    if (this.processingScreenshots || this.screenshotQueue.length === 0) {
      return;
    }
    
    this.processingScreenshots = true;
    
    while (this.screenshotQueue.length > 0) {
      const request = this.screenshotQueue.shift();
      
      try {
        // Rate limiting: Chrome allows 2 captures per second, so wait at least 550ms between captures
        const now = Date.now();
        const timeSinceLastCapture = now - this.lastScreenshotTime;
        if (timeSinceLastCapture < 550) {
          await new Promise(resolve => setTimeout(resolve, 550 - timeSinceLastCapture));
        }
        
        const screenshotData = await this.captureTabScreenshotInternal(
          request.tabId,
          request.elementInfo,
          request.eventType,
          request.eventId
        );
        
        this.lastScreenshotTime = Date.now();
        request.resolve(screenshotData);
      } catch (error) {
        request.reject(error);
      }
    }
    
    this.processingScreenshots = false;
  }

  async captureTabScreenshotInternal(tabId, elementInfo, eventType = null, eventId = null) {
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
    // Generate clean screenshot filename: fs-<timestamp>-<stable-session-name>-<event-id>-<event-type>
    
    // Get session timestamp and name for consistency with session files
    const date = new Date(session?.startTime || Date.now());
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = date.toISOString().split('T')[1].slice(0, 5).replace(':', ''); // HHMM
    const timestamp = `${dateStr}-${timeStr}`;
    
    // Use stable session name to ensure all screenshots in a session have consistent filenames
    const sessionNameShort = session ? this.getStableSessionName(session) : 'session';
    
    // Format event ID with leading zeros (0001, 0002, etc.)
    // If no eventId provided, generate next sequential number from session
    let formattedEventId;
    if (eventId) {
      formattedEventId = eventId.toString().padStart(4, '0');
    } else if (session) {
      // Generate next sequential ID based on current session events
      const nextEventNumber = (session.events?.length || 0) + 1;
      formattedEventId = nextEventNumber.toString().padStart(4, '0');
    } else {
      // Last resort - use a sequential number based on current time
      formattedEventId = '9999';
    }
    
    // Clean event type
    const cleanEventType = (eventType || 'event').toLowerCase().replace(/[^a-z0-9]/g, '');
    
    return `fs-${timestamp}-${sessionNameShort}-${formattedEventId}-${cleanEventType}`;
  }

  getStableSessionName(session) {
    // Return a stable session name, but allow updates when a better name becomes available
    
    // Compute the best available name based on current session state
    let bestName;
    
    // Priority 1: Use the current/most specific app name if available
    const currentName = session.metadata?.sessionName || '';
    if (currentName && 
        !currentName.includes('Launchpad') && 
        !currentName.startsWith('Session ') &&
        !currentName.includes('New Recording')) {
      bestName = this.cleanNameForFilename(currentName);
    }
    // Priority 2: Use the original session name if it was meaningful
    else if (session.metadata?.originalSessionName && 
             !session.metadata.originalSessionName.includes('Launchpad') &&
             !session.metadata.originalSessionName.startsWith('Session ')) {
      bestName = this.cleanNameForFilename(session.metadata.originalSessionName);
    }
    // Priority 3: Use URL pattern detection
    else {
      const url = session.metadata?.applicationUrl || '';
      if (url.includes('DetectionMethod-manage')) {
        bestName = 'manage-detection-methods';
      } else if (url.includes('Shell-home')) {
        bestName = 'launchpad-home';
      } else if (url.includes('ComplianceAlert-manage')) {
        bestName = 'manage-alerts';
      } else {
        // Fallback to session naming logic
        bestName = this.extractConciseSessionName(session);
      }
    }
    
    // Check if we have a cached stable name
    const cachedName = session.metadata?.stableSessionName;
    
    // Update stable name if:
    // 1. No cached name exists, OR
    // 2. Cached name is generic (launchpad, session) but we now have a better specific name
    const shouldUpdate = !cachedName || 
      ((cachedName.includes('launchpad') || cachedName.includes('session')) && 
       bestName && 
       !bestName.includes('launchpad') && 
       !bestName.includes('session'));
    
    if (shouldUpdate) {
      if (!session.metadata) session.metadata = {};
      session.metadata.stableSessionName = bestName;
      
      if (cachedName && cachedName !== bestName) {
        this.log(`Updated stable session name: "${cachedName}" → "${bestName}" for session ${session.sessionId}`);
      } else {
        this.log(`Set stable session name: "${bestName}" for session ${session.sessionId}`);
      }
      
      return bestName;
    }
    
    // Return cached name if no update needed
    return cachedName || bestName;
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

  async exportSessionAsJSON(sessionIdentifier) {
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

      // Generate enhanced session data with application intelligence summary
      const enhancedSessionData = this.generateEnhancedSessionData(sessionData);
      
      // Generate semantic filename
      const filename = this.generateSemanticFilename(sessionData, 'json');
      
      return {
        content: JSON.stringify(enhancedSessionData, null, 2),
        filename: filename
      };
    } catch (error) {
      this.logError('Failed to export session as JSON:', error);
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
    
    // Generate sequence summary for diagram generation
    const sequenceSummary = this.generateSequenceSummary(sessionData);
    const odataAnalysis = this.analyzeODataOperations(sessionData.networkRequests || []);
    
    return JSON.stringify({
      formatVersion: '1.1',
      exportedAt: new Date().toISOString(),
      session: cleanSession,
      summary: {
        sequenceSummary: sequenceSummary,
        odataAnalysis: odataAnalysis,
        screenshotCount: this.countScreenshotsInSession(sessionData),
        eventCount: sessionData.events?.length || 0,
        networkRequestCount: sessionData.networkRequests?.length || 0,
        // Enhanced application intelligence summary
        applicationIntelligence: {
          fioriAppId: sessionData.metadata?.fioriAppId || null,
          appTitle: sessionData.metadata?.ui5ModelData?.appInfo?.appTitle || null,
          appVersion: sessionData.metadata?.ui5ModelData?.appInfo?.appVersion || null,
          technicalComponent: sessionData.metadata?.ui5ModelData?.appInfo?.technicalComponentId || null,
          framework: sessionData.metadata?.ui5ModelData?.appInfo?.frameworkId || null,
          frameworkVersion: sessionData.metadata?.ui5ModelData?.appInfo?.frameworkVersion || null,
          odataServicesDetected: sessionData.metadata?.odataServiceCorrelations?.length || 0,
          businessContexts: this.extractBusinessContexts(sessionData.metadata?.odataServiceCorrelations || []),
          hasAppsLibraryIntegration: !!sessionData.metadata?.fioriAppsLibraryInfo,
          audioRecorded: !!sessionData.metadata?.audioRecording
        }
      },
      metadata: {
        screenshotCount: this.countScreenshotsInSession(sessionData),
        eventCount: sessionData.events?.length || 0,
        networkRequestCount: sessionData.networkRequests?.length || 0,
        enhancedMetadataVersion: '1.1',
        detectionMethods: this.getDetectionMethodsUsed(sessionData)
      }
    }, null, 2);
  }

  generateEnhancedSessionData(sessionData) {
    // Create a clean session export with screenshot references
    const cleanSession = this.cleanSessionData(sessionData);
    
    // Generate sequence summary for diagram generation
    const sequenceSummary = this.generateSequenceSummary(sessionData);
    const odataAnalysis = this.analyzeODataOperations(sessionData.networkRequests || []);
    
    return {
      formatVersion: '1.1',
      exportedAt: new Date().toISOString(),
      session: cleanSession,
      summary: {
        sequenceSummary: sequenceSummary,
        odataAnalysis: odataAnalysis,
        screenshotCount: this.countScreenshotsInSession(sessionData),
        eventCount: sessionData.events?.length || 0,
        networkRequestCount: sessionData.networkRequests?.length || 0,
        // Enhanced application intelligence summary
        applicationIntelligence: {
          fioriAppId: sessionData.metadata?.fioriAppId || null,
          appTitle: sessionData.metadata?.ui5ModelData?.appInfo?.appTitle || null,
          appVersion: sessionData.metadata?.ui5ModelData?.appInfo?.appVersion || null,
          technicalComponent: sessionData.metadata?.ui5ModelData?.appInfo?.technicalComponentId || null,
          framework: sessionData.metadata?.ui5ModelData?.appInfo?.frameworkId || null,
          frameworkVersion: sessionData.metadata?.ui5ModelData?.appInfo?.frameworkVersion || null,
          odataServicesDetected: sessionData.metadata?.odataServiceCorrelations?.length || 0,
          businessContexts: this.extractBusinessContexts(sessionData.metadata?.odataServiceCorrelations || []),
          hasAppsLibraryIntegration: !!sessionData.metadata?.fioriAppsLibraryInfo,
          audioRecorded: !!sessionData.metadata?.audioRecording
        }
      },
      metadata: {
        screenshotCount: this.countScreenshotsInSession(sessionData),
        eventCount: sessionData.events?.length || 0,
        networkRequestCount: sessionData.networkRequests?.length || 0,
        enhancedMetadataVersion: '1.1',
        detectionMethods: this.getDetectionMethodsUsed(sessionData)
      }
    };
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

  generateSequenceSummary(session) {
    // Generate a simplified sequence for mermaid diagram
    const summary = {
      actors: new Set(['User']),
      entities: new Set(),
      interactions: [],
      odataOperations: []
    };

    // Process events to extract key interactions
    if (session.events) {
      session.events.forEach((event, index) => {
        const interaction = {
          eventId: event.eventId,
          type: event.type,
          actor: 'User',
          target: this.extractEventTarget(event),
          timestamp: event.timestamp,
          hasScreenshot: !!event.screenshot?.id
        };

        // Add correlated requests
        if (event.correlatedRequests && event.correlatedRequests.length > 0) {
          event.correlatedRequests.forEach(req => {
            if (req.type?.includes('odata')) {
              const entity = this.extractEntityFromUrl(req.url);
              if (entity) {
                summary.entities.add(entity);
                summary.odataOperations.push({
                  eventId: event.eventId,
                  entity,
                  operation: req.method,
                  confidence: req.correlation.confidence
                });
              }
            }
          });
        }

        summary.interactions.push(interaction);
      });
    }

    return {
      actors: Array.from(summary.actors),
      entities: Array.from(summary.entities),
      interactions: summary.interactions,
      odataOperations: summary.odataOperations
    };
  }

  extractEventTarget(event) {
    if (event.element?.tagName) {
      const tag = event.element.tagName.toLowerCase();
      const id = event.element.id ? `#${event.element.id}` : '';
      const text = event.element.textContent ? 
        ` ("${event.element.textContent.slice(0, 20)}")` : '';
      return `${tag}${id}${text}`;
    }
    return 'unknown';
  }

  extractEntityFromUrl(url) {
    // Extract OData entity from URL
    const entityMatch = url.match(/\/([A-Z][a-zA-Z0-9_]+)(?:\(|$|\?)/);
    if (entityMatch) {
      return entityMatch[1];
    }
    
    // Fallback: extract from service name
    const serviceMatch = url.match(/\/([A-Z_]+)_SRV/);
    if (serviceMatch) {
      return serviceMatch[1].replace(/_SRV$/, '');
    }
    
    return null;
  }

  generateMermaidDiagrams(session, sequenceSummary, odataAnalysis) {
    let markdown = '';

    // Generate Business Process Flow (grouped operations)
    const businessFlow = this.generateBusinessFlow(session, sequenceSummary, odataAnalysis);
    if (businessFlow.operations.length > 0) {
      markdown += `## Business Process Flow\n\n`;
      markdown += '```mermaid\n';
      markdown += this.generateCleanFlowDiagram(businessFlow);
      markdown += '```\n\n';
    }

    // Generate OData Operations Summary
    if (sequenceSummary.odataOperations.length > 0 || odataAnalysis.operations.length > 0) {
      markdown += `## OData Operations Summary\n\n`;
      markdown += this.generateODataSummary(session, sequenceSummary, odataAnalysis);
    }

    return markdown;
  }

  generateBusinessFlow(session, sequenceSummary, odataAnalysis) {
    const businessFlow = {
      operations: [],
      modifyingOperations: [],
      readOperations: [],
      functions: []
    };

    // Group events into meaningful business operations
    const meaningfulEvents = this.extractMeaningfulEvents(session.events || []);
    
    // Process OData operations
    const odataOps = this.groupODataOperations(session.networkRequests || []);
    
    // Combine into business operations
    meaningfulEvents.forEach(eventGroup => {
      const operation = {
        id: `OP${businessFlow.operations.length + 1}`,
        type: eventGroup.type,
        description: eventGroup.description,
        events: eventGroup.events,
        odataOperations: this.findRelatedODataOps(eventGroup, odataOps),
        entities: eventGroup.entities || []
      };
      
      businessFlow.operations.push(operation);
      
      // Categorize operations
      if (operation.type === 'modify') {
        businessFlow.modifyingOperations.push(operation);
      } else if (operation.type === 'read') {
        businessFlow.readOperations.push(operation);
      } else if (operation.type === 'function') {
        businessFlow.functions.push(operation);
      }
    });

    return businessFlow;
  }

  extractMeaningfulEvents(events) {
    const meaningfulGroups = [];
    let currentGroup = null;
    
    events.forEach(event => {
      // Skip noise events (editing_start, editing_end, redundant inputs)
      if (this.isNoiseEvent(event)) {
        return;
      }
      
      // Detect new business operation
      if (this.isBusinessOperationStart(event)) {
        // Save previous group
        if (currentGroup && currentGroup.events.length > 0) {
          meaningfulGroups.push(currentGroup);
        }
        
        // Start new group
        currentGroup = {
          type: this.classifyBusinessOperation(event),
          description: this.extractBusinessDescription(event),
          events: [event],
          entities: this.extractEntitiesFromEvent(event)
        };
      } else if (currentGroup && this.isRelatedToCurrentOperation(event, currentGroup)) {
        // Add to current group
        currentGroup.events.push(event);
      }
    });
    
    // Add final group
    if (currentGroup && currentGroup.events.length > 0) {
      meaningfulGroups.push(currentGroup);
    }
    
    return meaningfulGroups;
  }

  isNoiseEvent(event) {
    // Filter out noise events
    return event.type === 'editing_start' || 
           event.type === 'editing_end' ||
           (event.type === 'input' && (!event.value || event.value.trim() === '')) ||
           (event.type === 'click' && !event.element?.textContent?.trim());
  }

  isBusinessOperationStart(event) {
    // Detect start of meaningful business operations
    if (event.type === 'click') {
      const text = event.element?.textContent?.trim().toLowerCase() || '';
      const id = event.element?.id?.toLowerCase() || '';
      
      // Button clicks that start operations
      return text.includes('save') || 
             text.includes('assign') || 
             text.includes('go') || 
             text.includes('search') ||
             text.includes('edit') ||
             text.includes('create') ||
             text.includes('delete') ||
             id.includes('button') ||
             id.includes('btn');
    }
    
    // Form submissions
    if (event.type === 'submit') {
      return true;
    }
    
    // Meaningful navigation
    if (event.type === 'click' && event.element?.tagName === 'SPAN' && 
        event.element?.textContent?.includes('Manage')) {
      return true;
    }
    
    return false;
  }

  classifyBusinessOperation(event) {
    const text = event.element?.textContent?.trim().toLowerCase() || '';
    const url = event.pageUrl || '';
    
    if (text.includes('save') || text.includes('edit')) return 'modify';
    if (text.includes('assign')) return 'function';
    if (text.includes('search') || text.includes('go')) return 'read';
    if (text.includes('manage') || url.includes('manage')) return 'navigation';
    
    return 'action';
  }

  extractBusinessDescription(event) {
    const text = event.element?.textContent?.trim() || '';
    const id = event.element?.id || '';
    
    if (text) {
      return `${this.classifyBusinessOperation(event)}: ${text}`;
    } else if (id) {
      return `${this.classifyBusinessOperation(event)}: ${id.split('-').pop()}`;
    }
    
    return `${this.classifyBusinessOperation(event)} operation`;
  }

  extractEntitiesFromEvent(event) {
    const entities = [];
    const url = event.pageUrl || '';
    
    // Extract from URL
    if (url.includes('DetectionMethod')) entities.push('DetectionMethod');
    if (url.includes('Alert')) entities.push('Alert');
    if (url.includes('ComplianceAlert')) entities.push('ComplianceAlert');
    
    return entities;
  }

  isRelatedToCurrentOperation(event, currentGroup) {
    // Check if event is part of current operation (e.g., input following a click)
    const timeDiff = event.timestamp - currentGroup.events[currentGroup.events.length - 1].timestamp;
    return timeDiff < 10000; // 10 seconds max gap
  }

  groupODataOperations(networkRequests) {
    const grouped = {
      modifying: [],
      reading: [],
      functions: []
    };

    networkRequests.forEach(request => {
      if (!request.type?.includes('odata')) return;
      
      const operation = {
        method: request.method,
        url: request.url,
        entity: this.extractEntityFromUrl(request.url),
        type: this.classifyODataOperation(request),
        body: this.extractODataPayload(request),
        timestamp: request.timestamp
      };

      if (operation.type === 'modify') {
        grouped.modifying.push(operation);
      } else if (operation.type === 'function') {
        grouped.functions.push(operation);
      } else {
        grouped.reading.push(operation);
      }
    });

    return grouped;
  }

  classifyODataOperation(request) {
    if (request.method === 'POST' && request.url.includes('$batch')) {
      const body = request.requestBody || '';
      if (typeof body === 'string' && body.includes('MERGE')) return 'modify';
      if (typeof body === 'string' && body.includes('GET')) return 'read';
    }
    
    if (request.method === 'MERGE' || request.method === 'PUT' || request.method === 'PATCH') {
      return 'modify';
    }
    
    if (request.method === 'POST' && !request.url.includes('$batch')) {
      return 'function';
    }
    
    return 'read';
  }

  extractODataPayload(request) {
    if (!request.requestBody) return null;
    
    if (typeof request.requestBody === 'string') {
      // Extract meaningful parts from body
      const lines = request.requestBody.split('\n');
      const meaningfulLines = lines.filter(line => 
        line.includes('"') && 
        !line.includes('Content-Type') && 
        !line.includes('HTTP/1.1')
      );
      
      return meaningfulLines.slice(0, 3).join('\n').slice(0, 200);
    }
    
    return JSON.stringify(request.requestBody).slice(0, 200);
  }

  findRelatedODataOps(eventGroup, odataOps) {
    const related = [];
    const groupStartTime = eventGroup.events[0].timestamp;
    const groupEndTime = eventGroup.events[eventGroup.events.length - 1].timestamp;
    
    // Find OData operations within 5 seconds of the event group
    [...odataOps.modifying, ...odataOps.reading, ...odataOps.functions].forEach(op => {
      const timeDiff = Math.abs(op.timestamp - groupEndTime);
      if (timeDiff < 5000) { // 5 seconds
        related.push(op);
      }
    });
    
    return related;
  }

  generateCleanFlowDiagram(businessFlow) {
    let diagram = 'flowchart TD\n';
    diagram += '    Start([User starts session])\n';
    
    let previousNode = 'Start';
    
    businessFlow.operations.forEach((operation, index) => {
      const nodeId = operation.id;
      let nodeShape = '[]'; // rectangle
      let nodeClass = '';
      
      // Choose shape and class based on operation type
      switch (operation.type) {
        case 'modify':
          nodeShape = '{}'; // rhombus
          nodeClass = 'modifyOp';
          break;
        case 'function':
          nodeShape = '(('; // circle
          nodeClass = 'functionOp';
          break;
        case 'read':
          nodeShape = '()'; // rounded rectangle
          nodeClass = 'readOp';
          break;
        case 'navigation':
          nodeShape = '[]'; // rectangle
          nodeClass = 'navOp';
          break;
      }
      
      const label = operation.description.length > 30 ? 
        operation.description.slice(0, 30) + '...' : 
        operation.description;
      
      if (nodeShape === '((') {
        diagram += `    ${nodeId}((${label}))\n`;
      } else {
        diagram += `    ${nodeId}${nodeShape[0]}${label}${nodeShape[1] || nodeShape[0]}\n`;
      }
      
      diagram += `    ${previousNode} --> ${nodeId}\n`;
      
      // Add OData operations as annotations
      if (operation.odataOperations.length > 0) {
        operation.odataOperations.forEach((odataOp, odataIndex) => {
          const odataNodeId = `${nodeId}_OD${odataIndex}`;
          diagram += `    ${odataNodeId}[${odataOp.method} ${odataOp.entity || 'Entity'}]\n`;
          diagram += `    ${nodeId} -.-> ${odataNodeId}\n`;
        });
      }
      
      previousNode = nodeId;
    });

    diagram += `    ${previousNode} --> End([Session completed])\n`;
    
    // Add styling
    diagram += '\n    classDef modifyOp fill:#ffebee,stroke:#f44336\n';
    diagram += '    classDef functionOp fill:#e8f5e8,stroke:#4caf50\n';
    diagram += '    classDef readOp fill:#e3f2fd,stroke:#2196f3\n';
    diagram += '    classDef navOp fill:#fff3e0,stroke:#ff9800\n';

    return diagram;
  }

  generateODataSummary(session, sequenceSummary, odataAnalysis) {
    let summary = '';
    
    // Group operations by type
    const modifyingOps = [];
    const readOps = [];
    const functionOps = [];
    
    (session.networkRequests || []).forEach(request => {
      if (!request.type?.includes('odata')) return;
      
      const op = {
        method: request.method,
        url: request.url,
        entity: this.extractEntityFromUrl(request.url),
        type: this.classifyODataOperation(request),
        body: this.extractODataPayload(request),
        timestamp: request.timestamp
      };
      
      if (op.type === 'modify') modifyingOps.push(op);
      else if (op.type === 'function') functionOps.push(op);
      else readOps.push(op);
    });
    
    // Modifying Operations First
    if (modifyingOps.length > 0) {
      summary += `### 🔄 Modifying Operations\n\n`;
      modifyingOps.forEach((op, index) => {
        const entity = op.entity || 'Unknown';
        const payload = op.body ? `\n\`\`\`\n${op.body}\n\`\`\`` : '';
        summary += `${index + 1}. **${op.method} ${entity}**${payload}\n\n`;
      });
    }
    
    // Function Calls
    if (functionOps.length > 0) {
      summary += `### ⚙️ Function Calls\n\n`;
      functionOps.forEach((op, index) => {
        const entity = op.entity || this.extractFunctionName(op.url);
        const payload = op.body ? `\n\`\`\`\n${op.body}\n\`\`\`` : '';
        summary += `${index + 1}. **Function: ${entity}**${payload}\n\n`;
      });
    }
    
    // Read Operations (grouped by entity)
    if (readOps.length > 0) {
      summary += `### 📖 Read Operations\n\n`;
      const entitiesRead = [...new Set(readOps.map(op => op.entity).filter(e => e))];
      entitiesRead.forEach(entity => {
        const entityOps = readOps.filter(op => op.entity === entity);
        summary += `- **${entity}**: ${entityOps.length} read operation${entityOps.length > 1 ? 's' : ''}\n`;
      });
      summary += '\n';
    }
    
    return summary;
  }

  extractFunctionName(url) {
    // Extract function name from URL
    const match = url.match(/\/([A-Z][a-zA-Z0-9_]+)(?:\(|\?|$)/);
    return match ? match[1] : 'Function';
  }

  generateFlowDiagram(session, sequenceSummary) {
    let diagram = 'flowchart TD\n';
    diagram += '    Start([User starts session])\n';
    
    let previousNode = 'Start';
    let nodeCounter = 1;

    // Add key events as flow nodes
    sequenceSummary.interactions.forEach((interaction, index) => {
      const nodeId = `E${nodeCounter}`;
      const nodeLabel = this.formatFlowNodeLabel(interaction);
      
      // Determine node shape based on event type
      let nodeShape = '[]'; // rectangle
      if (interaction.type === 'click') {
        nodeShape = '()'; // rounded rectangle
      } else if (interaction.type === 'input') {
        nodeShape = '{}'; // rhombus
      } else if (interaction.type === 'submit') {
        nodeShape = '((';  // circle
        nodeShape += '))';
      }

      diagram += `    ${nodeId}${nodeShape[0]}${nodeLabel}${nodeShape[1] || nodeShape[0]}\n`;
      diagram += `    ${previousNode} --> ${nodeId}\n`;
      
      // Add OData operations as side nodes
      const relatedOData = sequenceSummary.odataOperations.filter(op => op.eventId === interaction.eventId);
      relatedOData.forEach(op => {
        const odataNodeId = `OD${nodeCounter}`;
        diagram += `    ${odataNodeId}[${op.operation} ${op.entity}]\n`;
        diagram += `    ${nodeId} -.-> ${odataNodeId}\n`;
      });

      previousNode = nodeId;
      nodeCounter++;
    });

    diagram += `    ${previousNode} --> End([Session completed])\n`;
    
    // Add styling
    diagram += '\n    classDef clickEvent fill:#e1f5fe\n';
    diagram += '    classDef inputEvent fill:#f3e5f5\n';
    diagram += '    classDef odataEvent fill:#e8f5e8\n';

    return diagram;
  }

  generateSequenceDiagram(session, sequenceSummary) {
    let diagram = 'sequenceDiagram\n';
    diagram += '    participant User\n';
    diagram += '    participant UI as Fiori UI\n';
    
    // Add OData entities as participants
    sequenceSummary.entities.forEach(entity => {
      diagram += `    participant ${entity}\n`;
    });

    let eventCounter = 1;

    // Generate sequence interactions
    sequenceSummary.interactions.forEach(interaction => {
      const relatedOData = sequenceSummary.odataOperations.filter(op => op.eventId === interaction.eventId);
      
      // User interaction
      const actionLabel = this.formatSequenceAction(interaction);
      diagram += `    User->>UI: ${eventCounter}. ${actionLabel}\n`;
      
      // Add OData operations
      relatedOData.forEach(op => {
        diagram += `    UI->>${op.entity}: ${op.operation}\n`;
        diagram += `    ${op.entity}-->>UI: Response\n`;
      });
      
      // Screenshot indicator
      if (interaction.hasScreenshot) {
        diagram += `    Note over User,UI: 📸 Screenshot captured\n`;
      }

      eventCounter++;
    });

    return diagram;
  }

  formatFlowNodeLabel(interaction) {
    switch (interaction.type) {
      case 'click':
        return `Click ${interaction.target.split('(')[0]}`;
      case 'input':
        return `Input to ${interaction.target.split('(')[0]}`;
      case 'submit':
        return 'Submit Form';
      case 'keyboard':
        return 'Key Press';
      default:
        return interaction.type;
    }
  }

  formatSequenceAction(interaction) {
    switch (interaction.type) {
      case 'click':
        return `Click on ${interaction.target.split('(')[0]}`;
      case 'input':
        return `Enter data in ${interaction.target.split('(')[0]}`;
      case 'submit':
        return 'Submit form';
      case 'keyboard':
        return 'Keyboard action';
      default:
        return `${interaction.type} action`;
    }
  }

  generateSessionMarkdown(session) {
    const startDate = new Date(session.startTime);
    const endDate = session.endTime ? new Date(session.endTime) : null;
    const duration = session.duration ? Math.round(session.duration / 1000) : 0;

    // Analyze OData operations and generate summary
    const odataAnalysis = this.analyzeODataOperations(session.networkRequests || []);
    const sequenceSummary = this.generateSequenceSummary(session);
    
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

    // Add Mermaid Diagrams
    markdown += this.generateMermaidDiagrams(session, sequenceSummary, odataAnalysis);

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
        
        if (event.screenshot?.id) {
          markdown += `![Event Screenshot](${event.screenshot.id}.png)\n\n`;
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

    // Add enhanced metadata from UI5 models and Fiori Apps Library
    if (session.metadata?.ui5ModelData || session.metadata?.fioriAppsLibraryInfo || session.metadata?.odataServiceCorrelations) {
      markdown += `## Application Intelligence\n\n`;
      
      // UI5 Application Details
      if (session.metadata?.ui5ModelData?.appInfo) {
        const appInfo = session.metadata.ui5ModelData.appInfo;
        markdown += `### 📱 Application Information\n\n`;
        if (appInfo.appTitle) markdown += `- **App Title**: ${appInfo.appTitle}\n`;
        if (appInfo.appId) markdown += `- **App ID**: ${appInfo.appId}\n`;
        if (appInfo.appVersion) markdown += `- **Version**: ${appInfo.appVersion}\n`;
        if (appInfo.technicalComponentId) markdown += `- **Technical Component**: ${appInfo.technicalComponentId}\n`;
        if (appInfo.supportInfo) markdown += `- **Support Component**: ${appInfo.supportInfo}\n`;
        if (appInfo.frameworkId) markdown += `- **Framework**: ${appInfo.frameworkId}\n`;
        if (appInfo.frameworkVersion) markdown += `- **Framework Version**: ${appInfo.frameworkVersion}\n`;
        markdown += `\n`;
      }
      
      // System Information
      if (session.metadata?.ui5ModelData?.systemInfo) {
        const sysInfo = session.metadata.ui5ModelData.systemInfo;
        markdown += `### 🖥️ System Information\n\n`;
        if (sysInfo.productVersion) {
          markdown += `**Product Versions**:\n\`\`\`\n${sysInfo.productVersion}\n\`\`\`\n\n`;
        }
      }
      
      // OData Service Correlations
      if (session.metadata?.odataServiceCorrelations?.length > 0) {
        markdown += `### 🔗 OData Service Analysis\n\n`;
        session.metadata.odataServiceCorrelations.forEach((correlation, index) => {
          markdown += `${index + 1}. **${correlation.serviceName}**\n`;
          markdown += `   - Namespace: ${correlation.namespace}\n`;
          markdown += `   - Business Context: ${correlation.businessContext}\n`;
          if (correlation.estimatedAppMapping) {
            markdown += `   - App Category: ${correlation.estimatedAppMapping}\n`;
          }
          if (correlation.potentialAppIds.length > 0) {
            markdown += `   - Potential App IDs: ${correlation.potentialAppIds.join(', ')}\n`;
          }
          markdown += `   - [Service Metadata](${correlation.metadataUrl})\n\n`;
        });
      }
      
      // Fiori Apps Library Info
      if (session.metadata?.fioriAppsLibraryInfo) {
        markdown += `### 📚 Fiori Apps Library\n\n`;
        markdown += `- **API Endpoint**: [View Details](${session.metadata.fioriAppsLibraryInfo.apiUrl})\n`;
        markdown += `- **Metadata**: [Service Metadata](${session.metadata.fioriAppsLibraryInfo.metadataUrl})\n\n`;
      }
    }

    // Add sequence summary for debugging/reference
    if (sequenceSummary.interactions.length > 0) {
      markdown += `## Session Summary\n\n`;
      markdown += `### Key Interactions\n\n`;
      markdown += `- **Actors**: ${sequenceSummary.actors.join(', ')}\n`;
      markdown += `- **Entities**: ${sequenceSummary.entities.join(', ') || 'None detected'}\n`;
      markdown += `- **OData Operations**: ${sequenceSummary.odataOperations.length}\n\n`;

      if (sequenceSummary.odataOperations.length > 0) {
        markdown += `### OData Operations Details\n\n`;
        sequenceSummary.odataOperations.forEach((op, index) => {
          markdown += `${index + 1}. **Event ${op.eventId}**: ${op.operation} on ${op.entity} (${op.confidence}% confidence)\n`;
        });
        markdown += `\n`;
      }
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
        const bodyString = typeof request.requestBody === 'string' ? request.requestBody : 
                          (request.requestBody ? JSON.stringify(request.requestBody) : '');
        
        if (bodyString.includes('MERGE')) {
          operations.push({ type: 'UPDATE', description: 'Entity update operation' });
        } else if (bodyString.includes('POST') && !request.url.includes('$batch')) {
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
      // Create clean timestamp: YYYY-MM-DD-HHMM
      const date = new Date(session.startTime);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = date.toISOString().split('T')[1].slice(0, 5).replace(':', ''); // HHMM
      const timestamp = `${dateStr}-${timeStr}`;
      
      // Use stable session name for consistency with screenshots
      const sessionNameShort = this.getStableSessionName(session);
      
      return `fs-${timestamp}-${sessionNameShort}.${extension}`;
    } catch (error) {
      this.logError('Error generating semantic filename:', error);
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
      return `fs-${timestamp}-session.${extension}`;
    }
  }

  extractConciseSessionName(session) {
    // Get session name from various sources
    const sessionName = session.metadata?.sessionName || '';
    const url = session.metadata?.applicationUrl || '';
    
    this.log('Extracting concise session name:', { sessionName, url });
    
    // Method 1: Use enhanced UI5 model data if available (highest priority)
    if (session.metadata?.ui5ModelData?.appInfo?.appTitle) {
      const appTitle = session.metadata.ui5ModelData.appInfo.appTitle;
      const cleanedTitle = this.cleanNameForFilename(appTitle);
      this.log('Using UI5 AppInfo title:', cleanedTitle);
      return cleanedTitle;
    }
    
    // Method 2: Always prioritize actual session name if it's meaningful
    if (sessionName && sessionName !== 'Session' && !sessionName.startsWith('Session ')) {
      // Handle specific patterns first for known app names
      const lowerName = sessionName.toLowerCase();
      if (lowerName.includes('manage') && lowerName.includes('detection')) {
        this.log('Using manage-detection-methods pattern');
        return 'manage-detection-methods';
      }
      if (lowerName.includes('manage') && lowerName.includes('alert')) {
        this.log('Using manage-alerts pattern');
        return 'manage-alerts';
      }
      if (lowerName.includes('launchpad') || lowerName.includes('home')) {
        this.log('Using launchpad-home pattern');
        return 'launchpad-home';
      }
      
      // General processing - clean the session name directly
      const cleanedName = this.cleanNameForFilename(sessionName);
      this.log('Using cleaned session name:', cleanedName);
      return cleanedName;
    }
    
    // Method 2: Extract from URL patterns (only if no session name)
    if (url.includes('ComplianceAlert-manage') || url.includes('AlertManagement-manage')) {
      return 'manage-alerts';
    }
    if (url.includes('DetectionMethod-manage')) {
      return 'manage-detection-methods';
    }
    if (url.includes('Shell-home')) {
      return 'launchpad-home';
    }
    
    // Method 3: Parse Fiori hash to extract meaningful name
    const hashMatch = url.match(/#(\w+)-(\w+)/);
    if (hashMatch) {
      const [, namespace, action] = hashMatch;
      
      // Convert camelCase to readable format and take first 2 words
      const readable = action
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .toLowerCase()
        .split(' ')
        .slice(0, 2)
        .join('-');
      
      return readable || 'fiori-app';
    }
    
    return 'session';
  }

  cleanNameForFilename(name) {
    const lowerName = name.toLowerCase();
    
    // Handle special cases that need more than 2 words
    if (lowerName.includes('manage') && lowerName.includes('detection') && lowerName.includes('method')) {
      return 'manage-detection-methods';
    }
    if (lowerName.includes('manage') && lowerName.includes('alert')) {
      return 'manage-alerts';
    }
    
    // General case - up to 3 words
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0)
      .slice(0, 3)
      .join('-');
  }

  // Enhanced Fiori App Detection
  extractFioriAppId(session) {
    try {
      const url = session.metadata?.applicationUrl || '';
      const events = session.events || [];
      const requests = session.networkRequests || [];

      // Method 1: Extract from UI5 About Dialog elements (highest priority)
      const aboutDialogAppId = this.extractAppIdFromAboutDialog(session);
      if (aboutDialogAppId) {
        this.log('Found Fiori App ID from About Dialog:', aboutDialogAppId);
        return aboutDialogAppId;
      }

      // Method 2: Extract from UI5 Model data (AppInfo JSONModel)
      const modelAppId = this.extractAppIdFromUI5Models(session);
      if (modelAppId) {
        this.log('Found Fiori App ID from UI5 models:', modelAppId);
        return modelAppId;
      }

      // Method 3: Extract from URL hash patterns
      const hashMatch = url.match(/#([A-Z]\d{4})-/);
      if (hashMatch) {
        this.log('Found Fiori App ID from URL hash:', hashMatch[1]);
        return hashMatch[1]; // Returns F1730, F2305, etc.
      }

      // Method 4: Extract from Fiori Apps Library URL patterns
      const libraryMatch = url.match(/inpfioriId='([A-Z]\d{4})'/);
      if (libraryMatch) {
        this.log('Found Fiori App ID from Apps Library URL:', libraryMatch[1]);
        return libraryMatch[1];
      }

      // Method 5: Look for app manifest requests in network requests
      const manifestRequest = requests.find(req => 
        req.url && req.url.includes('manifest.json')
      );
      if (manifestRequest) {
        // Could parse manifest.json content if available
        const appIdMatch = manifestRequest.url.match(/apps\/([A-Z]\d{4})\//);
        if (appIdMatch) {
          this.log('Found Fiori App ID from manifest request:', appIdMatch[1]);
          return appIdMatch[1];
        }
      }

      // Method 6: Look for Fiori Apps Library API calls
      const apiRequest = requests.find(req => 
        req.url && req.url.includes('SingleApp.xsodata') && req.url.includes('fioriId=')
      );
      if (apiRequest) {
        const apiMatch = apiRequest.url.match(/fioriId='([A-Z]\d{4})'/);
        if (apiMatch) {
          this.log('Found Fiori App ID from API request:', apiMatch[1]);
          return apiMatch[1];
        }
      }

      return null;
    } catch (error) {
      this.logError('Error extracting Fiori App ID:', error);
      return null;
    }
  }

  extractAppIdFromAboutDialog(session) {
    // Look for About Dialog interactions containing App ID
    const aboutDialogEvents = session.events?.filter(event => 
      event.element?.id?.includes('aboutDialogFragment') ||
      event.element?.id?.includes('appInfoAppId') ||
      event.element?.className?.includes('AboutDialog')
    );

    for (const event of aboutDialogEvents || []) {
      // Check text content for App ID pattern
      if (event.element?.textContent) {
        const appIdMatch = event.element.textContent.match(/^([A-Z]\d{4})$/);
        if (appIdMatch) {
          return appIdMatch[1];
        }
      }

      // Check element ID for App ID pattern  
      if (event.element?.id) {
        const idMatch = event.element.id.match(/([A-Z]\d{4})/);
        if (idMatch) {
          return idMatch[1];
        }
      }
    }

    return null;
  }

  extractAppIdFromUI5Models(session) {
    // Look for UI5 context that might contain model data
    for (const event of session.events || []) {
      if (event.ui5Context) {
        // Check for AppInfo model
        if (event.ui5Context.model?.name === 'AppInfo' && 
            event.ui5Context.model?.data?.appId?.text) {
          const appId = event.ui5Context.model.data.appId.text;
          if (/^[A-Z]\d{4}$/.test(appId)) {
            return appId;
          }
        }

        // Check for binding paths to App ID
        if (event.ui5Context.properties) {
          for (const prop of event.ui5Context.properties) {
            if (prop.path?.includes('/appId/text') && prop.value) {
              const appId = prop.value;
              if (/^[A-Z]\d{4}$/.test(appId)) {
                return appId;
              }
            }
          }
        }

        // Check for any property containing App ID pattern
        const contextStr = JSON.stringify(event.ui5Context);
        const appIdMatch = contextStr.match(/"([A-Z]\d{4})"/);
        if (appIdMatch) {
          return appIdMatch[1];
        }
      }
    }

    return null;
  }

  extractAdditionalAppMetadata(session) {
    // Extract rich metadata from UI5 models
    const metadata = {};

    for (const event of session.events || []) {
      if (event.ui5Context?.model) {
        const model = event.ui5Context.model;

        // Extract from AppInfo model
        if (model.name === 'AppInfo' && model.data) {
          metadata.appInfo = {
            appId: model.data.appId?.text,
            appVersion: model.data.appVersion?.text,
            appTitle: model.data.appTitle?.text,
            technicalComponentId: model.data.technicalAppComponentId?.text,
            frameworkId: model.data.appFrameworkId?.text,
            frameworkVersion: model.data.appFrameworkVersion?.text,
            supportInfo: model.data.appSupportInfo?.text
          };
        }

        // Extract from SysInfo model
        if (model.name === 'SysInfo' && model.data) {
          metadata.systemInfo = {
            productVersion: model.data.productVersion?.text
          };
        }

        // Extract from other named models
        if (model.name && model.data && !metadata[model.name]) {
          metadata[model.name] = model.data;
        }
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  async queryFioriAppsLibraryAPI(appId) {
    try {
      if (!appId || !/^[A-Z]\d{4}$/.test(appId)) {
        return null;
      }

      // Note: This would typically be called from content script due to CORS
      // For now, we'll store the API URL pattern for future implementation
      const apiUrl = `https://fioriappslibrary.hana.ondemand.com/sap/fix/externalViewer/services/SingleApp.xsodata/Details(inpfioriId='${appId}',inpreleaseId='S14OP',inpLanguage='None',fioriId='${appId}',releaseId='S14OP')/RequiredODataServices`;
      
      return {
        appId: appId,
        apiUrl: apiUrl,
        metadataUrl: 'https://fioriappslibrary.hana.ondemand.com/sap/fix/externalViewer/services/SingleApp.xsodata/$metadata',
        odataServicesUrl: `${apiUrl}`
      };
    } catch (error) {
      this.logError('Error querying Fiori Apps Library API:', error);
      return null;
    }
  }

  async correlateODataServicesWithApps(session) {
    try {
      // Extract unique OData service URLs from network requests
      const odataServices = new Set();
      
      session.networkRequests?.forEach(request => {
        if (request.type?.includes('odata') && request.url) {
          // Extract service root URL, properly handling OData system parameters
          const serviceRoot = this.extractODataServiceRoot(request.url);
          if (serviceRoot) {
            odataServices.add(serviceRoot);
          }
        }
      });

      const correlations = [];
      
      for (const serviceUrl of odataServices) {
        try {
          // Extract potential app information from service URL patterns
          const serviceInfo = this.extractServiceMetadata(serviceUrl);
          
          const correlation = {
            serviceUrl: serviceUrl,
            metadataUrl: `${serviceUrl}/$metadata`,
            serviceName: serviceInfo.serviceName,
            namespace: serviceInfo.namespace,
            potentialAppIds: serviceInfo.potentialAppIds,
            businessContext: serviceInfo.businessContext,
            estimatedAppMapping: serviceInfo.estimatedAppMapping
          };
          
          correlations.push(correlation);
          
          this.log('DEBUG: Created OData correlation:', {
            serviceName: correlation.serviceName,
            namespace: correlation.namespace,
            metadataUrl: correlation.metadataUrl
          });
          
          this.log('Found OData service correlation:', serviceInfo);
        } catch (error) {
          this.log('Failed to correlate service:', serviceUrl, error.message);
        }
      }
      
      return correlations;
    } catch (error) {
      this.logError('Failed to correlate OData services:', error);
      return [];
    }
  }

  extractODataServiceRoot(url) {
    try {
      // Remove query parameters first
      const baseUrl = url.split('?')[0];
      
      // OData system parameters that should be ignored when extracting service root
      const odataSystemParams = [
        '$value', '$metadata', '$batch', '$count', '$links', '$ref',
        '$orderby', '$top', '$skip', '$filter', '$expand', '$select',
        '$format', '$inlinecount', '$skiptoken'
      ];
      
      // Find the OData service pattern: /sap/opu/odata/namespace/servicename with optional version
      const odataMatch = baseUrl.match(/(.*\/sap\/opu\/odata\/[^/]+\/[^/;]+(?:;v=\d+)?)/);
      if (!odataMatch) {
        return null;
      }
      
      let serviceRoot = odataMatch[1];
      
      // Get the part after the service root
      const afterService = baseUrl.substring(serviceRoot.length);
      
      // If there's more after the service root, analyze it to determine if we need to clean it
      if (afterService) {
        const pathSegments = afterService.split('/').filter(segment => segment.length > 0);
        
        // Check if any segment contains OData system parameters
        const hasSystemParam = pathSegments.some(segment => {
          // Check if the segment itself is a system parameter
          if (odataSystemParams.some(param => segment.startsWith(param))) {
            return true;
          }
          // Also check if the segment contains $value in nested paths
          return segment.includes('$value') || segment.includes('$metadata');
        });
        
        this.log('DEBUG: Extracted service root:', serviceRoot, 'from URL:', url);
        this.log('DEBUG: After service path segments:', pathSegments);
        this.log('DEBUG: Has system param:', hasSystemParam);
        
        // If we detect system parameters anywhere in the path, we know this is the correct service root
        // The presence of $value, $metadata, etc. confirms we've found the right boundary
      }
      
      return serviceRoot;
    } catch (error) {
      this.log('Failed to extract OData service root from:', url, error.message);
      return null;
    }
  }

  extractServiceMetadata(serviceUrl) {
    // Extract service name and namespace from the service root URL
    const serviceMatch = serviceUrl.match(/\/sap\/opu\/odata\/([^/]+)\/([^/;]+)/);
    if (!serviceMatch) {
      throw new Error('Invalid OData service URL format');
    }
    
    const namespace = serviceMatch[1];
    const serviceName = serviceMatch[2];
    
    // Infer potential Fiori App IDs from service patterns
    const potentialAppIds = [];
    
    // Common patterns in Fiori service names
    if (serviceName.includes('MANAGE')) {
      const id = this.extractAppIdFromPattern(serviceName, 'MANAGE');
      if (id) potentialAppIds.push('F' + id);
    }
    if (serviceName.includes('CREATE')) {
      const id = this.extractAppIdFromPattern(serviceName, 'CREATE');
      if (id) potentialAppIds.push('F' + id);
    }
    if (serviceName.includes('DISPLAY')) {
      const id = this.extractAppIdFromPattern(serviceName, 'DISPLAY');
      if (id) potentialAppIds.push('F' + id);
    }
    
    // Business context inference from service name patterns
    let businessContext = 'unknown';
    let estimatedAppMapping = null;
    
    if (serviceName.includes('COMPLIANCE') || serviceName.includes('ALERT')) {
      businessContext = 'compliance-management';
      estimatedAppMapping = 'Alert Management Apps';
    } else if (serviceName.includes('MASTER') || serviceName.includes('DATA')) {
      businessContext = 'master-data';
      estimatedAppMapping = 'Master Data Management';
    } else if (serviceName.includes('FINANCIAL') || serviceName.includes('FIN')) {
      businessContext = 'financial';
      estimatedAppMapping = 'Financial Applications';
    } else if (serviceName.includes('WORKFLOW') || serviceName.includes('WF')) {
      businessContext = 'workflow';
      estimatedAppMapping = 'Workflow Management';
    } else if (serviceName.includes('ANALYTICS') || serviceName.includes('REPORT')) {
      businessContext = 'analytics';
      estimatedAppMapping = 'Analytics & Reporting';
    }
    
    return {
      serviceName,
      namespace,
      potentialAppIds: potentialAppIds.filter(id => id !== 'F'),
      businessContext,
      estimatedAppMapping
    };
  }

  extractAppIdFromPattern(serviceName, pattern) {
    // Extract potential app ID from service name patterns
    const afterPattern = serviceName.split(pattern)[1];
    if (afterPattern) {
      // Look for 4-digit numbers which are common in Fiori App IDs
      const numberMatch = afterPattern.match(/(\d{4})/);
      return numberMatch ? numberMatch[1] : '';
    }
    return '';
  }

  extractBusinessContexts(odataCorrelations) {
    // Extract unique business contexts from OData service correlations
    const contexts = new Set();
    odataCorrelations.forEach(correlation => {
      if (correlation.businessContext && correlation.businessContext !== 'unknown') {
        contexts.add(correlation.businessContext);
      }
    });
    return Array.from(contexts);
  }

  getDetectionMethodsUsed(sessionData) {
    // Document which detection methods were used to enhance the session
    const methods = [];
    
    if (sessionData.metadata?.fioriAppId) {
      if (sessionData.metadata?.ui5ModelData?.appInfo) {
        methods.push('ui5-about-dialog');
        methods.push('ui5-model-data');
      } else {
        methods.push('url-hash-extraction');
      }
    }
    
    if (sessionData.metadata?.odataServiceCorrelations?.length > 0) {
      methods.push('odata-service-correlation');
    }
    
    if (sessionData.metadata?.fioriAppsLibraryInfo) {
      methods.push('fiori-apps-library-integration');
    }
    
    return methods;
  }

  generateImprovedSessionNameFromUrl(url) {
    if (!url) return null;

    // Known Fiori app mappings
    const fioriAppMappings = {
      'DetectionMethod-manageDetectionMethod': 'Manage Detection Methods',
      'ComplianceAlert-manage': 'Manage Alerts',
      'Shell-home': 'Fiori Launchpad Home',
      'UserManagement-maintain': 'User Management',
      'Analytics-reporting': 'Analytics & Reporting',
      'WorkflowInbox-displayInbox': 'Workflow Inbox',
      'fioriappslibrary.hana.ondemand.com': 'SAP Fiori Apps Library',
      'BusinessPartner-manage': 'Business Partner Management',
      'AlertManagement-manageAlerts': 'Manage Alerts',
      'DetectionMethod-manage': 'Manage Detection Methods'
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

  // Audio Recording Methods
  async startAudioRecording(tabId) {
    try {
      const session = this.sessions.get(tabId);
      if (!session) {
        throw new Error('No active session found');
      }

      // Initialize audio recording for session
      this.audioRecordings.set(session.sessionId, {
        tabId: tabId,
        sessionId: session.sessionId,
        startTime: Date.now(),
        chunks: [],
        isRecording: true
      });

      this.log(`Audio recording started for session ${session.sessionId}`);
      return true;
    } catch (error) {
      this.logError('Failed to start audio recording:', error);
      throw error;
    }
  }

  async stopAudioRecording(tabId) {
    try {
      const session = this.sessions.get(tabId);
      if (!session) {
        throw new Error('No active session found');
      }

      const audioData = this.audioRecordings.get(session.sessionId);
      if (!audioData) {
        this.log('No audio recording found for session');
        return null;
      }

      audioData.isRecording = false;
      audioData.endTime = Date.now();
      audioData.duration = audioData.endTime - audioData.startTime;

      this.log(`Audio recording stopped for session ${session.sessionId}, duration: ${audioData.duration}ms, chunks: ${audioData.chunks.length}`);
      return audioData;
    } catch (error) {
      this.logError('Failed to stop audio recording:', error);
      throw error;
    }
  }

  async storeAudioChunk(tabId, audioChunkData, timestamp) {
    try {
      const session = this.sessions.get(tabId);
      if (!session) {
        return false;
      }

      const audioData = this.audioRecordings.get(session.sessionId);
      if (!audioData || !audioData.isRecording) {
        return false;
      }

      audioData.chunks.push({
        data: audioChunkData,
        timestamp: timestamp || Date.now()
      });

      return true;
    } catch (error) {
      this.logError('Failed to store audio chunk:', error);
      return false;
    }
  }

  generateAudioFilename(session) {
    try {
      // Create clean timestamp: YYYY-MM-DD-HHMM
      const date = new Date(session.startTime);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = date.toISOString().split('T')[1].slice(0, 5).replace(':', ''); // HHMM
      const timestamp = `${dateStr}-${timeStr}`;
      
      // Extract concise session name
      const sessionNameShort = this.extractConciseSessionName(session);
      
      return `fs-${timestamp}-${sessionNameShort}.webm`;
    } catch (error) {
      this.logError('Error generating audio filename:', error);
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
      return `fs-${timestamp}-session.webm`;
    }
  }

  async exportSessionAudio(sessionIdentifier) {
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

      // Check for audio data in session first (saved sessions)
      let audioData = sessionData.audioData;
      
      // If not in session, check in-memory recordings (current session)
      if (!audioData) {
        audioData = this.audioRecordings.get(sessionData.sessionId);
      }
      
      if (!audioData || !audioData.chunks || !audioData.chunks.length) {
        return null; // No audio recorded
      }

      // Generate semantic filename
      const filename = this.generateAudioFilename(sessionData);
      
      return {
        filename: filename,
        audioData: audioData,
        duration: audioData.duration,
        chunkCount: audioData.chunks.length
      };
    } catch (error) {
      this.logError('Failed to export session audio:', error);
      throw error;
    }
  }

  async exportSessionAsZipPackage(sessionIdentifier) {
    try {
      this.log('DEBUG: Exporting ZIP package for session:', sessionIdentifier);
      
      // Get session data
      let sessionData;
      if (typeof sessionIdentifier === 'string') {
        // Session ID provided
        const allSessions = await this.getAllSessions();
        sessionData = allSessions[sessionIdentifier];
        this.log('DEBUG: Found session from storage by ID:', !!sessionData);
      } else {
        // Tab ID provided
        sessionData = this.sessions.get(sessionIdentifier);
        this.log('DEBUG: Found session from memory by tab ID:', !!sessionData);
      }

      if (!sessionData) {
        this.logError('Session not found for identifier:', sessionIdentifier);
        throw new Error('Session not found');
      }
      
      this.log('DEBUG: Session has events:', sessionData.events?.length || 0);

      // Generate markdown content
      const markdownContent = await this.generateSessionMarkdown(sessionData);
      
      // Collect all screenshots referenced in the session
      const screenshotIds = this.collectScreenshotIds(sessionData);
      this.log('DEBUG: Screenshot IDs found in session:', screenshotIds);
      this.log('DEBUG: Total screenshots in memory:', this.screenshots.size);
      
      const screenshots = [];
      
      for (const screenshotId of screenshotIds) {
        const screenshot = this.screenshots.get(screenshotId);
        if (screenshot) {
          screenshots.push({
            id: screenshotId,
            filename: `${screenshotId}.png`,
            dataUrl: screenshot.dataUrl
          });
          this.log('DEBUG: Found screenshot for ID:', screenshotId);
        } else {
          this.log('DEBUG: Missing screenshot for ID:', screenshotId);
        }
      }
      
      this.log('DEBUG: Total screenshots collected for ZIP:', screenshots.length);

      // Generate base filename
      const baseFilename = this.generateSemanticFilename(sessionData, '').replace('.', '');
      
      // Create file manifest for ZIP creation
      const zipManifest = {
        markdownFilename: `${baseFilename}.md`,
        markdownContent: markdownContent,
        screenshots: screenshots,
        baseFilename: baseFilename,
        sessionData: sessionData
      };

      return zipManifest;
    } catch (error) {
      this.logError('Failed to export session as ZIP package:', error);
      throw error;
    }
  }
}

// Initialize background script
const backgroundInstance = new FioriTestBackground();

