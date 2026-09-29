import { readFileSync } from 'node:fs';

// The VERSION file holds the version under a block of # comment lines (see the file itself).
export const parseVersion = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('')
    .trim();

// Resolves to <repo>/VERSION from both src/ (tsx) and dist/ (built image). The Dockerfile copies
// VERSION into the image, so the running bot reports the version it was built from.
export const version = parseVersion(readFileSync(new URL('../VERSION', import.meta.url), 'utf8'));
