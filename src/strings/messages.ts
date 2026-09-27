import { date, money, shares, total } from '../components/format.js';
import type { Position, Tx } from '../components/ledger.js';

// Every transaction renders the same way, in two lines:
//
//   **ACTION** QUANTITY × UNIT of **TICKER** @ UNIT_PRICE
//   `REF` · total TOTAL · DATE
//
// Rows that have no price, like splits, put their detail on the first line and drop the total.
// New transaction types (V2 options) follow the same shape: "**BUY** 2 × CALL of **AAPL** ...".
// The paradigm is documented in CLAUDE.md; keep it in sync.
// Share counts are in hundredths (1278 = 12.78 shares), so money totals divide by 100.
const action = (tx: Tx, counts?: [number, number]) =>
  tx.sec_type === 'SPLIT'
    ? `**SPLIT** ${tx.split_to}:${tx.split_from} of **${tx.ticker}**` +
      (counts ? ` — ${shares(counts[0])} → ${shares(counts[1])} shares` : '')
    : `**${tx.side}** ${shares(tx.shares!)} × shares of **${tx.ticker}** @ ${money(tx.price!)}`;

const meta = (tx: Tx) =>
  tx.sec_type === 'SPLIT'
    ? `\`${tx.ref}\` · ${date(tx.trade_date)}`
    : `\`${tx.ref}\` · total ${total((tx.shares! * tx.price!) / 100)} · ${date(tx.trade_date)}`;

const txLine = (tx: Tx, counts?: [number, number]) => `${action(tx, counts)}\n${meta(tx)}`;

// Thin rule between transactions in a list, so entries do not run together.
const SEPARATOR = '\n────────────\n';
const txList = (lines: string[]) => lines.join(SEPARATOR);

// Every user-facing string lives here.
export const messages = {
  txLine,
  txList,
  unexpectedError: 'Something went wrong. Try again, and tell the server owner if it keeps happening.',

  confirm: 'Confirm',
  cancel: 'Cancel',
  cancelled: 'Cancelled. Nothing was changed.',
  notYourRow: (ref: string) => `You have no transaction \`${ref}\`. Find your IDs with /position.`,
  previous: 'Previous',
  next: 'Next',
  page: (page: number, pageCount: number) => `Page ${page + 1} of ${pageCount}`,
  typeToConfirm: 'Type the text shown below to confirm',
  confirmMismatch: 'That did not match. Nothing was deleted.',
  notAllowed: 'You need the Manage Server permission to do that.',

  options: {
    ticker: 'Ticker symbol, e.g. AAPL',
    shares: 'Number of shares, up to 2 decimals, e.g. 12.78',
    price: 'Price per share',
    date: 'Trade date as YYYY-MM-DD. Defaults to today',
    user: 'Whose transactions to show. Defaults to you',
    id: 'Transaction ID, e.g. BSS01, shown next to each transaction',
  },

  invalidTicker: 'Tickers are 1–6 letters or dots, like `AAPL` or `BRK.B`.',
  invalidRef: 'Transaction IDs look like `BSS01` (buy), `SSS01` (sell) or `XSS01` (split).',
  invalidShares: 'Shares must be above 0 with at most 2 decimals, like `12.78`.',
  invalidPrice: 'Price must be above 0 and at most $10,000,000, with at most 8 decimals, like `150.25`.',
  invalidDate: 'Dates must be `YYYY-MM-DD` and not in the future.',
  oversold: (tx: Tx) =>
    `That would leave you with negative **${tx.ticker}** shares as of ${date(tx.trade_date)}. Nothing was changed.`,

  // One description per /buy and /sell subcommand, keyed by the subcommand name.
  buy: { description: 'Record a trade you bought', stock: 'Record shares you bought' } as Record<string, string>,
  sell: { description: 'Record a trade you sold', stock: 'Record shares you sold' } as Record<string, string>,
  recorded: (userId: string, tx: Tx) => `**Trade recorded**\n<@${userId}> ${txLine(tx)}`,

  portfolio: {
    description: 'Show holdings and recent transactions',
    columns: ['Ticker', 'Shares', 'Avg cost', 'Cost basis'],
    noHoldings: 'No holdings.',
    body: (userId: string, holdings: string, recent: string[]) =>
      `## Portfolio of <@${userId}>\n**Holdings**\n${holdings}\n**Recent transactions**\n` +
      (recent.length ? txList(recent) : 'None yet.'),
  },

  position: {
    description: 'Show every transaction for one ticker, with IDs for /amend and /delete',
    none: (userId: string, ticker: string) => `<@${userId}> has no **${ticker}** transactions.`,
    noShares: 'No shares held.',
    body: (userId: string, ticker: string, summary: string, lines: string[]) =>
      `## ${ticker} — <@${userId}>\n${summary}\n**Transactions**\n${txList(lines)}`,
  },

  delete: {
    description: 'Delete one of your transactions',
    prompt: (tx: Tx) => `**Delete this transaction?**\n${txLine(tx)}`,
    done: (tx: Tx) => `**Transaction deleted**\n${txLine(tx)}`,
  },

  amend: {
    description: 'Edit one of your transactions',
    title: (ref: string) => `Amend transaction ${ref}`,
    fields: {
      ticker: 'Ticker',
      side: 'Side (BUY or SELL)',
      shares: 'Shares',
      price: 'Price per share',
      date: 'Date (YYYY-MM-DD)',
    },
    split: 'Split rows cannot be amended. Use /delete to undo a split.',
    invalidSide: 'Side must be `BUY` or `SELL`.',
    done: (userId: string, tx: Tx) => `**Transaction amended**\n<@${userId}> ${txLine(tx)}`,
  },

  reset: {
    description: 'Delete every transaction for one member (Manage Server only)',
    userOption: 'Member whose history to delete',
    title: 'Delete all transactions for this member?',
    done: (userId: string, count: number) => `Deleted ${count} transactions for <@${userId}>.`,
  },

  clear: {
    description: 'Delete all of your transactions for one ticker',
    title: (ticker: string) => `Delete all your ${ticker} transactions?`,
    done: (ticker: string, count: number) => `Deleted ${count} of your **${ticker}** transactions.`,
  },

  split: {
    description: 'Apply a stock split to everyone holding a ticker (Manage Server only)',
    ratioOption: 'New:old shares, e.g. 3:2 forward or 1:10 reverse',
    invalidRatio: 'Ratio must be `X:Y` with two different whole numbers above 0, like `3:2` or `1:10`.',
    done: (ticker: string, ratio: { split_to: number; split_from: number }, count: number) =>
      `Applied a ${ratio.split_to}:${ratio.split_from} split to **${ticker}** for ${count} ${count === 1 ? 'member' : 'members'}.`,
  },
};

// A holdings row for the table in /portfolio and /position: ticker, shares, average cost, cost basis.
export const holdingRow = (position: Position) => [
  position.ticker,
  shares(position.shares),
  money(position.avgCost),
  total((position.shares * position.avgCost) / 100),
];
