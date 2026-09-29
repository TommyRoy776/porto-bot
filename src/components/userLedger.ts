import { applyChange, PLACEHOLDER_ID, replay, type Change, type Tx } from './ledger.js';
import { logRow } from './log.js';
import { inTransaction } from '../queries/db.js';
import { clearAllState, replaceUserState } from '../queries/holdings.js';
import {
  allUserIds,
  deleteRow,
  deleteUserRows,
  deleteUserTickerRows,
  insertRow,
  updateRow,
  userRows,
} from '../queries/transactions.js';
import { messages } from '../strings/messages.js';
import { UserError } from './userError.js';

// Replays a member's stored rows and stores the result in holdings and tx_history. For writes that
// need no validation, and for the rebuild at startup. Every change to transactions goes through
// commitChange or this, so stored rows always replay cleanly.
export function syncUser(userId: string) {
  const result = replay(userRows(userId));
  if (!result.ok) throw new Error(`Stored ledger for ${userId} does not replay (row ${result.oversold.id})`);
  replaceUserState(userId, result.positions, result.history);
}

// The one path for changes that can affect quantities: apply to a hypothetical copy of the user's
// ledger, reject if any position would go negative, and only then write the row, together with
// that same replay's holdings and history. Returns the row as stored for inserts and updates.
export function commitChange(userId: string, change: Change): Tx | undefined {
  const result = replay(applyChange(userRows(userId), change));
  if (!result.ok) throw new UserError(messages.oversold(result.oversold));
  const stored = inTransaction(() => {
    const stored =
      'insert' in change ? insertRow(change.insert) : 'update' in change ? updateRow(change.update) : undefined;
    if ('delete' in change) deleteRow(change.delete.id);
    // The replay ran before the database assigned the inserted row its id.
    const history = result.history.map((h) => (h.tx.id === PLACEHOLDER_ID ? { ...h, tx: stored! } : h));
    replaceUserState(userId, result.positions, history);
    return stored;
  });
  if ('delete' in change) logRow('delete', change.delete);
  else logRow('insert' in change ? 'insert' : 'update', stored!);
  return stored;
}

// Deletes every row a member has for one ticker. Deleting whole positions cannot leave anything
// negative, so this skips validation. Returns how many rows were deleted.
export const clearTicker = (userId: string, ticker: string) =>
  inTransaction(() => {
    const count = deleteUserTickerRows(userId, ticker);
    syncUser(userId);
    return count;
  });

// Deletes every row a member has. Returns how many rows were deleted.
export const resetUser = (userId: string) =>
  inTransaction(() => {
    const count = deleteUserRows(userId);
    syncUser(userId);
    return count;
  });

// Recomputes holdings and tx_history for every member from transactions alone. Runs at startup,
// which fills them on the first boot after upgrading and repairs anything that drifted.
export const rebuildAll = () =>
  inTransaction(() => {
    clearAllState();
    for (const userId of allUserIds()) syncUser(userId);
  });
