#!/bin/bash

# Fiori Test Automation Extension Build Script
# Packages extension and copies to Windows for easy reloading

set -e

echo "🎯 Building Fiori Test Automation Extension..."

# Define paths
WINDOWS_BIN_PATH="/mnt/c/bin"
EXTENSION_NAME="fiori_automator"
TARGET_PATH="$WINDOWS_BIN_PATH/$EXTENSION_NAME"

# Create build directory
mkdir -p build

# Clean previous builds
rm -rf build/*.zip

# Step 1: Regenerate all icons from source
echo "🎨 Regenerating icons from source..."
if [ -f "icons/icon_full.png" ]; then
  ./create-icons.sh
else
  echo "⚠️  Warning: icons/icon_full.png not found, skipping icon regeneration"
fi

# Extension files to copy (exclude build artifacts and dev files)
EXTENSION_FILES=(
  "manifest.json"
  "*.js"
  "*.html"
  "*.css"
  "icons/"
)

# Create Windows target directory
echo "📁 Creating Windows target directory..."
mkdir -p "$TARGET_PATH"

# Clean existing files in target
rm -rf "$TARGET_PATH"/*

# Copy extension files to Windows
echo "📋 Copying extension files to Windows..."
for pattern in "${EXTENSION_FILES[@]}"; do
  if [[ $pattern == *"/" ]]; then
    # It's a directory
    if [ -d "$pattern" ]; then
      cp -r "$pattern" "$TARGET_PATH/"
      echo "   ✓ Copied directory: $pattern"
    fi
  else
    # It's a file pattern
    for file in $pattern; do
      if [ -f "$file" ]; then
        cp "$file" "$TARGET_PATH/"
        echo "   ✓ Copied file: $file"
      fi
    done
  fi
done

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

# Create a Windows-accessible zip from the copied files
echo "💾 Creating Windows-accessible extension zip..."
cd "$TARGET_PATH"
zip -r "$WINDOWS_BIN_PATH/fiori-test-automation-latest.zip" . 
cd - > /dev/null

echo ""
echo "✅ Build completed!"
echo ""
echo "📁 Files created:"
echo "   build/fiori-test-automation-extension.zip - Extension package for Chrome/Edge"
echo "   build/fiori-test-automation-source.zip    - Source code archive"
echo "   $TARGET_PATH/                             - Unpacked extension ready for Windows"
echo "   $WINDOWS_BIN_PATH/fiori-test-automation-latest.zip - Windows-accessible zip"
echo ""
echo "🚀 Windows Installation Instructions:"
echo "1. Open Chrome/Edge and go to chrome://extensions/ or edge://extensions/"
echo "2. Enable 'Developer mode' (toggle in top right)"
echo "3. Click 'Load unpacked' and navigate to C:\\bin\\$EXTENSION_NAME\\"
echo "4. The extension will be loaded and ready to use!"
echo ""
echo "🔄 To reload after changes:"
echo "1. Run this build script again: ./build.sh"
echo "2. In Chrome/Edge extensions page, click the reload button on the extension"
echo ""
echo "🎉 Ready to use!"