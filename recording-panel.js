// Recording panel script (for standalone window)

class RecordingPanel {
  constructor() {
    this.currentTab = null;
    this.isRecording = false;
    this.sessionData = null;
    this.recordingTimer = null;
    this.refreshTimer = null;
    this.startTime = null;
    
    this.init();
  }

  async init() {
    await this.getCurrentTab();
    this.setupEventListeners();
    this.startAutoRefresh();
    await this.checkRecordingState();
    this.updateUI();
  }

  async getCurrentTab() {
    // Find the active tab in the main window (not this popup window)
    const tabs = await chrome.tabs.query({ active: true, currentWindow: false });
    if (tabs.length > 0) {
      this.currentTab = tabs[0];
    } else {
      // Fallback: get any tab that's not this extension
      const allTabs = await chrome.tabs.query({});
      this.currentTab = allTabs.find(tab => !tab.url.startsWith('chrome-extension://'));
    }
    console.log('Recording panel monitoring tab:', this.currentTab?.id);
  }

  setupEventListeners() {
    // Window controls
    document.getElementById('pinButton').addEventListener('click', () => this.toggleAlwaysOnTop());
    document.getElementById('refreshButton').addEventListener('click', () => this.refreshData());

    // Recording controls
    document.getElementById('recordBtn').addEventListener('click', () => this.startRecording());
    document.getElementById('pauseBtn').addEventListener('click', () => this.pauseRecording());
    document.getElementById('stopBtn').addEventListener('click', () => this.stopRecording());

    // Other controls
    document.getElementById('exportBtn').addEventListener('click', () => this.exportSession());
    document.getElementById('sessionsBtn').addEventListener('click', () => this.openSessions());

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });

    // Prevent window from closing accidentally
    window.addEventListener('beforeunload', (e) => {
      if (this.isRecording) {
        e.preventDefault();
        e.returnValue = 'Recording is in progress. Are you sure you want to close?';
      }
    });
  }

  toggleAlwaysOnTop() {
    document.body.classList.toggle('always-on-top');
    const pinButton = document.getElementById('pinButton');
    if (document.body.classList.contains('always-on-top')) {
      pinButton.textContent = '📍';
      pinButton.title = 'Unpin window';
    } else {
      pinButton.textContent = '📌';
      pinButton.title = 'Keep on top';
    }
  }

  startAutoRefresh() {
    // Refresh session data every 2 seconds
    this.refreshTimer = setInterval(() => {
      this.refreshData();
    }, 2000);
  }

  async refreshData() {
    if (!this.currentTab) {
      await this.getCurrentTab();
    }
    
    await this.checkRecordingState();
  }

  async checkRecordingState() {
    try {
      if (!this.currentTab) return;

      const response = await chrome.runtime.sendMessage({
        type: 'get-session-data',
        tabId: this.currentTab.id
      });

      if (response && response.success && response.data && response.data.isRecording) {
        if (!this.isRecording) {
          // Just started recording
          this.isRecording = true;
          this.sessionData = response.data;
          this.startTime = this.sessionData.startTime;
          
          this.updateRecordingState('recording');
          this.updateSessionInfo(this.sessionData.metadata?.sessionName || 'Recording Session');
          this.startRecordingTimer();
        } else {
          // Update existing recording
          this.sessionData = response.data;
          this.updateSessionStats(response.data);
          this.updateEventsList(response.data.events || []);
        }
      } else if (this.isRecording) {
        // Recording stopped
        this.isRecording = false;
        this.updateRecordingState('stopped');
        if (this.recordingTimer) {
          clearInterval(this.recordingTimer);
          this.recordingTimer = null;
        }
      }
    } catch (error) {
      console.error('Failed to check recording state:', error);
    }
  }

  handleMessage(message, sender, sendResponse) {
    if (message.tabId === this.currentTab?.id) {
      switch (message.type) {
        case 'session-updated':
          this.sessionData = message.data;
          this.updateSessionStats(message.data);
          this.updateEventsList(message.data.events || []);
          break;
      }
    }
  }

  async startRecording() {
    try {
      console.log('Starting recording from panel...');
      
      const sessionName = document.getElementById('sessionNameInput').value || 
                         `Panel Session ${new Date().toLocaleString()}`;
      
      const config = {
        sessionName,
        captureScreenshots: true,
        captureUI5Context: true,
        autoCorrelation: true,
        applicationUrl: this.currentTab.url,
        timestamp: Date.now()
      };

      const response = await chrome.runtime.sendMessage({
        type: 'start-recording',
        data: config,
        tabId: this.currentTab.id
      });

      if (response && response.success) {
        this.isRecording = true;
        this.startTime = Date.now();
        this.sessionData = { ...config, events: [], networkRequests: [] };
        
        this.startRecordingTimer();
        this.updateRecordingState('recording');
        this.updateSessionInfo(sessionName);
        
        // Notify content script
        try {
          await chrome.tabs.sendMessage(this.currentTab.id, {
            type: 'start-recording',
            data: config
          });
        } catch (contentError) {
          console.warn('Could not notify content script:', contentError);
        }
        
        this.showNotification('Recording started!');
      } else {
        throw new Error(response?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.showNotification(`Failed to start recording: ${error.message}`, 'error');
    }
  }

  async stopRecording() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'stop-recording',
        tabId: this.currentTab.id
      });

      if (response && response.success) {
        this.isRecording = false;
        
        if (this.recordingTimer) {
          clearInterval(this.recordingTimer);
          this.recordingTimer = null;
        }

        this.updateRecordingState('stopped');
        this.showNotification('Recording stopped successfully!');
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      this.showNotification('Failed to stop recording', 'error');
    }
  }

  pauseRecording() {
    // Toggle pause state
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
      this.updateRecordingState('paused');
    } else {
      this.startRecordingTimer();
      this.updateRecordingState('recording');
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
        document.title = '🔴 Recording - Fiori Panel';
        break;

      case 'paused':
        statusDot.classList.add('paused');
        statusText.textContent = 'Paused';
        pauseBtn.innerHTML = '<span class="btn-icon">▶️</span>Resume';
        document.title = '⏸️ Paused - Fiori Panel';
        break;

      case 'stopped':
        statusText.textContent = 'Ready';
        recordBtn.style.display = 'flex';
        pauseBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        sessionInfo.style.display = 'none';
        sessionConfig.style.display = 'block';
        pauseBtn.innerHTML = '<span class="btn-icon">⏸️</span>Pause';
        document.title = 'Fiori Recording Panel';
        break;
    }
  }

  updateSessionInfo(sessionName) {
    document.getElementById('sessionName').textContent = sessionName;
  }

  updateSessionStats(stats) {
    document.getElementById('actionCount').textContent = stats.events?.length || 0;
    document.getElementById('odataCount').textContent = stats.networkRequests?.length || 0;
    
    if (stats.events && stats.events.length > 0) {
      const lastEvent = stats.events[stats.events.length - 1];
      const lastAction = document.getElementById('lastAction');
      const actionText = lastAction.querySelector('.action-text');
      
      actionText.textContent = this.formatEventDescription(lastEvent);
    }
  }

  updateEventsList(events) {
    const eventsList = document.getElementById('eventsList');
    
    if (!events || events.length === 0) {
      eventsList.innerHTML = '<div class="no-events">No events captured yet</div>';
      return;
    }

    // Show last 10 events
    const recentEvents = events.slice(-10).reverse();
    
    eventsList.innerHTML = recentEvents.map(event => `
      <div class="event-item" style="padding: 8px; border: 1px solid #eee; margin: 4px 0; border-radius: 4px; font-size: 12px;">
        <div style="font-weight: bold; color: #0070f3;">${event.type}</div>
        <div style="color: #666; margin-top: 2px;">${this.formatEventDescription(event)}</div>
        <div style="color: #999; font-size: 10px;">${new Date(event.timestamp).toLocaleTimeString()}</div>
      </div>
    `).join('');
  }

  formatEventDescription(event) {
    switch (event.type) {
      case 'click':
        return `Clicked ${event.element?.tagName?.toLowerCase() || 'element'}`;
      case 'input':
        return `Input in ${event.element?.tagName?.toLowerCase() || 'field'}`;
      case 'submit':
        return 'Form submitted';
      case 'keyboard':
        return `Key pressed: ${event.key}`;
      default:
        return `${event.type} event`;
    }
  }

  async exportSession() {
    try {
      if (!this.sessionData) {
        this.showNotification('No session data to export', 'error');
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
        a.download = `fiori-session-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('Session exported successfully');
      }
    } catch (error) {
      console.error('Export failed:', error);
      this.showNotification('Export failed', 'error');
    }
  }

  openSessions() {
    chrome.tabs.create({ url: chrome.runtime.getURL('sessions.html') });
  }

  updateUI() {
    this.updateRecordingState('stopped');
  }

  showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 1001;
      ${type === 'success' 
        ? 'background: #4caf50; color: white;' 
        : 'background: #f44336; color: white;'
      }
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  // Cleanup when window closes
  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.recordingPanel = new RecordingPanel();
  });
} else {
  window.recordingPanel = new RecordingPanel();
}

// Cleanup on window close
window.addEventListener('beforeunload', () => {
  if (window.recordingPanel) {
    window.recordingPanel.destroy();
  }
});