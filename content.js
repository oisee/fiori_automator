// Content script for Fiori Test Automation System
// Captures DOM interactions, SAPUI5 context, and coordinates with background script

// Only declare the class if it doesn't already exist
if (!window.FioriTestCapture) {
  window.FioriTestCapture = class {
    constructor() {
      console.log('[Fiori] FioriTestCapture constructor called');
      this.isRecording = false;
      this.eventQueue = [];
      this.lastScreenshot = null;
      this.ui5Context = null;
      this.mediaRecorder = null;
      this.audioStream = null;
      this.audioChunks = [];
      this.init();
    }

  init() {
    this.setupDebugMode();
    this.setupEventListeners();
    this.setupMessageHandling();
    this.setupResponseCapture();
    this.detectUI5Context();
    this.injectHelperScript();
  }

  setupDebugMode() {
    this.debug = localStorage.getItem('fiori-debug') === 'true';
    if (this.debug) {
      console.log('🎯 Fiori Test Capture: Debug mode enabled');
      window.FIORI_DEBUG = true;
    }
  }

  log(...args) {
    if (this.debug) {
      console.log('[Fiori Content]', ...args);
    }
  }

  logError(...args) {
    console.error('[Fiori Content Error]', ...args);
  }

  setupEventListeners() {
    // Click events
    document.addEventListener('click', (event) => {
      if (this.isRecording) {
        this.captureClickEvent(event);
      }
    }, true);

    // Input events
    document.addEventListener('input', (event) => {
      if (this.isRecording) {
        this.captureInputEvent(event);
      }
    }, true);

    // Focus events for editing start/end
    document.addEventListener('focusin', (event) => {
      if (this.isRecording && this.isFormElement(event.target)) {
        this.captureEditingStart(event);
      }
    }, true);

    document.addEventListener('focusout', (event) => {
      if (this.isRecording && this.isFormElement(event.target)) {
        this.captureEditingEnd(event);
      }
    }, true);

    // Form submissions
    document.addEventListener('submit', (event) => {
      if (this.isRecording) {
        this.captureFormSubmit(event);
      }
    }, true);

    // Keyboard events
    document.addEventListener('keydown', (event) => {
      if (this.isRecording) {
        this.captureKeyboardEvent(event);
      }
    }, true);

    // Mouse events for drag and drop
    document.addEventListener('dragstart', (event) => {
      if (this.isRecording) {
        this.captureDragEvent(event, 'dragstart');
      }
    }, true);

    document.addEventListener('drop', (event) => {
      if (this.isRecording) {
        this.captureDragEvent(event, 'drop');
      }
    }, true);

    // File upload events
    document.addEventListener('change', (event) => {
      if (this.isRecording && event.target.type === 'file') {
        this.captureFileUpload(event);
      }
    }, true);

    // Page navigation
    window.addEventListener('beforeunload', () => {
      if (this.isRecording) {
        this.capturePageUnload();
      }
    });
  }

  setupMessageHandling() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });
  }

  setupResponseCapture() {
    // Store original fetch and XMLHttpRequest for restoration
    this.originalFetch = window.fetch;
    this.originalXMLHttpRequest = window.XMLHttpRequest;
    this.interceptedResponses = new Map();

    // Intercept fetch API
    window.fetch = async (...args) => {
      const startTime = Date.now();
      const [resource, config] = args;
      const url = typeof resource === 'string' ? resource : resource.url;
      const method = config?.method || 'GET';

      try {
        const response = await this.originalFetch.apply(window, args);
        
        // Clone response to read body without consuming it
        const responseClone = response.clone();
        
        // Capture response body for relevant requests
        if (this.isRelevantForCapture(url, method)) {
          this.captureResponseBody(url, method, responseClone, startTime);
        }
        
        return response;
      } catch (error) {
        this.log('Fetch error for', url, ':', error);
        throw error;
      }
    };

    // Intercept XMLHttpRequest
    const originalOpen = this.originalXMLHttpRequest.prototype.open;
    const originalSend = this.originalXMLHttpRequest.prototype.send;
    
    this.originalXMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._fioriRequestData = { method, url, startTime: Date.now() };
      return originalOpen.call(this, method, url, ...args);
    };
    
    this.originalXMLHttpRequest.prototype.send = function(body) {
      const self = window.fioriTestCaptureInstance; // Reference to content script instance
      
      this.addEventListener('loadend', function() {
        if (this._fioriRequestData && self?.isRelevantForCapture(this._fioriRequestData.url, this._fioriRequestData.method)) {
          const responseData = {
            url: this._fioriRequestData.url,
            method: this._fioriRequestData.method,
            status: this.status,
            statusText: this.statusText,
            responseText: this.responseText,
            responseHeaders: this.getAllResponseHeaders(),
            startTime: this._fioriRequestData.startTime,
            endTime: Date.now()
          };
          
          self.sendCapturedResponse(responseData);
        }
      });
      
      return originalSend.call(this, body);
    };

    this.log('Response capture interceptors installed');
  }

  async captureResponseBody(url, method, response, startTime) {
    try {
      const contentType = response.headers.get('content-type') || '';
      let responseData = null;

      // Only capture text-based responses to avoid large binary data
      if (contentType.includes('application/json') ||
          contentType.includes('text/') ||
          contentType.includes('application/xml') ||
          contentType.includes('application/atom+xml')) {
        
        responseData = await response.text();
        
        // Limit response size to 50KB to avoid memory issues
        if (responseData.length > 50000) {
          responseData = responseData.substring(0, 50000) + '...[truncated]';
        }
      }

      const capturedResponse = {
        url,
        method,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        responseData,
        contentType,
        startTime,
        endTime: Date.now(),
        captured: true
      };

      this.sendCapturedResponse(capturedResponse);
    } catch (error) {
      this.log('Error capturing response body:', error);
    }
  }

  isRelevantForCapture(url, method) {
    // Only capture responses for OData requests and other API calls
    if (url.includes('/$metadata') || 
        url.includes('/$batch') ||
        url.includes('/sap/opu/odata') ||
        url.includes('/sap/bc/rest/') ||
        url.includes('api/') ||
        (method !== 'GET' && !url.includes('.js') && !url.includes('.css'))) {
      return true;
    }
    return false;
  }

  sendCapturedResponse(responseData) {
    // Send captured response to background script
    chrome.runtime.sendMessage({
      type: 'response-captured',
      data: responseData
    }).catch(error => {
      this.log('Error sending captured response:', error);
    });
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'ping':
        // Respond to ping to confirm content script is loaded
        sendResponse({ success: true, status: 'ready' });
        break;

      case 'start-recording':
        this.startRecording(message.data);
        sendResponse({ success: true });
        break;

      case 'stop-recording':
        this.stopRecording();
        sendResponse({ success: true });
        break;

      case 'capture-screenshot':
        this.captureScreenshot().then(screenshot => {
          sendResponse({ success: true, screenshot });
        });
        break;

      case 'get-ui5-context':
        sendResponse({ success: true, context: this.ui5Context });
        break;

      case 'request-started':
      case 'request-completed':
        // Handle network request notifications from background script
        this.handleNetworkEvent(message.type, message.data);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  }

  startRecording(sessionData = {}) {
    console.log('[Fiori] Start recording called with data:', sessionData);
    this.isRecording = true;
    this.eventQueue = [];
    this.addRecordingIndicator();
    
    // Start audio recording if enabled
    if (sessionData && sessionData.recordAudio) {
      this.startAudioRecording();
    }
    
    console.log('[Fiori] Recording started - isRecording =', this.isRecording);
    console.log('[Fiori] Event listeners should now capture events when user interacts with page');
    
    // Test that event listeners are working by adding a one-time test
    const testListener = (event) => {
      console.log('[Fiori] TEST: Event listener is working - captured', event.type, 'on', event.target.tagName);
      document.removeEventListener('click', testListener, true);
    };
    document.addEventListener('click', testListener, true);
    console.log('[Fiori] Added test listener - click anywhere to verify event capture is working');
  }

  stopRecording() {
    this.isRecording = false;
    this.removeRecordingIndicator();
    
    // Stop audio recording if it was active
    this.stopAudioRecording();
    
    console.log('Fiori Test Capture: Recording stopped');
  }

  async captureClickEvent(event) {
    console.log('[Fiori] captureClickEvent called - isRecording:', this.isRecording);
    
    if (!this.isRecording) {
      console.warn('[Fiori] Click event ignored - not recording');
      return;
    }
    
    const element = event.target;
    const rect = element.getBoundingClientRect();
    
    console.log('[Fiori] Processing click on:', element.tagName, element.id || '(no id)', element.className || '(no class)');
    
    const eventData = {
      type: 'click',
      coordinates: {
        x: event.clientX,
        y: event.clientY,
        elementX: rect.left,
        elementY: rect.top,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      },
      element: await this.getElementInfo(element),
      ui5Context: this.getUI5ElementContext(element),
      modifiers: {
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey
      },
      pageUrl: window.location.href,
      pageTitle: document.title
    };

    console.log('[Fiori] Click event data prepared:', eventData);

    // Send event to background first to get event ID
    await this.sendEventToBackground(eventData);
    
    // Note: Screenshot will be captured in background with proper event ID and semantics
    this.log('[Fiori] Click captured and sent to background:', eventData);
  }

  async captureInputEvent(event) {
    const element = event.target;
    
    // Capture screenshot for input events
    const screenshot = await this.captureEventScreenshot(element, 'input');
    
    const eventData = {
      type: 'input',
      element: await this.getElementInfo(element),
      value: element.value,
      inputType: event.inputType,
      ui5Context: this.getUI5ElementContext(element),
      screenshot: screenshot
    };

    await this.sendEventToBackground(eventData);
  }

  async captureFormSubmit(event) {
    const form = event.target;
    const formData = new FormData(form);
    const formObject = {};
    
    for (let [key, value] of formData.entries()) {
      formObject[key] = value;
    }

    // Capture screenshot for form submissions
    const screenshot = await this.captureEventScreenshot(form, 'submit');

    const eventData = {
      type: 'submit',
      element: await this.getElementInfo(form),
      formData: formObject,
      action: form.action,
      method: form.method,
      ui5Context: this.getUI5ElementContext(form),
      screenshot: screenshot
    };

    await this.sendEventToBackground(eventData);
  }

  async captureKeyboardEvent(event) {
    // Only capture special keys and shortcuts
    if (event.ctrlKey || event.altKey || event.metaKey || 
        ['Enter', 'Escape', 'Tab', 'F1', 'F2', 'F3', 'F4'].includes(event.key)) {
      
      // Capture screenshot for important keyboard events
      const screenshot = await this.captureEventScreenshot(event.target, 'keyboard');
      
      const eventData = {
        type: 'keyboard',
        key: event.key,
        code: event.code,
        element: await this.getElementInfo(event.target),
        modifiers: {
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey
        },
        ui5Context: this.getUI5ElementContext(event.target),
        screenshot: screenshot
      };

      await this.sendEventToBackground(eventData);
    }
  }

  async captureDragEvent(event, dragType) {
    const eventData = {
      type: 'drag',
      dragType,
      coordinates: {
        x: event.clientX,
        y: event.clientY
      },
      element: await this.getElementInfo(event.target),
      dataTransfer: this.serializeDataTransfer(event.dataTransfer),
      ui5Context: this.getUI5ElementContext(event.target)
    };

    await this.sendEventToBackground(eventData);
  }

  async captureEditingStart(event) {
    const element = event.target;
    
    // Capture screenshot at start of editing
    const screenshot = await this.captureEventScreenshot(element, 'editing_start');
    
    const eventData = {
      type: 'editing_start',
      element: await this.getElementInfo(element),
      initialValue: element.value || element.textContent || '',
      ui5Context: this.getUI5ElementContext(element),
      screenshot: screenshot
    };

    this.log('Editing started with screenshot:', eventData);
    await this.sendEventToBackground(eventData);
  }

  async captureEditingEnd(event) {
    const element = event.target;
    
    // Capture screenshot at end of editing
    const screenshot = await this.captureEventScreenshot(element, 'editing_end');
    
    const eventData = {
      type: 'editing_end',
      element: await this.getElementInfo(element),
      finalValue: element.value || element.textContent || '',
      ui5Context: this.getUI5ElementContext(element),
      screenshot: screenshot
    };

    this.log('Editing ended with screenshot:', eventData);
    await this.sendEventToBackground(eventData);
  }

  isFormElement(element) {
    const formElements = ['INPUT', 'TEXTAREA', 'SELECT'];
    return formElements.includes(element.tagName) || 
           element.contentEditable === 'true' ||
           element.hasAttribute('contenteditable');
  }

  async captureFileUpload(event) {
    const files = Array.from(event.target.files).map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    }));

    // Capture screenshot for file uploads
    const screenshot = await this.captureEventScreenshot(event.target, 'file_upload');

    const eventData = {
      type: 'file_upload',
      element: await this.getElementInfo(event.target),
      files,
      ui5Context: this.getUI5ElementContext(event.target),
      screenshot: screenshot
    };

    await this.sendEventToBackground(eventData);
  }

  async capturePageUnload() {
    const eventData = {
      type: 'page_unload',
      url: window.location.href,
      timestamp: Date.now()
    };

    await this.sendEventToBackground(eventData);
  }

  async getElementInfo(element) {
    const rect = element.getBoundingClientRect();
    
    return {
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      textContent: element.textContent?.slice(0, 200), // Limit text length
      selector: this.generateSelector(element),
      attributes: this.getElementAttributes(element),
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      xpath: this.getXPath(element)
    };
  }

  getElementAttributes(element) {
    const attributes = {};
    for (let attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }
    return attributes;
  }

  generateSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }
    
    let path = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let selector = element.nodeName.toLowerCase();
      if (element.className) {
        selector += '.' + element.className.split(' ').join('.');
      }
      
      let sibling = element;
      let index = 1;
      while (sibling = sibling.previousElementSibling) {
        if (sibling.nodeName.toLowerCase() === selector.split('.')[0]) {
          index++;
        }
      }
      
      if (index > 1) {
        selector += `:nth-child(${index})`;
      }
      
      path.unshift(selector);
      element = element.parentNode;
    }
    
    return path.join(' > ');
  }

  getXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    
    let path = '';
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let index = 0;
      let sibling = element.previousSibling;
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }
      
      const tagName = element.nodeName.toLowerCase();
      const pathIndex = index > 0 ? `[${index + 1}]` : '';
      path = `/${tagName}${pathIndex}${path}`;
      
      element = element.parentNode;
    }
    
    return path;
  }

  detectUI5Context() {
    // Inject detection script into page context for deep UI5 access
    this.injectUI5DetectionScript();
    
    // Fallback: Direct detection (limited in content script context)
    this.performDirectUI5Detection();
    
    // DOM-based heuristic detection
    this.performHeuristicDetection();
    
    // Listen for injected script results
    this.setupUI5DetectionListener();
  }

  injectUI5DetectionScript() {
    try {
      // Use external script to avoid CSP violations with inline scripts
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('ui5-detector.js');
      script.onload = function() {
        this.remove();
      };
      script.onerror = () => {
        this.log('Failed to load UI5 detection script, falling back to content script detection');
        this.performDirectUI5Detection();
      };
      
      (document.head || document.documentElement).appendChild(script);
      
      this.log('UI5 detection script injected via external file');
    } catch (error) {
      this.log('Failed to inject UI5 detection script:', error);
      // Fallback to direct detection
      this.performDirectUI5Detection();
    }
  }

  performDirectUI5Detection() {
    // Limited detection in content script context
    try {
      if (window.sap && window.sap.ui) {
        this.ui5Context = {
          version: window.sap.ui.version,
          theme: window.sap.ui.getCore()?.getConfiguration()?.getTheme(),
          locale: window.sap.ui.getCore()?.getConfiguration()?.getLocale()?.toString(),
          libraries: Object.keys(window.sap.ui.getCore()?.getLoadedLibraries() || {}),
          isUI5App: true,
          isFiori: this.detectFioriPatterns(),
          detectionMethod: 'direct-content-script'
        };
        
        this.log('Direct UI5 detection successful', this.ui5Context);
      }
    } catch (error) {
      this.log('Direct UI5 detection failed:', error);
    }
  }

  performHeuristicDetection() {
    // DOM-based detection as fallback
    const heuristics = {
      // Fiori app ID patterns
      hasApplicationIds: !!document.querySelector('[id^="application-"][id*="component"]'),
      hasViewIds: !!document.querySelector('[id*="--"][id*="component---"]'),
      
      // SAP CSS classes
      hasSapClasses: !!document.querySelector('[class*="sap"]'),
      hasFioriShell: !!document.querySelector('.sapUshellShell'),
      hasFioriPage: !!document.querySelector('.sapMPage'),
      hasFioriTiles: !!document.querySelector('.sapUshellTile'),
      
      // UI5 control patterns
      hasUI5Controls: !!document.querySelector('[class*="sapM"], [class*="sapUi"]'),
      
      // Script tags indicating UI5
      hasUI5Scripts: !!document.querySelector('script[src*="sap-ui-core"], script[src*="resources/sap-ui"]'),
      
      // Bootstrap indicator
      hasUI5Bootstrap: !!document.querySelector('#sap-ui-bootstrap')
    };

    const confidence = Object.values(heuristics).filter(Boolean).length / Object.keys(heuristics).length;
    
    if (!this.ui5Context || !this.ui5Context.isUI5App) {
      this.ui5Context = {
        isUI5App: confidence > 0.3, // 30% threshold
        isFiori: heuristics.hasApplicationIds || heuristics.hasFioriShell,
        confidence: confidence,
        heuristics: heuristics,
        detectionMethod: 'heuristic-dom'
      };
    }

    this.log('Heuristic UI5 detection completed', { confidence, heuristics });
  }

  setupUI5DetectionListener() {
    window.addEventListener('SAPUI5DetectionResult', (event) => {
      const detection = event.detail;
      this.log('Received UI5 detection result from injected script:', detection);
      
      // Always update UI5 context with injected script results (they're more comprehensive)
      if (detection && (detection.isSAPUI5 || detection.confidence > 0.3)) {
        this.ui5Context = {
          isUI5App: detection.isSAPUI5,
          isFiori: detection.isSAPUI5 && this.detectFioriPatterns(),
          version: detection.version,
          theme: detection.theme,
          locale: detection.locale,
          libraries: detection.libraries || [],
          components: detection.components || [],
          views: detection.views || [],
          confidence: detection.confidence,
          detectionMethods: detection.detectionMethods || [],
          detectionMethod: 'injected-script-enhanced',
          buildInfo: detection.buildInfo,
          bootPath: detection.bootPath,
          resourceRoots: detection.resourceRoots,
          loadedModules: detection.loadedModules || [],
          errors: detection.errors || []
        };
        
        this.log('✅ Updated UI5 context from injected script:', this.ui5Context);
      } else {
        this.log('⚠️ Injected script detection failed or low confidence:', detection);
      }
    });
    
    // Add a timeout fallback in case injected script fails
    setTimeout(() => {
      if (!this.ui5Context || !this.ui5Context.isUI5App) {
        this.log('⏰ UI5 detection timeout - attempting final fallback detection');
        this.performFinalFallbackDetection();
      }
    }, 2000);
  }

  detectFioriPatterns() {
    // Enhanced Fiori pattern detection
    const fioriIndicators = [
      // ID patterns
      !!document.querySelector('[id^="application-"][id*="component"]'),
      !!document.querySelector('[id*="Shell-home"]'),
      !!document.querySelector('[id*="manageDetectionMethod"]'),
      
      // Class patterns
      !!document.querySelector('.sapUshellShell'),
      !!document.querySelector('.sapUshellTileContainer'),
      !!document.querySelector('.sapMPage'),
      
      // URL patterns
      window.location.hash.includes('#') && (
        window.location.hash.includes('Shell-home') ||
        window.location.hash.includes('-manage') ||
        window.location.hash.includes('DetectionMethod')
      )
    ];

    return fioriIndicators.some(Boolean);
  }

  performFinalFallbackDetection() {
    // Final attempt at UI5 detection using all available methods
    const finalHeuristics = {
      hasUI5Namespace: typeof window.sap !== 'undefined' && typeof window.sap.ui !== 'undefined',
      hasJQuerySap: typeof window.jQuery !== 'undefined' && typeof window.jQuery.sap !== 'undefined',
      hasUI5Bootstrap: !!document.querySelector('#sap-ui-bootstrap'),
      hasUI5Scripts: !!document.querySelector('script[src*="sap-ui"], script[src*="ui5"]'),
      hasSapClasses: document.querySelectorAll('[class*="sap"]').length > 10,
      hasFioriShell: !!document.querySelector('.sapUshellShell, .sapUshellContainer'),
      hasFioriControls: document.querySelectorAll('[class*="sapM"], [class*="sapUi"]').length > 5,
      hasApplicationId: !!document.querySelector('[id*="application-"][id*="component"]'),
      isFioriURL: /fiori|ui5|sap/i.test(window.location.href)
    };

    const positiveHeuristics = Object.values(finalHeuristics).filter(Boolean).length;
    const confidence = positiveHeuristics / Object.keys(finalHeuristics).length;

    if (confidence > 0.4 || finalHeuristics.hasUI5Namespace) {
      this.ui5Context = {
        isUI5App: true,
        isFiori: finalHeuristics.hasFioriShell || finalHeuristics.hasApplicationId,
        confidence: confidence,
        detectionMethod: 'final-fallback',
        heuristics: finalHeuristics,
        version: window.sap?.ui?.version || 'unknown',
        theme: 'unknown',
        locale: 'unknown',
        libraries: [],
        components: [],
        views: [],
        detectionMethods: ['final-fallback'],
        errors: []
      };
      
      this.log('🔄 Final fallback UI5 detection successful:', this.ui5Context);
    } else {
      this.ui5Context = {
        isUI5App: false,
        isFiori: false,
        confidence: confidence,
        detectionMethod: 'final-fallback-negative',
        heuristics: finalHeuristics,
        errors: ['No sufficient UI5 indicators found']
      };
      
      this.log('❌ Final fallback UI5 detection: Not a UI5 app:', this.ui5Context);
    }
  }

  getUI5ElementContext(element) {
    // Always return basic UI5 context information
    const baseContext = {
      globalUI5Context: this.ui5Context || { isUI5App: false, detectionMethod: 'not-detected' },
      timestamp: Date.now()
    };
    
    // Return early if no UI5 app detected
    if (!this.ui5Context?.isUI5App || !window.sap?.ui) {
      return {
        ...baseContext,
        elementUI5Info: null,
        reason: 'no-ui5-detected'
      };
    }

    try {
      const core = window.sap.ui.getCore();
      if (!core) {
        return {
          ...baseContext,
          elementUI5Info: null,
          reason: 'no-ui5-core'
        };
      }

      // Method 1: Direct control lookup by ID
      if (element.id) {
        const control = core.byId(element.id);
        if (control) {
          return {
            ...baseContext,
            elementUI5Info: {
              controlType: control.getMetadata().getName(),
              controlId: control.getId(),
              properties: this.getControlProperties(control),
              bindingInfo: this.getBindingInfo(control),
              method: 'direct-id'
            }
          };
        }
      }

      // Method 2: Use jQuery UI5 plugin if available
      if (window.jQuery && window.jQuery.fn.control) {
        try {
          const $element = window.jQuery(element);
          const control = $element.control();
          if (control && control.length > 0) {
            const ui5Control = control[0];
            return {
              ...baseContext,
              elementUI5Info: {
                controlType: ui5Control.getMetadata().getName(),
                controlId: ui5Control.getId(),
                properties: this.getControlProperties(ui5Control),
                bindingInfo: this.getBindingInfo(ui5Control),
                method: 'jquery-plugin'
              }
            };
          }
        } catch (e) {
          // jQuery method failed, continue
        }
      }

      // Method 3: Look for UI5 control data attributes
      let currentElement = element;
      while (currentElement && currentElement !== document.body) {
        // Check for UI5 control data
        if (currentElement.dataset && currentElement.dataset.sapUi) {
          const controlId = currentElement.dataset.sapUi;
          const control = core.byId(controlId);
          if (control) {
            return {
              ...baseContext,
              elementUI5Info: {
                controlType: control.getMetadata().getName(),
                controlId: control.getId(),
                properties: this.getControlProperties(control),
                bindingInfo: this.getBindingInfo(control),
                method: 'data-attribute',
                elementRole: currentElement === element ? 'direct' : 'descendant'
              }
            };
          }
        }

        // Check for UI5 control marker attributes
        const attributes = currentElement.attributes;
        for (let i = 0; i < attributes.length; i++) {
          const attr = attributes[i];
          if (attr.name.startsWith('data-sap-ui') || attr.name.includes('ui5')) {
            // This element has UI5 markers, try to find control
            if (currentElement.id) {
              const control = core.byId(currentElement.id);
              if (control) {
                return {
                  ...baseContext,
                  elementUI5Info: {
                    controlType: control.getMetadata().getName(),
                    controlId: control.getId(),
                    properties: this.getControlProperties(control),
                    bindingInfo: this.getBindingInfo(control),
                    method: 'ui5-marker',
                    elementRole: currentElement === element ? 'direct' : 'ancestor'
                  }
                };
              }
            }
          }
        }

        currentElement = currentElement.parentElement;
      }

      // Method 4: UI Area traversal
      const uiAreas = core.getUIAreas();
      for (let area of uiAreas) {
        if (area.getDomRef() && area.getDomRef().contains(element)) {
          // Element is within this UI area, try to find closest control
          const controls = this.findControlsInUIArea(area, element);
          if (controls.length > 0) {
            const closestControl = controls[0]; // Take the first (closest) control
            return {
              ...baseContext,
              elementUI5Info: {
                controlType: closestControl.getMetadata().getName(),
                controlId: closestControl.getId(),
                properties: this.getControlProperties(closestControl),
                bindingInfo: this.getBindingInfo(closestControl),
                method: 'ui-area-traversal',
                elementRole: 'within-control',
                uiAreaId: area.getId()
              }
            };
          }

          // If no specific control found, return UI area info
          return {
            ...baseContext,
            elementUI5Info: {
              controlType: 'sap.ui.core.UIArea',
              controlId: area.getId(),
              properties: {},
              bindingInfo: {},
              method: 'ui-area',
              elementRole: 'within-area'
            }
          };
        }
      }

      // Method 5: Check if element is within any known UI5 component
      const componentInfo = this.findUI5Component(element);
      if (componentInfo) {
        return {
          ...baseContext,
          elementUI5Info: componentInfo
        };
      }

    } catch (error) {
      console.warn('Error getting UI5 context:', error);
      return {
        ...baseContext,
        elementUI5Info: null,
        reason: 'ui5-context-error',
        error: error.message
      };
    }

    // No UI5 control found but UI5 app detected
    return {
      ...baseContext,
      elementUI5Info: null,
      reason: 'no-ui5-control-found'
    };
  }

  getControlProperties(control) {
    try {
      const properties = {};
      const metadata = control.getMetadata();
      const propertyNames = Object.keys(metadata.getAllProperties());
      
      propertyNames.forEach(propName => {
        try {
          const getter = `get${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
          if (typeof control[getter] === 'function') {
            properties[propName] = control[getter]();
          }
        } catch (e) {
          // Ignore property access errors
        }
      });
      
      return properties;
    } catch (error) {
      return {};
    }
  }

  getBindingInfo(control) {
    try {
      const bindingInfo = {};
      const metadata = control.getMetadata();
      const propertyNames = Object.keys(metadata.getAllProperties());
      
      propertyNames.forEach(propName => {
        const binding = control.getBinding(propName);
        if (binding) {
          bindingInfo[propName] = {
            path: binding.getPath(),
            model: binding.getModel()?.constructor?.name || 'unknown'
          };
        }
      });
      
      return bindingInfo;
    } catch (error) {
      return {};
    }
  }

  findControlsInUIArea(uiArea, targetElement) {
    const controls = [];
    
    try {
      // Get all controls in the UI area
      const areaControls = uiArea.getContent();
      
      for (let control of areaControls) {
        const controlDom = control.getDomRef();
        if (controlDom && controlDom.contains(targetElement)) {
          controls.push(control);
          
          // Also check nested controls
          const nestedControls = this.findNestedControls(control, targetElement);
          controls.push(...nestedControls);
        }
      }
    } catch (error) {
      console.warn('Error finding controls in UI area:', error);
    }
    
    return controls;
  }

  findNestedControls(parentControl, targetElement) {
    const controls = [];
    
    try {
      // Check if this control has aggregations
      const metadata = parentControl.getMetadata();
      const aggregations = metadata.getAllAggregations();
      
      Object.keys(aggregations).forEach(aggName => {
        try {
          const getter = `get${aggName.charAt(0).toUpperCase() + aggName.slice(1)}`;
          if (typeof parentControl[getter] === 'function') {
            const aggContent = parentControl[getter]();
            
            if (Array.isArray(aggContent)) {
              aggContent.forEach(child => {
                if (child && typeof child.getDomRef === 'function') {
                  const childDom = child.getDomRef();
                  if (childDom && childDom.contains(targetElement)) {
                    controls.push(child);
                    // Recursively check nested controls
                    const nested = this.findNestedControls(child, targetElement);
                    controls.push(...nested);
                  }
                }
              });
            } else if (aggContent && typeof aggContent.getDomRef === 'function') {
              const childDom = aggContent.getDomRef();
              if (childDom && childDom.contains(targetElement)) {
                controls.push(aggContent);
                const nested = this.findNestedControls(aggContent, targetElement);
                controls.push(...nested);
              }
            }
          }
        } catch (e) {
          // Skip this aggregation if there's an error
        }
      });
    } catch (error) {
      console.warn('Error finding nested controls:', error);
    }
    
    return controls;
  }

  findUI5Component(element) {
    try {
      // Look for component information in the element's class names or IDs
      const elementInfo = {
        id: element.id,
        className: element.className,
        tagName: element.tagName
      };

      // Enhanced semantic detection for Fiori controls
      const semanticInfo = this.detectSemanticRole(element);

      // Check for Fiori app component patterns
      if (element.id && element.id.includes('component')) {
        const componentMatch = element.id.match(/([^-]+)-([^-]+)-component/);
        if (componentMatch) {
          return {
            controlType: 'sap.ui.core.Component',
            controlId: element.id,
            properties: {
              componentName: `${componentMatch[1]}.${componentMatch[2]}`,
              elementType: 'component-element',
              ...semanticInfo
            },
            bindingInfo: {},
            method: 'component-pattern',
            elementRole: 'component-child'
          };
        }
      }

      // Check for view patterns
      if (element.className && element.className.includes('sapUiView')) {
        return {
          controlType: 'sap.ui.core.mvc.View',
          controlId: element.id || 'unknown-view',
          properties: {
            viewType: 'unknown',
            elementType: 'view-element',
            ...semanticInfo
          },
          bindingInfo: {},
          method: 'view-pattern',
          elementRole: 'view-child'
        };
      }

      // Check for control-specific class patterns
      const sapClasses = element.className.split(' ').filter(cls => cls.startsWith('sap'));
      if (sapClasses.length > 0) {
        const controlType = this.inferControlTypeFromClasses(sapClasses);
        return {
          controlType: controlType || 'sap.ui.core.Control',
          controlId: element.id || 'unknown-control',
          properties: {
            sapClasses: sapClasses,
            elementType: 'sap-styled-element',
            ...semanticInfo
          },
          bindingInfo: {},
          method: 'css-pattern',
          elementRole: 'styled-element'
        };
      }

    } catch (error) {
      console.warn('Error finding UI5 component:', error);
    }

    return null;
  }

  detectSemanticRole(element) {
    const semantic = {};
    
    // Detect common UI patterns
    if (element.tagName === 'INPUT') {
      semantic.inputType = element.type || 'text';
      semantic.placeholder = element.placeholder;
      semantic.required = element.required;
      semantic.semanticRole = 'input-field';
    } else if (element.tagName === 'BUTTON') {
      semantic.buttonText = element.textContent?.trim();
      semantic.semanticRole = 'action-button';
    } else if (element.tagName === 'SELECT') {
      semantic.semanticRole = 'dropdown';
    } else if (element.tagName === 'TABLE') {
      semantic.semanticRole = 'data-table';
    }

    // Detect Fiori-specific patterns
    const classNames = element.className || '';
    
    // Form elements
    if (classNames.includes('sapMInput')) {
      semantic.fioriControl = 'sap.m.Input';
      semantic.semanticRole = 'input-field';
    } else if (classNames.includes('sapMButton')) {
      semantic.fioriControl = 'sap.m.Button';
      semantic.semanticRole = 'action-button';
    } else if (classNames.includes('sapMComboBox')) {
      semantic.fioriControl = 'sap.m.ComboBox';
      semantic.semanticRole = 'combobox';
    } else if (classNames.includes('sapMText')) {
      semantic.fioriControl = 'sap.m.Text';
      semantic.semanticRole = 'display-text';
    } else if (classNames.includes('sapMLabel')) {
      semantic.fioriControl = 'sap.m.Label';
      semantic.semanticRole = 'field-label';
    }

    // Navigation elements
    if (classNames.includes('sapUshellTile')) {
      semantic.fioriControl = 'sap.ushell.ui.tile';
      semantic.semanticRole = 'navigation-tile';
    } else if (classNames.includes('sapMNavContainer')) {
      semantic.fioriControl = 'sap.m.NavContainer';
      semantic.semanticRole = 'navigation-container';
    }

    // Layout elements
    if (classNames.includes('sapUiTable')) {
      semantic.fioriControl = 'sap.ui.table.Table';
      semantic.semanticRole = 'data-table';
    } else if (classNames.includes('sapMList')) {
      semantic.fioriControl = 'sap.m.List';
      semantic.semanticRole = 'item-list';
    }

    // Page elements
    if (classNames.includes('sapMPage')) {
      semantic.fioriControl = 'sap.m.Page';
      semantic.semanticRole = 'page-container';
    } else if (classNames.includes('sapMPanel')) {
      semantic.fioriControl = 'sap.m.Panel';
      semantic.semanticRole = 'content-panel';
    }

    // Business context from ID patterns
    if (element.id) {
      if (element.id.includes('filterBar')) {
        semantic.businessContext = 'search-and-filter';
      } else if (element.id.includes('worklist') || element.id.includes('table')) {
        semantic.businessContext = 'data-display';
      } else if (element.id.includes('form') || element.id.includes('dialog')) {
        semantic.businessContext = 'data-entry';
      } else if (element.id.includes('detail') || element.id.includes('object')) {
        semantic.businessContext = 'detail-view';
      }
    }

    return semantic;
  }

  inferControlTypeFromClasses(sapClasses) {
    // Map common SAP CSS classes to likely control types
    const controlMap = {
      'sapMInput': 'sap.m.Input',
      'sapMButton': 'sap.m.Button',
      'sapMText': 'sap.m.Text',
      'sapMLabel': 'sap.m.Label',
      'sapMComboBox': 'sap.m.ComboBox',
      'sapMSelect': 'sap.m.Select',
      'sapMTable': 'sap.m.Table',
      'sapMList': 'sap.m.List',
      'sapMPanel': 'sap.m.Panel',
      'sapMPage': 'sap.m.Page',
      'sapUiTable': 'sap.ui.table.Table',
      'sapUshellTile': 'sap.ushell.ui.tile.TileBase'
    };

    for (let className of sapClasses) {
      if (controlMap[className]) {
        return controlMap[className];
      }
    }

    return null;
  }

  async captureScreenshot() {
    try {
      // Use HTML5 Canvas API to capture visible area
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      // Note: This is a simplified implementation
      // In a real extension, you'd use chrome.tabs.captureVisibleTab from background script
      return null; // Placeholder - actual implementation would require background script coordination
    } catch (error) {
      console.warn('Screenshot capture failed:', error);
      return null;
    }
  }

  serializeDataTransfer(dataTransfer) {
    if (!dataTransfer) return null;
    
    const serialized = {
      types: Array.from(dataTransfer.types),
      files: Array.from(dataTransfer.files).map(file => ({
        name: file.name,
        size: file.size,
        type: file.type
      }))
    };

    // Try to get data for each type
    dataTransfer.types.forEach(type => {
      try {
        serialized[type] = dataTransfer.getData(type);
      } catch (e) {
        // Some data types might not be accessible
      }
    });

    return serialized;
  }

  handleNetworkEvent(type, data) {
    // Log network events for debugging
    console.log(`Network event: ${type}`, data);
    
    // Show notification for completed requests
    if (type === 'request-completed') {
      this.showNetworkNotification(data);
    }
  }

  showNetworkNotification(requestData) {
    // Show a brief notification about network request
    if (this.isRecording) {
      const notification = document.createElement('div');
      const color = this.getNotificationColor(requestData.type);
      
      notification.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: ${color};
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 999999;
        opacity: 0.9;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      `;
      
      const urlPart = requestData.url.split('/').pop() || requestData.url.substring(requestData.url.lastIndexOf('/') + 1, requestData.url.lastIndexOf('/') + 20);
      notification.textContent = `${requestData.type.toUpperCase()}: ${requestData.method} ${urlPart}`;
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 3000);
    }
  }

  getNotificationColor(requestType) {
    switch (requestType) {
      case 'odata':
      case 'odata-batch':
        return '#2196F3'; // Blue for OData
      case 'odata-metadata':
        return '#9C27B0'; // Purple for metadata
      case 'csrf-token':
      case 'auth-token':
      case 'authentication':
        return '#FFC107'; // Amber for auth
      case 'sap-post':
      case 'sap-put':
      case 'sap-patch':
        return '#FF9800'; // Orange for SAP modifications
      case 'sap-delete':
        return '#F44336'; // Red for deletions
      case 'webapp-post':
      case 'webapp-put':
      case 'webapp-patch':
      case 'webapp-delete':
        return '#607D8B'; // Blue Grey for web app requests
      default:
        return '#4CAF50'; // Green for others
    }
  }

  addRecordingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'fiori-recording-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(244, 67, 54, 0.9);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      z-index: 999999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      animation: pulse 2s infinite;
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255,255,255,0.2);
    `;
    indicator.innerHTML = '🔴 Recording Fiori Session';
    
    // Add pulsing animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { opacity: 0.8; }
        50% { opacity: 0.5; }
        100% { opacity: 0.8; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(indicator);
  }

  removeRecordingIndicator() {
    const indicator = document.getElementById('fiori-recording-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  async captureEventScreenshot(element, eventType, eventId = null) {
    try {
      // Skip screenshot capture if disabled
      if (!this.shouldCaptureScreenshots()) {
        return null;
      }

      // Capture both full page screenshot and element info
      const rect = element.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      
      const elementInfo = {
        x: rect.left + scrollX,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
        visible: this.isElementVisible(element),
        tagName: element.tagName,
        id: element.id,
        className: element.className,
        textContent: element.textContent?.slice(0, 100),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
      
      // Get screenshot via background script with event type and ID
      const response = await chrome.runtime.sendMessage({
        type: 'capture-screenshot',
        elementInfo: elementInfo,
        eventType: eventType,
        eventId: eventId,
        pageUrl: window.location.href,
        pageTitle: document.title
      });
      
      if (response && response.success && response.screenshot) {
        return {
          id: response.screenshot.id,
          filename: `${response.screenshot.id}.png`,
          timestamp: response.screenshot.timestamp,
          eventType: eventType,
          eventId: eventId,
          elementBounds: elementInfo,
          viewportSize: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          pageSize: {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight
          },
          pageInfo: response.screenshot.pageInfo,
          captureMethod: 'chrome-tabs-api'
        };
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to capture event screenshot:', error);
      return null;
    }
  }

  async captureElementScreenshot(element) {
    // Legacy method - use the new event-based method
    return await this.captureEventScreenshot(element, 'legacy');
  }

  shouldCaptureScreenshots() {
    // Check if screenshots are enabled in settings
    try {
      // Check for settings in storage (async, so we'll use a default)
      return true; // Default to enabled, could be made configurable
    } catch (error) {
      return false;
    }
  }

  async capturePageScreenshot() {
    try {
      if (!this.shouldCaptureScreenshots()) {
        return null;
      }

      // Request full page screenshot from background script
      const response = await chrome.runtime.sendMessage({
        type: 'capture-screenshot'
      });
      
      if (response && response.success) {
        return {
          dataUrl: response.screenshot.dataUrl,
          timestamp: response.screenshot.timestamp,
          pageInfo: response.screenshot.pageInfo,
          viewportSize: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          captureMethod: 'chrome-tabs-api'
        };
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to capture page screenshot:', error);
      return null;
    }
  }

  isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }

  async captureScreenshot() {
    try {
      // Request full page screenshot from background script
      const response = await chrome.runtime.sendMessage({
        type: 'capture-screenshot'
      });
      
      if (response && response.success) {
        return response.screenshot;
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to capture screenshot:', error);
      return null;
    }
  }

  injectHelperScript() {
    // Inject a script to access page context that content scripts can't reach
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  async sendEventToBackground(eventData) {
    try {
      console.log('[Fiori] Sending event to background:', eventData.type, eventData);
      const response = await chrome.runtime.sendMessage({
        type: 'capture-event',
        data: eventData
      });
      
      if (response && response.success) {
        console.log('[Fiori] Event sent successfully to background');
      } else {
        console.warn('[Fiori] Background script responded with error:', response?.error);
      }
    } catch (error) {
      console.error('[Fiori] Failed to send event to background:', error);
      // Store event locally as fallback
      if (!this.eventQueue) this.eventQueue = [];
      this.eventQueue.push({
        timestamp: Date.now(),
        eventData,
        error: error.message
      });
      console.log('[Fiori] Event stored locally due to communication failure');
    }
  }

  // Audio Recording Methods
  async startAudioRecording() {
    try {
      console.log('[Fiori] Starting audio recording...');
      
      // Initialize audio recording directly
      if (!this.mediaRecorder) {
        await this.initializeAudioRecording();
      }

      if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
        this.audioChunks = [];
        this.mediaRecorder.start(1000); // 1 second chunks
        console.log('[Fiori] Audio recording started successfully');
        
        // Notify background script
        chrome.runtime.sendMessage({
          type: 'start-audio-recording'
        });
      }
    } catch (error) {
      console.error('[Fiori] Failed to start audio recording:', error);
    }
  }

  async stopAudioRecording() {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        console.log('[Fiori] Stopping audio recording...');
        
        this.mediaRecorder.stop();
        
        // Stop all audio tracks
        if (this.audioStream) {
          this.audioStream.getTracks().forEach(track => track.stop());
        }
        
        console.log('[Fiori] Audio recording stopped successfully');
      }
    } catch (error) {
      console.error('[Fiori] Failed to stop audio recording:', error);
    }
  }

  async initializeAudioRecording() {
    try {
      console.log('[Fiori] Initializing audio recording...');
      
      // Request microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];

      // Handle data chunks
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          console.log('[Fiori] Audio chunk captured:', event.data.size, 'bytes');
          
          // Send chunk to background script
          this.sendAudioChunkToBackground(event.data);
        }
      };

      // Handle recording stop
      this.mediaRecorder.onstop = () => {
        console.log('[Fiori] MediaRecorder stopped, final chunks:', this.audioChunks.length);
        
        // Notify background script
        chrome.runtime.sendMessage({
          type: 'stop-audio-recording'
        });
      };

      console.log('[Fiori] Audio recording initialized successfully');
    } catch (error) {
      console.error('[Fiori] Failed to initialize audio recording:', error);
      throw error;
    }
  }

  async sendAudioChunkToBackground(audioData) {
    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result.split(',')[1];
        
        chrome.runtime.sendMessage({
          type: 'store-audio-chunk',
          audioData: base64Data,
          timestamp: Date.now()
        });
      };
      reader.readAsDataURL(audioData);
    } catch (error) {
      console.error('[Fiori] Failed to send audio chunk:', error);
    }
  }

  }; // End of FioriTestCapture class
}

// Initialize content script only if not already initialized
if (!window.fioriTestCaptureInstance) {
  console.log('[Fiori] Initializing content script...');
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Fiori] DOM loaded, creating instance');
      window.fioriTestCaptureInstance = new window.FioriTestCapture();
    });
  } else {
    console.log('[Fiori] DOM ready, creating instance immediately');
    window.fioriTestCaptureInstance = new window.FioriTestCapture();
  }
} else {
  console.log('[Fiori] Content script already initialized');
}