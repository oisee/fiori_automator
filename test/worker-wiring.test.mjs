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
  instance.stoppingSaves = new Map();
  instance.captureWriteQueue = Promise.resolve();
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

test('worker reconciles late capture with a saved request', async () => {
  const instance = worker();
  const request = { requestId: 'r', tabId: 1, method: 'GET',
    url: 'https://example.test/api/Items', timestamp: 100,
    responseBody: { captured: false } };
  instance.sessions.set(1, { tabId: 1, isRecording: true, networkRequests: [request] });
  await instance.handleCapturedResponse({ url: '/api/Items', method: 'GET', startTime: 101,
    responseData: 'ok', contentType: 'text/plain' }, 1);
  assert.equal(request.responseBody.data, 'ok');
});

test('a response arriving after stop repairs the stored export', async () => {
  const stored = { fioriSessions: {} };
  context.chrome = { storage: { local: {
    async get() { return structuredClone(stored); },
    async set(value) { stored.fioriSessions = structuredClone(value.fioriSessions); }
  } } };
  const instance = worker();
  instance.stopAudioRecording = async () => null;
  instance.notifyContentScript = async () => {};
  instance.broadcastStateChange = () => {};
  instance.audioRecordings = new Map();
  instance.saveSession = async session => {
    const result = await context.chrome.storage.local.get(['fioriSessions']);
    result.fioriSessions[session.sessionId] = instance.cleanSessionData(session);
    await context.chrome.storage.local.set(result);
  };
  const now = Date.now();
  instance.sessions.set(1, { sessionId: 'synthetic', tabId: 1, startTime: now - 100,
    pausedTime: 0, isRecording: true, metadata: {}, events: [], networkRequests: [{
      requestId: 'r', tabId: 1, method: 'GET', url: 'https://example.test/api/Items',
      timestamp: now - 50, responseBody: { captured: false }
    }] });
  await instance.stopRecording(1);
  assert.equal(instance.sessions.has(1), false);
  await instance.handleCapturedResponse({ url: '/api/Items', method: 'GET',
    startTime: now - 49, responseData: 'late', status: 200 }, 1);
  assert.equal(stored.fioriSessions.synthetic.networkRequests[0].responseBody.data, 'late');
});

test('Markdown session summary prints the correlation label', () => {
  const instance = worker();
  instance.analyzeODataOperations = () => ({ entities: [], operations: [] });
  instance.generateSequenceSummary = () => ({ interactions: [{}], actors: ['user'],
    entities: ['Items'], odataOperations: [{ eventId: 'event-1', operation: 'GET',
      entity: 'Items', correlation: 'bound' }] });
  instance.generateImprovedSessionName = () => 'Synthetic session';
  instance.generateMermaidDiagrams = () => '';
  const markdown = instance.generateSessionMarkdown({ sessionId: 'synthetic',
    startTime: 100, metadata: {}, events: [], networkRequests: [] });
  assert.match(markdown, /Event event-1.*\(bound correlation\)/);
  assert.doesNotMatch(markdown, /\[object Object\] correlation/);
});
