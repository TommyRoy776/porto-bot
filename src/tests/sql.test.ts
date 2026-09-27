import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const srcDir = fileURLToPath(new URL('..', import.meta.url));

// SQL built from a template literal with ${...} inside, passed straight to prepare() or exec().
const INTERPOLATED_SQL = /\.(prepare|exec)\(\s*`[^`]*\$\{/g;

test('no query interpolates values into SQL; every value is a bound parameter', () => {
  const sources = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter(
    (f) => f.endsWith('.ts') && !f.startsWith('tests'),
  );
  const found = sources.flatMap((f) =>
    [...readFileSync(srcDir + f, 'utf8').matchAll(INTERPOLATED_SQL)].map(() => f),
  );
  // The two exceptions are statements SQLite cannot bind parameters into, both commented where they
  // are: VACUUM INTO's file name and PRAGMA user_version's number, neither from user input.
  assert.deepEqual(found, ['queries/migrate.ts', 'queries/migrate.ts']);
});
