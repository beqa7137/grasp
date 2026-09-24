import type { Prediction } from './types.js';

/** FNV-1a, then murmur3's finalizer: FNV-1a alone mixes its low bits poorly, and they are the ones that pick a slot. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The question with its answer and up to three distinct distractors, rotated by a hash of the prompt and answer. The
 * answer's slot comes from the question itself, so it varies across questions and inputs without a pattern a learner
 * can follow. Choices with an order of their own, such as Yes / No, keep that order instead.
 */
export function rotatedChoices(
  prompt: string,
  answer: string,
  distractors: readonly string[],
): Pick<Prediction, 'prompt' | 'choices' | 'answer'> {
  const options = [...new Set([answer, ...distractors])].slice(0, 4);
  const start = hash(`${prompt}\u0000${answer}`) % options.length;
  const choices = [...options.slice(start), ...options.slice(0, start)];
  return { prompt, choices, answer: choices.indexOf(answer) };
}
