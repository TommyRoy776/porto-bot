import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { historyLines } from '../components/historyLines.js';
import { portfolioView } from '../components/views.js';
import { holdingsOf, recentHistory } from '../queries/holdings.js';
import { messages } from '../strings/messages.js';

const RECENT_COUNT = 10;

export const data = new SlashCommandBuilder()
  .setName('portfolio')
  .setDescription(messages.portfolio.description)
  .addUserOption((o) => o.setName('user').setDescription(messages.options.user));

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = (interaction.options.getUser('user') ?? interaction.user).id;
  await interaction.reply(portfolioView(userId, holdingsOf(userId), historyLines(recentHistory(userId, RECENT_COUNT))));
}
