import {
  EmbedBuilder,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import { config } from '../config.js';
import { messages } from '../strings/messages.js';
import type { NewTx } from './ledger.js';
import { tickerAutocomplete } from './tickerAutocomplete.js';
import { commitChange } from './userLedger.js';
import { UserError } from './userError.js';
import { toScaled } from './units.js';
import { MAX_PRICE, parseDate, parseTicker, toPrice } from './validate.js';

type Side = 'BUY' | 'SELL';

// The part of interaction.options a security type reads its fields from.
export type TradeOptions = Pick<ChatInputCommandInteraction['options'], 'getString' | 'getNumber' | 'getInteger'>;

// The fields of a row that differ by security type. user_id, side and trade_date are shared.
type TypeFields = Omit<NewTx, 'user_id' | 'side' | 'trade_date'>;

// One entry per /buy and /sell subcommand. `options` adds that type's required fields (the shared,
// optional date is added after them, since Discord lists required options first); `read`
// validates what was typed, throwing a UserError for anything invalid.
type SecurityType = {
  options(sub: SlashCommandSubcommandBuilder, side: Side): SlashCommandSubcommandBuilder;
  read(options: TradeOptions): TypeFields;
};

const types: Record<string, SecurityType> = {
  stock: {
    options: (sub, side) =>
      sub
        .addStringOption((o) =>
          o
            .setName('ticker')
            .setDescription(messages.options.ticker)
            .setRequired(true)
            .setMaxLength(6)
            .setAutocomplete(side === 'SELL'),
        )
        .addNumberOption((o) =>
          o.setName('shares').setDescription(messages.options.shares).setRequired(true).setMinValue(0.01),
        )
        .addNumberOption((o) =>
          o
            .setName('price')
            .setDescription(messages.options.price)
            .setRequired(true)
            .setMinValue(0.00000001)
            .setMaxValue(MAX_PRICE),
        ),
    read(options) {
      const ticker = parseTicker(options.getString('ticker', true));
      if (!ticker) throw new UserError(messages.invalidTicker);
      // Discord number options cannot limit decimal places, so the 2-decimal rule is checked here.
      const shares = toScaled(options.getNumber('shares', true), 'STOCK');
      if (shares === null) throw new UserError(messages.invalidShares);
      const price = toPrice(options.getNumber('price', true));
      if (price === null) throw new UserError(messages.invalidPrice);
      return { sec_type: 'STOCK', ticker, shares, price, split_from: null, split_to: null };
    },
  },
};

// The row a /buy or /sell subcommand would insert, validated. `now` is only overridden by tests.
export function tradeRow(user_id: string, side: Side, type: string, options: TradeOptions, tz: string, now = new Date()): NewTx {
  const fields = types[type].read(options);
  const trade_date = parseDate(options.getString('date') ?? undefined, tz, now);
  if (trade_date === null) throw new UserError(messages.invalidDate);
  return { user_id, side, trade_date, ...fields };
}

// /buy and /sell are the same command with a different side, and one subcommand per security type.
export function trade(side: Side) {
  const name = side === 'BUY' ? 'buy' : 'sell';

  const data = new SlashCommandBuilder().setName(name).setDescription(messages[name].description);
  for (const [type, { options }] of Object.entries(types)) {
    data.addSubcommand((sub) =>
      options(sub.setName(type).setDescription(messages[name][type]), side).addStringOption((o) =>
        o.setName('date').setDescription(messages.options.date).setMaxLength(10),
      ),
    );
  }

  async function execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const row = tradeRow(userId, side, interaction.options.getSubcommand(), interaction.options, config.tz);
    const stored = commitChange(userId, { insert: row })!;
    await interaction.reply({ embeds: [new EmbedBuilder().setDescription(messages.recorded(userId, stored))] });
  }

  // Only /sell autocompletes, from what the user already holds.
  const autocomplete = (interaction: AutocompleteInteraction) => tickerAutocomplete(interaction, interaction.user.id);

  return { data, execute, autocomplete };
}
