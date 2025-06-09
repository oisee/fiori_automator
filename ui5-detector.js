// UI5 Detection Script - CSP-compliant external script
// Runs in page context to access UI5 core without CSP violations

(function() {
  'use strict';
  
  try {
    const detection = {
      isSAPUI5: false,
      isFiori: false,
      hasCore: false,
      loadedLibraries: [],
      theme: null,
      locale: null,
      version: null,
      viewIdPrefixDetected: false,
      fioriClassDetected: false,
      uiAreas: [],
      components: [],
      detectionMethod: 'external-script',
      appSemantics: null
    };

    // Check for SAPUI5/OpenUI5
    if (window.sap?.ui?.getCore) {
      const core = window.sap.ui.getCore();
      detection.isSAPUI5 = true;
      detection.hasCore = true;
      detection.version = window.sap.ui.version;

      try {
        detection.loadedLibraries = Object.keys(core.getLoadedLibraries?.() || {});
        detection.theme = core.getConfiguration?.().getTheme?.();
        detection.locale = core.getConfiguration?.().getLocale?.().toString();
        detection.uiAreas = core.getUIAreas?.().map(area => ({
          id: area.getId?.(),
          content: area.getContent?.().length || 0
        })) || [];

        // Get component information
        const componentRegistry = core.getComponentRegistry?.();
        if (componentRegistry) {
          detection.components = Object.keys(componentRegistry).map(id => {
            const component = componentRegistry[id];
            return {
              id: id,
              manifest: component.getManifest?.()?.['sap.app']?.id,
              type: component.getMetadata?.()?.getName()
            };
          });
        }

        // Detect app semantics for better file naming
        detection.appSemantics = detectAppSemantics();
        
      } catch (e) {
        console.warn('Error getting UI5 core details:', e);
      }

      // Heuristic: Fiori app detection by ID patterns
      detection.viewIdPrefixDetected = !!document.querySelector('[id^="application-"][id*="--"]');
      
      // Heuristic: Fiori shell/page detection
      detection.fioriClassDetected = !!(
        document.querySelector('.sapMPage, .sapUshellShell, .sapUshellTileContainer') ||
        document.querySelector('[class*="sapMObject"]') ||
        document.querySelector('[class*="sapUshell"]')
      );

      detection.isFiori = detection.viewIdPrefixDetected || detection.fioriClassDetected;
    }

    // Dispatch result to content script
    window.dispatchEvent(new CustomEvent('SAPUI5DetectionResult', { 
      detail: detection 
    }));
    
  } catch (err) {
    console.warn('SAPUI5 detection error:', err);
    window.dispatchEvent(new CustomEvent('SAPUI5DetectionResult', { 
      detail: { 
        isSAPUI5: false, 
        error: err.message,
        detectionMethod: 'external-script-error'
      } 
    }));
  }

  function detectAppSemantics() {
    try {
      // Try to detect app type from various sources
      const semantics = {
        appType: 'unknown',
        businessObject: null,
        scenario: null
      };

      // Method 1: From URL hash
      const hash = window.location.hash;
      if (hash.includes('#')) {
        const hashPart = hash.split('#')[1];
        if (hashPart.includes('ComplianceAlert-manage')) {
          semantics.appType = 'manage-alerts';
          semantics.businessObject = 'ComplianceAlert';
          semantics.scenario = 'manage';
        } else if (hashPart.includes('DetectionMethod-manage')) {
          semantics.appType = 'manage-detection-methods';
          semantics.businessObject = 'DetectionMethod';
          semantics.scenario = 'manage';
        } else if (hashPart.includes('Shell-home')) {
          semantics.appType = 'fiori-launchpad';
          semantics.scenario = 'home';
        }
      }

      // Method 2: From page title
      const title = document.title;
      if (title.includes('Manage Alerts')) {
        semantics.appType = 'manage-alerts';
        semantics.businessObject = 'Alert';
      } else if (title.includes('Launchpad')) {
        semantics.appType = 'fiori-launchpad';
      }

      // Method 3: From component manifest
      if (window.sap?.ui?.getCore) {
        const core = window.sap.ui.getCore();
        const componentRegistry = core.getComponentRegistry?.();
        if (componentRegistry) {
          for (let id in componentRegistry) {
            const component = componentRegistry[id];
            const manifest = component.getManifest?.();
            if (manifest?.['sap.app']?.id) {
              const appId = manifest['sap.app'].id;
              if (appId.includes('fraud.alertworklist')) {
                semantics.appType = 'manage-alerts';
                semantics.businessObject = 'Alert';
                semantics.scenario = 'worklist';
              }
            }
          }
        }
      }

      // Method 4: From DOM analysis
      if (document.querySelector('[id*="alertHeaderAssignButton"]')) {
        semantics.appType = 'manage-alerts';
        semantics.scenario = 'detail';
      } else if (document.querySelector('.sapUshellTileContainer')) {
        semantics.appType = 'fiori-launchpad';
        semantics.scenario = 'home';
      }

      return semantics;
    } catch (error) {
      console.warn('Error detecting app semantics:', error);
      return { appType: 'unknown', businessObject: null, scenario: null };
    }
  }

})();