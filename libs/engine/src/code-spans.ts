export interface TextPart {
  text: string;
  code: boolean;
}

/** Splits learner text into prose and the code spans between backticks. An unbalanced backtick leaves the whole text as prose. */
export function codeSpans(text: string): TextPart[] {
  const parts = text.split('`');
  if (parts.length % 2 === 0) return [{ text, code: false }];
  return parts.flatMap((part, i) => (part ? [{ text: part, code: i % 2 === 1 }] : []));
}

// A code span moves to the next line whole and breaks inside only when wider than the line, which a longer one would
// be on a phone.
const MAX_CODE_SPAN = 24;

/** Every way learner text would render badly: an unbalanced backtick, or a code span too long to fit the line. */
export function codeSpanProblems(text: string): string[] {
  const parts = codeSpans(text);
  return [
    ...(parts.some((part) => part.text.includes('`')) ? ['an unbalanced backtick'] : []),
    ...parts
      .filter((part) => part.code && part.text.length > MAX_CODE_SPAN)
      .map((part) => `a code span over ${MAX_CODE_SPAN} characters: ${part.text}`),
  ];
}
