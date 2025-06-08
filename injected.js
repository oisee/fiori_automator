// Injected script for Fiori Test Automation System
// Runs in page context to access variables and functions not available to content scripts

(function() {
  'use strict';
  
  // Enhanced SAPUI5 context extraction that runs in page context
  class FioriContextExtractor {
    constructor() {
      this.init();
    }

    init() {
      this.setupMessageBridge();
      this.monitorUI5Events();
    }

    setupMessageBridge() {
      // Listen for requests from content script
      window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data.type) return;
        
        if (event.data.type === 'GET_UI5_DEEP_CONTEXT') {
          const context = this.getDeepUI5Context();
          window.postMessage({
            type: 'UI5_DEEP_CONTEXT_RESPONSE',
            data: context
          }, '*');
        }
      });
    }

    getDeepUI5Context() {
      if (!window.sap || !window.sap.ui) {
        return { available: false };
      }

      try {
        const core = window.sap.ui.getCore();
        const context = {
          available: true,
          version: window.sap.ui.version,
          buildInfo: window.sap.ui.buildinfo,
          configuration: this.getConfiguration(),
          loadedLibraries: this.getLoadedLibraries(),
          models: this.getModels(),
          router: this.getRouterInfo(),
          components: this.getComponentInfo(),
          views: this.getViewInfo(),
          controls: this.getControlHierarchy()
        };

        return context;
      } catch (error) {
        console.warn('Error extracting deep UI5 context:', error);
        return { available: true, error: error.message };
      }
    }

    getConfiguration() {
      try {
        const config = window.sap.ui.getCore().getConfiguration();
        return {
          theme: config.getTheme(),
          locale: config.getLocale().toString(),
          language: config.getLanguage(),
          formatLocale: config.getFormatSettings().getFormatLocale().toString(),
          timezone: config.getTimezone(),
          accessibility: config.getAccessibility(),
          animation: config.getAnimationMode(),
          rtl: config.getRTL(),
          debug: config.getDebug(),
          appRoot: config.getAppRoot(),
          resourceRoots: config.getResourceRoots()
        };
      } catch (error) {
        return { error: error.message };
      }
    }

    getLoadedLibraries() {
      try {
        const libraries = window.sap.ui.getCore().getLoadedLibraries();
        const libraryInfo = {};
        
        Object.keys(libraries).forEach(libName => {
          const lib = libraries[libName];
          libraryInfo[libName] = {
            version: lib.version,
            buildTimestamp: lib.buildTimestamp,
            controls: lib.controls || [],
            elements: lib.elements || [],
            interfaces: lib.interfaces || []
          };
        });
        
        return libraryInfo;
      } catch (error) {
        return { error: error.message };
      }
    }

    getModels() {
      try {
        const core = window.sap.ui.getCore();
        const models = {};
        
        // Get global models
        const modelNames = core.getModel() ? ['default'] : [];
        
        // Add named models
        if (core.oModels) {
          modelNames.push(...Object.keys(core.oModels));
        }

        modelNames.forEach(modelName => {
          const model = modelName === 'default' ? core.getModel() : core.getModel(modelName);
          if (model) {
            models[modelName] = {
              type: model.getMetadata().getName(),
              serviceUrl: model.sServiceUrl,
              defaultBindingMode: model.getDefaultBindingMode(),
              properties: this.getModelProperties(model)
            };
          }
        });

        return models;
      } catch (error) {
        return { error: error.message };
      }
    }

    getModelProperties(model) {
      try {
        if (model.getMetadata().getName() === 'sap.ui.model.odata.v2.ODataModel') {
          return {
            serviceMetadata: model.getServiceMetadata(),
            entitySets: Object.keys(model.getServiceMetadata()?.dataServices?.schema?.[0]?.entityContainer?.[0]?.entitySet || {}),
            securityToken: model.getSecurityToken(),
            useBatch: model.bUseBatch,
            refreshAfterChange: model.bRefreshAfterChange
          };
        } else if (model.getMetadata().getName() === 'sap.ui.model.json.JSONModel') {
          return {
            data: model.getData(),
            sizeLimit: model.iSizeLimit
          };
        }
        return {};
      } catch (error) {
        return { error: error.message };
      }
    }

    getRouterInfo() {
      try {
        // Try to get router from component
        const component = this.getCurrentComponent();
        if (component && component.getRouter) {
          const router = component.getRouter();
          if (router) {
            return {
              available: true,
              currentRoute: router.getRoute(router._oRouter._prevMatchedRequest?.name),
              routes: router.getRoutes().map(route => ({
                name: route._oConfig.name,
                pattern: route._oConfig.pattern,
                target: route._oConfig.target
              })),
              targets: router.getTargets()._mTargets ? Object.keys(router.getTargets()._mTargets) : []
            };
          }
        }
        return { available: false };
      } catch (error) {
        return { available: false, error: error.message };
      }
    }

    getComponentInfo() {
      try {
        const component = this.getCurrentComponent();
        if (component) {
          return {
            id: component.getId(),
            name: component.getMetadata().getName(),
            version: component.getMetadata().getVersion(),
            manifest: component.getManifest(),
            models: Object.keys(component.oModels || {}),
            rootControl: component.getRootControl()?.getId()
          };
        }
        return { available: false };
      } catch (error) {
        return { available: false, error: error.message };
      }
    }

    getCurrentComponent() {
      try {
        // Try multiple ways to get the current component
        if (window.sap?.ushell?.Container) {
          const service = window.sap.ushell.Container.getService('AppLifeCycle');
          const currentApp = service.getCurrentApplication();
          if (currentApp && currentApp.componentInstance) {
            return currentApp.componentInstance;
          }
        }

        // Fallback: search through all components
        const core = window.sap.ui.getCore();
        const components = core.oCore.mObjects;
        for (let key in components) {
          const obj = components[key];
          if (obj && obj.getMetadata && obj.getMetadata().getName().includes('Component')) {
            return obj;
          }
        }

        return null;
      } catch (error) {
        return null;
      }
    }

    getViewInfo() {
      try {
        const core = window.sap.ui.getCore();
        const views = [];
        
        // Get all views from core
        if (core.mObjects) {
          Object.values(core.mObjects).forEach(obj => {
            if (obj && obj.getMetadata && obj.getMetadata().getName().includes('View')) {
              views.push({
                id: obj.getId(),
                type: obj.getMetadata().getName(),
                viewName: obj.getViewName?.(),
                controllerName: obj.getControllerName?.(),
                content: obj.getContent()?.map(ctrl => ctrl.getId()) || []
              });
            }
          });
        }

        return views;
      } catch (error) {
        return { error: error.message };
      }
    }

    getControlHierarchy() {
      try {
        const core = window.sap.ui.getCore();
        const rootControls = [];

        // Find root controls (typically in UIArea)
        const uiAreas = core.mUIAreas;
        Object.values(uiAreas || {}).forEach(uiArea => {
          const content = uiArea.getContent();
          content.forEach(control => {
            rootControls.push(this.buildControlTree(control));
          });
        });

        return rootControls;
      } catch (error) {
        return { error: error.message };
      }
    }

    buildControlTree(control, depth = 0) {
      if (depth > 10) return null; // Prevent infinite recursion
      
      try {
        const controlInfo = {
          id: control.getId(),
          type: control.getMetadata().getName(),
          domRef: !!control.getDomRef(),
          visible: control.getVisible?.() !== false,
          children: []
        };

        // Get aggregations that contain child controls
        const aggregations = control.getMetadata().getAllAggregations();
        Object.keys(aggregations).forEach(aggName => {
          try {
            const getter = 'get' + aggName.charAt(0).toUpperCase() + aggName.slice(1);
            const aggContent = control[getter]?.();
            
            if (Array.isArray(aggContent)) {
              aggContent.forEach(child => {
                if (child && child.getMetadata) {
                  const childInfo = this.buildControlTree(child, depth + 1);
                  if (childInfo) {
                    controlInfo.children.push(childInfo);
                  }
                }
              });
            } else if (aggContent && aggContent.getMetadata) {
              const childInfo = this.buildControlTree(aggContent, depth + 1);
              if (childInfo) {
                controlInfo.children.push(childInfo);
              }
            }
          } catch (e) {
            // Ignore aggregation access errors
          }
        });

        return controlInfo;
      } catch (error) {
        return null;
      }
    }

    monitorUI5Events() {
      try {
        if (window.sap?.ui?.getCore) {
          const core = window.sap.ui.getCore();
          
          // Monitor routing events
          try {
            const eventBus = core.getEventBus();
            if (eventBus && typeof eventBus.subscribe === 'function') {
              eventBus.subscribe('sap.ui.core.routing', 'RouteMatched', (channelId, eventId, data) => {
                window.postMessage({
                  type: 'UI5_ROUTE_MATCHED',
                  data: {
                    route: data.name,
                    arguments: data.arguments,
                    timestamp: Date.now()
                  }
                }, '*');
              });
            }
          } catch (routingError) {
            console.warn('Could not set up routing event monitoring:', routingError.message);
          }

          // Monitor model changes (check if method exists first)
          try {
            if (typeof core.attachModelContextChange === 'function') {
              core.attachModelContextChange((event) => {
                window.postMessage({
                  type: 'UI5_MODEL_CHANGE',
                  data: {
                    model: event.getParameter('model')?.getMetadata?.()?.getName(),
                    timestamp: Date.now()
                  }
                }, '*');
              });
            } else {
              console.info('attachModelContextChange not available in this UI5 version');
            }
          } catch (modelError) {
            console.warn('Could not set up model change monitoring:', modelError.message);
          }
        }
      } catch (error) {
        console.warn('Error setting up UI5 event monitoring:', error);
      }
    }
  }

  // Initialize the context extractor
  new FioriContextExtractor();
  
  // Signal that the injected script is ready
  window.postMessage({
    type: 'FIORI_INJECTED_READY',
    data: { ready: true }
  }, '*');

})();