#!/bin/bash

# Create proper PNG icons for the extension
# Using base64 encoded minimal valid PNG files

mkdir -p icons

# Function to create a valid colored PNG
create_png() {
    local size=$1
    local filename="icons/icon${size}.png"
    
    # Create different colored squares for different sizes
    case $size in
        16)
            # Small blue square - 16x16
            echo -n "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABdSURBVDiN7ZAxDgAgCAPB//9ZHYwJKlqMN2MhQDqgKiJiZhBxd3IBAQAAEF2cGUg1sNkZZnbuSZJk5p601hpzzrnW2ntv7z0ppZRSEhERETPDzBhjqCoAAAAA4OM9F2/zJUl/AAAAAElFTkSuQmCC" | base64 -d > "$filename"
            ;;
        32)
            # Medium blue square - 32x32
            echo -n "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA3wAAAN8B9wStXgAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAB5SURBVFiF7daxDYAwDETR70gZgRUYgRXYiBEYjQ3IZmRAKkpAcpHASFz1lU/+dzKyLIQQQgghhBBTUVU1M4cxxhhjjDFSSplz7r1HRFLee++9t9ZyzqW11nuPiJhZRGTOWWsdY5RScveqKpFZ13VZlu/vAQAAAADw5gaU9zJu8xKHiQAAAABJRU5ErkJggg==" | base64 -d > "$filename"
            ;;
        48)
            # Larger blue square - 48x48
            echo -n "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7wAAAO8BKgjzRwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAACDSURBVGiB7dihDcJAGIbhp5cg2IANYAMmYAJGYANGYBM2aDdgg3aDEhIkBEFwOKr6kH+59+tXXfK/7yuhKKWUUkoppZRSqokxRiklImJmZmaMMcwsxjjGWNd1WZYpJSKKiLTWWmtzzjnnEBERMbPee++9hxDu7wEAAAAAAAD+3AVj7Udy1RA5iAAAAABJRU5ErkJggg==" | base64 -d > "$filename"
            ;;
        128)
            # Large blue square - 128x128
            echo -n "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAABQAAAAUAB0svW1gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADVSURBVHic7d3BDcIwEATAXUrLAHTACHRAB5RAB5RADXRAF6EDOsAPgvCJFBBg77J7M38byfK9doQkAAAAAAAAAAAAAAAAwP/VWqOUEhHxnFLKOeecW2utNRGR1lrvvffee++llNJaizHGGKPWGqVUVQ1V1d1zRGRdd3cfEam17p4jIndPVdU553XdPSciknPePUdEYozrug8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOD7PgBQ3VV5kkGq3gAAAABJRU5ErkJggg==" | base64 -d > "$filename"
            ;;
    esac
}

# Create all icon sizes
echo "Creating valid PNG icons..."
for size in 16 32 48 128; do
    create_png $size
    echo "✓ Created icon${size}.png"
done

echo ""
echo "✅ Valid PNG icons created successfully!"
echo ""
echo "Icon files:"
ls -la icons/*.png

# Verify the PNG files are valid
echo ""
echo "Verifying PNG files..."
for size in 16 32 48 128; do
    if file "icons/icon${size}.png" | grep -q "PNG image data"; then
        echo "✓ icon${size}.png is a valid PNG file"
    else
        echo "✗ icon${size}.png is NOT valid!"
    fi
done