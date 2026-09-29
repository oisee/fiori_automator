// Shared, browser-loadable export helpers. Node tests load the same functions.
var FioriExportLogic = (() => {
  function parseBatch(requestBody) {
    if (typeof requestBody !== 'string') return [];
    const first = requestBody.match(/^--([^\r\n]+)\r?\n/);
    if (!first) return [];
    const parts = [];

    function headersAndBody(text) {
      const separator = text.match(/\r?\n\r?\n/);
      if (!separator) return null;
      const headers = {};
      for (const line of text.slice(0, separator.index).split(/\r?\n/)) {
        const colon = line.indexOf(':');
        if (colon > 0) headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
      }
      return { headers, body: text.slice(separator.index + separator[0].length) };
    }

    function parseMultipart(text, boundary, changeset) {
      const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const delimiter = new RegExp(`(?:^|\\r?\\n)--${escaped}(--)?[ \t]*(?:\\r?\\n|$)`, 'g');
      const markers = [...text.matchAll(delimiter)];
      for (let i = 0; i < markers.length - 1; i++) {
        if (markers[i][1]) break;
        const section = text.slice(markers[i].index + markers[i][0].length, markers[i + 1].index);
        const parsed = headersAndBody(section);
        if (!parsed) continue;
        const type = Object.entries(parsed.headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1] || '';
        const nested = type.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
        if (nested) {
          parseMultipart(parsed.body, nested[1] || nested[2], nested[1] || nested[2]);
          continue;
        }
        const requestLine = parsed.body.match(/^(GET|POST|PUT|PATCH|DELETE|MERGE)\s+(\S+)\s+HTTP\/\d(?:\.\d)?\r?\n/i);
        if (!requestLine) continue;
        const operation = headersAndBody(parsed.body + (parsed.body.match(/\r?\n\r?\n/) ? '' : '\r\n'));
        if (!operation) continue;
        parts.push({ method: requestLine[1].toUpperCase(), url: requestLine[2],
          headers: operation.headers, body: operation.body || null, changeset });
      }
    }

    parseMultipart(requestBody, first[1], null);
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

  const BODY_LIMIT = 1024 * 1024;

  function cleanBody(body) {
    if (body == null) return null;
    if (body?.captured === true) return { ...body, data: cleanBody(body.data) };
    if (typeof body !== 'string' && typeof body !== 'object') return body;
    const serialized = typeof body === 'string' ? body : JSON.stringify(body);
    if (serialized.length <= BODY_LIMIT) return body;
    return {
      data: serialized.slice(0, BODY_LIMIT),
      truncated: true,
      originalLength: serialized.length,
      keptLength: BODY_LIMIT
    };
  }

  function cleanUI5Context(context) {
    if (!context) return null;
    const info = context.elementUI5Info || context;
    return {
      controlId: info.controlId,
      controlType: info.controlType,
      bindingInfo: info.bindingInfo,
      properties: info.properties
    };
  }

  function correlateTimeline(events, requests, tabId) {
    const interactions = events.filter(event =>
      ['click', 'input', 'navigation', 'page_unload', 'field_edit'].includes(event.type));
    const matches = new Map();
    for (let index = 0; index < interactions.length; index++) {
      const event = interactions[index];
      const nextTime = interactions[index + 1]?.timestamp ?? Infinity;
      const info = event.ui5Context?.elementUI5Info || event.ui5Context;
      const paths = Object.values(info?.bindingInfo || {}).map(binding => binding?.path)
        .filter(path => typeof path === 'string' && path.length > 1);
      const correlated = requests.filter(request =>
        request.tabId === tabId && request.timestamp >= event.timestamp &&
        request.timestamp < nextTime && request.timestamp - event.timestamp <= 10000
      ).map(request => {
        const body = typeof request.requestBody === 'string' ? request.requestBody :
          JSON.stringify(request.requestBody || '');
        const partTargets = (request.batchParts || request.batchOperations || [])
          .map(part => `${part.url || ''} ${typeof part.body === 'string' ? part.body : JSON.stringify(part.body || '')}`);
        const target = `${request.url || ''} ${body} ${partTargets.join(' ')}`;
        const bound = paths.some(path => {
          const candidates = [path, path.substring(0, path.lastIndexOf('/'))].filter(value => value.length > 1);
          return candidates.some(value => target.includes(value) || target.includes(encodeURIComponent(value)));
        });
        return {
          ...request,
          correlation: bound ? 'bound' : request.type?.includes('odata') ? 'sequence' : 'tentative'
        };
      });
      const rank = { bound: 0, sequence: 1, tentative: 2 };
      correlated.sort((a, b) => rank[a.correlation] - rank[b.correlation] || a.timestamp - b.timestamp);
      matches.set(event.eventId, correlated);
    }
    return matches;
  }

  function reconcileCapturedResponse(session, response, tabId) {
    if (!session || session.tabId !== tabId) return null;
    const candidates = (session.networkRequests || []).filter(request =>
      request.tabId === tabId && request.url === response.url &&
      request.responseBody?.captured !== true &&
      Math.abs(request.timestamp - response.startTime) < 5000);
    candidates.sort((a, b) => Math.abs(a.timestamp - response.startTime) -
      Math.abs(b.timestamp - response.startTime));
    const request = candidates[0];
    if (!request) return null;
    request.responseBody = {
      captured: true, data: response.responseData, contentType: response.contentType,
      status: response.status, headers: response.headers, truncated: response.truncated,
      originalLength: response.originalLength, keptLength: response.keptLength,
      responseType: response.responseType, byteLength: response.byteLength
    };
    return request;
  }

  return { parseBatch, cleanBatchParts, cleanBody, cleanUI5Context, correlateTimeline, reconcileCapturedResponse, BODY_LIMIT };
})();
if (typeof module !== 'undefined') module.exports = FioriExportLogic;
