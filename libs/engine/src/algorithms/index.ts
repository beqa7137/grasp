import { binarySearch } from './binary-search.js';
import { gridBfs } from './grid-bfs.js';
import { nextGreater } from './monotonic-stack.js';
import { longestUnique } from './sliding-window.js';
import { pairSum } from './two-pointers.js';
import type { AlgorithmDef, AlgorithmMeta } from './types.js';

export * from './types.js';
export { parseField, formatField, mulberry32 } from './input.js';

export const ALGORITHMS: AlgorithmDef<any>[] = [binarySearch, pairSum, longestUnique, nextGreater, gridBfs];

export function getAlgorithm(id: string): AlgorithmDef<any> | undefined {
  return ALGORITHMS.find((a) => a.id === id);
}

export function algorithmMeta(def: AlgorithmDef<any>): AlgorithmMeta & { defaultInput: unknown } {
  const { id, title, patternId, difficulty, summary, complexity, code, fields, defaultInput } = def;
  return { id, title, patternId, difficulty, summary, complexity, code, fields, defaultInput };
}
