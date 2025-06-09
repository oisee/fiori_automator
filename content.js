// Content script for Fiori Test Automation System
// Captures DOM interactions, SAPUI5 context, and coordinates with background script

class FioriTestCapture {
  constructor() {
    this.isRecording = false;
    this.eventQueue = [];
    this.lastScreenshot = null;
    this.ui5Context = null;
    this.init();
  }

  init() {
    this.setupDebugMode();
    this.setupEventListeners();
    this.setupMessageHandling();
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

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'ping':
        // Respond to ping to confirm content script is loaded
        sendResponse({ success: true, status: 'ready' });
        break;

      case 'start-recording':
        this.startRecording();
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

  startRecording() {
    this.isRecording = true;
    this.eventQueue = [];
    this.addRecordingIndicator();
    console.log('Fiori Test Capture: Recording started');
  }

  stopRecording() {
    this.isRecording = false;
    this.removeRecordingIndicator();
    console.log('Fiori Test Capture: Recording stopped');
  }

  async captureClickEvent(event) {
    const element = event.target;
    const rect = element.getBoundingClientRect();
    
    const eventData = {
      type: 'click',
      coordinates: {
        x: event.clientX,
        y: event.clientY,
        elementX: rect.left,
        elementY: rect.top
      },
      element: await this.getElementInfo(element),
      ui5Context: this.getUI5ElementContext(element),
      screenshot: await this.captureScreenshot(),
      modifiers: {
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey
      }
    };

    this.log('Click captured:', eventData);
    await this.sendEventToBackground(eventData);
  }

  async captureInputEvent(event) {
    const element = event.target;
    
    const eventData = {
      type: 'input',
      element: await this.getElementInfo(element),
      value: element.value,
      inputType: event.inputType,
      ui5Context: this.getUI5ElementContext(element)
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

    const eventData = {
      type: 'submit',
      element: await this.getElementInfo(form),
      formData: formObject,
      action: form.action,
      method: form.method,
      ui5Context: this.getUI5ElementContext(form)
    };

    await this.sendEventToBackground(eventData);
  }

  async captureKeyboardEvent(event) {
    // Only capture special keys and shortcuts
    if (event.ctrlKey || event.altKey || event.metaKey || 
        ['Enter', 'Escape', 'Tab', 'F1', 'F2', 'F3', 'F4'].includes(event.key)) {
      
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
        ui5Context: this.getUI5ElementContext(event.target)
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

  async captureFileUpload(event) {
    const files = Array.from(event.target.files).map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    }));

    const eventData = {
      type: 'file_upload',
      element: await this.getElementInfo(event.target),
      files,
      ui5Context: this.getUI5ElementContext(event.target)
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
    // Check if SAPUI5 is loaded
    if (window.sap && window.sap.ui) {
      this.ui5Context = {
        version: window.sap.ui.version,
        theme: window.sap.ui.getCore()?.getConfiguration()?.getTheme(),
        locale: window.sap.ui.getCore()?.getConfiguration()?.getLocale()?.toString(),
        libraries: Object.keys(window.sap.ui.getCore()?.getLoadedLibraries() || {}),
        isUI5App: true
      };
      
      console.log('Fiori Test Capture: SAPUI5 detected', this.ui5Context);
    } else {
      this.ui5Context = { isUI5App: false };
    }
  }

  getUI5ElementContext(element) {
    if (!this.ui5Context?.isUI5App || !window.sap?.ui) {
      return null;
    }

    try {
      // Try to get UI5 control from element
      const control = window.sap.ui.getCore().byId(element.id);
      if (control) {
        return {
          controlType: control.getMetadata().getName(),
          controlId: control.getId(),
          properties: this.getControlProperties(control),
          bindingInfo: this.getBindingInfo(control)
        };
      }

      // Try to find parent UI5 control
      let parentElement = element.parentElement;
      while (parentElement) {
        const parentControl = window.sap.ui.getCore().byId(parentElement.id);
        if (parentControl) {
          return {
            parentControlType: parentControl.getMetadata().getName(),
            parentControlId: parentControl.getId(),
            elementRole: 'child'
          };
        }
        parentElement = parentElement.parentElement;
      }
    } catch (error) {
      console.warn('Error getting UI5 context:', error);
    }

    return null;
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
      case 'sap-post':
      case 'sap-put':
      case 'sap-patch':
        return '#FF9800'; // Orange for SAP modifications
      case 'sap-delete':
        return '#F44336'; // Red for deletions
      default:
        return '#4CAF50'; // Green for others
    }
  }

  addRecordingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'fiori-recording-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: #f44336;
      color: white;
      padding: 8px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      z-index: 999999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      animation: pulse 2s infinite;
    `;
    indicator.innerHTML = '🔴 Recording Fiori Session';
    
    // Add pulsing animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
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
      await chrome.runtime.sendMessage({
        type: 'capture-event',
        data: eventData
      });
    } catch (error) {
      console.error('Failed to send event to background:', error);
    }
  }
}

// Initialize content script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new FioriTestCapture();
  });
} else {
  new FioriTestCapture();
}