import {
  EmbedBuilder,
  LabelBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { config } from '../config.js';
import { ownRow } from '../components/ownRow.js';
import { commitChange } from '../components/userLedger.js';
import { UserError } from '../components/userError.js';
import { parseRef } from '../components/ref.js';
import { parseQuantity, quantityText } from '../components/units.js';
import { parseDate, parsePrice, parseTicker, priceText, toDateString } from '../components/validate.js';
import { messages } from '../strings/messages.js';

export const data = new SlashCommandBuilder()
  .setName('amend')
  .setDescription(messages.amend.description)
  .addStringOption((o) => o.setName('id').setDescription(messages.options.id).setRequired(true).setMaxLength(12));

// min and max are the lengths the matching parser in validate.ts can accept, so Discord rejects
// anything longer before it reaches the bot.
const field = (id: string, label: string, value: string, min: number, max: number) =>
  new LabelBuilder()
    .setLabel(label)
    .setTextInputComponent(
      new TextInputBuilder()
        .setCustomId(id)
        .setStyle(TextInputStyle.Short)
        .setValue(value)
        .setMinLength(min)
        .setMaxLength(max),
    );

export async function execute(interaction: ChatInputCommandInteraction) {
  const ref = parseRef(interaction.options.getString('id', true));
  if (!ref) throw new UserError(messages.invalidRef);
  const row = ownRow(ref, interaction.user.id);
  // Split rows are undone with /delete; amending a ratio has no clear meaning for one holder.
  if (row.sec_type === 'SPLIT') throw new UserError(messages.amend.split);

  const labels = messages.amend.fields;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(`amend:${row.ref}`)
      .setTitle(messages.amend.title(row.ref))
      .addLabelComponents(
        field('ticker', labels.ticker, row.ticker, 1, 6),
        field('side', labels.side, row.side!, 3, 4),
        // Stored scaled; shown as the decimal the user typed, which parseQuantity reads back.
        field('shares', labels.shares, quantityText(row.shares!, 'STOCK'), 1, 20),
        field('price', labels.price, priceText(row.price!), 1, 20),
        field('date', labels.date, toDateString(row.trade_date), 10, 10),
      ),
  );
}

export async function modal(interaction: ModalSubmitInteraction, [ref]: string[]) {
  const value = (name: string) => interaction.fields.getTextInputValue(name);
  const ticker = parseTicker(value('ticker'));
  if (!ticker) throw new UserError(messages.invalidTicker);
  const side = value('side').trim().toUpperCase();
  if (side !== 'BUY' && side !== 'SELL') throw new UserError(messages.amend.invalidSide);
  const shares = parseQuantity(value('shares'), 'STOCK');
  if (shares === null) throw new UserError(messages.invalidShares);
  const price = parsePrice(value('price'));
  if (price === null) throw new UserError(messages.invalidPrice);
  const trade_date = parseDate(value('date'), config.tz);
  if (trade_date === null) throw new UserError(messages.invalidDate);

  // Re-check: the row may have been deleted while the modal was open.
  const row = ownRow(ref, interaction.user.id);
  const stored = commitChange(interaction.user.id, { update: { ...row, ticker, side, shares, price, trade_date } })!;
  await interaction.reply({ embeds: [new EmbedBuilder().setDescription(messages.amend.done(interaction.user.id, stored))] });
}
