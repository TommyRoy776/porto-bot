import { convertToCrypto } from './components/convertCrypto.js';
import { parseCryptoTicker, parseTicker } from './components/validate.js';

// Usage: node dist/convertCrypto.js BTC [BTC-USD]
// Moves V1 rows that recorded a coin as stock to crypto. See components/convertCrypto.ts.
const [fromArg = '', toArg = fromArg] = process.argv.slice(2);
const from = parseTicker(fromArg);
const to = parseCryptoTicker(toArg);
if (!from || !to) {
  console.error('Usage: node dist/convertCrypto.js <old stock ticker> [<crypto ticker, e.g. BTC-USD>]');
  process.exit(1);
}
console.log(`Converted ${convertToCrypto(from, to)} ${from} rows to ${to}.`);
