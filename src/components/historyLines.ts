import type { History } from './ledger.js';
import { messages } from '../strings/messages.js';

// One line per row. Split rows show the shares held before and after ("5 → 7.5"); sells show their
// realized P/L.
export const historyLines = (history: History) =>
  history.map(({ tx, before, after, realized }) => messages.txLine(tx, { counts: [before, after], realized }));
