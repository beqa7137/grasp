import { CODING_CATALOG, type CodingProblemId } from '../catalog.js';
import type { CodingProblem, CodingProblemDefinition } from '../types.js';
import {
  coinChange,
  countPrefixes,
  houseRobber,
  longestCommonSubsequence,
  singleNumber,
  subsets,
  totalHammingDistance,
} from './advanced.js';
import { dailyTemperatures, findDuplicate, kthLargestElement, mergeIntervals, subarraySumK, topKFrequent } from './core.js';
import {
  binarySearch,
  containerMostWater,
  jumpGame,
  kokoBananas,
  longestUniqueSubstring,
  minSizeSubarraySum,
  pairSumSorted,
  twoSum,
} from './foundations.js';
import {
  countComponents,
  courseSchedule,
  houseRobberTree,
  networkDelay,
  numberOfIslands,
  redundantConnection,
  rottingOranges,
  treeDiameter,
} from './graphs.js';

const DEFINITIONS: Record<CodingProblemId, CodingProblemDefinition> = {
  'two-sum': twoSum,
  'pair-sum-sorted': pairSumSorted,
  'container-most-water': containerMostWater,
  'longest-unique-substring': longestUniqueSubstring,
  'min-size-subarray-sum': minSizeSubarraySum,
  'binary-search': binarySearch,
  'koko-bananas': kokoBananas,
  'daily-temperatures': dailyTemperatures,
  'subarray-sum-k': subarraySumK,
  'find-duplicate': findDuplicate,
  'number-of-islands': numberOfIslands,
  'rotting-oranges': rottingOranges,
  subsets,
  'merge-intervals': mergeIntervals,
  'top-k-frequent': topKFrequent,
  'house-robber': houseRobber,
  'coin-change': coinChange,
  'kth-largest-element': kthLargestElement,
  'longest-common-subsequence': longestCommonSubsequence,
  'count-components': countComponents,
  'redundant-connection': redundantConnection,
  'course-schedule': courseSchedule,
  'network-delay': networkDelay,
  'tree-diameter': treeDiameter,
  'house-robber-tree': houseRobberTree,
  'count-prefixes': countPrefixes,
  'jump-game': jumpGame,
  'single-number': singleNumber,
  'total-hamming-distance': totalHammingDistance,
};

export const CODING_PROBLEMS: CodingProblem[] = CODING_CATALOG.map((summary) => ({ ...summary, ...DEFINITIONS[summary.id] }));

export function getCodingProblem(id: string): CodingProblem | undefined {
  return CODING_PROBLEMS.find((p) => p.id === id);
}
