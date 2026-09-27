// Per-unit prices keep up to 4 decimals, because an average cost rarely lands on a cent. Below a
// dollar, as many coins are, up to 8, so a price never shows as $0.00.
export const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 8 : 4 });

// Amounts that are actual money changing hands are always cents.
export const total = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Discord renders this in each viewer's own locale and time zone.
export const date = (unix: number) => `<t:${unix}:D>`;
