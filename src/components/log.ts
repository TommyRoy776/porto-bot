import type { Tx } from './ledger.js';
import { toDateString } from './validate.js';

// One line per stored change, so `docker compose logs porto-bot` is a record of every transaction and
// the first place to look when a number looks wrong. Plain text, not JSON: it is read by a person.
export function logTx(event: string, userId: string, detail: string) {
  console.log(`${new Date().toISOString()} tx.${event} user=${userId} ${detail}`);
}

// Logs a stored row and hands it back, so write paths can log inline.
export function logRow(event: string, tx: Tx) {
  const detail =
    tx.sec_type === 'SPLIT'
      ? `${tx.ref} SPLIT ${tx.split_to}:${tx.split_from} ${tx.ticker} date=${toDateString(tx.trade_date)}`
      : // shares is stored in hundredths (1278 = 12.78 shares)
        `${tx.ref} ${tx.side} ${tx.shares! / 100} ${tx.ticker} @ ${tx.price} total=${((tx.shares! * tx.price!) / 100).toFixed(2)} date=${toDateString(tx.trade_date)}`;
  logTx(event, tx.user_id, detail);
  return tx;
}
