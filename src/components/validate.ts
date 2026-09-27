// Parsers for user input. Each returns the normalized value, or null if the input is invalid.

export function parseTicker(input: string) {
  const ticker = input.trim().toUpperCase();
  return /^[A-Z.]{1,6}$/.test(ticker) ? ticker : null;
}

// Today's calendar date as YYYY-MM-DD in the given IANA time zone (en-CA formats as YYYY-MM-DD).
const todayIn = (tz: string, now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);

// YYYY-MM-DD, today or earlier in `tz`, to unix seconds at 12:00 UTC (see trade_date in the schema).
export function parseDate(input: string | undefined, tz: string, now = new Date()) {
  const date = input?.trim() ?? todayIn(tz, now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIn(tz, now)) return null;
  const ms = Date.parse(`${date}T12:00:00Z`);
  // Date.parse rolls impossible dates like 2025-02-29 forward, so check it round-trips.
  if (Number.isNaN(ms) || toDateString(ms / 1000) !== date) return null;
  return ms / 1000;
}

export const toDateString = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

// "X:Y" means X new shares for every Y old: 3:2 forward, 1:10 reverse.
export function parseRatio(input: string) {
  const match = input.trim().match(/^(\d+):(\d+)$/);
  if (!match) return null;
  const [split_to, split_from] = [Number(match[1]), Number(match[2])];
  return split_to > 0 && split_from > 0 && split_to !== split_from ? { split_to, split_from } : null;
}

// Shares are stored as whole hundredths (12.78 shares → 1278), so ledger math stays in integers.
// Returns null for 0 or less, or more than 2 decimals. The decimals are checked on String(shares),
// which is the shortest text for the number (0.29, not 0.28999…); Math.round then absorbs the float
// error in the multiply (0.29 * 100 is 28.999999999999996).
export function toHundredths(shares: number) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(shares))) return null;
  const hundredths = Math.round(shares * 100);
  return hundredths > 0 && Number.isSafeInteger(hundredths) ? hundredths : null;
}

// Typed shares from the /amend modal, like "12.78", in hundredths.
export function parseShares(input: string) {
  const trimmed = input.trim();
  return /^\d+(\.\d{1,2})?$/.test(trimmed) ? toHundredths(Number(trimmed)) : null;
}

// Highest price per unit accepted. Well above any real share or coin, low enough to catch a typo.
export const MAX_PRICE = 10_000_000;

// A price per unit from a Discord number option: above 0, at most MAX_PRICE, at most 8 decimals
// (enough for a coin priced below a cent). toFixed(8) round-trips exactly when there are 8 or
// fewer decimals, and unlike String() it never switches to 1e-7 notation.
export function toPrice(price: number) {
  return price > 0 && price <= MAX_PRICE && Number(price.toFixed(8)) === price ? price : null;
}

// A price as plain decimal text that parsePrice reads back: 1e-7 becomes "0.0000001".
export const priceText = (price: number) => price.toFixed(8).replace(/\.?0+$/, '');

// A typed price from the /amend modal, like "$1,234.50", by the same rules as toPrice.
export function parsePrice(input: string) {
  const cleaned = input.trim().replace(/[$,]/g, '');
  return /^\d*\.?\d+$/.test(cleaned) ? toPrice(Number(cleaned)) : null;
}
