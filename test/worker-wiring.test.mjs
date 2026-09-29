import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import logic from '../export-logic.js';

const source = readFileSync(new URL('../background.js', import.meta.url), 'utf8')
  .replace("importScripts('export-logic.js');", '')
  .replace('const backgroundInstance = new FioriTestBackground();',
    'globalThis.TestBackground = FioriTestBackground;');
const context = { FioriExportLogic: logic, console, setTimeout, clearTimeout };
vm.runInNewContext(source, context);

function worker() {
  const instance = Object.create(context.TestBackground.prototype);
  instance.log = () => {};
  instance.capturedResponses = new Map();
  instance.sessions = new Map();
  return instance;
}

test('worker exports parsed batch parts after a second cleaning pass', () => {
  const instance = worker();
  const request = { requestId: 'r', tabId: 1, url: '/$batch', method: 'POST',
    batchOperations: logic.parseBatch('--outer\r\nContent-Type: application/http\r\n\r\nGET Items HTTP/1.1\r\n\r\n--outer--') };
  const first = instance.cleanNetworkData(request);
  const second = instance.cleanNetworkData(first);
  assert.equal(second.batchParts[0].url, 'Items');
});

test('worker reconciles late capture with a saved request', () => {
  const instance = worker();
  const request = { requestId: 'r', tabId: 1, url: '/api/Items', timestamp: 100,
    responseBody: { captured: false } };
  instance.sessions.set(1, { tabId: 1, networkRequests: [request] });
  instance.handleCapturedResponse({ url: '/api/Items', startTime: 101,
    responseData: 'ok', contentType: 'text/plain' }, 1);
  assert.equal(request.responseBody.data, 'ok');
});
