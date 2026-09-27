// Every transaction has a reference like BSS01: three letters for its type, then how many of that
// type the bot has recorded, padded to at least two digits. This is the ID users type into
// /amend and /delete. The letters come from the ref_prefixes table, which documents the scheme
// (migrations/2026092700_ref_prefixes.sql).
export const formatRef = (prefix: string, seq: number) => prefix + String(seq).padStart(2, '0');

// Accepts what a user might type: lower case, and fewer digits than the reference is shown with.
export function parseRef(input: string) {
  const match = input.trim().toUpperCase().match(/^([A-Z]{3})(\d+)$/);
  return match ? formatRef(match[1], Number(match[2])) : null;
}
