import {
  ContainerBuilder,
  MessageFlags,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type ActionRowBuilder,
  type ButtonBuilder,
} from 'discord.js';
import { messages } from '../strings/messages.js';
import type { Position } from './ledger.js';
import { pageButtons } from './pageButtons.js';
import { value, type Holdable } from './units.js';

// /portfolio and /position replies, built from Discord's message components (Container,
// TextDisplay, Separator) instead of an embed with code-block tables. With the IsComponentsV2 flag
// a message may not also carry content or embeds, and all its text displays share one 4000
// character budget. Mentions inside text displays would ping, so allowedMentions turns that off.

type View = {
  components: (ContainerBuilder | ActionRowBuilder<ButtonBuilder>)[];
  flags: MessageFlags.IsComponentsV2;
  allowedMentions: { parse: [] };
};

const view = (components: View['components']): View => ({
  components,
  flags: MessageFlags.IsComponentsV2,
  allowedMentions: { parse: [] },
});

const text = (content: string) => new TextDisplayBuilder().setContent(content);

// Adds transaction lines as separate text displays with a separator component between entries.
function addTransactions(container: ContainerBuilder, lines: string[]) {
  lines.forEach((line, i) => {
    if (i > 0) container.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(text(line));
  });
}

const totalLine = (positions: Position[]) =>
  messages.portfolio.total(positions.reduce((sum, p) => sum + value(p.sec_type, p.shares, p.avgCost), 0));

// One line per holding, then the total cost basis across all of them.
const holdingsText = (positions: Position[], empty: string) =>
  positions.length ? [...positions.map(messages.holdingLine), totalLine(positions)].join('\n') : empty;

// /portfolio's holdings: a titled section per security type, in this order, each left out when
// empty, then one total across every section. positions arrive sorted by ticker, and filtering
// keeps that order within each section.
const SECTIONS: Holdable[] = ['STOCK', 'CRYPTO', 'OPTION'];
function sectionedHoldings(positions: Position[]) {
  if (!positions.length) return messages.portfolio.noHoldings;
  const sections = SECTIONS.map((type) => positions.filter((p) => p.sec_type === type))
    .filter((group) => group.length)
    .map((group) => [messages.portfolio.section[group[0].sec_type], ...group.map(messages.holdingLine)].join('\n'));
  return [...sections, totalLine(positions)].join('\n\n');
}

// ponytail: no truncation. The text budget fits roughly 40 holdings alongside the recent list;
// past that Discord rejects the reply. Paginate holdings if anyone gets there.
export function portfolioView(userId: string, positions: Position[], recent: string[]) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(messages.portfolio.title(userId)),
      text(`${messages.portfolio.holdings}\n${sectionedHoldings(positions)}`),
    )
    .addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(text(messages.portfolio.recent));
  if (recent.length) addTransactions(container, recent);
  else container.addTextDisplayComponents(text(messages.portfolio.noRecent));
  return view([container]);
}

// One page of a ticker's transactions (already cut to the page), under the holdings for that ticker.
export function positionView(userId: string, ticker: string, held: Position[], lines: string[], page: number, pageCount: number) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(messages.position.title(userId, ticker)),
      text(holdingsText(held, messages.position.noShares)),
    )
    .addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(text(messages.position.transactions));
  addTransactions(container, lines);
  if (pageCount === 1) return view([container]);
  container.addTextDisplayComponents(text(messages.page(page, pageCount)));
  return view([container, pageButtons((p) => `position:${p}:${userId}:${ticker}`, page, pageCount)]);
}
