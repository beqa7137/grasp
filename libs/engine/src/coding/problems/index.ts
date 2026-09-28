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
import { characterReplacement, longestConsecutive, searchRotatedArray, threeSum } from './batch-a.js';
import { contiguousArray, happyNumber, insertInterval, sumSubarrayMins } from './batch-b.js';
import { combinationSum, kClosestPoints, shortestPathBinaryMatrix, wordSearch } from './batch-c.js';
import { cheapestFlights, longestIncreasingPath, maxPathSum, numberOfProvinces } from './batch-d.js';
import { countingBits, gasStation, longestPalindromicSubsequence, wordBreak, wordSearchII } from './batch-e.js';
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
  'longest-consecutive-sequence': longestConsecutive,
  'pair-sum-sorted': pairSumSorted,
  'container-most-water': containerMostWater,
  'three-sum': threeSum,
  'longest-unique-substring': longestUniqueSubstring,
  'min-size-subarray-sum': minSizeSubarraySum,
  'character-replacement': characterReplacement,
  'binary-search': binarySearch,
  'koko-bananas': kokoBananas,
  'search-rotated-array': searchRotatedArray,
  'subarray-sum-k': subarraySumK,
  'product-of-array-except-self': productExceptSelf,
  'contiguous-array': contiguousArray,
  'daily-temperatures': dailyTemperatures,
  'largest-rectangle-in-histogram': largestRectangleArea,
  'sum-subarray-minimums': sumSubarrayMins,
  'find-duplicate': findDuplicate,
  'circular-array-loop': circularArrayLoop,
  'happy-numbers': happyNumber,
  'merge-intervals': mergeIntervals,
  'non-overlapping-intervals': eraseOverlapIntervals,
  'insert-interval': insertInterval,
  'top-k-frequent': topKFrequent,
  'kth-largest-element': kthLargestElement,
  'k-closest-points': kClosestPoints,
  'number-of-islands': numberOfIslands,
  'rotting-oranges': rottingOranges,
  'shortest-path-binary-matrix': shortestPathBinaryMatrix,
  subsets,
  'combination-sum': combinationSum,
  'word-search': wordSearch,
  'course-schedule': courseSchedule,
  'parallel-courses': parallelCourses,
  'longest-increasing-path': longestIncreasingPath,
  'count-components': countComponents,
  'redundant-connection': redundantConnection,
  'number-of-provinces': numberOfProvinces,
  'network-delay': networkDelay,
  'path-with-minimum-effort': pathWithMinimumEffort,
  'cheapest-flights': cheapestFlights,
  'tree-diameter': treeDiameter,
  'house-robber-tree': houseRobberTree,
  'max-path-sum': maxPathSum,
  'count-prefixes': countPrefixes,
  'replace-words': replaceWords,
  'word-search-ii': wordSearchII,
  'house-robber': houseRobber,
  'coin-change': coinChange,
  'word-break': wordBreak,
  'longest-common-subsequence': longestCommonSubsequence,
  'edit-distance': editDistance,
  'longest-palindromic-subsequence': longestPalindromicSubsequence,
  'jump-game': jumpGame,
  'gas-station': gasStation,
  'single-number': singleNumber,
  'total-hamming-distance': totalHammingDistance,
  'counting-bits': countingBits,
};

export const CODING_PROBLEMS: CodingProblem[] = CODING_CATALOG.map((summary) => ({ ...summary, ...DEFINITIONS[summary.id] }));

export function getCodingProblem(id: string): CodingProblem | undefined {
  return CODING_PROBLEMS.find((p) => p.id === id);
}
