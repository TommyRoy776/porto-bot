-- Stored results of replaying each member's ledger (src/components/ledger.ts), so /portfolio and
-- /position read a few rows instead of replaying a member's whole history on every command.
-- transactions stays the source of truth: every write replays the member's ledger to validate it
-- anyway, and commitChange (src/components/userLedger.ts) replaces that member's rows in both
-- tables from that replay, in the same database transaction as the ledger write. The bot also
-- rebuilds both tables for every member at startup, which fills them on the first boot after
-- upgrading and repairs any drift. Nothing else writes here.

-- One row per member per position currently held. A position sold to zero has no row.
CREATE TABLE holdings (
  user_id TEXT NOT NULL,
  -- The position key, the same columns as transactions: STOCK and CRYPTO positions are a ticker,
  -- an OPTION is a ticker, right, strike and expiry together (NULL for the others).
  sec_type TEXT NOT NULL,
  ticker TEXT NOT NULL,
  opt_right TEXT,
  strike REAL,
  expiry INTEGER,
  -- Quantity at the sec_type's scale (src/components/units.ts), and average cost per whole unit.
  shares INTEGER NOT NULL,
  avg_cost REAL NOT NULL
);
CREATE INDEX holdings_user ON holdings (user_id);
CREATE INDEX holdings_ticker ON holdings (ticker);

-- One row per transaction: its position's quantity just before and just after it (a split line
-- shows "5 → 7.5 shares"), and for a SELL the realized P/L in dollars.
CREATE TABLE tx_history (
  tx_id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  held_before INTEGER NOT NULL,
  held_after INTEGER NOT NULL,
  realized REAL
);
CREATE INDEX tx_history_user ON tx_history (user_id);
