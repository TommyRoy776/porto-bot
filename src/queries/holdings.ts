import type { History, HistoryEntry, Position, Tx } from '../components/ledger.js';
import type { Holdable } from '../components/units.js';
import { db } from './db.js';

// Reads and writes of the stored replay results (migrations/2026092703_holdings.sql).

// A tx_history row joined to its transaction, as selected by the history queries below.
type HistoryRow = Tx & { held_before: number; held_after: number; realized: number | null };
const toEntry = ({ held_before, held_after, realized, ...tx }: HistoryRow): HistoryEntry => ({
  tx,
  before: held_before,
  after: held_after,
  realized,
});

// Replaces everything stored for one member with a fresh replay's positions and history. Callers
// run it inside inTransaction, together with the ledger write it follows.
export function replaceUserState(userId: string, positions: Position[], history: History) {
  db.prepare('DELETE FROM holdings WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM tx_history WHERE user_id = ?').run(userId);
  const holding = db.prepare(
    `INSERT INTO holdings (user_id, sec_type, ticker, opt_right, strike, expiry, shares, avg_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const p of positions) holding.run(userId, p.sec_type, p.ticker, p.opt_right, p.strike, p.expiry, p.shares, p.avgCost);
  const entry = db.prepare('INSERT INTO tx_history (tx_id, user_id, held_before, held_after, realized) VALUES (?, ?, ?, ?, ?)');
  for (const h of history) entry.run(h.tx.id, userId, h.before, h.after, h.realized);
}

// Empties both tables, before rebuilding them for every member.
export function clearAllState() {
  db.exec('DELETE FROM holdings; DELETE FROM tx_history;');
}

// A member's positions, optionally of one type, in the same order replay() sorts them: ticker,
// then type, then an option's expiry, strike and right. Code-point order (SQLite's default BINARY
// collation) matches replay's comparison exactly. Spread into plain objects, since node:sqlite
// returns null-prototype ones, so these compare equal to the positions replay() builds.
export const holdingsOf = (userId: string, secType?: Holdable) =>
  (
    db
    .prepare(
      `SELECT sec_type, ticker, opt_right, strike, expiry, shares, avg_cost AS avgCost
       FROM holdings
       WHERE user_id = ? AND (? IS NULL OR sec_type = ?)
       ORDER BY ticker, sec_type, expiry, strike, opt_right`,
    )
      .all(userId, secType ?? null, secType ?? null) as Position[]
  ).map((p) => ({ ...p }));

// Members who currently hold shares of a stock, for /split.
export const holdersOf = (ticker: string) =>
  (
    db.prepare("SELECT DISTINCT user_id FROM holdings WHERE sec_type = 'STOCK' AND ticker = ? ORDER BY user_id").all(ticker) as {
      user_id: string;
    }[]
  ).map((r) => r.user_id);

// A member's newest `limit` transactions with their stored history, newest first. Replay order
// is trade_date, then created_at, then id, so newest first is that order reversed.
export const recentHistory = (userId: string, limit: number) =>
  (
    db
      .prepare(
        `SELECT t.*, h.held_before, h.held_after, h.realized
         FROM transactions t JOIN tx_history h ON h.tx_id = t.id
         WHERE t.user_id = ?
         ORDER BY t.trade_date DESC, t.created_at DESC, t.id DESC
         LIMIT ?`,
      )
      .all(userId, limit) as HistoryRow[]
  ).map(toEntry);

// One page of a member's transactions for one ticker, newest first, with how many pages there
// are. `page` is clamped to the pages that exist, since rows may have changed since a Previous or
// Next button was sent. pageCount is 0 when the member has no rows for the ticker.
export function tickerHistory(userId: string, ticker: string, pageSize: number, page: number) {
  const { count } = db
    .prepare('SELECT count(*) AS count FROM transactions WHERE user_id = ? AND ticker = ?')
    .get(userId, ticker) as { count: number };
  const pageCount = Math.ceil(count / pageSize);
  page = Math.min(Math.max(page, 0), Math.max(pageCount - 1, 0));
  const rows = db
    .prepare(
      `SELECT t.*, h.held_before, h.held_after, h.realized
       FROM transactions t JOIN tx_history h ON h.tx_id = t.id
       WHERE t.user_id = ? AND t.ticker = ?
       ORDER BY t.trade_date DESC, t.created_at DESC, t.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(userId, ticker, pageSize, page * pageSize) as HistoryRow[];
  return { rows: rows.map(toEntry), page, pageCount };
}

// Realized P/L stored for one transaction; null for anything but a SELL.
export const realizedOf = (txId: number) =>
  (db.prepare('SELECT realized FROM tx_history WHERE tx_id = ?').get(txId) as { realized: number | null } | undefined)
    ?.realized ?? null;
