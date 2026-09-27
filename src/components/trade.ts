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
import { realizedOf } from '../queries/holdings.js';
import { commitChange } from './userLedger.js';
import { UserError } from './userError.js';
import { toScaled, type Holdable } from './units.js';
import { MAX_PRICE, parseCalendarDate, parseCryptoTicker, parseDate, parseExpiry, parseTicker, toPrice } from './validate.js';

type Side = 'BUY' | 'SELL';

// The part of interaction.options a security type reads its fields from.
export type TradeOptions = Pick<ChatInputCommandInteraction['options'], 'getString' | 'getNumber' | 'getInteger'>;

// The fields of a row that differ by security type. user_id, side and trade_date are shared.
type TypeFields = Omit<NewTx, 'user_id' | 'side' | 'trade_date'>;

// One entry per /buy and /sell subcommand. `options` adds that type's required fields (the shared,
// optional date is added after them, since Discord lists required options first); `read`
// validates what was typed, throwing a UserError for anything invalid.
type SecurityType = {
  sec_type: Holdable;
  options(sub: SlashCommandSubcommandBuilder, side: Side): SlashCommandSubcommandBuilder;
  read(options: TradeOptions, side: Side, tz: string, now: Date): TypeFields;
};

// The columns only splits and options use.
const NOT_SPLIT_OR_OPTION = { split_from: null, split_to: null, opt_right: null, strike: null, expiry: null };

// Ticker, quantity and price options, shared by stock and crypto. Only /sell autocompletes the
// ticker, from what the user already holds.
const tickerQuantityPrice = (
  sub: SlashCommandSubcommandBuilder,
  side: Side,
  ticker: { description: string; maxLength: number },
  quantity: { name: string; description: string; min: number },
  priceDescription: string,
) =>
  sub
    .addStringOption((o) =>
      o
        .setName('ticker')
        .setDescription(ticker.description)
        .setRequired(true)
        .setMaxLength(ticker.maxLength)
        .setAutocomplete(side === 'SELL'),
    )
    .addNumberOption((o) =>
      o.setName(quantity.name).setDescription(quantity.description).setRequired(true).setMinValue(quantity.min),
    )
    .addNumberOption((o) =>
      o.setName('price').setDescription(priceDescription).setRequired(true).setMinValue(0.00000001).setMaxValue(MAX_PRICE),
    );

// Discord number options cannot limit decimal places, so the quantity and price rules are checked here.
function readPrice(options: TradeOptions) {
  const price = toPrice(options.getNumber('price', true));
  if (price === null) throw new UserError(messages.invalidPrice);
  return price;
}

const types: Record<string, SecurityType> = {
  stock: {
    sec_type: 'STOCK',
    options: (sub, side) =>
      tickerQuantityPrice(
        sub,
        side,
        { description: messages.options.ticker, maxLength: 6 },
        { name: 'shares', description: messages.options.shares, min: 0.01 },
        messages.options.price,
      ),
    read(options) {
      const ticker = parseTicker(options.getString('ticker', true));
      if (!ticker) throw new UserError(messages.invalidTicker);
      const shares = toScaled(options.getNumber('shares', true), 'STOCK');
      if (shares === null) throw new UserError(messages.invalidShares);
      return { sec_type: 'STOCK', ticker, shares, price: readPrice(options), ...NOT_SPLIT_OR_OPTION };
    },
  },
  crypto: {
    sec_type: 'CRYPTO',
    options: (sub, side) =>
      tickerQuantityPrice(
        sub,
        side,
        { description: messages.options.cryptoTicker, maxLength: 15 },
        { name: 'amount', description: messages.options.amount, min: 0.00000001 },
        messages.options.coinPrice,
      ),
    read(options) {
      const ticker = parseCryptoTicker(options.getString('ticker', true));
      if (!ticker) throw new UserError(messages.invalidCryptoTicker);
      const shares = toScaled(options.getNumber('amount', true), 'CRYPTO');
      if (shares === null) throw new UserError(messages.invalidAmount);
      return { sec_type: 'CRYPTO', ticker, shares, price: readPrice(options), ...NOT_SPLIT_OR_OPTION };
    },
  },
  option: {
    sec_type: 'OPTION',
    options: (sub, side) =>
      sub
        .addStringOption((o) =>
          o
            .setName('ticker')
            .setDescription(messages.options.optionTicker)
            .setRequired(true)
            .setMaxLength(6)
            .setAutocomplete(side === 'SELL'),
        )
        .addStringOption((o) =>
          o
            .setName('right')
            .setDescription(messages.options.right)
            .setRequired(true)
            .addChoices({ name: 'Call', value: 'CALL' }, { name: 'Put', value: 'PUT' }),
        )
        .addNumberOption((o) =>
          o
            .setName('strike')
            .setDescription(messages.options.strike)
            .setRequired(true)
            .setMinValue(0.00000001)
            .setMaxValue(MAX_PRICE),
        )
        .addStringOption((o) =>
          o.setName('expiry').setDescription(messages.options.expiry).setRequired(true).setMinLength(10).setMaxLength(10),
        )
        .addIntegerOption((o) =>
          o.setName('contracts').setDescription(messages.options.contracts).setRequired(true).setMinValue(1),
        )
        .addNumberOption((o) =>
          o
            .setName('price')
            .setDescription(messages.options.premium)
            .setRequired(true)
            .setMinValue(0.00000001)
            .setMaxValue(MAX_PRICE),
        ),
    read(options, side, tz, now) {
      const ticker = parseTicker(options.getString('ticker', true));
      if (!ticker) throw new UserError(messages.invalidTicker);
      // Discord only offers the two choices, but a stale client could still send anything.
      const opt_right = options.getString('right', true);
      if (opt_right !== 'CALL' && opt_right !== 'PUT') throw new UserError(messages.invalidRight);
      const strike = toPrice(options.getNumber('strike', true));
      if (strike === null) throw new UserError(messages.invalidStrike);
      // Only a buy opens a position, so only a buy needs a contract that has not expired. A sell must
      // match a contract already held (replay rejects anything else), and may close one after expiry.
      const typed = options.getString('expiry', true);
      const expiry = side === 'BUY' ? parseExpiry(typed, tz, now) : parseCalendarDate(typed);
      if (expiry === null) throw new UserError(messages.invalidExpiry);
      const shares = toScaled(options.getInteger('contracts', true), 'OPTION');
      if (shares === null) throw new UserError(messages.invalidContracts);
      const price = readPrice(options);
      return { sec_type: 'OPTION', ticker, shares, price, split_from: null, split_to: null, opt_right, strike, expiry };
    },
  },
};

// The row a /buy or /sell subcommand would insert, validated. `now` is only overridden by tests.
export function tradeRow(user_id: string, side: Side, type: string, options: TradeOptions, tz: string, now = new Date()): NewTx {
  const fields = types[type].read(options, side, tz, now);
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
    await interaction.reply({
      embeds: [new EmbedBuilder().setDescription(messages.recorded(userId, stored, realizedOf(stored.id)))],
    });
  }

  // Only /sell autocompletes, from what the user holds of that subcommand's type.
  const autocomplete = (interaction: AutocompleteInteraction) =>
    tickerAutocomplete(interaction, interaction.user.id, types[interaction.options.getSubcommand()].sec_type);

  return { data, execute, autocomplete };
}
