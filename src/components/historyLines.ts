import { positionKey, type History } from './ledger.js';
import { messages } from '../strings/messages.js';

// One line per row, oldest first. Tracks each position's previous quantity so split rows can show
// "5 → 8"; sells show their realized P/L.
export function historyLines(history: History) {
  const previous = new Map<string, number>();
  return history.map(({ tx, shares, realized }) => {
    const before = previous.get(positionKey(tx)) ?? 0;
    previous.set(positionKey(tx), shares);
    return messages.txLine(tx, { counts: [before, shares], realized });
  });
}
