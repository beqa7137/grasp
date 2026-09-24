import type { Prediction } from './types.js';

/** The answer and up to three distinct distractors, rotated by `shift` so the answer's position varies between checkpoints. */
export function rotatedChoices(answer: string, distractors: readonly string[], shift: number): Pick<Prediction, 'choices' | 'answer'> {
  const options = [...new Set([answer, ...distractors])].slice(0, 4);
  const start = shift % options.length;
  const choices = [...options.slice(start), ...options.slice(0, start)];
  return { choices, answer: choices.indexOf(answer) };
}
