// Sessions page script

class SessionsManager {
  constructor() {
    this.sessions = {};
    this.filteredSessions = [];
    this.selectedSession = null;
    this.init();
  }

  async init() {
    await this.loadSessions();
    this.setupEventListeners();
    this.renderSessions();
    this.checkForSelectedSession();
  }

  checkForSelectedSession() {
    // Check if a specific session was requested via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');
    
    if (sessionId && this.sessions[sessionId]) {
      // Auto-open the requested session
      this.showSessionDetails(this.sessions[sessionId]);
    }
  }

  setupEventListeners() {
    // Back button
    document.getElementById('backBtn').addEventListener('click', () => {
      window.close();
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.filterSessions(e.target.value);
    });

    // Export all
    document.getElementById('exportAllBtn').addEventListener('click', () => {
      this.exportAllSessions();
    });

    // Delete all
    document.getElementById('deleteAllBtn').addEventListener('click', () => {
      if (confirm('Are you sure you want to delete all sessions? This cannot be undone.')) {
        this.deleteAllSessions();
      }
    });

    // Modal controls
    document.getElementById('modalClose').addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('modalExportBtn').addEventListener('click', () => {
      this.exportSession(this.selectedSession);
    });

    document.getElementById('modalExportMarkdownBtn').addEventListener('click', () => {
      this.exportSessionAsMarkdown(this.selectedSession);
    });

    document.getElementById('modalExportZipBtn').addEventListener('click', () => {
      this.exportSessionAsZip(this.selectedSession);
    });

    document.getElementById('modalReplayBtn').addEventListener('click', () => {
      this.replaySession(this.selectedSession);
    });

    document.getElementById('modalDeleteBtn').addEventListener('click', () => {
      if (confirm('Are you sure you want to delete this session?')) {
        this.deleteSession(this.selectedSession);
        this.closeModal();
      }
    });

    // Close modal on background click
    document.getElementById('sessionModal').addEventListener('click', (e) => {
      if (e.target.id === 'sessionModal') {
        this.closeModal();
      }
    });
  }

  async loadSessions() {
    try {
      const result = await chrome.storage.local.get(['fioriSessions']);
      this.sessions = result.fioriSessions || {};
      this.filteredSessions = Object.values(this.sessions);
      console.log('Loaded sessions:', this.sessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      this.sessions = {};
      this.filteredSessions = [];
      
      // Show error to user
      const container = document.getElementById('sessionsContainer');
      if (container) {
        container.innerHTML = '<div class="error-message">Failed to load sessions. Please refresh the page.</div>';
      }
    }
  }

  renderSessions() {
    const container = document.getElementById('sessionsContainer');
    const noSessions = document.getElementById('noSessions');

    if (this.filteredSessions.length === 0) {
      container.innerHTML = '';
      noSessions.style.display = 'block';
      return;
    }

    noSessions.style.display = 'none';
    
    // Sort by start time (newest first)
    const sortedSessions = this.filteredSessions.sort((a, b) => 
      (b.startTime || 0) - (a.startTime || 0)
    );

    container.innerHTML = sortedSessions.map(session => 
      this.createSessionCard(session)
    ).join('');

    // Add click listeners
    container.querySelectorAll('.session-card').forEach((card, index) => {
      card.addEventListener('click', () => {
        this.showSessionDetails(sortedSessions[index]);
      });
    });
  }

  createSessionCard(session) {
    const startDate = new Date(session.startTime);
    const duration = session.duration ? Math.round(session.duration / 1000) : 0;
    const eventCount = session.events?.length || 0;
    const requestCount = session.networkRequests?.length || 0;

    return `
      <div class="session-card" data-session-id="${session.sessionId}">
        <div class="session-header">
          <div>
            <div class="session-title">${session.metadata?.sessionName || 'Unnamed Session'}</div>
            <div class="session-date">${startDate.toLocaleString()}</div>
          </div>
        </div>
        
        <div class="session-stats">
          <div class="stat-item">
            <div class="stat-value">${eventCount}</div>
            <div class="stat-label">Events</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${requestCount}</div>
            <div class="stat-label">Requests</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${duration}s</div>
            <div class="stat-label">Duration</div>
          </div>
        </div>
        
        <div class="session-url">${session.metadata?.applicationUrl || 'Unknown URL'}</div>
      </div>
    `;
  }

  filterSessions(searchTerm) {
    const term = searchTerm.toLowerCase();
    
    if (!term) {
      this.filteredSessions = Object.values(this.sessions);
    } else {
      this.filteredSessions = Object.values(this.sessions).filter(session => {
        const name = (session.metadata?.sessionName || '').toLowerCase();
        const url = (session.metadata?.applicationUrl || '').toLowerCase();
        return name.includes(term) || url.includes(term);
      });
    }
    
    this.renderSessions();
  }

  showSessionDetails(session) {
    this.selectedSession = session;
    
    const modal = document.getElementById('sessionModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    if (!modal || !modalTitle || !modalBody) {
      console.error('Modal elements not found');
      return;
    }
    
    modalTitle.textContent = session.metadata?.sessionName || 'Session Details';
    
    const startDate = new Date(session.startTime);
    const endDate = session.endTime ? new Date(session.endTime) : null;
    const duration = session.duration ? Math.round(session.duration / 1000) : 0;
    
    try {
      modalBody.innerHTML = `
        <div class="session-details">
          <h3>Session Information</h3>
          <p><strong>Session ID:</strong> ${session.sessionId}</p>
          <p><strong>URL:</strong> ${session.metadata?.applicationUrl || 'Unknown'}</p>
          <p><strong>Started:</strong> ${startDate.toLocaleString()}</p>
          ${endDate ? `<p><strong>Ended:</strong> ${endDate.toLocaleString()}</p>` : ''}
          <p><strong>Duration:</strong> ${duration} seconds</p>
          <p><strong>Total Events:</strong> ${session.events?.length || 0}</p>
          <p><strong>Network Requests:</strong> ${session.networkRequests?.length || 0}</p>
          
          <div class="event-list">
            <h3>Events Timeline</h3>
            ${this.renderEventList(session.events || [])}
          </div>
        </div>
      `;
      
      modal.style.display = 'flex';
    } catch (error) {
      console.error('Error displaying session details:', error);
      modalBody.innerHTML = '<p>Error loading session details</p>';
      modal.style.display = 'flex';
    }
  }

  renderEventList(events) {
    if (events.length === 0) {
      return '<p>No events recorded</p>';
    }
    
    return events.slice(0, 50).map(event => `
      <div class="event-item">
        <div class="event-type">${event.type}</div>
        <div class="event-details">
          ${this.formatEventDetails(event)}
        </div>
      </div>
    `).join('') + (events.length > 50 ? '<p>...and ' + (events.length - 50) + ' more events</p>' : '');
  }

  formatEventDetails(event) {
    let details = [];
    
    if (event.element) {
      details.push(`Element: ${event.element.tagName}${event.element.id ? '#' + event.element.id : ''}`);
    }
    
    if (event.coordinates) {
      details.push(`Position: (${event.coordinates.x}, ${event.coordinates.y})`);
    }
    
    if (event.value) {
      details.push(`Value: ${event.value}`);
    }
    
    // Show coalescing information for input events
    if (event.isCoalesced) {
      details.push(`📝 Coalesced Input: ${event.editCount} edits over ${Math.round(event.duration / 1000)}s`);
      if (event.initialValue && event.finalValue && event.initialValue !== event.finalValue) {
        details.push(`   "${event.initialValue}" → "${event.finalValue}"`);
      }
      if (event.hadBackspace) {
        details.push(`   🔙 Used backspace`);
      }
      if (event.hadPause) {
        details.push(`   ⏸️ Had pause`);
      }
    }
    
    if (event.correlatedRequests && event.correlatedRequests.length > 0) {
      details.push(`Correlated OData: ${event.correlatedRequests.length} request(s)`);
    }
    
    return details.join('\n');
  }

  closeModal() {
    document.getElementById('sessionModal').style.display = 'none';
    this.selectedSession = null;
  }

  async exportSession(session) {
    try {
      const sessionData = JSON.stringify(session, null, 2);
      const blob = new Blob([sessionData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiori-session-${session.sessionId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      
      this.showNotification('Session exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      this.showNotification('Export failed', 'error');
    }
  }

  async exportSessionAsMarkdown(session) {
    try {
      this.showNotification('Generating markdown export...', 'info');
      
      const response = await chrome.runtime.sendMessage({
        type: 'export-session-markdown',
        sessionId: session.sessionId
      });

      if (response && response.success) {
        const markdownContent = response.zipData; // This is actually markdown content
        const blob = new Blob([markdownContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        // Use semantic filename from response or fallback
        a.download = response.filename || `fiori-session-${session.sessionId}-export.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        this.showNotification('Markdown export completed!');
      } else {
        throw new Error(response?.error || 'Export failed');
      }
    } catch (error) {
      console.error('Markdown export failed:', error);
      this.showNotification('Markdown export failed', 'error');
    }
  }

  async exportSessionAsZip(session) {
    try {
      this.showNotification('Creating ZIP export with screenshots...', 'info');
      
      const response = await chrome.runtime.sendMessage({
        type: 'export-session-zip',
        sessionId: session.sessionId
      });

      if (response && response.success) {
        // Create ZIP-like structure download
        const zipContent = response.zipData;
        const blob = new Blob([zipContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        // Use semantic filename from response or fallback
        a.download = response.filename || `fiori-session-${session.sessionId}-with-screenshots.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        this.showNotification(`ZIP export completed! ${response.screenshotCount || 0} screenshots included.`);
      } else {
        throw new Error(response?.error || 'Export failed');
      }
    } catch (error) {
      console.error('ZIP export failed:', error);
      this.showNotification('ZIP export failed', 'error');
    }
  }

  async exportAllSessions() {
    try {
      const allData = {
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        sessions: this.sessions
      };
      
      const dataStr = JSON.stringify(allData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiori-all-sessions-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      
      this.showNotification(`Exported ${Object.keys(this.sessions).length} sessions`);
    } catch (error) {
      console.error('Export all failed:', error);
      this.showNotification('Export failed', 'error');
    }
  }

  async deleteSession(session) {
    try {
      delete this.sessions[session.sessionId];
      await chrome.storage.local.set({ fioriSessions: this.sessions });
      
      this.filteredSessions = Object.values(this.sessions);
      this.renderSessions();
      
      this.showNotification('Session deleted');
    } catch (error) {
      console.error('Delete failed:', error);
      this.showNotification('Delete failed', 'error');
    }
  }

  async deleteAllSessions() {
    try {
      await chrome.storage.local.set({ fioriSessions: {} });
      this.sessions = {};
      this.filteredSessions = [];
      this.renderSessions();
      
      this.showNotification('All sessions deleted');
    } catch (error) {
      console.error('Delete all failed:', error);
      this.showNotification('Delete all failed', 'error');
    }
  }

  replaySession(session) {
    // Placeholder for replay functionality
    alert('Replay functionality will be implemented in a future version');
  }

  showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    
    let bgColor;
    switch(type) {
      case 'success':
        bgColor = '#4caf50';
        break;
      case 'error':
        bgColor = '#f44336';
        break;
      case 'info':
        bgColor = '#2196f3';
        break;
      default:
        bgColor = '#4caf50';
    }
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 1001;
      background: ${bgColor};
      color: white;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, type === 'info' ? 2000 : 3000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SessionsManager();
  });
} else {
  new SessionsManager();
}