import type { Locator, Prediction, ValuePick } from './types.js';

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
 * can follow. A menu with an order of its own, such as Yes / No, keeps it instead: see `fixedChoices`.
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

/** A fixed menu, such as Yes / No, whose order means something: the player shows it as it is, and review keeps it. */
export function fixedChoices(choices: string[], answer: number): Pick<Prediction, 'choices' | 'answer' | 'ordered'> {
  return { choices, answer, ordered: true };
}

/**
 * Each choice's array cells, from the choices that stand for indices (`roles`, as text and indices); a choice that stands
 * for values gets none, even when its text reads as indices, so a tap on those cells never grades as it.
 */
export function cellsFor(choices: readonly string[], roles: readonly (readonly [string, readonly number[]])[]): Locator[][] {
  return choices.map((c) => (roles.find(([text]) => text === c)?.[1] ?? []).map((at): Locator => ({ view: 'array', at })));
}

/** A value ask: its choices are numbers (or ∞), which the player offers as chips beside a field to type one. */
export const VALUE: ValuePick = { on: 'value' };
