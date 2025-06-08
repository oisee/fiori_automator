// Settings page script

class SettingsManager {
  constructor() {
    this.settings = {};
    this.defaultSettings = {
      captureScreenshots: true,
      captureUI5Context: true,
      autoCorrelation: true,
      correlationWindow: 5,
      minConfidence: 70,
      debugMode: false,
      verboseLogging: false
    };
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadStorageInfo();
    this.setupEventListeners();
    this.updateUI();
  }

  setupEventListeners() {
    // Back button
    document.getElementById('backBtn').addEventListener('click', () => {
      window.close();
    });

    // Save button
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveSettings();
    });

    // Reset button
    document.getElementById('resetBtn').addEventListener('click', () => {
      if (confirm('Reset all settings to defaults?')) {
        this.resetSettings();
      }
    });

    // Clear storage button
    document.getElementById('clearStorageBtn').addEventListener('click', () => {
      if (confirm('This will delete all recorded sessions and settings. Are you sure?')) {
        this.clearAllData();
      }
    });

    // Export settings button
    document.getElementById('exportSettingsBtn').addEventListener('click', () => {
      this.exportSettings();
    });

    // Debug mode toggle
    document.getElementById('debugMode').addEventListener('change', (e) => {
      if (e.target.checked) {
        chrome.storage.local.set({ 'debug-mode': true });
      } else {
        chrome.storage.local.remove('debug-mode');
      }
    });
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['extensionSettings']);
      this.settings = { ...this.defaultSettings, ...(result.extensionSettings || {}) };
      console.log('Loaded settings:', this.settings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = { ...this.defaultSettings };
    }
  }

  async loadStorageInfo() {
    try {
      const result = await chrome.storage.local.get(null);
      const sessions = result.fioriSessions || {};
      const sessionCount = Object.keys(sessions).length;
      
      // Estimate storage size
      const dataStr = JSON.stringify(result);
      const sizeInBytes = new Blob([dataStr]).size;
      const sizeInKB = Math.round(sizeInBytes / 1024);
      
      document.getElementById('sessionCount').textContent = sessionCount;
      document.getElementById('storageUsed').textContent = `${sizeInKB} KB`;
    } catch (error) {
      console.error('Failed to load storage info:', error);
    }
  }

  updateUI() {
    // Update checkboxes
    document.getElementById('captureScreenshots').checked = this.settings.captureScreenshots;
    document.getElementById('captureUI5Context').checked = this.settings.captureUI5Context;
    document.getElementById('autoCorrelation').checked = this.settings.autoCorrelation;
    document.getElementById('debugMode').checked = this.settings.debugMode;
    document.getElementById('verboseLogging').checked = this.settings.verboseLogging;
    
    // Update number inputs
    document.getElementById('correlationWindow').value = this.settings.correlationWindow;
    document.getElementById('minConfidence').value = this.settings.minConfidence;
  }

  async saveSettings() {
    try {
      // Gather settings from UI
      this.settings = {
        captureScreenshots: document.getElementById('captureScreenshots').checked,
        captureUI5Context: document.getElementById('captureUI5Context').checked,
        autoCorrelation: document.getElementById('autoCorrelation').checked,
        correlationWindow: parseInt(document.getElementById('correlationWindow').value),
        minConfidence: parseInt(document.getElementById('minConfidence').value),
        debugMode: document.getElementById('debugMode').checked,
        verboseLogging: document.getElementById('verboseLogging').checked
      };
      
      // Save to storage
      await chrome.storage.local.set({ extensionSettings: this.settings });
      
      this.showNotification('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showNotification('Failed to save settings', 'error');
    }
  }

  async resetSettings() {
    try {
      this.settings = { ...this.defaultSettings };
      await chrome.storage.local.set({ extensionSettings: this.settings });
      this.updateUI();
      this.showNotification('Settings reset to defaults');
    } catch (error) {
      console.error('Failed to reset settings:', error);
      this.showNotification('Failed to reset settings', 'error');
    }
  }

  async clearAllData() {
    try {
      await chrome.storage.local.clear();
      
      // Re-save default settings
      await chrome.storage.local.set({ extensionSettings: this.defaultSettings });
      
      await this.loadStorageInfo();
      this.showNotification('All data cleared successfully');
    } catch (error) {
      console.error('Failed to clear data:', error);
      this.showNotification('Failed to clear data', 'error');
    }
  }

  async exportSettings() {
    try {
      const exportData = {
        settings: this.settings,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
      };
      
      const dataStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiori-test-settings-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      
      this.showNotification('Settings exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      this.showNotification('Export failed', 'error');
    }
  }

  showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SettingsManager();
  });
} else {
  new SettingsManager();
}