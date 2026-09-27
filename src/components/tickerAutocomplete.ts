import type { AutocompleteInteraction } from 'discord.js';
import type { Holdable } from './units.js';
import { holdingsOf } from '../queries/holdings.js';

// Suggests tickers the user currently holds, of one security type or of any. Suggestions only:
// any ticker can still be typed.
export async function tickerAutocomplete(interaction: AutocompleteInteraction, userId: string, secType?: Holdable) {
  const typed = interaction.options.getFocused().toUpperCase();
  const tickers = holdingsOf(userId, secType)
    .map((p) => p.ticker)
    .filter((t, i, all) => t.startsWith(typed) && all.indexOf(t) === i);
  // Discord allows at most 25 choices.
  await interaction.respond(tickers.slice(0, 25).map((t) => ({ name: t, value: t })));
}
