import { mulberry32 } from './random.js';
import type { AlgorithmDefinition, AlgorithmInput, Frame } from './types.js';

/** Helpers bound to one tracer, shared by the tracer specs. */
export function tracerFixture<I extends AlgorithmInput>(algo: AlgorithmDefinition<I>) {
  return {
    traceOf: (input: unknown) => algo.trace(algo.validate(input)),
    randomInputs: (seed: number, count: number) => {
      const rand = mulberry32(seed);
      return Array.from({ length: count }, () => algo.randomInput(rand));
    },
  };
}

export const resultOf = (frames: Frame[]) => frames[frames.length - 1].vars['result'];
export const predictions = (frames: Frame[]) => frames.flatMap((f) => (f.predict ? [f.predict] : []));
export const correctChoices = (frames: Frame[]) => predictions(frames).map((p) => p.choices[p.answer]);
