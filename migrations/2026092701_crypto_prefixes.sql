-- Crypto references (see 2026092700_ref_prefixes.sql for the scheme): B/S, then C for crypto,
-- then C for coin. BCC01 is the first crypto buy, SCC01 the first crypto sell.
INSERT INTO ref_prefixes (prefix, sec_type, side) VALUES
  ('BCC', 'CRYPTO', 'BUY'),
  ('SCC', 'CRYPTO', 'SELL');
