import type { Scorecard } from './interview.types.js';

/**
 * Model text as the learner reads it, whichever model wrote it: an em dash becomes a comma (the one reading that fits
 * every position), curly quotes become straight, and markdown bold, italics and backticks go while their text stays.
 * Underscore emphasis stays, since underscores are also Python names; en dashes stay, since they write ranges.
 */
export function learnerText(text: string): string {
  return text
    .replace(/^[ \t]*```[^\n]*\n?/gm, '')
    .replace(/`/g, '')
    .replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, '$1')
    .replace(/(?<![\p{L}\p{N}*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\p{L}\p{N}*])/gu, '$1')
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]*\u2014[ \t]*/g, ', ')
    .replace(/(^|\n)[ \t]*, /g, '$1')
    .replace(/, (?=[,.;:!?)]|$)/gm, '')
    .replace(/([,;:]), /g, '$1 ');
}

export function learnerScorecard(card: Scorecard): Scorecard {
  return {
    ...card,
    summary: learnerText(card.summary),
    dimensions: card.dimensions.map((d) => ({ ...d, evidence: learnerText(d.evidence) })),
    strengths: card.strengths.map(learnerText),
    improvements: card.improvements.map(learnerText),
    ...(card.flaws && {
      flaws: card.flaws.map((f) => ({ ...f, quote: f.quote === null ? null : learnerText(f.quote), fix: learnerText(f.fix) })),
    }),
  };
}
