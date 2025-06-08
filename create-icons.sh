#!/bin/bash

# Create placeholder icons for the extension
# Replace these with actual icon files later

mkdir -p icons

# Function to create a simple SVG icon
create_svg_icon() {
    local size=$1
    cat > "icons/icon${size}.svg" << EOF
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#0070f3" rx="8"/>
  <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white" font-family="Arial" font-size="$((size/2))px" font-weight="bold">F</text>
</svg>
EOF
}

# Create SVG icons
for size in 16 32 48 128; do
    create_svg_icon $size
done

# Convert SVG to PNG using browser if available
if command -v google-chrome &> /dev/null || command -v chromium-browser &> /dev/null; then
    echo "Converting SVG to PNG..."
    
    # Create HTML file for conversion
    cat > convert.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; padding: 0; }
        canvas { display: none; }
    </style>
</head>
<body>
    <script>
        const sizes = [16, 32, 48, 128];
        
        sizes.forEach(size => {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, size, size);
                
                // Convert to PNG
                canvas.toBlob(blob => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `icon${size}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 'image/png');
            };
            img.src = `icons/icon${size}.svg`;
        });
    </script>
</body>
</html>
EOF
    
    echo "Please open convert.html in a browser to download PNG icons"
else
    echo "Creating placeholder PNG files..."
    
    # Create simple placeholder PNG files
    for size in 16 32 48 128; do
        # Create a minimal PNG header (1x1 blue pixel)
        printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\xf4\xa8\x92\x8d\x00\x00\x00\x00IEND\xaeB`\x82' > "icons/icon${size}.png"
    done
    
    echo "⚠️  Created placeholder PNG files. Replace with actual icons for production."
fi

echo "✅ Icon files created in icons/ directory"
echo ""
echo "Icon files created:"
ls -la icons/

# Cleanup
rm -f convert.html

echo ""
echo "To use custom icons:"
echo "1. Create a 512x512 source icon"
echo "2. Use an image editor or online tool to resize to 16x16, 32x32, 48x48, and 128x128"
echo "3. Save as PNG files in the icons/ directory"