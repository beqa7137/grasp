import { binarySearch } from './binary-search.js';
import { ALGORITHM_CATALOG, type AlgorithmId } from './catalog.js';
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
import type { AlgorithmDef, AlgorithmDefinition, AlgorithmMeta } from './types.js';

export * from './types.js';
export * from './catalog.js';
export { parseField, formatField } from './input.js';
export { mulberry32 } from './random.js';
export { GRAPH_BOX, GRAPH_NODE_RADIUS } from './layout.js';

const DEFINITIONS: Record<AlgorithmId, AlgorithmDefinition<any>> = {
  'binary-search': binarySearch,
  'pair-sum-sorted': pairSum,
  'longest-unique-substring': longestUnique,
  'next-greater-element': nextGreater,
  'grid-bfs': gridBfs,
  'kth-largest': kthLargest,
  lcs,
  'union-find': unionFind,
  'topo-sort': topoSort,
  trie,
  dijkstra,
  'merge-intervals': mergeIntervals,
  'subsets-backtracking': subsetsBacktracking,
  'tree-traversal': treeTraversal,
  'jump-game': jumpGame,
  'single-number-xor': singleNumberXor,
  'two-sum-hash': twoSumHash,
  'subarray-sum-prefix': subarraySumPrefix,
  'linked-list-cycle': linkedListCycle,
  'house-robber': houseRobber,
};

export const ALGORITHMS: AlgorithmDef<any>[] = ALGORITHM_CATALOG.map((summary) => ({ ...summary, ...DEFINITIONS[summary.id] }));

export function getAlgorithm(id: string): AlgorithmDef<any> | undefined {
  return ALGORITHMS.find((a) => a.id === id);
}

export function algorithmMeta(def: AlgorithmDef<any>): AlgorithmMeta & { defaultInput: unknown } {
  const { id, title, patternId, difficulty, summary, complexity, code, fields, defaultInput } = def;
  return { id, title, patternId, difficulty, summary, complexity, code, fields, defaultInput };
}
