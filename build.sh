#!/bin/bash

# Fiori Test Automation Extension - Build Script
# Builds the extension for distribution

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
EXTENSION_NAME="fiori-test-automation"
VERSION=$(grep '"version"' manifest.json | cut -d'"' -f4)
BUILD_DIR="dist"
OUTPUT_DIR="build"

echo -e "${BLUE}🔨 Fiori Test Automation Extension Build Script${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"
echo ""

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf "$BUILD_DIR" "$OUTPUT_DIR"
mkdir -p "$BUILD_DIR" "$OUTPUT_DIR"
print_status "Cleaned build directories"

# Check if icons exist
if [ ! -d "icons" ] || [ -z "$(ls -A icons/*.png 2>/dev/null)" ]; then
    print_warning "Icon files missing. Creating placeholders..."
    ./create-icons.sh
fi

# Copy extension files
echo ""
echo "Copying extension files..."
cp manifest.json "$BUILD_DIR/"
cp background.js "$BUILD_DIR/"
cp content.js "$BUILD_DIR/"
cp injected.js "$BUILD_DIR/"
cp screenshot.js "$BUILD_DIR/"
cp popup.html "$BUILD_DIR/"
cp popup.css "$BUILD_DIR/"
cp popup.js "$BUILD_DIR/"
print_status "Copied core files"

# Copy icons
mkdir -p "$BUILD_DIR/icons"
cp icons/*.png "$BUILD_DIR/icons/" 2>/dev/null || {
    print_error "No PNG icons found!"
    echo "Creating minimal icons..."
    for size in 16 32 48 128; do
        printf '\x89PNG\r\n\x1a\n' > "$BUILD_DIR/icons/icon${size}.png"
    done
}
print_status "Copied icon files"

# Validate manifest
echo ""
echo "Validating manifest.json..."
if command -v python3 &> /dev/null; then
    python3 -m json.tool "$BUILD_DIR/manifest.json" > /dev/null && print_status "Manifest is valid JSON" || print_error "Invalid manifest.json!"
elif command -v node &> /dev/null; then
    node -e "JSON.parse(require('fs').readFileSync('$BUILD_DIR/manifest.json'))" && print_status "Manifest is valid JSON" || print_error "Invalid manifest.json!"
else
    print_warning "Cannot validate manifest (no Python or Node.js found)"
fi

# Create different build variants
echo ""
echo "Creating build variants..."

# 1. Development build (uncompressed)
echo "  Creating development build..."
cd "$BUILD_DIR"
zip -r "../$OUTPUT_DIR/${EXTENSION_NAME}-${VERSION}-dev.zip" . -x "*.DS_Store" "*/.git/*"
cd ..
print_status "Created development build: $OUTPUT_DIR/${EXTENSION_NAME}-${VERSION}-dev.zip"

# 2. Edge-specific build
echo "  Creating Edge build..."
cp -r "$BUILD_DIR" "$BUILD_DIR-edge"
# Edge-specific modifications if needed
cd "$BUILD_DIR-edge"
zip -r "../$OUTPUT_DIR/${EXTENSION_NAME}-${VERSION}-edge.zip" . -x "*.DS_Store" "*/.git/*"
cd ..
rm -rf "$BUILD_DIR-edge"
print_status "Created Edge build: $OUTPUT_DIR/${EXTENSION_NAME}-${VERSION}-edge.zip"

# 3. Chrome build (same as Edge for now)
echo "  Creating Chrome build..."
cd "$BUILD_DIR"
zip -r "../$OUTPUT_DIR/${EXTENSION_NAME}-${VERSION}-chrome.zip" . -x "*.DS_Store" "*/.git/*"
cd ..
print_status "Created Chrome build: $OUTPUT_DIR/${EXTENSION_NAME}-${VERSION}-chrome.zip"

# 4. Source code archive (for store submission)
echo "  Creating source archive..."
zip -r "$OUTPUT_DIR/${EXTENSION_NAME}-${VERSION}-source.zip" . \
    -x "*.DS_Store" "*/.git/*" "dist/*" "build/*" "node_modules/*" \
    "*.log" "*.tmp" "sessions/*" "*.crx" "*.pem"
print_status "Created source archive: $OUTPUT_DIR/${EXTENSION_NAME}-${VERSION}-source.zip"

# Generate checksums
echo ""
echo "Generating checksums..."
cd "$OUTPUT_DIR"
if command -v sha256sum &> /dev/null; then
    sha256sum *.zip > checksums.txt
    print_status "Generated SHA-256 checksums"
elif command -v shasum &> /dev/null; then
    shasum -a 256 *.zip > checksums.txt
    print_status "Generated SHA-256 checksums"
else
    print_warning "Cannot generate checksums (no sha256sum or shasum found)"
fi
cd ..

# Create release notes
echo ""
echo "Creating release notes..."
cat > "$OUTPUT_DIR/RELEASE_NOTES.md" << EOF
# Fiori Test Automation Extension - Release ${VERSION}

## Build Information
- **Build Date**: $(date)
- **Version**: ${VERSION}
- **Build Type**: Production

## Package Contents
- \`${EXTENSION_NAME}-${VERSION}-dev.zip\` - Development build (uncompressed)
- \`${EXTENSION_NAME}-${VERSION}-edge.zip\` - Microsoft Edge optimized build
- \`${EXTENSION_NAME}-${VERSION}-chrome.zip\` - Google Chrome build
- \`${EXTENSION_NAME}-${VERSION}-source.zip\` - Source code archive

## Installation Instructions
1. Extract the appropriate ZIP file for your browser
2. Open browser extension management page:
   - Edge: \`edge://extensions/\`
   - Chrome: \`chrome://extensions/\`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extracted folder

## Features
- Universal DOM interaction capture
- OData request correlation
- SAPUI5 context extraction
- Screenshot capture with annotations
- Debug/trace mode support

## Debug Mode
Enable debug mode in browser console:
\`\`\`javascript
localStorage.setItem('fiori-debug', 'true')
\`\`\`

## Checksums
\`\`\`
$(cat "$OUTPUT_DIR/checksums.txt" 2>/dev/null || echo "No checksums generated")
\`\`\`
EOF
print_status "Created release notes"

# Summary
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Build completed successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "📦 Build artifacts in: $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR/"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Test the extension: unzip $OUTPUT_DIR/${EXTENSION_NAME}-${VERSION}-edge.zip"
echo "  2. Load in Edge: edge://extensions/ → Load unpacked"
echo "  3. Verify all features work correctly"
echo "  4. Distribute the appropriate .zip file"
echo ""
echo -e "${YELLOW}For production release:${NC}"
echo "  - Sign the extension with your developer certificate"
echo "  - Upload to Edge Add-ons store"
echo "  - Include $OUTPUT_DIR/${EXTENSION_NAME}-${VERSION}-source.zip for review"