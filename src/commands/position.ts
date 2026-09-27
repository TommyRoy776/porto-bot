import {
  EmbedBuilder,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { table } from '../components/format.js';
import { historyLines } from '../components/historyLines.js';
import { pageButtons } from '../components/pageButtons.js';
import { tickerAutocomplete } from '../components/tickerAutocomplete.js';
import { holdingsOf, tickerHistory } from '../queries/holdings.js';
import { UserError } from '../components/userError.js';
import { parseLookupTicker } from '../components/validate.js';
import { holdingRow, messages } from '../strings/messages.js';

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName('position')
  .setDescription(messages.position.description)
  .addStringOption((o) =>
    o.setName('ticker').setDescription(messages.options.anyTicker).setRequired(true).setMaxLength(15).setAutocomplete(true),
  )
  .addUserOption((o) => o.setName('user').setDescription(messages.options.user));

// Page `page` of the member's transactions for the ticker, newest first.
function render(userId: string, ticker: string, requested: number) {
  const { rows, page, pageCount } = tickerHistory(userId, ticker, PAGE_SIZE, requested);
  if (!pageCount) throw new UserError(messages.position.none(userId, ticker));

  // The current holdings under this ticker, matching the holdings table in /portfolio.
  const held = holdingsOf(userId).filter((p) => p.ticker === ticker);
  const summary = held.length ? table([messages.portfolio.columns, ...held.map(holdingRow)]) : messages.position.noShares;

  const embed = new EmbedBuilder().setDescription(messages.position.body(userId, ticker, summary, historyLines(rows)));
  if (pageCount === 1) return { embeds: [embed], components: [] };
  embed.setFooter({ text: messages.page(page, pageCount) });
  return { embeds: [embed], components: [pageButtons((p) => `position:${p}:${userId}:${ticker}`, page, pageCount)] };
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const ticker = parseLookupTicker(interaction.options.getString('ticker', true));
  if (!ticker) throw new UserError(messages.invalidLookupTicker);
  const userId = (interaction.options.getUser('user') ?? interaction.user).id;
  await interaction.reply(render(userId, ticker, 0));
}

export async function button(interaction: ButtonInteraction, [page, userId, ticker]: string[]) {
  await interaction.update(render(userId, ticker, Number(page)));
}

// Suggests from the holdings of whichever user is selected, which arrives as a raw ID string.
export const autocomplete = (interaction: AutocompleteInteraction) =>
  tickerAutocomplete(interaction, (interaction.options.get('user')?.value as string) ?? interaction.user.id);
