import { test } from 'node:test';
import assert from 'node:assert/strict';

// config.ts validates env at import, so set it before loading anything that opens the database.
Object.assign(process.env, { DISCORD_TOKEN: 't', DISCORD_CLIENT_ID: 'c', DISCORD_GUILD_ID: 'g', DB_PATH: ':memory:' });
const { trade, tradeRow } = await import('../components/trade.js');
const { UserError } = await import('../components/userError.js');

// Stands in for interaction.options: the values a user typed, by option name.
const typed = (values: Record<string, string | number>) => ({
  getString: (name: string) => (values[name] as string) ?? null,
  getNumber: (name: string) => (values[name] as number) ?? null,
  getInteger: (name: string) => (values[name] as number) ?? null,
});

const NOW = new Date('2026-03-10T15:00:00Z');

test('/buy and /sell each have a stock subcommand', () => {
  for (const side of ['BUY', 'SELL'] as const) {
    const json = trade(side).data.toJSON();
    const stock = json.options!.find((o) => o.name === 'stock') as { options: { name: string; required?: boolean }[] };
    assert.ok(stock, `${json.name} has a stock subcommand`);
    assert.deepEqual(
      stock.options.map((o) => [o.name, o.required ?? false]),
      [['ticker', true], ['shares', true], ['price', true], ['date', false]],
    );
  }
});

test('a stock trade reads into a STOCK row with shares in hundredths', () => {
  const row = tradeRow('u', 'BUY', 'stock', typed({ ticker: ' aapl ', shares: 12.78, price: 150, date: '2026-03-02' }), 'UTC', NOW);
  assert.deepEqual(row, {
    user_id: 'u',
    sec_type: 'STOCK',
    side: 'BUY',
    ticker: 'AAPL',
    shares: 1278,
    price: 150,
    trade_date: Date.parse('2026-03-02T12:00:00Z') / 1000,
    split_from: null,
    split_to: null,
  });
});

test('a stock trade without a date is dated today', () => {
  const row = tradeRow('u', 'SELL', 'stock', typed({ ticker: 'AAPL', shares: 1, price: 1 }), 'UTC', NOW);
  assert.equal(row.trade_date, Date.parse('2026-03-10T12:00:00Z') / 1000);
});

test('invalid stock input is a UserError', () => {
  const base = { ticker: 'AAPL', shares: 1, price: 1 };
  const bads: Record<string, string | number>[] = [{ ticker: 'TOOLONGX' }, { shares: 0.001 }, { date: '2099-01-01' }];
  for (const bad of bads) {
    assert.throws(() => tradeRow('u', 'BUY', 'stock', typed({ ...base, ...bad }), 'UTC', NOW), UserError);
  }
});
