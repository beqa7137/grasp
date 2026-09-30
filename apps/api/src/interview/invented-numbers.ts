const NUMBER_PLACEHOLDER = '[number]';

const NUMERAL = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)*`;
// Not a claim: a number glued to a name (p99, v2.1, EC2, GPT-4), part of a longer numeral, or an ordinal.
const NUMBER = String.raw`(?<![\p{L}\p{N}_.]|\p{L}-)(?:${NUMERAL})(?!\p{N}|\.\p{N}|(?:st|nd|rd|th)\b)`;
const CLAIM = new RegExp(
  [
    String.raw`(?<bracket>\[[^\[\]\n]*\])`,
    String.raw`\bstep\s+\d+\b`,
    String.raw`(?<=^|\n)[ \t]*\d+[.)](?=[ \t])`,
    String.raw`\b1(?::1|-on-1)\b`,
    `(?<number>${NUMBER})`,
  ].join('|'),
  'giu',
);
const NUMBERS = new RegExp(NUMBER, 'giu');
const NUMERALS = new RegExp(NUMERAL, 'g');

/** "1,000" is 1000 and "2.50" is 2.5; a version such as 1.2.3 compares as written. */
function normalize(numeral: string): string {
  const digits = numeral.replace(/,/g, '');
  return /^\d+(?:\.\d+)?$/.test(digits) ? String(Number(digits)) : digits;
}

/**
 * Replaces each number the candidate never said with [number], keeping the units and words around it, so feedback
 * written in the candidate's voice cannot teach them to invent a metric. Numbers the candidate said may be reused.
 * A bracketed placeholder is left alone unless it holds an invented number, when all of it becomes [number]; step
 * numbers, list markers, ordinals, "1:1" and numbers inside names stay as they are.
 */
export function replaceInventedNumbers(text: string, candidateTexts: readonly string[]): { text: string; invented: number } {
  const spoken = new Set(candidateTexts.flatMap((t) => t.match(NUMERALS) ?? []).map(normalize));
  const isInvented = (numeral: string) => !spoken.has(normalize(numeral));
  let invented = 0;
  const rewritten = text.replace(CLAIM, (match: string, ...rest: unknown[]) => {
    const { bracket, number } = rest.at(-1) as { bracket?: string; number?: string };
    const replace = number !== undefined ? isInvented(number) : !!bracket?.match(NUMBERS)?.some(isInvented);
    if (!replace) return match;
    invented += 1;
    return NUMBER_PLACEHOLDER;
  });
  return { text: rewritten, invented };
}
