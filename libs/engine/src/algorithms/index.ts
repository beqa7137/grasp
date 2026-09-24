import { binarySearch } from './binary-search.js';
import { dijkstra } from './dijkstra.js';
import { gridBfs } from './grid-bfs.js';
import { houseRobber } from './house-robber.js';
import { jumpGame } from './jump-game.js';
import { kthLargest } from './kth-largest.js';
import { lcs } from './lcs.js';
import { linkedListCycle } from './linked-list-cycle.js';
import { mergeIntervals } from './merge-intervals.js';
import { nextGreater } from './monotonic-stack.js';
import { singleNumberXor } from './single-number-xor.js';
import { longestUnique } from './sliding-window.js';
import { subarraySumPrefix } from './subarray-sum-prefix.js';
import { subsetsBacktracking } from './subsets-backtracking.js';
import { topoSort } from './topo-sort.js';
import { treeTraversal } from './tree-traversal.js';
import { trie } from './trie.js';
import { pairSum } from './two-pointers.js';
import { twoSumHash } from './two-sum-hash.js';
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
  mergeIntervals,
  subsetsBacktracking,
  treeTraversal,
  jumpGame,
  singleNumberXor,
  twoSumHash,
  subarraySumPrefix,
  linkedListCycle,
  houseRobber,
];

export function getAlgorithm(id: string): AlgorithmDef<any> | undefined {
  return ALGORITHMS.find((a) => a.id === id);
}

export function algorithmMeta(def: AlgorithmDef<any>): AlgorithmMeta & { defaultInput: unknown } {
  const { id, title, patternId, difficulty, summary, complexity, code, fields, defaultInput } = def;
  return { id, title, patternId, difficulty, summary, complexity, code, fields, defaultInput };
}
