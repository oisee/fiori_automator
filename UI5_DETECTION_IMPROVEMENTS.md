# UI5 Context Detection & Semantic Extraction Improvements

## 🎯 Current Status and Improvements Needed

### ✅ **What's Already Implemented**

The extension currently has basic UI5 detection in place:

1. **Basic Detection** (`ui5-detector.js`):
   - Direct SAP namespace detection (`window.sap.ui`)
   - UI5 Core access checks
   - Bootstrap script detection
   - URL pattern analysis

2. **Element Context** (`content.js`):
   - `getUI5ElementContext()` maps DOM elements to UI5 controls
   - Basic semantic role detection
   - Form control identification

### 🔧 **Issue: Session Names Getting Truncated**

**Problem**: "Manage Alerts" app extracts as just "Manage"
**Root Cause**: Session name extraction logic is cutting off at first word or using overly aggressive truncation

**Fixed**: Updated `extractConciseSessionName()` to:
- Handle specific patterns like "Manage Alerts" → "manage-alerts"
- Look for complete app names before truncating
- Better URL pattern matching for known Fiori apps

---

## 🚀 **Enhanced UI5 Detection Strategy (Based on ui5-inspector)**

### 📋 **Implementation Plan**

#### 1. **Deep Component Tree Analysis**

Add to `content.js`:

```javascript
extractDeepUI5Context() {
  if (!window.sap?.ui) return null;
  
  try {
    const core = window.sap.ui.getCore();
    const appInfo = {
      appId: null,
      appTitle: null,
      version: core.getVersion?.().version || 'Unknown',
      theme: core.getConfiguration?.().getTheme?.() || 'Unknown',
      components: [],
      models: []
    };

    // Method 1: Component Analysis
    const components = core.getUIAreas();
    for (let area of components) {
      const content = area.getContent();
      for (let component of content) {
        if (component.getMetadata) {
          const metadata = component.getMetadata();
          const componentInfo = {
            name: metadata.getName(),
            id: component.getId(),
            type: metadata.getElementName()
          };
          
          // Extract app semantics from component
          if (componentInfo.name.includes('manage')) {
            appInfo.appId = componentInfo.name;
            appInfo.appTitle = this.extractAppTitleFromComponent(component);
          }
          
          appInfo.components.push(componentInfo);
        }
      }
    }

    // Method 2: Model Analysis
    if (core.getModel) {
      const model = core.getModel();
      if (model) {
        appInfo.models.push({
          type: model.getMetadata().getName(),
          serviceUrl: model.sServiceUrl || null
        });
      }
    }

    // Method 3: Router Analysis (for single-page apps)
    if (window.sap.ui.core.routing) {
      const router = core.getRouter?.();
      if (router) {
        appInfo.routing = {
          currentRoute: router.getRoute?.()?.getPattern?.() || null
        };
      }
    }

    return appInfo;
  } catch (error) {
    console.warn('Deep UI5 analysis failed:', error);
    return null;
  }
}

extractAppTitleFromComponent(component) {
  // Try multiple methods to get meaningful app title
  
  // Method 1: Check component manifest
  if (component.getManifest) {
    const manifest = component.getManifest();
    const appTitle = manifest?.['sap.app']?.title;
    if (appTitle) return appTitle;
  }

  // Method 2: Look for main titles in DOM
  const titleSelectors = [
    '.sapMTitle',
    '.sapUiTitle', 
    'h1',
    '[data-sap-ui-type*="Title"]'
  ];
  
  for (let selector of titleSelectors) {
    const titleEl = document.querySelector(selector);
    if (titleEl && titleEl.textContent.trim()) {
      const title = titleEl.textContent.trim();
      if (title.length > 3 && title.length < 100) {
        return title;
      }
    }
  }

  // Method 3: Extract from page metadata
  const metaTitle = document.querySelector('meta[name="title"]');
  if (metaTitle && metaTitle.content) {
    return metaTitle.content;
  }

  return null;
}
```

#### 2. **Enhanced Semantic Extraction**

```javascript
extractBusinessSemantics() {
  const semantics = {
    businessObject: null,
    scenario: null,
    appType: 'unknown',
    confidence: 0
  };

  // Method 1: OData Service Analysis
  if (window.sap?.ui) {
    const models = this.getAllModels();
    for (let model of models) {
      if (model.sServiceUrl) {
        const serviceMatch = model.sServiceUrl.match(/\/([A-Z_]+_SRV)/);
        if (serviceMatch) {
          const serviceName = serviceMatch[1];
          
          // Parse service name for business context
          if (serviceName.includes('ALERT')) {
            semantics.businessObject = 'alerts';
            semantics.scenario = 'manage';
            semantics.confidence += 0.4;
          }
          if (serviceName.includes('DETECTION')) {
            semantics.businessObject = 'detection-methods';
            semantics.scenario = 'manage';
            semantics.confidence += 0.4;
          }
        }
      }
    }
  }

  // Method 2: Page Content Analysis
  const contentAnalysis = this.analyzePageContent();
  if (contentAnalysis.businessTerms.length > 0) {
    semantics.businessObject = contentAnalysis.businessTerms[0];
    semantics.confidence += 0.2;
  }

  // Method 3: Navigation Context
  const navContext = this.extractNavigationContext();
  if (navContext.appId) {
    semantics.appType = navContext.appId;
    semantics.confidence += 0.3;
  }

  return semantics;
}

analyzePageContent() {
  const businessTerms = [];
  const contentText = document.body.textContent.toLowerCase();
  
  // Common SAP business objects
  const businessPatterns = [
    'alerts?', 'detection.methods?', 'compliance', 'workflow',
    'purchase.orders?', 'sales.orders?', 'invoices?', 'materials?',
    'business.partners?', 'customers?', 'vendors?'
  ];
  
  for (let pattern of businessPatterns) {
    const regex = new RegExp(pattern, 'gi');
    if (regex.test(contentText)) {
      businessTerms.push(pattern.replace(/[^a-z]/g, ''));
    }
  }
  
  return { businessTerms };
}
```

#### 3. **Enhanced Session Naming**

```javascript
generateIntelligentSessionName(pageContext) {
  const ui5Context = this.extractDeepUI5Context();
  const businessSemantics = this.extractBusinessSemantics();
  
  // Priority 1: Use UI5 app title if available
  if (ui5Context?.appTitle && !ui5Context.appTitle.includes('Launchpad')) {
    return ui5Context.appTitle;
  }
  
  // Priority 2: Build from business semantics
  if (businessSemantics.confidence > 0.5) {
    if (businessSemantics.scenario && businessSemantics.businessObject) {
      return `${businessSemantics.scenario} ${businessSemantics.businessObject}`.replace(/[^a-zA-Z\s]/g, ' ').trim();
    }
  }
  
  // Priority 3: Extract from URL hash with better parsing
  const hash = window.location.hash;
  if (hash.includes('#')) {
    const appMatch = hash.match(/#(\w+)-(\w+)/);
    if (appMatch) {
      const [, namespace, action] = appMatch;
      return this.humanizeAppName(action);
    }
  }
  
  // Fallback
  return `Session ${new Date().toLocaleString()}`;
}

humanizeAppName(camelCaseString) {
  return camelCaseString
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^\w/, c => c.toUpperCase());
}
```

---

## 🔗 **Integration Points**

### **Where to Call Enhanced Detection**

1. **During Recording Start** (`background.js` - `startRecording()`):
   ```javascript
   // Get enhanced UI5 context
   const enhancedContext = await this.getEnhancedUI5Context(tabId);
   session.metadata.enhancedUI5Context = enhancedContext;
   ```

2. **During Session Name Generation** (`background.js`):
   ```javascript
   const improvedSessionName = this.generateIntelligentSessionName(enhancedContext) || 
                              this.generateImprovedSessionNameFromUrl(sessionData.applicationUrl);
   ```

3. **During Event Capture** (`content.js`):
   ```javascript
   // Include enhanced context with each event
   eventData.enhancedUI5Context = this.extractBusinessSemantics();
   ```

---

## 📂 **File Structure for New Features**

```
/home/alice/dev/fiori_automator/
├── ui5-enhanced-detector.js    # Deep UI5 analysis (new)
├── semantic-extractor.js       # Business context extraction (new)
├── content.js                  # Enhanced with deep context calls
├── background.js               # Updated session naming logic
└── injected.js                 # Page context bridge for UI5 access
```

---

## 🎯 **Expected Results**

### **Before (Current)**:
- Session Name: "Session 2024-01-15 10:30:15" 
- Filename: `fiori-session-2024-01-15_10-30-15-manage-detection-methods.json`

### **After (Enhanced)**:
- Session Name: "Manage Alerts"
- Filename: `fs-2024-01-15-1030-manage-alerts.json`
- Screenshots: `fs-2024-01-15-1030-manage-alerts-0001-click.png`

### **Additional Benefits**:
- Better correlation of events with business processes
- Richer metadata for test automation generation
- More meaningful session exports
- Enhanced debugging capabilities

---

## 🚀 **Implementation Priority**

1. **High Priority**: Fix filename generation (✅ **COMPLETED**)
2. **Medium Priority**: Enhance session name extraction 
3. **Low Priority**: Deep UI5 component analysis
4. **Future**: Business process correlation and test generation

The current filename fixes address the immediate naming issues. The enhanced UI5 detection can be added incrementally for even better semantic understanding.