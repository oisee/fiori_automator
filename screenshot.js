// Screenshot capture utility for Fiori Test Automation System
// Handles high-quality screenshot capture with element highlighting

class ScreenshotCapture {
  constructor() {
    this.canvas = null;
    this.context = null;
    this.setupCanvas();
  }

  setupCanvas() {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
  }

  async captureFullPage() {
    try {
      return await this.captureVisibleArea();
    } catch (error) {
      console.warn('Screenshot capture failed:', error);
      return null;
    }
  }

  async captureVisibleArea() {
    try {
      // Use chrome.tabs.captureVisibleTab for actual screenshot
      return new Promise((resolve) => {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            console.error('Screenshot capture error:', chrome.runtime.lastError);
            resolve(null);
          } else {
            resolve(dataUrl);
          }
        });
      });
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      return null;
    }
  }

  async captureElementHighlight(element, event) {
    try {
      // First capture the full page
      const baseScreenshot = await this.captureVisibleArea();
      if (!baseScreenshot) return null;

      // Create an overlay with element highlighting
      const overlay = await this.createElementOverlay(element, event);
      
      // Combine base screenshot with overlay
      return await this.combineScreenshots(baseScreenshot, overlay);
    } catch (error) {
      console.error('Failed to capture element highlight:', error);
      return null;
    }
  }

  async createElementOverlay(element, event) {
    try {
      const rect = element.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      // Set canvas size to viewport
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;

      // Clear canvas with transparent background
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Draw element highlight
      this.drawElementHighlight(rect, event);

      // Draw click indicator if it's a click event
      if (event && event.type === 'click') {
        this.drawClickIndicator(event.clientX, event.clientY);
      }

      // Convert canvas to data URL
      return this.canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Failed to create element overlay:', error);
      return null;
    }
  }

  drawElementHighlight(rect, event) {
    const ctx = this.context;
    
    // Save context state
    ctx.save();

    // Draw semi-transparent overlay on entire screen
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Clear the highlighted element area
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(rect.left - 2, rect.top - 2, rect.width + 4, rect.height + 4);

    // Draw border around element
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(rect.left - 2, rect.top - 2, rect.width + 4, rect.height + 4);

    // Draw solid border
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.left - 1, rect.top - 1, rect.width + 2, rect.height + 2);

    // Restore context state
    ctx.restore();
  }

  drawClickIndicator(x, y) {
    const ctx = this.context;
    
    ctx.save();

    // Draw click ripple effect
    const radius = 20;
    
    // Outer circle
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.stroke();

    // Inner circle
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();

    // Click coordinates text
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.fillText(`(${x}, ${y})`, x + 25, y - 10);

    ctx.restore();
  }

  async combineScreenshots(baseScreenshot, overlay) {
    try {
      // Create a new canvas for combining
      const combineCanvas = document.createElement('canvas');
      const combineCtx = combineCanvas.getContext('2d');

      // Load base screenshot
      const baseImage = await this.loadImage(baseScreenshot);
      combineCanvas.width = baseImage.width;
      combineCanvas.height = baseImage.height;

      // Draw base screenshot
      combineCtx.drawImage(baseImage, 0, 0);

      // Draw overlay if it exists
      if (overlay) {
        const overlayImage = await this.loadImage(overlay);
        combineCtx.drawImage(overlayImage, 0, 0);
      }

      return combineCanvas.toDataURL('image/png');
    } catch (error) {
      console.error('Failed to combine screenshots:', error);
      return baseScreenshot; // Return base screenshot as fallback
    }
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async captureElementOnly(element) {
    try {
      const rect = element.getBoundingClientRect();
      
      // Capture full page first
      const fullScreenshot = await this.captureVisibleArea();
      if (!fullScreenshot) return null;

      // Create a cropped version
      const image = await this.loadImage(fullScreenshot);
      
      // Calculate device pixel ratio for high-DPI displays
      const dpr = window.devicePixelRatio || 1;
      
      // Create canvas for cropped image
      const cropCanvas = document.createElement('canvas');
      const cropCtx = cropCanvas.getContext('2d');
      
      cropCanvas.width = rect.width * dpr;
      cropCanvas.height = rect.height * dpr;
      
      // Draw cropped portion
      cropCtx.drawImage(
        image,
        rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr,
        0, 0, rect.width * dpr, rect.height * dpr
      );

      return cropCanvas.toDataURL('image/png');
    } catch (error) {
      console.error('Failed to capture element only:', error);
      return null;
    }
  }

  async captureWithAnnotations(element, event, annotations = {}) {
    try {
      const baseScreenshot = await this.captureVisibleArea();
      if (!baseScreenshot) return null;

      const image = await this.loadImage(baseScreenshot);
      
      // Create annotation canvas
      const annotCanvas = document.createElement('canvas');
      const annotCtx = annotCanvas.getContext('2d');
      
      annotCanvas.width = image.width;
      annotCanvas.height = image.height;

      // Draw base image
      annotCtx.drawImage(image, 0, 0);

      // Add annotations
      await this.addAnnotations(annotCtx, element, event, annotations);

      return annotCanvas.toDataURL('image/png');
    } catch (error) {
      console.error('Failed to capture with annotations:', error);
      return null;
    }
  }

  async addAnnotations(ctx, element, event, annotations) {
    const rect = element.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    ctx.save();

    // Scale for device pixel ratio
    const scaledRect = {
      left: rect.left * dpr,
      top: rect.top * dpr,
      width: rect.width * dpr,
      height: rect.height * dpr
    };

    // Draw element outline
    ctx.strokeStyle = annotations.highlightColor || '#ff4444';
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(scaledRect.left, scaledRect.top, scaledRect.width, scaledRect.height);

    // Add element info box
    if (annotations.showElementInfo !== false) {
      this.drawElementInfoBox(ctx, element, scaledRect, dpr);
    }

    // Add click indicator
    if (event && event.type === 'click' && annotations.showClickPoint !== false) {
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(event.clientX * dpr, event.clientY * dpr, 6 * dpr, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Add timestamp
    if (annotations.showTimestamp !== false) {
      this.drawTimestamp(ctx, dpr);
    }

    ctx.restore();
  }

  drawElementInfoBox(ctx, element, rect, dpr) {
    const info = [
      `Tag: ${element.tagName.toLowerCase()}`,
      element.id ? `ID: ${element.id}` : null,
      element.className ? `Class: ${element.className.split(' ')[0]}` : null
    ].filter(Boolean);

    const boxPadding = 8 * dpr;
    const lineHeight = 16 * dpr;
    const fontSize = 12 * dpr;

    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(
      rect.left,
      rect.top - (info.length * lineHeight + boxPadding * 2),
      Math.max(...info.map(text => ctx.measureText(text).width)) + boxPadding * 2,
      info.length * lineHeight + boxPadding
    );

    ctx.fillStyle = '#ffffff';
    info.forEach((text, index) => {
      ctx.fillText(
        text,
        rect.left + boxPadding,
        rect.top - boxPadding - (info.length - index - 1) * lineHeight
      );
    });
  }

  drawTimestamp(ctx, dpr) {
    const timestamp = new Date().toLocaleString();
    const fontSize = 12 * dpr;
    const padding = 8 * dpr;

    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    
    const textMetrics = ctx.measureText(timestamp);
    const boxWidth = textMetrics.width + padding * 2;
    const boxHeight = fontSize + padding;

    ctx.fillRect(
      ctx.canvas.width - boxWidth - 10 * dpr,
      10 * dpr,
      boxWidth,
      boxHeight
    );

    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      timestamp,
      ctx.canvas.width - boxWidth - 10 * dpr + padding,
      10 * dpr + fontSize
    );
  }

  // Utility method to compress screenshot
  compressScreenshot(dataUrl, quality = 0.8) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          
          // Convert to JPEG with compression
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        };
        img.src = dataUrl;
      });
    } catch (error) {
      console.error('Screenshot compression failed:', error);
      return dataUrl; // Return original if compression fails
    }
  }

  // Method to get screenshot metadata
  getScreenshotMetadata() {
    return {
      timestamp: Date.now(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      scroll: {
        x: window.pageXOffset || document.documentElement.scrollLeft,
        y: window.pageYOffset || document.documentElement.scrollTop
      },
      devicePixelRatio: window.devicePixelRatio || 1,
      userAgent: navigator.userAgent,
      url: window.location.href
    };
  }
}

// Export for use in content script
window.ScreenshotCapture = ScreenshotCapture;