import { value, type Holdable } from './units.js';

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
  // OPTION rows only, NULL otherwise (migrations/2026092702_options.sql). expiry is unix seconds
  // at 12:00 UTC, like trade_date.
  opt_right: 'CALL' | 'PUT' | null;
  strike: number | null;
  expiry: number | null;
};

export type Position = Pick<Tx, 'ticker' | 'opt_right' | 'strike' | 'expiry'> & {
  sec_type: Holdable;
  shares: number;
  avgCost: number;
};

// Rows with the same key belong to one position: an option is its ticker, right, strike and
// expiry together. A split row joins its ticker's stock position.
export const positionKey = (tx: Pick<Tx, 'sec_type' | 'ticker' | 'opt_right' | 'strike' | 'expiry'>) =>
  tx.sec_type === 'OPTION'
    ? `OPTION ${tx.ticker} ${tx.opt_right} ${tx.strike} ${tx.expiry}`
    : `${tx.sec_type === 'SPLIT' ? 'STOCK' : tx.sec_type} ${tx.ticker}`;

// After each row, in replay order: the quantity of that row's position held, and for a SELL the
// realized P/L in dollars, (sell price − average cost at that moment) × quantity sold.
export type History = { tx: Tx; shares: number; realized: number | null }[];

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
    const { ticker, opt_right, strike, expiry } = tx;
    const pos = held.get(key) ?? { sec_type, ticker, opt_right, strike, expiry, shares: 0, avgCost: 0 };
    let realized: number | null = null;

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
      realized = value(sec_type, tx.shares!, tx.price! - pos.avgCost);
      pos.shares -= tx.shares!;
    }

    if (pos.shares > 0) held.set(key, pos);
    else held.delete(key);
    history.push({ tx, shares: pos.shares, realized });
  }

  // Alphabetical by ticker; options of one ticker by nearest expiry, then strike, then right.
  const positions = [...held.values()].sort(
    (a, b) =>
      a.ticker.localeCompare(b.ticker) ||
      a.sec_type.localeCompare(b.sec_type) ||
      a.expiry! - b.expiry! ||
      a.strike! - b.strike! ||
      a.opt_right!.localeCompare(b.opt_right!),
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
