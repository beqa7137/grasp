import { mulberry32, shuffle } from '../algorithms/input.js';

export { shuffle };

export type Rand = () => number;

export const seeded = (seed: number): Rand => mulberry32(seed);

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function pick<T>(rand: Rand, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

/** Shuffles the correct answer in with distractors, de-duplicating, and reports where it landed. */
export function withChoices(rand: Rand, correct: string, distractors: readonly string[]): { choices: string[]; answer: number } {
  const unique = [correct, ...distractors.filter((d, i) => d !== correct && distractors.indexOf(d) === i)];
  const choices = shuffle(rand, unique);
  return { choices, answer: choices.indexOf(correct) };
}
