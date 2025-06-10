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

    document.getElementById('modalExportAudioBtn').addEventListener('click', () => {
      this.exportSessionAsAudio(this.selectedSession);
    });

    document.getElementById('modalExportZipPackageBtn').addEventListener('click', () => {
      this.exportSessionAsZipPackage(this.selectedSession);
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
          <p><strong>Audio Recording:</strong> ${session.metadata?.audioRecording ? '🎤 Yes' : '❌ No'}</p>
          ${session.metadata?.fioriAppId ? `<p><strong>Fiori App ID:</strong> ${session.metadata.fioriAppId}</p>` : ''}
          ${session.metadata?.fioriAppsLibraryInfo ? `<p><strong>Apps Library:</strong> <a href="${session.metadata.fioriAppsLibraryInfo.apiUrl}" target="_blank">View Details</a></p>` : ''}
          ${session.metadata?.odataServiceCorrelations ? this.renderODataCorrelations(session.metadata.odataServiceCorrelations) : ''}
          
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

  renderODataCorrelations(correlations) {
    if (!correlations || correlations.length === 0) {
      return '';
    }
    
    return `
      <div class="odata-correlations">
        <h4>🔗 OData Service Analysis</h4>
        ${correlations.map(correlation => `
          <div class="correlation-item">
            <p><strong>Service:</strong> ${correlation.serviceName}</p>
            <p><strong>Namespace:</strong> ${correlation.namespace}</p>
            <p><strong>Business Context:</strong> ${correlation.businessContext}</p>
            ${correlation.estimatedAppMapping ? `<p><strong>Estimated App Category:</strong> ${correlation.estimatedAppMapping}</p>` : ''}
            ${correlation.potentialAppIds.length > 0 ? `<p><strong>Potential App IDs:</strong> ${correlation.potentialAppIds.join(', ')}</p>` : ''}
            <p><strong>Metadata:</strong> <a href="${correlation.metadataUrl}" target="_blank">View Service Metadata</a></p>
          </div>
        `).join('')}
      </div>
    `;
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
      this.showNotification('Exporting session with screenshots...', 'info');
      
      const response = await chrome.runtime.sendMessage({
        type: 'export-session-screenshots',
        sessionId: session.sessionId
      });

      if (response && response.success) {
        // Download session JSON first
        const sessionBlob = new Blob([response.sessionData], { type: 'application/json' });
        const sessionUrl = URL.createObjectURL(sessionBlob);
        
        const sessionLink = document.createElement('a');
        sessionLink.href = sessionUrl;
        sessionLink.download = response.filename || `fiori-session-${session.sessionId}.json`;
        document.body.appendChild(sessionLink);
        sessionLink.click();
        document.body.removeChild(sessionLink);
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
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            // Small delay to prevent browser blocking multiple downloads
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        this.showNotification(`Export completed! ${response.screenshotCount || 0} screenshots downloaded.`);
      } else {
        throw new Error(response?.error || 'Export failed');
      }
    } catch (error) {
      console.error('Screenshot export failed:', error);
      this.showNotification('Screenshot export failed', 'error');
    }
  }

  async exportSessionAsAudio(session) {
    try {
      this.showNotification('Exporting session audio...', 'info');
      
      const response = await chrome.runtime.sendMessage({
        type: 'export-session-audio',
        sessionId: session.sessionId
      });

      if (response && response.success) {
        if (!response.audioData) {
          this.showNotification('No audio data found in this session', 'warning');
          return;
        }

        // Reconstruct audio blob from chunks
        const audioChunks = response.audioData.audioData.chunks;
        const audioBlobs = [];
        
        for (const chunk of audioChunks) {
          // Convert base64 back to blob
          const byteCharacters = atob(chunk.data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          audioBlobs.push(byteArray);
        }

        // Create final audio blob
        const audioBlob = new Blob(audioBlobs, { type: 'audio/webm;codecs=opus' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Download audio file
        const link = document.createElement('a');
        link.href = audioUrl;
        link.download = response.audioData.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(audioUrl);
        
        const duration = Math.round((response.audioData.duration || 0) / 1000);
        this.showNotification(`Audio exported! Duration: ${duration}s, ${audioChunks.length} chunks.`);
      } else {
        throw new Error(response?.error || 'Audio export failed');
      }
    } catch (error) {
      console.error('Audio export failed:', error);
      this.showNotification('Audio export failed', 'error');
    }
  }

  async exportSessionAsZipPackage(session) {
    try {
      this.showNotification('Creating ZIP package with markdown and screenshots...', 'info');
      
      // Load the ZIP utility if not already loaded
      if (!window.SimpleZipCreator) {
        await this.loadZipUtility();
      }
      
      const response = await chrome.runtime.sendMessage({
        type: 'export-session-zip',
        sessionId: session.sessionId
      });

      if (response && response.success && response.zipData) {
        const zipData = response.zipData;
        
        // Create ZIP package
        const zip = new window.SimpleZipCreator();
        
        // Add markdown file
        zip.addFile(zipData.markdownFilename, zipData.markdownContent, true);
        
        // Add all screenshots
        for (const screenshot of zipData.screenshots) {
          zip.addFile(screenshot.filename, screenshot.dataUrl, false);
        }
        
        // Generate ZIP file
        const zipBytes = zip.generateZip();
        const zipBlob = new Blob([zipBytes], { type: 'application/zip' });
        const zipUrl = URL.createObjectURL(zipBlob);
        
        // Download ZIP file
        const link = document.createElement('a');
        link.href = zipUrl;
        link.download = `${zipData.baseFilename}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(zipUrl);
        
        this.showNotification(`ZIP package exported! Contains markdown + ${zipData.screenshots.length} screenshots.`);
      } else {
        throw new Error(response?.error || 'ZIP export failed');
      }
    } catch (error) {
      console.error('ZIP package export failed:', error);
      this.showNotification('ZIP package export failed', 'error');
    }
  }

  async loadZipUtility() {
    return new Promise((resolve, reject) => {
      if (window.SimpleZipCreator) {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('zip-utils.js');
      script.onload = () => {
        console.log('ZIP utility loaded successfully');
        resolve();
      };
      script.onerror = () => {
        console.error('Failed to load ZIP utility');
        reject(new Error('Failed to load ZIP utility'));
      };
      
      document.head.appendChild(script);
    });
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