import test from 'node:test';
import assert from 'node:assert/strict';
import capture from '../response-capture.js';

test('streamed capture keeps a bounded body and counts all decoded text', async () => {
  const limit = 1024 * 1024;
  const encoder = new TextEncoder();
  const chunks = ['a'.repeat(limit - 1), 'bc', 'd'].map(text => encoder.encode(text));
  const response = { body: new ReadableStream({
    pull(controller) {
      if (chunks.length) controller.enqueue(chunks.shift());
      else controller.close();
    }
  }) };
  assert.deepEqual(await capture.readLimitedText(response, limit), {
    responseData: 'a'.repeat(limit - 1) + 'b', truncated: true,
    originalLength: limit + 2, keptLength: limit
  });
});

test('capture handles a no-body response with a text content type', async () => {
  const response = new Response(null, { status: 204,
    headers: { 'content-type': 'application/json' } });
  assert.deepEqual(await capture.readLimitedText(response, 1024), { responseData: '' });
});

test('XHR JSON is captured and document length is explicitly unavailable', () => {
  const xhr = { responseType: 'json', response: { item: 1 },
    getResponseHeader: () => null, getAllResponseHeaders: () => '' };
  assert.equal(capture.summarizeXhr(xhr, 100).responseData, '{"item":1}');
  xhr.responseType = 'document';
  assert.equal(capture.summarizeXhr(xhr, 100).byteLength, null);
});
