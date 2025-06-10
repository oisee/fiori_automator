#!/bin/bash

# Generate all icon sizes from icon_full.png source using ffmpeg
# This script regenerates all extension icons from the master source

set -e

SOURCE_ICON="icons/icon_full.png"
ICON_DIR="icons"

# Check if source icon exists
if [ ! -f "$SOURCE_ICON" ]; then
    echo "❌ Error: Source icon not found at $SOURCE_ICON"
    echo "Please ensure icon_full.png exists in the icons/ directory"
    exit 1
fi

# Check if ffmpeg is available
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ Error: ffmpeg not found"
    echo "Please install ffmpeg to regenerate icons:"
    echo "  Ubuntu/Debian: sudo apt install ffmpeg"
    echo "  macOS: brew install ffmpeg"
    echo "  Windows: Download from https://ffmpeg.org/"
    exit 1
fi

echo "🔧 Regenerating all icons from $SOURCE_ICON using ffmpeg..."

# Ensure icons directory exists
mkdir -p "$ICON_DIR"

# Generate all required icon sizes
SIZES=(16 32 48 128)

for size in "${SIZES[@]}"; do
    output_file="$ICON_DIR/icon${size}.png"
    echo "   Generating ${size}x${size} icon: $output_file"
    
    ffmpeg -i "$SOURCE_ICON" \
           -vf "scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2" \
           -y "$output_file" \
           2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "   ✅ Created $output_file"
    else
        echo "   ❌ Failed to create $output_file"
        exit 1
    fi
done

echo ""
echo "✅ All icons regenerated successfully!"
echo ""
echo "Generated icon files:"
ls -la "$ICON_DIR"/icon*.png

echo ""
echo "🔍 Icon file sizes:"
for size in "${SIZES[@]}"; do
    file="$ICON_DIR/icon${size}.png"
    if [ -f "$file" ]; then
        actual_size=$(file "$file" | grep -o '[0-9]\+ x [0-9]\+' | head -1)
        file_size=$(du -h "$file" | cut -f1)
        echo "   icon${size}.png: ${actual_size} (${file_size})"
    fi
done

echo ""
echo "✨ Icon regeneration complete! All sizes generated from icon_full.png"