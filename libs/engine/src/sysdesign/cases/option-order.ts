import { mulberry32, shuffle } from '../../algorithms/random.js';
import { murmur3 } from './flags/murmur.js';

/**
 * The order to show a decision's options in, as indexes into its authored options. Authors list the recommended option
 * first, so the order is shuffled by `seed` (the case, the run and the stage): the same on every reload of a run and new
 * on the next. Answers keep the authored index, so the order never changes what a saved answer chose.
 */
export function optionOrder(seed: string, count: number): number[] {
  return shuffle(
    mulberry32(murmur3(seed)),
    Array.from({ length: count }, (_, i) => i),
  );
}
