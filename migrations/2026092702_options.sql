-- Options (calls and puts) live in transactions like every other trade, so /amend and /delete keep
-- one reference namespace. For sec_type 'OPTION' rows, shares holds whole contracts and price the
-- per-share premium quoted for one contract (a contract covers 100 shares; see src/components/units.ts).
-- These three columns are NULL on every other row. Together with ticker they identify a position:
-- two lots with a different right, strike or expiry are different holdings.
--
-- 'CALL' or 'PUT'. Named opt_right because RIGHT is an SQL keyword (RIGHT JOIN).
ALTER TABLE transactions ADD COLUMN opt_right TEXT;
-- Strike price per share, above 0.
ALTER TABLE transactions ADD COLUMN strike REAL;
-- Expiry date as unix seconds at 12:00 UTC, the same convention as trade_date.
ALTER TABLE transactions ADD COLUMN expiry INTEGER;

-- Option references (see 2026092700_ref_prefixes.sql for the scheme): B/S, then O for option, then
-- the right as the secondary type, C call or P put. BOC01 is the first bought call.
ALTER TABLE ref_prefixes ADD COLUMN opt_right TEXT;
INSERT INTO ref_prefixes (prefix, sec_type, side, opt_right) VALUES
  ('BOC', 'OPTION', 'BUY', 'CALL'),
  ('BOP', 'OPTION', 'BUY', 'PUT'),
  ('SOC', 'OPTION', 'SELL', 'CALL'),
  ('SOP', 'OPTION', 'SELL', 'PUT');
