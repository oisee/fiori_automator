// Popup script for Fiori Test Automation System
// Handles UI interactions and communication with background/content scripts

class FioriTestPopup {
  constructor() {
    this.currentTab = null;
    this.recordingTimer = null;
    this.currentState = null;
    
    this.init();
  }

  async init() {
    await this.getCurrentTab();
    this.setupEventListeners();
    await this.loadCurrentState();
    this.detectApplication();
    this.loadRecentSessions();
    this.updateUIFromState();
  }

  async loadCurrentState() {
    try {
      console.log('Loading current recording state for tab:', this.currentTab.id);
      
      // Get comprehensive recording state from background
      const response = await chrome.runtime.sendMessage({
        type: 'get-recording-state',
        tabId: this.currentTab.id
      });

      console.log('Recording state response:', response);

      if (response && response.success) {
        this.currentState = response.data;
        
        console.log('Current state loaded:', {
          state: this.currentState.state,
          sessionId: this.currentState.sessionId,
          duration: this.currentState.duration,
          eventCount: this.currentState.eventCount
        });
        
        // Start/resume timer if recording
        if (this.currentState.isRecording) {
          this.startRecordingTimer();
        }
        
        console.log('✅ State loaded from background');
      } else {
        console.error('Failed to load state:', response?.error);
        this.currentState = { state: 'idle', isRecording: false, isPaused: false };
      }
    } catch (error) {
      console.error('❌ Failed to load recording state:', error);
      this.currentState = { state: 'idle', isRecording: false, isPaused: false };
    }
  }

  async getCurrentTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tabs[0];
  }

  setupEventListeners() {
    // Recording controls
    document.getElementById('recordBtn').addEventListener('click', () => this.startRecording());
    document.getElementById('pauseBtn').addEventListener('click', () => this.pauseRecording());
    document.getElementById('stopBtn').addEventListener('click', () => this.stopRecording());

    // Other controls
    document.getElementById('viewAllBtn').addEventListener('click', () => this.viewAllSessions());
    document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
    document.getElementById('helpBtn').addEventListener('click', () => this.openHelp());
    document.getElementById('popoutBtn').addEventListener('click', () => this.openInWindow());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportSession());
    
    // Add markdown export button if it exists
    const markdownExportBtn = document.getElementById('exportMarkdownBtn');
    if (markdownExportBtn) {
      markdownExportBtn.addEventListener('click', () => this.exportSessionAsMarkdown());
    }

    // Add ZIP export button if it exists
    const zipExportBtn = document.getElementById('exportZipBtn');
    if (zipExportBtn) {
      zipExportBtn.addEventListener('click', () => this.exportSessionAsZip());
    }

    // Add manual screenshot button if it exists
    const manualScreenshotBtn = document.getElementById('manualScreenshotBtn');
    if (manualScreenshotBtn) {
      manualScreenshotBtn.addEventListener('click', () => this.captureManualScreenshot());
    }

    // Listen for background script messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'recording-state-changed':
        if (message.tabId === this.currentTab?.id) {
          console.log('Recording state changed:', message.state);
          this.refreshState();
        }
        break;

      case 'session-updated':
        if (message.tabId === this.currentTab?.id) {
          console.log('Session updated');
          this.refreshState();
        }
        break;
    }
  }

  async refreshState() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'get-recording-state',
        tabId: this.currentTab.id
      });

      if (response && response.success) {
        this.currentState = response.data;
        this.updateUIFromState();
        
        // Update timer based on new state
        if (this.currentState.isRecording && !this.recordingTimer) {
          this.startRecordingTimer();
        } else if (!this.currentState.isRecording && this.recordingTimer) {
          clearInterval(this.recordingTimer);
          this.recordingTimer = null;
        }
      }
    } catch (error) {
      console.error('Failed to refresh state:', error);
    }
  }

  async startRecording() {
    try {
      console.log('Starting recording...');
      this.showLoading('Starting recording...');

      const sessionName = document.getElementById('sessionNameInput').value || 
                         `Session ${new Date().toLocaleString()}`;
      
      const config = {
        sessionName,
        captureScreenshots: document.getElementById('captureScreenshots').checked,
        captureUI5Context: document.getElementById('captureUI5Context').checked,
        autoCorrelation: document.getElementById('autoCorrelation').checked,
        filterJSRequests: document.getElementById('filterJSRequests').checked,
        applicationUrl: this.currentTab.url,
        timestamp: Date.now()
      };

      console.log('Recording config:', config);

      // Send start recording message to background script
      const response = await chrome.runtime.sendMessage({
        type: 'start-recording',
        data: config,
        tabId: this.currentTab.id
      });

      console.log('Background response:', response);

      if (response && response.success) {
        // Refresh state from background (single source of truth)
        await this.refreshState();
        
        // Background script now handles content script notification
        console.log('Recording started via background script');
        
        this.showSuccess('Recording started!');
      } else {
        throw new Error(response?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.showError(`Failed to start recording: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  async pauseRecording() {
    try {
      if (!this.currentState || !this.currentState.isRecording) return;
      
      const action = this.currentState.isPaused ? 'resume-recording' : 'pause-recording';
      
      console.log(`${action}...`);
      this.showLoading(this.currentState.isPaused ? 'Resuming...' : 'Pausing...');

      const response = await chrome.runtime.sendMessage({
        type: action,
        tabId: this.currentTab.id
      });

      if (response && response.success) {
        // Refresh state from background
        await this.refreshState();
        this.showSuccess(this.currentState.isPaused ? 'Recording paused' : 'Recording resumed');
      } else {
        throw new Error(response?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Failed to toggle pause:', error);
      this.showError('Failed to toggle pause');
    } finally {
      this.hideLoading();
    }
  }

  async stopRecording() {
    try {
      this.showLoading('Stopping recording...');

      // Send stop message to background script
      const response = await chrome.runtime.sendMessage({
        type: 'stop-recording',
        tabId: this.currentTab.id
      });

      if (response && response.success) {
        // Refresh state from background
        await this.refreshState();
        
        // Background script now handles content script notification
        console.log('Recording stopped via background script');

        // Show completion message
        this.showSuccess('Recording completed successfully!');
        
        // Refresh sessions list
        setTimeout(() => this.loadRecentSessions(), 1000);
      } else {
        throw new Error(response?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      this.showError('Failed to stop recording');
    } finally {
      this.hideLoading();
    }
  }

  startRecordingTimer() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }
    
    this.recordingTimer = setInterval(() => {
      if (this.currentState && this.currentState.isRecording) {
        const duration = this.currentState.duration || 0;
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        
        const durationElement = document.getElementById('duration');
        if (durationElement) {
          durationElement.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // Refresh state periodically to get updated duration
        if (Date.now() % 5000 < 1000) { // Refresh every 5 seconds
          this.refreshState();
        }
      }
    }, 1000);
  }

  updateUIFromState() {
    if (!this.currentState) return;
    
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const recordBtn = document.getElementById('recordBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const sessionInfo = document.getElementById('sessionInfo');
    const sessionConfig = document.getElementById('sessionConfig');

    // Reset classes
    statusDot.className = 'status-dot';
    
    switch (this.currentState.state) {
      case 'recording':
        statusDot.classList.add('recording');
        statusText.textContent = 'Recording';
        recordBtn.style.display = 'none';
        pauseBtn.style.display = 'flex';
        stopBtn.style.display = 'flex';
        sessionInfo.style.display = 'block';
        sessionConfig.style.display = 'none';
        pauseBtn.innerHTML = '<span class="btn-icon">⏸️</span>Pause';
        break;

      case 'paused':
        statusDot.classList.add('paused');
        statusText.textContent = 'Paused';
        recordBtn.style.display = 'none';
        pauseBtn.style.display = 'flex';
        stopBtn.style.display = 'flex';
        sessionInfo.style.display = 'block';
        sessionConfig.style.display = 'none';
        pauseBtn.innerHTML = '<span class="btn-icon">▶️</span>Resume';
        break;

      case 'stopped':
      case 'idle':
      default:
        statusText.textContent = 'Ready';
        recordBtn.style.display = 'flex';
        pauseBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        sessionInfo.style.display = 'none';
        sessionConfig.style.display = 'block';
        pauseBtn.innerHTML = '<span class="btn-icon">⏸️</span>Pause';
        break;
    }
    
    // Update session info if recording
    if (this.currentState.isRecording) {
      this.updateSessionInfo(this.currentState.sessionName);
      this.updateSessionStats(this.currentState);
    }
  }

  updateSessionInfo(sessionName) {
    document.getElementById('sessionName').textContent = sessionName;
  }

  updateSessionStats(state) {
    const actionCountEl = document.getElementById('actionCount');
    const odataCountEl = document.getElementById('odataCount');
    
    if (actionCountEl) actionCountEl.textContent = state.eventCount || 0;
    if (odataCountEl) odataCountEl.textContent = state.networkRequestCount || 0;
    
    if (state.lastEvent) {
      const lastAction = document.getElementById('lastAction');
      const actionText = lastAction?.querySelector('.action-text');
      const confidence = document.getElementById('confidence');
      
      if (actionText) {
        actionText.textContent = this.formatEventDescription(state.lastEvent);
      }
      
      if (confidence && state.lastEvent.correlatedRequests?.length > 0) {
        const avgConfidence = state.lastEvent.correlatedRequests.reduce(
          (sum, req) => sum + req.correlation.confidence, 0
        ) / state.lastEvent.correlatedRequests.length;
        
        confidence.textContent = `${Math.round(avgConfidence)}%`;
        confidence.className = 'confidence ' + this.getConfidenceClass(avgConfidence);
        confidence.style.display = 'inline';
      } else if (confidence) {
        confidence.style.display = 'none';
      }
    }
  }

  formatEventDescription(event) {
    switch (event.type) {
      case 'click':
        return `Clicked ${event.element.tagName.toLowerCase()}`;
      case 'input':
        return `Input in ${event.element.tagName.toLowerCase()}`;
      case 'submit':
        return 'Form submitted';
      case 'keyboard':
        return `Key pressed: ${event.key}`;
      default:
        return `${event.type} event`;
    }
  }

  getConfidenceClass(confidence) {
    if (confidence >= 80) return 'high';
    if (confidence >= 60) return 'medium';
    return 'low';
  }

  async detectApplication() {
    try {
      // Try to get UI5 context from content script with retry
      const response = await this.ensureContentScriptAndNotify('get-ui5-context');

      const appStatusIcon = document.getElementById('appStatusIcon');
      const appStatusText = document.getElementById('appStatusText');
      const appDetails = document.getElementById('appDetails');

      if (response?.success && response.context?.isUI5App) {
        const context = response.context;
        
        appStatusIcon.textContent = '✅';
        appStatusText.textContent = 'SAPUI5 Application Detected';
        
        document.getElementById('appName').textContent = 
          context.fioriAppId || 'SAPUI5 Application';
        document.getElementById('ui5Version').textContent = 
          context.version || 'Unknown';
        document.getElementById('ui5Theme').textContent = 
          context.theme || 'Unknown';
        
        appDetails.style.display = 'block';
      } else {
        appStatusIcon.textContent = '⚠️';
        appStatusText.textContent = 'Generic web application';
        appDetails.style.display = 'none';
      }
    } catch (error) {
      console.warn('Could not detect application context:', error);
      
      document.getElementById('appStatusIcon').textContent = '❓';
      document.getElementById('appStatusText').textContent = 'Detection failed';
    }
  }

  async ensureContentScriptAndNotify(messageType, data = null) {
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // First try to send the message
        const response = await chrome.tabs.sendMessage(this.currentTab.id, {
          type: messageType,
          data
        });
        return response;
      } catch (error) {
        console.log(`Attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // If it failed, try to inject the content script
        try {
          await chrome.scripting.executeScript({
            target: { tabId: this.currentTab.id },
            files: ['content.js']
          });
          
          // Wait for script to initialize
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (injectionError) {
          console.warn('Failed to inject content script:', injectionError);
        }
      }
    }
  }

  async loadRecentSessions() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'get-sessions'
      });

      const sessionsList = document.getElementById('sessionsList');
      const noSessions = document.getElementById('noSessions');

      // Check if DOM elements exist before trying to use them
      if (!sessionsList || !noSessions) {
        // This can happen if popup is opened without session list (e.g., in recording panel)
        return;
      }

      if (response && response.success && response.data) {
        const sessions = Object.values(response.data)
          .sort((a, b) => b.startTime - a.startTime)
          .slice(0, 5); // Show last 5 sessions

        if (sessions.length > 0) {
          noSessions.style.display = 'none';
          sessionsList.innerHTML = sessions.map(session => 
            this.createSessionItem(session)
          ).join('');
          
          // Add click listeners
          sessionsList.querySelectorAll('.session-item').forEach((item, index) => {
            item.addEventListener('click', () => this.openSession(sessions[index]));
          });
        } else {
          noSessions.style.display = 'block';
          sessionsList.innerHTML = '';
        }
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  createSessionItem(session) {
    const date = new Date(session.startTime).toLocaleDateString();
    const time = new Date(session.startTime).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const duration = session.duration ? 
      Math.round(session.duration / 1000) + 's' : 
      'Unknown';

    return `
      <div class="session-item" data-session-id="${session.sessionId}">
        <div>
          <div class="session-name">${session.metadata?.sessionName || 'Unnamed Session'}</div>
          <div class="session-meta">${date} ${time} • ${duration} • ${session.events?.length || 0} actions</div>
        </div>
      </div>
    `;
  }

  openSession(session) {
    // Open sessions management page with specific session selected
    const sessionUrl = chrome.runtime.getURL('sessions.html') + `?sessionId=${session.sessionId}`;
    chrome.tabs.create({ url: sessionUrl });
    
    // Close this popup
    window.close();
  }

  viewAllSessions() {
    // Open sessions management page
    chrome.tabs.create({ url: chrome.runtime.getURL('sessions.html') });
  }

  openSettings() {
    // Open settings page
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  }

  openHelp() {
    // Open help documentation
    chrome.tabs.create({ url: 'https://github.com/your-repo/fiori-test-automation' });
  }

  openInWindow() {
    // Open the dedicated recording panel in a separate window
    const panelUrl = chrome.runtime.getURL('recording-panel.html');
    chrome.windows.create({
      url: panelUrl,
      type: 'popup',
      width: 420,
      height: 650,
      left: 100,
      top: 100
    });
    
    // Close this popup
    window.close();
  }

  async exportSession() {
    try {
      if (!this.currentState || !this.currentState.sessionId) {
        this.showError('No session data to export');
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'get-session-data',
        tabId: this.currentTab.id
      });

      if (response && response.success && response.data) {
        const sessionJson = JSON.stringify(response.data, null, 2);
        const blob = new Blob([sessionJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `fiori-session-${this.currentState.sessionId}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showSuccess('Session exported successfully');
      } else {
        this.showError('No session data available');
      }
    } catch (error) {
      console.error('Export failed:', error);
      this.showError('Export failed');
    }
  }

  async exportSessionAsMarkdown() {
    try {
      if (!this.currentState || !this.currentState.sessionId) {
        this.showError('No session data to export');
        return;
      }

      this.showLoading('Generating markdown export...');

      const response = await chrome.runtime.sendMessage({
        type: 'export-session-markdown',
        tabId: this.currentTab.id,
        sessionId: this.currentState.sessionId
      });

      if (response && response.success) {
        // For now, just create a markdown file (not a zip)
        // In the future, this could be enhanced to include screenshots in a zip
        const markdownContent = response.zipData; // This is actually markdown content
        const blob = new Blob([markdownContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        // Use semantic filename from response or fallback
        a.download = response.filename || `fiori-session-${this.currentState.sessionId}-export.md`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showSuccess('Markdown export completed!');
      } else {
        throw new Error(response?.error || 'Export failed');
      }
    } catch (error) {
      console.error('Markdown export failed:', error);
      this.showError('Markdown export failed');
    } finally {
      this.hideLoading();
    }
  }

  async exportSessionAsZip() {
    try {
      if (!this.currentState || !this.currentState.sessionId) {
        this.showError('No session data to export');
        return;
      }

      this.showLoading('Exporting session with screenshots...');

      const response = await chrome.runtime.sendMessage({
        type: 'export-session-screenshots',
        tabId: this.currentTab.id,
        sessionId: this.currentState.sessionId
      });

      if (response && response.success) {
        // Download session JSON first
        const sessionBlob = new Blob([response.sessionData], { type: 'application/json' });
        const sessionUrl = URL.createObjectURL(sessionBlob);
        
        const sessionLink = document.createElement('a');
        sessionLink.href = sessionUrl;
        sessionLink.download = response.filename || `fiori-session-${this.currentState.sessionId}.json`;
        sessionLink.click();
        URL.revokeObjectURL(sessionUrl);

        // Download each screenshot individually
        if (response.screenshots && response.screenshots.length > 0) {
          for (const screenshot of response.screenshots) {
            // Convert data URL to blob
            const base64Data = screenshot.dataUrl.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = screenshot.filename;
            link.click();
            URL.revokeObjectURL(url);
            
            // Small delay to prevent browser blocking multiple downloads
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        this.showSuccess(`Export completed! ${response.screenshotCount || 0} screenshots downloaded.`);
      } else {
        throw new Error(response?.error || 'Export failed');
      }
    } catch (error) {
      console.error('Screenshot export failed:', error);
      this.showError('Screenshot export failed');
    } finally {
      this.hideLoading();
    }
  }

  showLoading(message) {
    const overlay = document.getElementById('loadingOverlay');
    const text = overlay.querySelector('.loading-text');
    text.textContent = message;
    overlay.style.display = 'flex';
  }

  hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  async captureManualScreenshot() {
    try {
      this.showLoading('Capturing screenshot...');

      const response = await chrome.runtime.sendMessage({
        type: 'capture-screenshot',
        tabId: this.currentTab.id
      });

      if (response && response.success && response.screenshot) {
        // Create download link for the screenshot
        const dataUrl = response.screenshot.dataUrl;
        const link = document.createElement('a');
        link.href = dataUrl;
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `fiori-manual-screenshot-${timestamp}.png`;
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showSuccess('Screenshot captured and downloaded!');
      } else {
        throw new Error(response?.error || 'Failed to capture screenshot');
      }
    } catch (error) {
      console.error('Manual screenshot failed:', error);
      this.showError('Failed to capture screenshot');
    } finally {
      this.hideLoading();
    }
  }

  showNotification(message, type) {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      z-index: 1001;
      max-width: 80%;
      text-align: center;
      ${type === 'success' 
        ? 'background: #4caf50; color: white;' 
        : 'background: #f44336; color: white;'
      }
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

}

// Initialize popup when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new FioriTestPopup();
  });
} else {
  new FioriTestPopup();
}