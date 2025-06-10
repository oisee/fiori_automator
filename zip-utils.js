// Minimal ZIP creation utility for Chrome Extension
// Based on ZIP file format specification

class SimpleZipCreator {
  constructor() {
    this.files = [];
  }

  addFile(filename, content, isText = true) {
    let data;
    if (isText) {
      // Convert string to Uint8Array
      data = new TextEncoder().encode(content);
    } else if (content instanceof Uint8Array) {
      data = content;
    } else if (typeof content === 'string' && content.startsWith('data:')) {
      // Handle data URLs (like base64 images)
      const base64Data = content.split(',')[1];
      const binaryString = atob(base64Data);
      data = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        data[i] = binaryString.charCodeAt(i);
      }
    } else {
      throw new Error('Unsupported content type');
    }

    this.files.push({
      name: filename,
      data: data,
      crc32: this.calculateCRC32(data),
      size: data.length
    });
  }

  calculateCRC32(data) {
    // Simple CRC32 calculation
    const table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }

    let crc = 0 ^ (-1);
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }

  writeUint32(view, offset, value) {
    view.setUint32(offset, value, true); // little endian
  }

  writeUint16(view, offset, value) {
    view.setUint16(offset, value, true); // little endian
  }

  generateZip() {
    try {
      // Calculate total size needed
      let totalSize = 0;
      let centralDirSize = 0;
      const localHeaders = [];

      // Calculate sizes
      this.files.forEach(file => {
        const localHeaderSize = 30 + file.name.length; // Local file header + filename
        totalSize += localHeaderSize + file.size;
        
        const centralHeaderSize = 46 + file.name.length; // Central directory header + filename
        centralDirSize += centralHeaderSize;
        
        localHeaders.push(localHeaderSize);
      });

      const centralDirOffset = totalSize;
      totalSize += centralDirSize + 22; // Add central directory + end record

      // Create buffer
      const buffer = new ArrayBuffer(totalSize);
      const view = new DataView(buffer);
      const uint8View = new Uint8Array(buffer);
      let offset = 0;

      // Write local file headers and data
      this.files.forEach((file, index) => {
        // Local file header signature
        this.writeUint32(view, offset, 0x04034b50);
        offset += 4;

        // Version needed to extract
        this.writeUint16(view, offset, 20);
        offset += 2;

        // General purpose bit flag
        this.writeUint16(view, offset, 0);
        offset += 2;

        // Compression method (0 = no compression)
        this.writeUint16(view, offset, 0);
        offset += 2;

        // File last modification time & date (dummy values)
        this.writeUint16(view, offset, 0);
        offset += 2;
        this.writeUint16(view, offset, 0);
        offset += 2;

        // CRC-32
        this.writeUint32(view, offset, file.crc32);
        offset += 4;

        // Compressed size
        this.writeUint32(view, offset, file.size);
        offset += 4;

        // Uncompressed size
        this.writeUint32(view, offset, file.size);
        offset += 4;

        // File name length
        this.writeUint16(view, offset, file.name.length);
        offset += 2;

        // Extra field length
        this.writeUint16(view, offset, 0);
        offset += 2;

        // File name
        const nameBytes = new TextEncoder().encode(file.name);
        uint8View.set(nameBytes, offset);
        offset += nameBytes.length;

        // File data
        uint8View.set(file.data, offset);
        offset += file.data.length;
      });

      // Write central directory
      const centralDirStart = offset;
      this.files.forEach((file, index) => {
        // Central directory header signature
        this.writeUint32(view, offset, 0x02014b50);
        offset += 4;

        // Version made by
        this.writeUint16(view, offset, 20);
        offset += 2;

        // Version needed to extract
        this.writeUint16(view, offset, 20);
        offset += 2;

        // General purpose bit flag
        this.writeUint16(view, offset, 0);
        offset += 2;

        // Compression method
        this.writeUint16(view, offset, 0);
        offset += 2;

        // File last modification time & date
        this.writeUint16(view, offset, 0);
        offset += 2;
        this.writeUint16(view, offset, 0);
        offset += 2;

        // CRC-32
        this.writeUint32(view, offset, file.crc32);
        offset += 4;

        // Compressed size
        this.writeUint32(view, offset, file.size);
        offset += 4;

        // Uncompressed size
        this.writeUint32(view, offset, file.size);
        offset += 4;

        // File name length
        this.writeUint16(view, offset, file.name.length);
        offset += 2;

        // Extra field length
        this.writeUint16(view, offset, 0);
        offset += 2;

        // File comment length
        this.writeUint16(view, offset, 0);
        offset += 2;

        // Disk number start
        this.writeUint16(view, offset, 0);
        offset += 2;

        // Internal file attributes
        this.writeUint16(view, offset, 0);
        offset += 2;

        // External file attributes
        this.writeUint32(view, offset, 0);
        offset += 4;

        // Relative offset of local header
        let localOffset = 0;
        for (let i = 0; i < index; i++) {
          localOffset += localHeaders[i] + this.files[i].size;
        }
        this.writeUint32(view, offset, localOffset);
        offset += 4;

        // File name
        const nameBytes = new TextEncoder().encode(file.name);
        uint8View.set(nameBytes, offset);
        offset += nameBytes.length;
      });

      // End of central directory record
      this.writeUint32(view, offset, 0x06054b50); // Signature
      offset += 4;
      this.writeUint16(view, offset, 0); // Disk number
      offset += 2;
      this.writeUint16(view, offset, 0); // Disk with central directory
      offset += 2;
      this.writeUint16(view, offset, this.files.length); // Total entries this disk
      offset += 2;
      this.writeUint16(view, offset, this.files.length); // Total entries
      offset += 2;
      this.writeUint32(view, offset, centralDirSize); // Central directory size
      offset += 4;
      this.writeUint32(view, offset, centralDirStart); // Central directory offset
      offset += 4;
      this.writeUint16(view, offset, 0); // Comment length
      offset += 2;

      return new Uint8Array(buffer);
    } catch (error) {
      console.error('Error generating ZIP:', error);
      throw error;
    }
  }
}

// Make available globally
window.SimpleZipCreator = SimpleZipCreator;