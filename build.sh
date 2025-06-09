#!/bin/bash

# Fiori Test Automation Extension Build Script
# Simple script to package the extension for different browsers

set -e

echo "🎯 Building Fiori Test Automation Extension..."

# Create build directory
mkdir -p build

# Clean previous builds
rm -rf build/*.zip

# Create source archive (all files)
echo "📦 Creating source archive..."
zip -r build/fiori-test-automation-source.zip . \
  -x "build/*" "*.git*" "node_modules/*" "*.DS_Store"

# Create Chrome/Edge extension package (production files only)
echo "🌐 Creating Chrome/Edge extension package..."
zip -r build/fiori-test-automation-extension.zip \
  manifest.json \
  *.js \
  *.html \
  *.css \
  icons/ \
  -x "build.sh" "*.md"

echo "✅ Build completed!"
echo ""
echo "📁 Files created:"
echo "   build/fiori-test-automation-extension.zip - Extension package for Chrome/Edge"
echo "   build/fiori-test-automation-source.zip    - Source code archive"
echo ""
echo "🚀 Installation Instructions:"
echo "1. Extract fiori-test-automation-extension.zip to a folder"
echo "2. Open Chrome/Edge and go to Extensions page"
echo "3. Enable 'Developer mode'"
echo "4. Click 'Load unpacked' and select the extracted folder"
echo ""
echo "🎉 Ready to use!"