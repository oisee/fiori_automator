import test from 'node:test';
import assert from 'node:assert/strict';
import capture from '../response-capture.js';

test('streamed capture keeps a bounded body and counts all decoded text', async () => {
  const encoder = new TextEncoder();
  const chunks = ['abc', 'def', 'ghi'].map(text => encoder.encode(text));
  const response = { body: new ReadableStream({
    pull(controller) {
      if (chunks.length) controller.enqueue(chunks.shift());
      else controller.close();
    }
  }) };
  assert.deepEqual(await capture.readLimitedText(response, 5), {
    responseData: 'abcde', truncated: true, originalLength: 9, keptLength: 5
  });
});
