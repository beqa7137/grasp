import type { CodingProblem } from '../types.js';
import { countPrefixes, houseRobber, longestCommonSubsequence, singleNumber, totalHammingDistance } from './advanced.js';
import { dailyTemperatures, findDuplicate, kthLargestElement, mergeIntervals, subarraySumK, topKFrequent } from './core.js';
import { binarySearch, containerMostWater, kokoBananas, longestUniqueSubstring, pairSumSorted, twoSum } from './foundations.js';
import { countComponents, courseSchedule, houseRobberTree, networkDelay, numberOfIslands, treeDiameter } from './graphs.js';

/** Every problem, in the order the code list shows them; the learn page suggests the first one not yet solved. */
export const CODING_PROBLEMS: CodingProblem[] = [
  twoSum,
  pairSumSorted,
  containerMostWater,
  longestUniqueSubstring,
  binarySearch,
  kokoBananas,
  dailyTemperatures,
  subarraySumK,
  findDuplicate,
  numberOfIslands,
  mergeIntervals,
  topKFrequent,
  houseRobber,
  kthLargestElement,
  longestCommonSubsequence,
  countComponents,
  courseSchedule,
  networkDelay,
  treeDiameter,
  houseRobberTree,
  countPrefixes,
  singleNumber,
  totalHammingDistance,
];

export function getCodingProblem(id: string): CodingProblem | undefined {
  return CODING_PROBLEMS.find((p) => p.id === id);
}

export function problemsForPattern(patternId: string): CodingProblem[] {
  return CODING_PROBLEMS.filter((p) => p.patternIds.includes(patternId));
}
