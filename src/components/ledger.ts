import type { Holdable } from './units.js';

// A row of the transactions table (migrations/001_transactions.sql).
export type Tx = {
  id: number;
  // Human-facing reference like BSS01 (src/components/ref.ts).
  ref: string;
  user_id: string;
  // SPLIT rows apply to the STOCK position of their ticker.
  sec_type: Holdable | 'SPLIT';
  side: 'BUY' | 'SELL' | null;
  ticker: string;
  // Quantity at the sec_type's scale (src/components/units.ts): 1278 STOCK is 12.78 shares,
  // 34000 CRYPTO is 0.00034 coins. Named shares because stock came first.
  shares: number | null;
  price: number | null;
  trade_date: number;
  created_at: number;
  split_from: number | null;
  split_to: number | null;
};

export type Position = { sec_type: Holdable; ticker: string; shares: number; avgCost: number };

// Rows with the same key belong to one position. A split row joins its ticker's stock position.
export const positionKey = (tx: Pick<Tx, 'sec_type' | 'ticker'>) =>
  `${tx.sec_type === 'SPLIT' ? 'STOCK' : tx.sec_type} ${tx.ticker}`;

// Quantity of that row's position held after each row, in replay order.
export type History = { tx: Tx; shares: number }[];

export type Replay =
  | { ok: true; positions: Position[]; history: History }
  | { ok: false; oversold: Tx };

// Replays one user's rows, in any order, into current positions using average cost.
export function replay(rows: Tx[]): Replay {
  const held = new Map<string, Position>();
  const history: History = [];

  const ordered = rows.toSorted((a, b) => a.trade_date - b.trade_date || a.created_at - b.created_at || a.id - b.id);
  for (const tx of ordered) {
    const key = positionKey(tx);
    const sec_type = tx.sec_type === 'SPLIT' ? 'STOCK' : tx.sec_type;
    const pos = held.get(key) ?? { sec_type, ticker: tx.ticker, shares: 0, avgCost: 0 };

    if (tx.sec_type === 'SPLIT') {
      // shares is in hundredths, so this rounds half-up to the nearest 0.01 share; anything
      // smaller is discarded along with its cost.
      pos.shares = Math.round((pos.shares * tx.split_to!) / tx.split_from!);
      pos.avgCost = (pos.avgCost * tx.split_from!) / tx.split_to!;
    } else if (tx.side === 'BUY') {
      // Deliberately not divided by the scale (100 for stock): quantities are scaled on both sides
      // of this weighted average, so the factor cancels. Only dollar amounts divide.
      pos.avgCost = (pos.shares * pos.avgCost + tx.shares! * tx.price!) / (pos.shares + tx.shares!);
      pos.shares += tx.shares!;
    } else {
      if (tx.shares! > pos.shares) return { ok: false, oversold: tx };
      pos.shares -= tx.shares!;
    }

    if (pos.shares > 0) held.set(key, pos);
    else held.delete(key);
    history.push({ tx, shares: pos.shares });
  }

  const positions = [...held.values()].sort(
    (a, b) => a.ticker.localeCompare(b.ticker) || a.sec_type.localeCompare(b.sec_type),
  );
  return { ok: true, positions, history };
}

// A row as written by an insert, before the database assigns id and created_at.
export type NewTx = Omit<Tx, 'id' | 'created_at' | 'ref'>;

export type Change = { insert: NewTx } | { update: Tx } | { delete: Tx };

// The user's rows as they would be after `change`, for replay validation before anything is written.
export function applyChange(rows: Tx[], change: Change): Tx[] {
  if ('insert' in change) {
    // Stand-ins for what the database will assign: now, an id above every existing row, and the
    // reference, which only matters once the row is stored.
    return [
      ...rows,
      { ...change.insert, id: Number.MAX_SAFE_INTEGER, created_at: Math.floor(Date.now() / 1000), ref: '' },
    ];
  }
  if ('update' in change) return rows.map((row) => (row.id === change.update.id ? change.update : row));
  return rows.filter((row) => row.id !== change.delete.id);
}
