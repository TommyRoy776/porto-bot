import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NewTx } from '../components/ledger.js';

// config.ts validates env at import, so set it before loading anything that opens the database.
Object.assign(process.env, { DISCORD_TOKEN: 't', DISCORD_CLIENT_ID: 'c', DISCORD_GUILD_ID: 'g', DB_PATH: ':memory:' });
const { commitChange, ledgerOf } = await import('../components/userLedger.js');
const { convertToCrypto } = await import('../components/convertCrypto.js');
const { userRows } = await import('../queries/transactions.js');

const stock = (user_id: string, side: 'BUY' | 'SELL', shares: number, ticker = 'BTC'): NewTx => ({
  user_id, sec_type: 'STOCK', side, ticker, shares, price: 50_000, trade_date: 86_400, split_from: null, split_to: null,
});

test('converts V1 stock rows for a coin into crypto rows at the crypto scale, for every user', () => {
  commitChange('a', { insert: stock('a', 'BUY', 300) }); // 3 "shares" of BTC, entered as stock in V1
  commitChange('a', { insert: stock('a', 'SELL', 100) });
  commitChange('b', { insert: stock('b', 'BUY', 100) });
  commitChange('a', { insert: stock('a', 'BUY', 100, 'AAPL') });

  assert.equal(convertToCrypto('BTC', 'BTC-USD'), 3);

  assert.deepEqual(ledgerOf('a').positions, [
    { sec_type: 'STOCK', ticker: 'AAPL', shares: 100, avgCost: 50_000 },
    { sec_type: 'CRYPTO', ticker: 'BTC-USD', shares: 200_000_000, avgCost: 50_000 },
  ]);
  assert.deepEqual(ledgerOf('b').positions, [{ sec_type: 'CRYPTO', ticker: 'BTC-USD', shares: 100_000_000, avgCost: 50_000 }]);
  const refs = userRows('a').filter((r) => r.ticker === 'BTC-USD').map((r) => r.ref.slice(0, 3));
  assert.deepEqual(refs.sort(), ['BCC', 'SCC']);
});

test('refuses a ticker with split rows, and changes nothing', () => {
  commitChange('c', { insert: stock('c', 'BUY', 100, 'ETH') });
  commitChange('c', {
    insert: { user_id: 'c', sec_type: 'SPLIT', side: null, ticker: 'ETH', shares: null, price: null, trade_date: 86_400, split_from: 1, split_to: 2 },
  });
  const before = userRows('c');
  assert.throws(() => convertToCrypto('ETH', 'ETH-USD'), /split/);
  assert.deepEqual(userRows('c'), before);
});

