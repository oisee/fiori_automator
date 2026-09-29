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
  function summarizeXhr(xhr, limit) {
    const responseType = xhr.responseType || 'text';
    const contentType = xhr.getResponseHeader('content-type') || '';
    const headers = xhr.getAllResponseHeaders();
    let responseData = null;
    if (responseType === 'text') responseData = xhr.responseText;
    if (responseType === 'json') responseData = JSON.stringify(xhr.response);
    let truncation = {};
    if (responseData != null && responseData.length > limit) {
      truncation = { truncated: true, originalLength: responseData.length, keptLength: limit };
      responseData = responseData.slice(0, limit);
    }
    const byteLength = responseType === 'arraybuffer' ? xhr.response?.byteLength :
      responseType === 'blob' ? xhr.response?.size :
      responseType === 'document' ? Number(xhr.getResponseHeader('content-length')) || null : undefined;
    return { responseType, responseData, byteLength, contentType, headers, ...truncation };
  }

  return { readLimitedText, summarizeXhr };
})();
if (typeof module !== 'undefined') module.exports = FioriResponseCapture;
