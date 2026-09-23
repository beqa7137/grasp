import { binarySearch } from './binary-search.js';
import { dijkstra } from './dijkstra.js';
import { gridBfs } from './grid-bfs.js';
import { kthLargest } from './kth-largest.js';
import { lcs } from './lcs.js';
import { nextGreater } from './monotonic-stack.js';
import { longestUnique } from './sliding-window.js';
import { topoSort } from './topo-sort.js';
import { trie } from './trie.js';
import { pairSum } from './two-pointers.js';
import { unionFind } from './union-find.js';
import type { AlgorithmDef, AlgorithmMeta } from './types.js';

export * from './types.js';
export { parseField, formatField, mulberry32 } from './input.js';

export const ALGORITHMS: AlgorithmDef<any>[] = [
  binarySearch,
  pairSum,
  longestUnique,
  nextGreater,
  gridBfs,
  kthLargest,
  lcs,
  unionFind,
  topoSort,
  trie,
  dijkstra,
];

export function getAlgorithm(id: string): AlgorithmDef<any> | undefined {
  return ALGORITHMS.find((a) => a.id === id);
}

export function algorithmMeta(def: AlgorithmDef<any>): AlgorithmMeta & { defaultInput: unknown } {
  const { id, title, patternId, difficulty, summary, complexity, code, fields, defaultInput } = def;
  return { id, title, patternId, difficulty, summary, complexity, code, fields, defaultInput };
}
