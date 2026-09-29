import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, version } from '../version.js';

test('parseVersion skips comment lines and surrounding whitespace', () => {
  assert.equal(parseVersion('# The version\n#\n# 9.9.9 in a comment\n\n1.2.3-beta\n'), '1.2.3-beta');
});

test('the VERSION file at the repo root is readable and semver', () => {
  assert.match(version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/);
});
