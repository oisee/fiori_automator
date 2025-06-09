// Injected script for accessing page context
// This script runs in the page context and can access page variables directly

(function() {
  'use strict';
  
  // Check if already injected
  if (window.fioriInjectedScript) {
    return;
  }
  
  window.fioriInjectedScript = true;
  
  console.log('[Fiori Injected] Script loaded in page context');
  
  // Enhanced UI5 detection with page context access
  function detectUI5Context() {
    const detection = {
      timestamp: Date.now(),
      isSAPUI5: false,
      version: null,
      libraries: [],
      theme: null,
      locale: null,
      fioriAppId: null,
      fioriAppType: null,
      confidence: 0,
      detectionMethod: 'injected-script'
    };
    
    // Check for SAP UI5
    if (window.sap && window.sap.ui) {
      detection.isSAPUI5 = true;
      detection.version = window.sap.ui.version;
      
      try {
        const core = window.sap.ui.getCore();
        if (core) {
          const config = core.getConfiguration();
          detection.theme = config?.getTheme();
          detection.locale = config?.getLocale()?.toString();
          detection.libraries = Object.keys(core.getLoadedLibraries() || {});
          
          // Try to get Fiori app information
          const apps = core.getUIAreas();
          if (apps && apps.length > 0) {
            // Look for Fiori app patterns
            for (let app of apps) {
              const appElement = app.getDomRef();
              if (appElement && appElement.id) {
                const appId = appElement.id;
                if (appId.includes('application-') && appId.includes('component')) {
                  detection.fioriAppId = appId;
                  
                  // Extract app type from URL or component name
                  const hash = window.location.hash;
                  if (hash.includes('#')) {
                    const hashParts = hash.split('-');
                    if (hashParts.length > 1) {
                      detection.fioriAppType = hashParts[1];
                    }
                  }
                  break;
                }
              }
            }
          }
        }
        
        detection.confidence = 0.9; // High confidence for full UI5 detection
      } catch (error) {
        console.warn('[Fiori Injected] Error accessing UI5 core:', error);
        detection.confidence = 0.6; // Medium confidence if UI5 exists but core access fails
      }
    }
    
    // Fallback: Check for UI5 indicators in global scope
    if (!detection.isSAPUI5) {
      const indicators = {
        hasJQuery: !!window.jQuery,
        hasUI5Global: !!window.sap,
        hasBootstrap: !!document.querySelector('#sap-ui-bootstrap'),
        hasResourcesScript: !!document.querySelector('script[src*="resources/sap-ui"]'),
        hasSapClasses: !!document.querySelector('[class*="sap"]'),
        hasFioriShell: !!document.querySelector('.sapUshellShell')
      };
      
      const positiveIndicators = Object.values(indicators).filter(Boolean).length;
      detection.confidence = positiveIndicators / Object.keys(indicators).length;
      
      if (detection.confidence > 0.3) {
        detection.isSAPUI5 = true;
        detection.detectionMethod = 'heuristic-injected';
      }
    }
    
    return detection;
  }
  
  // Run detection immediately
  const detection = detectUI5Context();
  console.log('[Fiori Injected] UI5 detection result:', detection);
  
  // Send detection result to content script
  window.dispatchEvent(new CustomEvent('SAPUI5DetectionResult', {
    detail: detection
  }));
  
  // Re-run detection after DOM changes (for dynamic loading)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        const laterDetection = detectUI5Context();
        if (laterDetection.confidence > detection.confidence) {
          console.log('[Fiori Injected] Updated UI5 detection:', laterDetection);
          window.dispatchEvent(new CustomEvent('SAPUI5DetectionResult', {
            detail: laterDetection
          }));
        }
      }, 1000);
    });
  }
  
})();