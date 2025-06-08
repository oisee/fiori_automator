// Popup script for Fiori Test Automation System
// Handles UI interactions and communication with background/content scripts

class FioriTestPopup {
  constructor() {
    this.currentTab = null;
    this.isRecording = false;
    this.sessionData = null;
    this.recordingTimer = null;
    this.startTime = null;
    
    this.init();
  }

  async init() {
    await this.getCurrentTab();
    this.setupEventListeners();
    await this.checkRecordingState();
    this.detectApplication();
    this.loadRecentSessions();
    this.updateUI();
  }

  async checkRecordingState() {
    try {
      console.log('Checking recording state for tab:', this.currentTab.id);
      
      // Check if we have an active recording session for this tab
      const response = await chrome.runtime.sendMessage({
        type: 'get-session-data',
        tabId: this.currentTab.id
      });

      console.log('Recording state response:', response);

      if (response && response.success && response.data && response.data.isRecording) {
        // Resume the recording state in popup
        this.isRecording = true;
        this.sessionData = response.data;
        this.startTime = this.sessionData.startTime;
        
        console.log('Resuming recording state:', {
          sessionId: this.sessionData.sessionId,
          startTime: this.startTime,
          events: this.sessionData.events?.length || 0
        });
        
        // Update UI to show recording state
        this.updateRecordingState('recording');
        this.updateSessionInfo(this.sessionData.metadata?.sessionName || 'Recording Session');
        
        // Restart timer
        this.startRecordingTimer();
        
        // Update session stats if we have events
        if (this.sessionData.events && this.sessionData.events.length > 0) {
          this.updateSessionStats(this.sessionData);
        }
        
        console.log('✅ Resumed recording state from background');
      } else {
        console.log('No active recording found for this tab');
      }
    } catch (error) {
      console.error('❌ Failed to check recording state:', error);
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

    // Listen for background script messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'update-recording-state':
        if (message.tabId === this.currentTab?.id) {
          this.updateRecordingState(message.state);
        }
        break;

      case 'session-updated':
        if (message.tabId === this.currentTab?.id) {
          console.log('Session updated:', message.data);
          this.sessionData = message.data;
          this.updateSessionStats(message.data);
        }
        break;

      case 'event-captured':
        if (message.tabId === this.currentTab?.id && this.isRecording) {
          console.log('Event captured, updating stats');
          // Refresh session data to get latest stats
          this.refreshSessionData();
        }
        break;
    }
  }

  async refreshSessionData() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'get-session-data',
        tabId: this.currentTab.id
      });

      if (response && response.success && response.data) {
        this.sessionData = response.data;
        this.updateSessionStats(response.data);
      }
    } catch (error) {
      console.error('Failed to refresh session data:', error);
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
        this.isRecording = true;
        this.startTime = Date.now();
        this.sessionData = { ...config, events: [], networkRequests: [] };
        
        // Start UI timer
        this.startRecordingTimer();
        
        // Update UI
        this.updateRecordingState('recording');
        this.updateSessionInfo(sessionName);
        
        // Notify content script
        try {
          await chrome.tabs.sendMessage(this.currentTab.id, {
            type: 'start-recording',
            data: config
          });
          console.log('Content script notified');
        } catch (contentError) {
          console.warn('Could not notify content script:', contentError);
          // This is okay - content script might not be injected yet
        }
        
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
      // Toggle pause state
      if (this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = null;
        this.updateRecordingState('paused');
      } else {
        this.startRecordingTimer();
        this.updateRecordingState('recording');
      }
    } catch (error) {
      console.error('Failed to pause recording:', error);
    }
  }

  async stopRecording() {
    try {
      this.showLoading('Stopping recording...');

      // Stop timer
      if (this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = null;
      }

      // Send stop message to background script
      const response = await chrome.runtime.sendMessage({
        type: 'stop-recording'
      });

      if (response.success) {
        this.isRecording = false;
        
        // Notify content script
        await chrome.tabs.sendMessage(this.currentTab.id, {
          type: 'stop-recording'
        });

        // Update UI
        this.updateRecordingState('stopped');
        
        // Show completion message
        this.showSuccess('Recording completed successfully!');
        
        // Refresh sessions list
        setTimeout(() => this.loadRecentSessions(), 1000);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      this.showError('Failed to stop recording');
    } finally {
      this.hideLoading();
    }
  }

  startRecordingTimer() {
    this.recordingTimer = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      
      document.getElementById('duration').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
  }

  updateRecordingState(state) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const recordBtn = document.getElementById('recordBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const sessionInfo = document.getElementById('sessionInfo');
    const sessionConfig = document.getElementById('sessionConfig');

    // Reset classes
    statusDot.className = 'status-dot';
    
    switch (state) {
      case 'recording':
        statusDot.classList.add('recording');
        statusText.textContent = 'Recording';
        recordBtn.style.display = 'none';
        pauseBtn.style.display = 'flex';
        stopBtn.style.display = 'flex';
        sessionInfo.style.display = 'block';
        sessionConfig.style.display = 'none';
        break;

      case 'paused':
        statusDot.classList.add('paused');
        statusText.textContent = 'Paused';
        pauseBtn.innerHTML = '<span class="btn-icon">▶️</span>Resume';
        break;

      case 'stopped':
        statusText.textContent = 'Ready';
        recordBtn.style.display = 'flex';
        pauseBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        sessionInfo.style.display = 'none';
        sessionConfig.style.display = 'block';
        
        // Reset pause button text
        pauseBtn.innerHTML = '<span class="btn-icon">⏸️</span>Pause';
        break;

      default:
        statusText.textContent = 'Ready';
        break;
    }
  }

  updateSessionInfo(sessionName) {
    document.getElementById('sessionName').textContent = sessionName;
  }

  updateSessionStats(stats) {
    document.getElementById('actionCount').textContent = stats.events?.length || 0;
    document.getElementById('odataCount').textContent = stats.networkRequests?.length || 0;
    
    if (stats.lastEvent) {
      const lastAction = document.getElementById('lastAction');
      const actionText = lastAction.querySelector('.action-text');
      const confidence = document.getElementById('confidence');
      
      actionText.textContent = this.formatEventDescription(stats.lastEvent);
      
      if (stats.lastEvent.correlatedRequests?.length > 0) {
        const avgConfidence = stats.lastEvent.correlatedRequests.reduce(
          (sum, req) => sum + req.correlation.confidence, 0
        ) / stats.lastEvent.correlatedRequests.length;
        
        confidence.textContent = `${Math.round(avgConfidence)}%`;
        confidence.className = 'confidence ' + this.getConfidenceClass(avgConfidence);
        confidence.style.display = 'inline';
      } else {
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
      // Try to get UI5 context from content script
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        type: 'get-ui5-context'
      });

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

  async loadRecentSessions() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'get-sessions'
      });

      const sessionsList = document.getElementById('sessionsList');
      const noSessions = document.getElementById('noSessions');

      if (response.success && response.data) {
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
    // This would open a detailed session viewer
    console.log('Opening session:', session);
    // For now, just show an alert
    alert(`Session: ${session.metadata?.sessionName || 'Unnamed'}\nActions: ${session.events?.length || 0}\nDuration: ${session.duration ? Math.round(session.duration / 1000) + 's' : 'Unknown'}`);
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
      if (!this.sessionData) {
        this.showError('No session data to export');
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'get-session-data',
        tabId: this.currentTab.id
      });

      if (response.success && response.data) {
        const sessionJson = JSON.stringify(response.data, null, 2);
        const blob = new Blob([sessionJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `fiori-session-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showSuccess('Session exported successfully');
      }
    } catch (error) {
      console.error('Export failed:', error);
      this.showError('Export failed');
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

  updateUI() {
    // Initial UI state
    this.updateRecordingState('stopped');
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