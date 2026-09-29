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
