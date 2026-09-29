-- Transaction references are three letters and a number, like BSS01. The letters are
-- [transaction type][security type][secondary type]:
--
--   transaction type   B buy, S sell, X split (a split has no side)
--   security type      S shares (stock)
--   secondary type     S shares; for types with variants it names the variant
--
-- so BSS01 is the first stock buy, SSS01 the first stock sell and XSS01 the first stock split.
-- This table is the whole list: the bot looks a row's prefix up here by the row's own columns,
-- so adding a type is an INSERT in a new migration, not a code change.
CREATE TABLE ref_prefixes (
  prefix TEXT PRIMARY KEY,
  -- Matched against transactions.sec_type and transactions.side (NULL for splits).
  sec_type TEXT NOT NULL,
  side TEXT
);

INSERT INTO ref_prefixes (prefix, sec_type, side) VALUES
  ('BSS', 'STOCK', 'BUY'),
  ('SSS', 'STOCK', 'SELL'),
  ('XSS', 'SPLIT', NULL);

-- Rename the 2-letter references from 002_transaction_refs.sql, keeping each number:
-- BS01 → BSS01, SS01 → SSS01, SL01 → XSS01. A 3-letter value never equals a 2-letter one,
-- so the unique index on ref cannot trip halfway through.
UPDATE transactions
SET ref = CASE substr(ref, 1, 2) WHEN 'BS' THEN 'BSS' WHEN 'SS' THEN 'SSS' WHEN 'SL' THEN 'XSS' END || substr(ref, 3);

UPDATE ref_counters
SET prefix = CASE prefix WHEN 'BS' THEN 'BSS' WHEN 'SS' THEN 'SSS' WHEN 'SL' THEN 'XSS' END;
