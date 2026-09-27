import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmModal } from '../components/confirmModal.js';

test('the confirm modal only accepts text as long as the expected text', () => {
  const json = JSON.stringify(confirmModal('clear:AAPL', 'Delete?', 'AAPL').toJSON());
  assert.match(json, /"min_length":4/);
  assert.match(json, /"max_length":4/);
});
