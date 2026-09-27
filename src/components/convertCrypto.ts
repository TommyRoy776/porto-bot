import { db } from '../queries/db.js';
import { stockRowsForTicker, updateRow } from '../queries/transactions.js';
import { logRow } from './log.js';
import { units } from './units.js';

// One-time fix for installs that ran V1, which had no crypto: members recorded coins with /buy as
// if they were stock, in hundredths. This turns every such row, for every member, into a CRYPTO
// row under `to` at the crypto scale, with a crypto reference. Run by the host (src/convertCrypto.ts).
// Returns how many rows changed.
//
// No replay check is needed: every member's stock rows and crypto rows already replay on their own,
// and merging two ledgers that never go negative cannot go negative.
export function convertToCrypto(from: string, to: string) {
  const rows = stockRowsForTicker(from);
  // A split recorded on a coin has no crypto meaning; the host decides what to do with it first.
  if (rows.some((row) => row.sec_type === 'SPLIT')) {
    throw new Error(`${from} has split rows. Delete them with /delete, then run this again.`);
  }
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      const shares = row.shares! * (units.CRYPTO.scale / units.STOCK.scale);
      logRow('convert', updateRow({ ...row, sec_type: 'CRYPTO', ticker: to, shares }));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return rows.length;
}
