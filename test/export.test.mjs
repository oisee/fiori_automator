import test from 'node:test';
import assert from 'node:assert/strict';
import logic from '../export-logic.js';

test('batch parser keeps real requests and changeset identity', () => {
  const body = [
    '--batch_demo', 'Content-Type: multipart/mixed; boundary=changeset_one', '',
    '--changeset_one', 'Content-Type: application/http', '',
    'PATCH Items(1) HTTP/1.1', 'Content-Type: application/json', 'X-Test: yes', '',
    '{"name":"A"}', '--changeset_one--', '--batch_demo',
    'Content-Type: application/http', '', 'GET Items HTTP/1.1', 'Accept: application/json', '',
    '--batch_demo--'
  ].join('\r\n');
  const parts = logic.cleanBatchParts(logic.parseBatch(body));
  assert.deepEqual(parts, [
    { method: 'PATCH', url: 'Items(1)', headers: { 'Content-Type': 'application/json', 'X-Test': 'yes' }, body: '{"name":"A"}', changeset: 'changeset_one' },
    { method: 'GET', url: 'Items', headers: { Accept: 'application/json' }, body: null, changeset: null }
  ]);
  assert.equal(logic.cleanBatchParts([{ method: null, url: null }]).length, 0);
});

test('body cleaning records lengths when a string or JSON body exceeds the limit', () => {
  const long = 'x'.repeat(logic.BODY_LIMIT + 3);
  const cleaned = logic.cleanBody(long);
  assert.equal(cleaned.truncated, true);
  assert.equal(cleaned.originalLength, logic.BODY_LIMIT + 3);
  assert.equal(cleaned.keptLength, logic.BODY_LIMIT);
  assert.equal(cleaned.data.length, logic.BODY_LIMIT);
  assert.deepEqual(logic.cleanBody({ captured: true, data: long }).data, cleaned);
  assert.deepEqual(logic.cleanBody({ value: 'ok' }), { value: 'ok' });
});

test('UI5 control identity and binding survive event cleaning', () => {
  const context = { globalUI5Context: { isUI5App: true }, elementUI5Info: {
    controlId: 'view--field', controlType: 'sap.m.Input',
    bindingInfo: { value: { path: '/Items(1)/Name', model: 'ODataModel' } },
    properties: { editable: true }
  } };
  assert.deepEqual(logic.cleanUI5Context(context), context.elementUI5Info);
  assert.equal(logic.cleanUI5Context(null), null);
});

test('correlation follows tab and interaction sequence, preferring bound requests', () => {
  const events = [
    { eventId: 'a', type: 'click', timestamp: 100, ui5Context: { elementUI5Info: { bindingInfo: { value: { path: '/Items(1)' } } } } },
    { eventId: 'b', type: 'input', timestamp: 250 },
    { eventId: 'c', type: 'navigation', timestamp: 12000 }
  ];
  const requests = [
    { requestId: 'before', tabId: 1, timestamp: 99, url: '/Items(1)', type: 'odata' },
    { requestId: 'other-tab', tabId: 2, timestamp: 120, url: '/Items(1)', type: 'odata' },
    { requestId: 'generic', tabId: 1, timestamp: 120, url: '/api/other', type: 'odata' },
    { requestId: 'bound', tabId: 1, timestamp: 150, url: '/Items(1)', type: 'odata' },
    { requestId: 'next', tabId: 1, timestamp: 300, url: '/api/other', type: 'other' },
    { requestId: 'late', tabId: 1, timestamp: 11000, url: '/api/late', type: 'odata' }
  ];
  const matches = logic.correlateTimeline(events, requests, 1);
  assert.deepEqual(matches.get('a').map(item => [item.requestId, item.correlation]), [
    ['bound', 'bound'], ['generic', 'sequence']
  ]);
  assert.deepEqual(matches.get('b').map(item => [item.requestId, item.correlation]), [
    ['next', 'tentative']
  ]);
  assert.deepEqual(matches.get('c'), []);
});

test('correlation uses source time when asynchronous events arrive out of order', () => {
  const events = [
    { eventId: 'input', type: 'input', timestamp: 200 },
    { eventId: 'click', type: 'click', timestamp: 100 }
  ];
  const requests = [{ requestId: 'after-input', tabId: 1, timestamp: 210,
    url: '/api/Items' }];
  const matches = logic.correlateTimeline(events, requests, 1);
  assert.deepEqual(matches.get('click'), []);
  assert.deepEqual(matches.get('input').map(request => request.requestId), ['after-input']);
});


test('batch parts remain clean after a second export pass', () => {
  const parsed = logic.cleanBatchParts(logic.parseBatch('--batch_demo\nGET Items HTTP/1.1\n\n--batch_demo--'));
  assert.deepEqual(logic.cleanBatchParts(parsed), parsed);
});

test('CRLF multipart accepts arbitrary boundaries and preserves body lines', () => {
  const body = [
    '--outer-7', 'Content-Type: multipart/mixed; boundary="inner-2"', '',
    '--inner-2', 'Content-Type: application/http', '',
    'PATCH Items(1) HTTP/1.1', 'Content-Type: text/plain', '',
    'line one', 'GET fake HTTP/1.1', 'last line  ',
    '--inner-2--', '--outer-7--'
  ].join('\r\n');
  assert.deepEqual(logic.parseBatch(body), [{
    method: 'PATCH', url: 'Items(1)', headers: { 'Content-Type': 'text/plain' },
    body: 'line one\r\nGET fake HTTP/1.1\r\nlast line  ', changeset: 'inner-2'
  }]);
});

test('late capture repairs the matching saved request', () => {
  const session = { tabId: 1, networkRequests: [
    { requestId: 'a', tabId: 1, url: '/api/Items', timestamp: 100,
      responseBody: { captured: false } }
  ] };
  const response = { url: '/api/Items', startTime: 101, responseData: 'ok',
    contentType: 'text/plain', status: 200, headers: {} };
  assert.equal(logic.reconcileCapturedResponse(session, response, 2), null);
  assert.equal(logic.reconcileCapturedResponse(session, response, 1)?.requestId, 'a');
  assert.deepEqual(session.networkRequests[0].responseBody.data, 'ok');
  assert.equal(logic.reconcileCapturedResponse(session, response, 1), null);
});

test('same-millisecond and immediate requests follow source interaction time', () => {
  const events = [{ eventId: 'click', type: 'click', timestamp: 100 }];
  const requests = [
    { requestId: 'same', tabId: 1, timestamp: 100, url: '/api/a' },
    { requestId: 'immediate', tabId: 1, timestamp: 101, url: '/api/b' }
  ];
  assert.deepEqual(logic.correlateTimeline(events, requests, 1).get('click')
    .map(request => request.requestId), ['same', 'immediate']);
});

test('binding matches a batch part past the cleaned outer body limit', () => {
  const events = [{ eventId: 'a', type: 'click', timestamp: 100,
    ui5Context: { bindingInfo: { value: { path: '/Items(1)' } } } }];
  const requests = [{ requestId: 'batch', tabId: 1, timestamp: 101,
    url: '/$batch', requestBody: { data: 'unrelated', truncated: true },
    batchParts: [{ url: '/Items(1)', body: '{"value":1}' }], type: 'odata-batch' }];
  assert.equal(logic.correlateTimeline(events, requests, 1).get('a')[0].correlation, 'bound');
});
