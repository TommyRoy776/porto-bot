import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRef, parseRef } from '../components/ref.js';

test('formatRef pads to at least two digits and grows past them', () => {
  assert.equal(formatRef('BSS', 1), 'BSS01');
  assert.equal(formatRef('SSS', 2), 'SSS02');
  assert.equal(formatRef('BSS', 99), 'BSS99');
  assert.equal(formatRef('BSS', 133), 'BSS133');
});

test('parseRef uppercases and pads what the user typed', () => {
  assert.equal(parseRef('bss01'), 'BSS01');
  assert.equal(parseRef(' BSS1 '), 'BSS01');
  assert.equal(parseRef('XSS133'), 'XSS133');
  for (const bad of ['', 'BSS', '01', 'BS01', 'BSSS01', 'BSS-1', '#1']) assert.equal(parseRef(bad), null, bad);
});
