import { CODING_CATALOG, type CodingProblemId } from '../catalog.js';
import type { CodingProblem, CodingProblemDefinition } from '../types.js';
import {
  coinChange,
  countPrefixes,
  editDistance,
  houseRobber,
  longestCommonSubsequence,
  replaceWords,
  singleNumber,
  subsets,
  totalHammingDistance,
} from './advanced.js';
import {
  circularArrayLoop,
  dailyTemperatures,
  eraseOverlapIntervals,
  findDuplicate,
  kthLargestElement,
  largestRectangleArea,
  mergeIntervals,
  productExceptSelf,
  subarraySumK,
  topKFrequent,
} from './core.js';
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
  parallelCourses,
  redundantConnection,
  treeDiameter,
} from './graphs.js';
import { numberOfIslands, pathWithMinimumEffort, rottingOranges } from './grids.js';

const DEFINITIONS: Record<CodingProblemId, CodingProblemDefinition> = {
  'two-sum': twoSum,
  'pair-sum-sorted': pairSumSorted,
  'container-most-water': containerMostWater,
  'longest-unique-substring': longestUniqueSubstring,
  'min-size-subarray-sum': minSizeSubarraySum,
  'binary-search': binarySearch,
  'koko-bananas': kokoBananas,
  'subarray-sum-k': subarraySumK,
  'product-of-array-except-self': productExceptSelf,
  'daily-temperatures': dailyTemperatures,
  'largest-rectangle-in-histogram': largestRectangleArea,
  'find-duplicate': findDuplicate,
  'circular-array-loop': circularArrayLoop,
  'merge-intervals': mergeIntervals,
  'non-overlapping-intervals': eraseOverlapIntervals,
  'top-k-frequent': topKFrequent,
  'kth-largest-element': kthLargestElement,
  'number-of-islands': numberOfIslands,
  'rotting-oranges': rottingOranges,
  subsets,
  'course-schedule': courseSchedule,
  'parallel-courses': parallelCourses,
  'count-components': countComponents,
  'redundant-connection': redundantConnection,
  'network-delay': networkDelay,
  'path-with-minimum-effort': pathWithMinimumEffort,
  'tree-diameter': treeDiameter,
  'house-robber-tree': houseRobberTree,
  'count-prefixes': countPrefixes,
  'replace-words': replaceWords,
  'house-robber': houseRobber,
  'coin-change': coinChange,
  'longest-common-subsequence': longestCommonSubsequence,
  'edit-distance': editDistance,
  'jump-game': jumpGame,
  'single-number': singleNumber,
  'total-hamming-distance': totalHammingDistance,
};

export const CODING_PROBLEMS: CodingProblem[] = CODING_CATALOG.map((summary) => ({ ...summary, ...DEFINITIONS[summary.id] }));

export function getCodingProblem(id: string): CodingProblem | undefined {
  return CODING_PROBLEMS.find((p) => p.id === id);
}
