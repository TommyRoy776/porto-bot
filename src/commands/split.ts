import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { config } from '../config.js';
import { logTx } from '../components/log.js';
import { commitChange } from '../components/userLedger.js';
import { UserError } from '../components/userError.js';
import { parseDate, parseRatio, parseTicker, STOCK_TICKER_MAX } from '../components/validate.js';
import { holdersOf } from '../queries/holdings.js';
import { messages } from '../strings/messages.js';

export const data = new SlashCommandBuilder()
  .setName('split')
  .setDescription(messages.split.description)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) =>
    o.setName('ticker').setDescription(messages.options.ticker).setRequired(true).setMaxLength(STOCK_TICKER_MAX),
  )
  .addStringOption((o) =>
    o.setName('ratio').setDescription(messages.split.ratioOption).setRequired(true).setMaxLength(11),
  );

// Writes one SPLIT row per current holder, dated today, so replay stays per-user and each
// holder can undo their own copy with /delete.
export async function execute(interaction: ChatInputCommandInteraction) {
  const ticker = parseTicker(interaction.options.getString('ticker', true));
  if (!ticker) throw new UserError(messages.invalidTicker);
  const ratio = parseRatio(interaction.options.getString('ratio', true));
  if (!ratio) throw new UserError(messages.split.invalidRatio);
  const trade_date = parseDate(undefined, config.tz)!;

  const holders = holdersOf(ticker);
  for (const user_id of holders) {
    commitChange(user_id, {
      insert: {
        user_id, sec_type: 'SPLIT', side: null, ticker, shares: null, price: null, trade_date, ...ratio,
        opt_right: null, strike: null, expiry: null,
      },
    });
  }
  logTx('split', interaction.user.id, `${ticker} ${ratio.split_to}:${ratio.split_from} holders=${holders.length}`);
  await interaction.reply({
    embeds: [new EmbedBuilder().setDescription(messages.split.done(ticker, ratio, holders.length))],
  });
}
