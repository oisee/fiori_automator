# Fiori Test Automation Extension Makefile
# Simple commands for building and deploying the extension

.PHONY: all build deploy clean install help validate test

# Default target
all: build

# Build and deploy to Windows
build: validate
	@echo "🎯 Building and deploying Fiori Test Automation Extension..."
	@./build.sh

# Alias for build (deploy to Windows)
deploy: build

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf build/
	@rm -rf /mnt/c/bin/fiori_automator/
	@rm -f /mnt/c/bin/fiori-test-automation-latest.zip
	@echo "✅ Clean completed!"

# Install: ensure build script is executable and build
install:
	@echo "🔧 Setting up build environment..."
	@chmod +x build.sh
	@./build.sh

# Validate manifest
validate:
	@echo "🔍 Validating manifest.json..."
	@python3 -m json.tool manifest.json > /dev/null 2>&1 || \
		node -e "JSON.parse(require('fs').readFileSync('manifest.json'))" 2>/dev/null || \
		(echo "✗ manifest.json is invalid!" && exit 1)
	@echo "✓ Manifest is valid"

# Test target (placeholder)
test:
	@echo "⚠️  No automated tests configured yet"
	@echo "Manual testing steps:"
	@echo "1. Load extension in Chrome/Edge"
	@echo "2. Test on a Fiori application"
	@echo "3. Verify recording, UI5 context, and markdown export"

# Show help
help:
	@echo "Fiori Test Automation Extension Build Commands:"
	@echo ""
	@echo "  make build     - Build extension and copy to Windows (C:\\bin\\fiori_automator\\)"
	@echo "  make deploy    - Same as build"
	@echo "  make clean     - Remove all build artifacts and Windows files"
	@echo "  make install   - Set permissions and build"
	@echo "  make validate  - Check manifest.json validity"
	@echo "  make test      - Show manual testing instructions"
	@echo "  make help      - Show this help message"
	@echo ""
	@echo "Windows Installation:"
	@echo "  1. Run 'make build'"
	@echo "  2. Open Chrome/Edge -> Extensions -> Developer mode ON"
	@echo "  3. Load unpacked extension from C:\\bin\\fiori_automator\\"
	@echo ""
	@echo "After code changes:"
	@echo "  1. Run 'make build' again"
	@echo "  2. Click reload button in browser extension page"