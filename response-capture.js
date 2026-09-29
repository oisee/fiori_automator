// Shared response capture helpers for the content script and Node tests.
var FioriResponseCapture = (() => {
  async function readLimitedText(response, limit) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks = [];
    let originalLength = 0;
    let keptLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const decoded = decoder.decode(value, { stream: true });
        originalLength += decoded.length;
        if (keptLength < limit) {
          const kept = decoded.slice(0, limit - keptLength);
          chunks.push(kept);
          keptLength += kept.length;
        }
      }
      const final = decoder.decode();
      originalLength += final.length;
      if (keptLength < limit) chunks.push(final.slice(0, limit - keptLength));
      const data = chunks.join('');
      return originalLength > limit ? { responseData: data, truncated: true,
        originalLength, keptLength: data.length } : { responseData: data };
    } finally {
      reader.releaseLock();
    }
  }
  return { readLimitedText };
})();
if (typeof module !== 'undefined') module.exports = FioriResponseCapture;
