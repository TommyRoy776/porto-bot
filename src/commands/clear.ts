import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { confirmModal, typedMatches } from '../components/confirmModal.js';
import { logTx } from '../components/log.js';
import { UserError } from '../components/userError.js';
import { ANY_TICKER_MAX, parseLookupTicker } from '../components/validate.js';
import { clearTicker } from '../components/userLedger.js';
import { messages } from '../strings/messages.js';

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription(messages.clear.description)
  .addStringOption((o) =>
    o.setName('ticker').setDescription(messages.options.anyTicker).setRequired(true).setMaxLength(ANY_TICKER_MAX),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const ticker = parseLookupTicker(interaction.options.getString('ticker', true));
  if (!ticker) throw new UserError(messages.invalidLookupTicker);
  await interaction.showModal(confirmModal(`clear:${ticker}`, messages.clear.title(ticker), ticker));
}

export async function modal(interaction: ModalSubmitInteraction, [ticker]: string[]) {
  if (!typedMatches(interaction, ticker)) throw new UserError(messages.confirmMismatch);
  const count = clearTicker(interaction.user.id, ticker);
  logTx('clear', interaction.user.id, `${ticker} rows=${count}`);
  await interaction.reply({ content: messages.clear.done(ticker, count), flags: MessageFlags.Ephemeral });
}
