// Shared, browser-loadable export helpers. Node tests load the same functions.
var FioriExportLogic = (() => {
  function parseBatch(requestBody) {
    if (typeof requestBody !== 'string') return [];
    const parts = [];
    let changeset = null;
    let part = null;
    let readingHeaders = false;
    let readingBody = false;

    function finishPart() {
      if (part?.method && part.url) {
        part.body = part.body.length ? part.body.join('\n').trimEnd() : null;
        delete part._body;
        parts.push(part);
      }
      part = null;
      readingHeaders = false;
      readingBody = false;
    }

    for (const rawLine of requestBody.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (/^--changeset_[^\s]+/.test(line)) {
        finishPart();
        changeset = line.endsWith('--') ? null : line.slice(2);
        continue;
      }
      if (/^--batch_[^\s]+/.test(line)) {
        finishPart();
        if (line.endsWith('--')) changeset = null;
        continue;
      }
      const match = line.match(/^(GET|POST|PUT|PATCH|DELETE|MERGE)\s+(\S+)\s+HTTP\/\d(?:\.\d)?$/i);
      if (match) {
        finishPart();
        part = { method: match[1].toUpperCase(), url: match[2], headers: {}, body: [], changeset };
        readingHeaders = true;
        continue;
      }
      if (readingHeaders && part) {
        if (!line) {
          readingHeaders = false;
          readingBody = true;
        } else {
          const separator = rawLine.indexOf(':');
          if (separator > 0) part.headers[rawLine.slice(0, separator).trim()] = rawLine.slice(separator + 1).trim();
        }
      } else if (readingBody && part) {
        part.body.push(rawLine);
      }
    }
    finishPart();
    return parts;
  }

  function cleanBatchParts(operations) {
    return (operations || []).filter(part => part?.method && part.url).map(part => ({
      method: part.method,
      url: part.url,
      headers: part.headers || {},
      body: part.body ?? null,
      changeset: part.changeset ?? null
    }));
  }

  return { parseBatch, cleanBatchParts };
})();
if (typeof module !== 'undefined') module.exports = FioriExportLogic;
