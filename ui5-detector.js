// UI5 Detector Script - Enhanced SAPUI5 detection
// This script is injected into the page context for deeper UI5 analysis

(function() {
  'use strict';
  
  console.log('[UI5 Detector] Starting enhanced UI5 detection');
  
  function performEnhancedUI5Detection() {
    const result = {
      timestamp: Date.now(),
      isSAPUI5: false,
      version: null,
      buildInfo: null,
      libraries: [],
      loadedModules: [],
      theme: null,
      locale: null,
      bootPath: null,
      resourceRoots: {},
      components: [],
      views: [],
      models: [],
      confidence: 0,
      detectionMethods: [],
      errors: []
    };
    
    try {
      // Method 1: Direct SAP namespace detection
      if (window.sap && window.sap.ui) {
        result.isSAPUI5 = true;
        result.detectionMethods.push('sap-namespace');
        
        // Get version information
        if (window.sap.ui.version) {
          result.version = window.sap.ui.version;
        }
        
        // Get build information
        if (window.sap.ui.buildinfo) {
          result.buildInfo = window.sap.ui.buildinfo;
        }
        
        try {
          // Access UI5 Core
          const core = window.sap.ui.getCore();
          if (core) {
            result.detectionMethods.push('ui5-core-access');
            
            // Configuration
            const config = core.getConfiguration();
            if (config) {
              result.theme = config.getTheme();
              result.locale = config.getLocale()?.toString();
              result.bootPath = config.getBootstrapPath();
              result.resourceRoots = config.getResourceRoots();
            }
            
            // Loaded libraries
            const libraries = core.getLoadedLibraries();
            result.libraries = Object.keys(libraries || {});
            
            // UI Areas and Components
            const uiAreas = core.getUIAreas();
            result.components = [];
            result.views = [];
            
            if (uiAreas) {
              for (let area of uiAreas) {
                try {
                  const content = area.getContent();
                  if (content && content.length > 0) {
                    for (let item of content) {
                      if (item.getMetadata) {
                        const metadata = item.getMetadata();
                        const componentInfo = {
                          id: item.getId(),
                          type: metadata.getName(),
                          element: item.getDomRef()?.tagName
                        };
                        result.components.push(componentInfo);
                      }
                    }
                  }
                } catch (err) {
                  result.errors.push(`UI Area processing: ${err.message}`);
                }
              }
            }
            
            // Try to get loaded modules
            if (window.sap.ui.loader && window.sap.ui.loader._.getModuleState) {
              const modules = [];
              // This is internal API, so wrap in try-catch
              try {
                const moduleNames = Object.keys(window.sap.ui.loader._.mModules || {});
                result.loadedModules = moduleNames.slice(0, 50); // Limit to first 50
              } catch (err) {
                result.errors.push(`Module enumeration: ${err.message}`);
              }
            }
            
            result.confidence = 0.95; // Very high confidence
          }
        } catch (coreError) {
          result.errors.push(`Core access: ${coreError.message}`);
          result.confidence = 0.8; // High confidence but core access failed
        }
      }
      
      // Method 2: jQuery UI5 plugin detection
      if (window.jQuery && window.jQuery.sap) {
        result.detectionMethods.push('jquery-sap');
        if (!result.isSAPUI5) {
          result.isSAPUI5 = true;
          result.confidence = Math.max(result.confidence, 0.7);
        }
      }
      
      // Method 3: Bootstrap script detection
      const bootstrap = document.querySelector('#sap-ui-bootstrap');
      if (bootstrap) {
        result.detectionMethods.push('bootstrap-script');
        result.bootPath = bootstrap.src;
        
        // Extract configuration from bootstrap script
        const bootstrapConfig = {
          theme: bootstrap.getAttribute('data-sap-ui-theme'),
          libs: bootstrap.getAttribute('data-sap-ui-libs'),
          resourceroots: bootstrap.getAttribute('data-sap-ui-resourceroots'),
          compatversion: bootstrap.getAttribute('data-sap-ui-compatversion'),
          language: bootstrap.getAttribute('data-sap-ui-language')
        };
        
        Object.keys(bootstrapConfig).forEach(key => {
          if (bootstrapConfig[key]) {
            result[key] = bootstrapConfig[key];
          }
        });
        
        if (!result.isSAPUI5) {
          result.isSAPUI5 = true;
          result.confidence = Math.max(result.confidence, 0.8);
        }
      }
      
      // Method 4: Resource script detection
      const resourceScripts = document.querySelectorAll('script[src*="resources/sap-ui"], script[src*="sap-ui-core"]');
      if (resourceScripts.length > 0) {
        result.detectionMethods.push('resource-scripts');
        if (!result.isSAPUI5) {
          result.isSAPUI5 = true;
          result.confidence = Math.max(result.confidence, 0.6);
        }
      }
      
      // Method 5: Extract UI5 Models (especially AppInfo model)
      if (result.isSAPUI5 && window.sap.ui.getCore) {
        try {
          const core = window.sap.ui.getCore();
          result.models = this.extractUI5Models(core);
        } catch (modelError) {
          result.errors.push(`Model extraction: ${modelError.message}`);
        }
      }
      
      // Method 6: CSS and DOM indicators
      const domIndicators = {
        sapClasses: document.querySelectorAll('[class*="sap"]').length,
        fioriShell: !!document.querySelector('.sapUshellShell'),
        ui5Controls: document.querySelectorAll('[class*="sapM"], [class*="sapUi"]').length,
        fioriTiles: document.querySelectorAll('.sapUshellTile').length,
        fioriLaunchpad: !!document.querySelector('.sapUshellContainer')
      };
      
      const domScore = (
        (domIndicators.sapClasses > 0 ? 0.2 : 0) +
        (domIndicators.fioriShell ? 0.3 : 0) +
        (domIndicators.ui5Controls > 0 ? 0.2 : 0) +
        (domIndicators.fioriTiles > 0 ? 0.2 : 0) +
        (domIndicators.fioriLaunchpad ? 0.1 : 0)
      );
      
      if (domScore > 0.3) {
        result.detectionMethods.push('dom-indicators');
        if (!result.isSAPUI5) {
          result.isSAPUI5 = true;
          result.confidence = Math.max(result.confidence, domScore);
        }
      }
      
      // Method 7: URL pattern analysis
      const url = window.location.href;
      const urlPatterns = [
        /\/sap\/bc\/ui5_ui5\//,
        /\/sap\/bc\/webdynpro\//,
        /#Shell-home/,
        /#.*-manage/,
        /#.*-display/,
        /fiori/i,
        /ui5/i
      ];
      
      const urlMatches = urlPatterns.filter(pattern => pattern.test(url));
      if (urlMatches.length > 0) {
        result.detectionMethods.push('url-patterns');
        if (!result.isSAPUI5) {
          result.isSAPUI5 = true;
          result.confidence = Math.max(result.confidence, 0.4);
        }
      }
      
    } catch (error) {
      result.errors.push(`Detection error: ${error.message}`);
      console.error('[UI5 Detector] Detection failed:', error);
    }
    
    // Final confidence adjustment
    if (result.isSAPUI5 && result.detectionMethods.length > 1) {
      result.confidence = Math.min(0.95, result.confidence + (result.detectionMethods.length * 0.05));
    }
    
    return result;
  }
  
  // Extract UI5 Models data
  function extractUI5Models(core) {
    const models = [];
    
    try {
      // Method 1: Try to get models from current view/component
      const currentApp = this.getCurrentApplication(core);
      if (currentApp && currentApp.getModel) {
        // Get all named models
        const modelNames = ['', 'AppInfo', 'SysInfo', 'UserEnvInfo', 'i18n', 'device'];
        
        modelNames.forEach(modelName => {
          try {
            const model = currentApp.getModel(modelName);
            if (model) {
              const modelInfo = {
                name: modelName || 'default',
                type: model.getMetadata().getName(),
                mode: model.getDefaultBindingMode ? model.getDefaultBindingMode() : 'Unknown'
              };
              
              // Extract data for JSON models
              if (model.getData && typeof model.getData === 'function') {
                try {
                  modelInfo.data = model.getData();
                } catch (e) {
                  // Some models don't support getData
                }
              }
              
              models.push(modelInfo);
            }
          } catch (e) {
            // Model not found or error accessing it
          }
        });
      }
      
      // Method 2: Try to find models in the shell component
      if (window.sap && window.sap.ushell && window.sap.ushell.Container) {
        try {
          const shellComponent = window.sap.ushell.Container.getRenderer('fiori2').getShellComponent();
          if (shellComponent && shellComponent.getModel) {
            const appInfoModel = shellComponent.getModel('AppInfo');
            if (appInfoModel && appInfoModel.getData) {
              models.push({
                name: 'AppInfo',
                type: 'sap.ui.model.json.JSONModel',
                mode: 'TwoWay',
                data: appInfoModel.getData(),
                source: 'shell-component'
              });
            }
          }
        } catch (e) {
          // Shell component method failed
        }
      }
      
      // Method 3: Look for models in UI areas
      const uiAreas = core.getUIAreas();
      for (let area of uiAreas) {
        try {
          const content = area.getContent();
          if (content && content.length > 0) {
            for (let item of content) {
              if (item.getModel) {
                // Check for AppInfo model specifically
                const appInfoModel = item.getModel('AppInfo');
                if (appInfoModel && appInfoModel.getData && !models.find(m => m.name === 'AppInfo')) {
                  models.push({
                    name: 'AppInfo',
                    type: appInfoModel.getMetadata().getName(),
                    data: appInfoModel.getData(),
                    source: 'ui-area-content'
                  });
                }
              }
            }
          }
        } catch (e) {
          // Error processing UI area
        }
      }
      
    } catch (error) {
      console.warn('Error extracting UI5 models:', error);
    }
    
    return models;
  }
  
  // Get current application component
  function getCurrentApplication(core) {
    try {
      // Method 1: Get from current component
      const currentComponent = core.getCurrentComponent ? core.getCurrentComponent() : null;
      if (currentComponent) return currentComponent;
      
      // Method 2: Get from shell container
      if (window.sap.ushell && window.sap.ushell.Container) {
        const currentApp = window.sap.ushell.Container.getService("AppLifeCycle").getCurrentApplication();
        if (currentApp && currentApp.componentInstance) {
          return currentApp.componentInstance;
        }
      }
      
      // Method 3: Find application component in UI areas
      const uiAreas = core.getUIAreas();
      for (let area of uiAreas) {
        const content = area.getContent();
        if (content && content.length > 0) {
          for (let item of content) {
            if (item.getMetadata && item.getMetadata().getName().includes('Component')) {
              return item;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error getting current application:', e);
    }
    
    return null;
  }
  
  // Perform detection
  const detectionResult = performEnhancedUI5Detection();
  console.log('[UI5 Detector] Detection completed:', detectionResult);
  
  // Send result to content script
  window.dispatchEvent(new CustomEvent('SAPUI5DetectionResult', {
    detail: detectionResult
  }));
  
  // Expose result globally for debugging
  window.fioriUI5Detection = detectionResult;
  
})();