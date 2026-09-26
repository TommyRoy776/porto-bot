import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';

// Resolves to <repo>/migrations from both src/queries (tsx) and dist/queries (built image).
const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

// Applies every NNN_*.sql file numbered above PRAGMA user_version, each in its own transaction,
// so a failing file leaves the database at the last version that fully applied. Backs up the
// database file first whenever there is something to apply.
export function migrate(db: DatabaseSync, dir = MIGRATIONS_DIR) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const pending = readdirSync(dir)
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .map((file) => ({ file, version: parseInt(file, 10) }))
    .filter(({ version }) => version > current)
    .sort((a, b) => a.version - b.version);

  // Snapshot before changing an existing database, e.g. porto.db.v2-backup-2026-09-26T13-45-00.db
  // next to the original (so in the /data volume in Docker). Skipped for a brand-new database
  // (version 0, nothing to lose) and for :memory:, where location() is null. VACUUM INTO writes a
  // consistent copy even while the file is open. Backups are never pruned; delete old ones by hand.
  const location = db.location();
  if (pending.length && current > 0 && location) {
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
    // VACUUM INTO does not accept bound parameters; escape quotes for the SQL string literal.
    db.exec(`VACUUM INTO '${`${location}.v${current}-backup-${stamp}.db`.replaceAll("'", "''")}'`);
  }

  for (const { file, version } of pending) {
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(join(dir, file), 'utf8'));
      // PRAGMA does not accept bound parameters; version is an integer parsed from the filename.
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
