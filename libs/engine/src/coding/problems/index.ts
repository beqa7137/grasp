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
import { kthSmallestSortedMatrix, minArrowsBalloons, taskScheduler, wordLadder, zeroOneMatrix } from './batch-h.js';
import { decodeWays, longestWordInDictionary, lowestCommonAncestor, rightSideView, validateBst } from './batch-j.js';
import { interleavingString, longestIncreasingSubsequence, maximumXorPair, partitionEqualSubset, partitionLabels } from './batch-k.js';
import { equalityEquations, minimumHeightTrees, nQueensCount, permutations, swimRisingWater } from './batch-i.js';
import { carFleet, maxSlidingWindow, minMeetingRooms, splitArrayLargestSum, subarraysDivByK } from './batch-g.js';
import { findMinRotated, fourSumCount, minimumWindowSubstring, permutationInString, trappingRainWater } from './batch-f.js';
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
  'four-sum-count': fourSumCount,
  'pair-sum-sorted': pairSumSorted,
  'container-most-water': containerMostWater,
  'three-sum': threeSum,
  'trapping-rain-water': trappingRainWater,
  'longest-unique-substring': longestUniqueSubstring,
  'min-size-subarray-sum': minSizeSubarraySum,
  'character-replacement': characterReplacement,
  'permutation-in-string': permutationInString,
  'minimum-window-substring': minimumWindowSubstring,
  'binary-search': binarySearch,
  'koko-bananas': kokoBananas,
  'search-rotated-array': searchRotatedArray,
  'find-min-rotated': findMinRotated,
  'split-array-largest-sum': splitArrayLargestSum,
  'subarray-sum-k': subarraySumK,
  'product-of-array-except-self': productExceptSelf,
  'contiguous-array': contiguousArray,
  'subarray-sums-divisible-k': subarraysDivByK,
  'daily-temperatures': dailyTemperatures,
  'largest-rectangle-in-histogram': largestRectangleArea,
  'sum-subarray-minimums': sumSubarrayMins,
  'sliding-window-maximum': maxSlidingWindow,
  'car-fleet': carFleet,
  'find-duplicate': findDuplicate,
  'circular-array-loop': circularArrayLoop,
  'happy-numbers': happyNumber,
  'merge-intervals': mergeIntervals,
  'non-overlapping-intervals': eraseOverlapIntervals,
  'insert-interval': insertInterval,
  'meeting-rooms-ii': minMeetingRooms,
  'min-arrows-balloons': minArrowsBalloons,
  'top-k-frequent': topKFrequent,
  'kth-largest-element': kthLargestElement,
  'k-closest-points': kClosestPoints,
  'task-scheduler': taskScheduler,
  'kth-smallest-sorted-matrix': kthSmallestSortedMatrix,
  'number-of-islands': numberOfIslands,
  'rotting-oranges': rottingOranges,
  'shortest-path-binary-matrix': shortestPathBinaryMatrix,
  'word-ladder': wordLadder,
  'zero-one-matrix': zeroOneMatrix,
  subsets,
  'combination-sum': combinationSum,
  'word-search': wordSearch,
  permutations,
  'n-queens-count': nQueensCount,
  'course-schedule': courseSchedule,
  'parallel-courses': parallelCourses,
  'longest-increasing-path': longestIncreasingPath,
  'minimum-height-trees': minimumHeightTrees,
  'count-components': countComponents,
  'redundant-connection': redundantConnection,
  'number-of-provinces': numberOfProvinces,
  'equality-equations': equalityEquations,
  'network-delay': networkDelay,
  'path-with-minimum-effort': pathWithMinimumEffort,
  'cheapest-flights': cheapestFlights,
  'swim-rising-water': swimRisingWater,
  'tree-diameter': treeDiameter,
  'house-robber-tree': houseRobberTree,
  'max-path-sum': maxPathSum,
  'validate-bst': validateBst,
  'lowest-common-ancestor': lowestCommonAncestor,
  'right-side-view': rightSideView,
  'count-prefixes': countPrefixes,
  'replace-words': replaceWords,
  'word-search-ii': wordSearchII,
  'longest-word-in-dictionary': longestWordInDictionary,
  'house-robber': houseRobber,
  'coin-change': coinChange,
  'word-break': wordBreak,
  'partition-equal-subset': partitionEqualSubset,
  'longest-increasing-subsequence': longestIncreasingSubsequence,
  'decode-ways': decodeWays,
  'longest-common-subsequence': longestCommonSubsequence,
  'edit-distance': editDistance,
  'longest-palindromic-subsequence': longestPalindromicSubsequence,
  'interleaving-string': interleavingString,
  'jump-game': jumpGame,
  'gas-station': gasStation,
  'partition-labels': partitionLabels,
  'single-number': singleNumber,
  'total-hamming-distance': totalHammingDistance,
  'counting-bits': countingBits,
  'maximum-xor-pair': maximumXorPair,
};

export const CODING_PROBLEMS: CodingProblem[] = CODING_CATALOG.map((summary) => ({ ...summary, ...DEFINITIONS[summary.id] }));

export function getCodingProblem(id: string): CodingProblem | undefined {
  return CODING_PROBLEMS.find((p) => p.id === id);
}
