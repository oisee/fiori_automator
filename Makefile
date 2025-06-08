# Fiori Test Automation Extension - Makefile
# Cross-platform build automation

.PHONY: all build clean install test help icons validate dev edge chrome

# Default target
all: build

# Help target
help:
	@echo "Fiori Test Automation Extension - Build Targets"
	@echo "=============================================="
	@echo "  make build    - Build all extension variants"
	@echo "  make dev      - Build development version only"
	@echo "  make edge     - Build Edge-specific version"
	@echo "  make chrome   - Build Chrome-specific version"
	@echo "  make clean    - Remove all build artifacts"
	@echo "  make icons    - Generate icon files"
	@echo "  make validate - Validate manifest.json"
	@echo "  make install  - Build and show installation instructions"
	@echo "  make test     - Run tests (when available)"
	@echo ""

# Build all variants
build: clean validate icons
	@echo "Building extension..."
	@./build.sh

# Development build only
dev: clean validate
	@echo "Creating development build..."
	@mkdir -p dist
	@cp manifest.json *.js *.html *.css dist/
	@cp -r icons dist/
	@echo "✓ Development build ready in dist/"

# Edge-specific build
edge: build
	@echo "✓ Edge build available in build/fiori-test-automation-*-edge.zip"

# Chrome-specific build
chrome: build
	@echo "✓ Chrome build available in build/fiori-test-automation-*-chrome.zip"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf dist/ build/
	@echo "✓ Clean complete"

# Generate icons
icons:
	@echo "Generating icons..."
	@./create-icons.sh

# Validate manifest
validate:
	@echo "Validating manifest.json..."
	@python3 -m json.tool manifest.json > /dev/null 2>&1 || \
		node -e "JSON.parse(require('fs').readFileSync('manifest.json'))" 2>/dev/null || \
		(echo "✗ manifest.json is invalid!" && exit 1)
	@echo "✓ Manifest is valid"

# Install instructions
install: build
	@echo ""
	@echo "Installation Instructions"
	@echo "========================"
	@echo "1. Open Edge: edge://extensions/"
	@echo "2. Enable 'Developer mode'"
	@echo "3. Extract: build/fiori-test-automation-*-edge.zip"
	@echo "4. Click 'Load unpacked' and select the extracted folder"
	@echo ""
	@echo "Or for development:"
	@echo "1. Click 'Load unpacked' and select the 'dist' folder"
	@echo ""

# Test target (placeholder)
test:
	@echo "⚠️  No tests configured yet"
	@echo "Manual testing required:"
	@echo "1. Load extension in browser"
	@echo "2. Test on a Fiori application"
	@echo "3. Verify all features work"

# Quick development workflow
quick: dev
	@echo ""
	@echo "Quick development build ready!"
	@echo "Load the 'dist' folder in your browser"