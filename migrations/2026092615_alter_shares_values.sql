-- Shares are now stored as whole hundredths (12.78 shares → 1278) so fractional shares keep
-- integer math in the ledger. Converts every existing row, which was stored in whole shares.
-- SPLIT rows have NULL shares and stay NULL.
UPDATE transactions SET shares = shares * 100 WHERE shares IS NOT NULL;
