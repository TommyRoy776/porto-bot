import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { config } from '../config.js';
import { messages } from '../strings/messages.js';
import { commitChange } from './userLedger.js';
import { UserError } from './userError.js';
import { parseDate, parseTicker, toHundredths } from './validate.js';

// /buy and /sell are the same command with a different side.
export function trade(side: 'BUY' | 'SELL') {
  const name = side === 'BUY' ? 'buy' : 'sell';

  const data = new SlashCommandBuilder()
    .setName(name)
    .setDescription(messages[name].description)
    .addStringOption((o) =>
      o.setName('ticker').setDescription(messages.options.ticker).setRequired(true).setAutocomplete(side === 'SELL'),
    )
    .addNumberOption((o) => o.setName('shares').setDescription(messages.options.shares).setRequired(true).setMinValue(0.01))
    .addNumberOption((o) => o.setName('price').setDescription(messages.options.price).setRequired(true).setMinValue(0))
    .addStringOption((o) => o.setName('date').setDescription(messages.options.date));

  async function execute(interaction: ChatInputCommandInteraction) {
    const ticker = parseTicker(interaction.options.getString('ticker', true));
    if (!ticker) throw new UserError(messages.invalidTicker);
    const trade_date = parseDate(interaction.options.getString('date') ?? undefined, config.tz);
    if (trade_date === null) throw new UserError(messages.invalidDate);
    // Discord number options cannot limit decimal places, so the 2-decimal rule is checked here.
    const shares = toHundredths(interaction.options.getNumber('shares', true));
    if (shares === null) throw new UserError(messages.invalidShares);

    const userId = interaction.user.id;
    const stored = commitChange(userId, {
      insert: {
        user_id: userId,
        sec_type: 'STOCK',
        side,
        ticker,
        shares,
        price: interaction.options.getNumber('price', true),
        trade_date,
        split_from: null,
        split_to: null,
      },
    })!;
    await interaction.reply({ embeds: [new EmbedBuilder().setDescription(messages.recorded(userId, stored))] });
  }

  return { data, execute };
}
