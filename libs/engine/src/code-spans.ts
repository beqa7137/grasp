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
