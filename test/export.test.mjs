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
