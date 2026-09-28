import type { Lesson } from './types.js';

export const FOUNDATIONS_CORE_LESSONS: Record<
  'hashing' | 'two-pointers' | 'sliding-window' | 'binary-search' | 'prefix-sum' | 'monotonic-stack' | 'fast-slow' | 'intervals' | 'heap',
  Lesson
> = {
  hashing: {
    why: 'A brute-force pair search asks "is my partner anywhere?" by rescanning, which costs O(n) per element. A hash map remembers every element already passed, so the same question becomes one O(1) average lookup, and one pass of n lookups finds the answer in O(n). The price is O(n) memory, and the key must capture exactly what makes two items match.',
    examples: [
      {
        title: 'Two Sum',
        problem: 'Given `nums = [5, 2, 8, 6]` and `target = 11`, return the indices of the two numbers that add up to 11.',
        insight: 'For each x, the partner is fully determined: `target - x`. Check the map for it before storing x.',
        steps: [
          '`i = 0`, `x = 5`: need 6. The map is empty, so store `5 → 0`.',
          '`i = 1`, `x = 2`: need 9. Not in the map, so store `2 → 1`.',
          '`i = 2`, `x = 8`: need 3. Not in the map, so store `8 → 2`.',
          '`i = 3`, `x = 6`: need 5, and 5 is in the map at index 0. Return `[0, 3]`, since 5 + 6 = 11.',
          'The pair was 3 positions apart, yet each step was one lookup and one store: O(n) time, O(n) space.',
        ],
        visualize: { algorithmId: 'two-sum-hash', input: { nums: [5, 2, 8, 6], target: 11 } },
      },
      {
        title: 'Group Anagrams',
        problem: 'Group ["eat", "tea", "tan", "ate", "nat", "bat"] so that words with the same letters end up together.',
        insight: 'Anagrams share a canonical form: their letters sorted. Use that as the map key and append each word to its bucket.',
        steps: [
          '"eat" sorts to "aet": create bucket `aet: [eat]`.',
          '"tea" also sorts to "aet", so it joins that bucket. "tan" sorts to "ant": a new bucket.',
          '"ate" joins "aet", and "nat" joins "ant", each with one O(1) average lookup.',
          '"bat" sorts to "abt", a new bucket of its own.',
          'Return the buckets: `[eat, tea, ate]`, `[tan, nat]`, `[bat]`. Cost: O(n · L log L) for n words of length L.',
        ],
      },
      {
        title: 'Longest Consecutive Sequence',
        problem: 'Given `[100, 4, 200, 1, 3, 2]`, return the length of the longest run of consecutive integers, in O(n).',
        insight: 'Put everything in a set, and only start counting at a number x where `x - 1` is missing: x is the start of a run.',
        steps: [
          'Build the set {100, 4, 200, 1, 3, 2} in O(n).',
          '100: 99 is missing, so it starts a run. 101 is missing too: length 1.',
          '4: 3 is in the set, so 4 is not a start. Skip it without counting.',
          '1: 0 is missing, so count upward: 2, 3 and 4 are present, 5 is not. Length 4.',
          'Each number is walked over at most once by the one run that contains it, so the total is O(n). Answer: 4.',
        ],
      },
    ],
    variations: [
      {
        name: 'Frequency counting',
        how: 'Store counts instead of indices, adding one to `count[x]` per occurrence. Valid Anagram compares two count maps; Majority Element scans one.',
      },
      {
        name: 'Canonical keys',
        how: 'When items match by shape rather than value, build a key first: sorted letters, a 26-letter count string, or a tuple joined with a separator.',
      },
      {
        name: 'Set for membership only',
        how: 'When you only ask "have I seen it?", use a `Set` instead of a `Map`. Contains Duplicate returns true the first time `seen.has(x)` holds.',
      },
    ],
    followUps: [
      {
        question: 'What if you cannot use O(n) extra memory?',
        answer:
          'Sort in place and use two pointers: O(n log n) time, O(1) extra space. You lose original indices unless you sort index pairs, which costs memory again.',
      },
      {
        question: 'What is the worst case of a hash map lookup?',
        answer:
          'O(n) when many keys collide, for example under adversarial input. Average O(1) holds with a good hash; interviewers mostly want you to say "average".',
      },
      {
        question: 'How does Two Sum handle duplicates, like `[3, 3]` with target 6?',
        answer:
          'Checking before storing handles it: the first 3 finds nothing and is stored, and the second 3 finds it, returning `[0, 1]`. Storing first could pair 3 with itself.',
      },
    ],
  },

  'two-pointers': {
    why: 'On a sorted array, if `a[l] + a[r]` is too small, then `a[l]` paired with anything left of r is no larger, so `a[l]` can be in no valid pair and l moves right. The symmetric argument drops `a[r]` when the sum is too big. Every step discards one element with proof, so at most n - 1 steps check all pairs that matter.',
    examples: [
      {
        title: 'Two Sum II (Sorted Input)',
        problem: 'Given sorted nums = [2, 3, 5, 8, 11, 13] and `target = 19`, return the indices of two numbers that sum to 19.',
        insight: 'Start at both ends; the comparison with the target says which end can never be part of an answer.',
        steps: [
          '`l = 0`, `r = 5`: 2 + 13 = 15 < 19. Even 13, the largest, cannot rescue 2, so drop 2: `l = 1`.',
          '3 + 13 = 16 < 19: drop 3, `l = 2`.',
          '5 + 13 = 18 < 19: drop 5, `l = 3`.',
          '8 + 13 = 21 > 19. Even 8, the smallest left, overshoots with 13, so drop 13: `r = 4`.',
          '8 + 11 = 19: return `[3, 4]` after 5 comparisons instead of 15 pairs.',
        ],
        visualize: { algorithmId: 'pair-sum-sorted', input: { nums: [2, 3, 5, 8, 11, 13], target: 19 } },
      },
      {
        title: 'Container With Most Water',
        problem: 'Walls have heights `[2, 5, 4, 3, 6, 1]`. Pick two walls holding the most water: `min(h[l], h[r])` times `r - l`.',
        insight:
          'Always move the shorter wall: any container keeping it and a closer partner is capped by the same height with less width.',
        steps: [
          '`l = 0`, `r = 5`: min(2, 1) × 5 = 5. Wall 5 (height 1) is shorter, so `r = 4`.',
          'min(2, 6) × 4 = 8, best 8. Wall 0 (height 2) is shorter, so `l = 1`.',
          'min(5, 6) × 3 = 15, best 15. Wall 1 is shorter, so `l = 2`.',
          'min(4, 6) × 2 = 8, then `l = 3`: min(3, 6) × 1 = 3. Now `l + 1 = r`, and the scan ends.',
          'Answer 15 from walls 1 and 4, found in n - 1 steps instead of checking all 15 pairs.',
        ],
      },
      {
        title: '3Sum',
        problem: 'Find all unique triplets in `[-1, 0, 1, 2, -1, -4]` that sum to 0.',
        insight: 'Sort, fix the first number, and run the sorted pair search on the rest for its negation, skipping repeated values.',
        steps: [
          'Sort: `[-4, -1, -1, 0, 1, 2]`.',
          'Fix -4, need 4: the biggest pair left is 1 + 2 = 3, so the pointers meet with no match.',
          'Fix -1 (index 1), need 1: -1 + 2 = 1 records `[-1, -1, 2]`; move both, then 0 + 1 = 1 records `[-1, 0, 1]`.',
          'Index 2 is -1 again: skip it, or both triplets would repeat.',
          'Fix 0, need 0: 1 + 2 = 3 is too big and r passes l. Result: two triplets, O(n²) total.',
        ],
      },
    ],
    variations: [
      {
        name: 'Same-direction (fast and slow index)',
        how: 'Both pointers start at 0: r scans every element and l marks where the next kept one goes. Remove Duplicates writes `a[l++] = a[r]` when `a[r]` is new.',
      },
      {
        name: 'Palindrome check',
        how: 'Start at both ends and compare `s[l]` and `s[r]`, moving both inward on a match. Valid Palindrome first skips characters that are not letters or digits.',
      },
      {
        name: 'Merge two sorted arrays',
        how: 'One pointer per array; take the smaller head each step. Merging into the first array from the back avoids overwriting unread values.',
      },
    ],
    followUps: [
      {
        question: 'What if the input is not sorted?',
        answer:
          'Sorting costs O(n log n) and loses original indices unless you sort `[value, index]` pairs. For plain Two Sum, a hash map gives O(n) and keeps indices.',
      },
      {
        question: 'How do you avoid duplicate triplets in 3Sum without a set?',
        answer:
          'Skip a fixed value equal to the previous one, and after a match move l past every copy of `a[l]` (and r past copies of `a[r]`).',
      },
      {
        question: 'How does this generalize to 4Sum or k-Sum?',
        answer:
          'Fix k - 2 numbers with nested loops and run the two-pointer pair search inside: O(n^(k-1)) time, with the same duplicate skipping at each level.',
      },
    ],
  },

  'sliding-window': {
    why: 'When shrinking a valid window keeps it valid (and growing an invalid one keeps it invalid), the earliest valid start for right is never before the earliest valid start for `right - 1`. So left never needs to move backward, and each element enters once and leaves at most once: O(n) instead of checking all O(n²) subarrays.',
    examples: [
      {
        title: 'Longest Substring Without Repeating Characters',
        problem: 'Return the length of the longest substring of `"pwwkew"` with no repeated character.',
        insight: 'Extend on the right; when the new character is already inside, evict from the left until the old copy is gone.',
        steps: [
          '"p" then "pw": both new, so the window grows to length 2.',
          'The second "w" repeats: evict "p", then the first "w". The window is just "w", starting at index 2.',
          'Add "k" and "e": window "wke", length 3, the new best.',
          'The last "w" repeats: evict the "w" at index 2, leaving "kew", length 3.',
          'Answer 3. Each character entered and left at most once, so the scan is O(n).',
        ],
        visualize: { algorithmId: 'longest-unique-substring', input: { s: 'pwwkew' } },
      },
      {
        title: 'Minimum Size Subarray Sum',
        problem:
          'Given positive nums = [2, 3, 1, 2, 4, 3] and `target = 7`, return the length of the shortest subarray with sum at least 7.',
        insight: 'Grow until the sum reaches the target, then shrink from the left while it still does, recording each length.',
        steps: [
          'Add 2, 3, 1, 2: the sum reaches 8 at index 3, length 4. Remove 2: sum 6 < 7, stop shrinking.',
          'Add 4: sum 10, length 4. Remove 3: sum 7, length 3, the new best.',
          'Remove 1: sum 6 < 7, stop. The window is `[2, 4]`.',
          'Add 3: sum 9, length 3. Remove 2: sum 7, length 2, the new best. Remove 4: sum 3, stop.',
          'Answer 2, the subarray `[4, 3]`. Positive numbers make "shrinking lowers the sum" true, which the window relies on.',
        ],
      },
      {
        title: 'Longest Repeating Character Replacement',
        problem: 'In `"AABABBA"` you may change at most `k = 1` character. Return the longest substring that can become all one letter.',
        insight: 'A window is fixable when `len - maxCount <= k`: everything but the most common letter gets replaced.',
        steps: [
          'Grow to "AABA": 3 A, length 4, one replacement. Valid, best 4.',
          'Add "B": "AABAB" needs 2 replacements. Shrink: dropping "A" leaves "ABAB", still 2; dropping the next "A" leaves "BAB".',
          'Add "B": "BABB" has 3 B, one replacement. Valid, length 4.',
          'Add "A": "BABBA" needs 2. Shrink twice to "BBA".',
          'Answer 4, from "AABA" or "BABB".',
        ],
      },
    ],
    variations: [
      {
        name: 'Fixed-size window',
        how: 'Add `a[right]` and remove `a[right - k]` on every step once the window has k elements. Maximum Average Subarray and Find All Anagrams work this way.',
      },
      {
        name: 'At most k distinct',
        how: 'Keep a count map of the window and shrink while `map.size > k`. For "exactly k", compute `atMost(k)` minus `atMost(k - 1)`.',
      },
      {
        name: 'Shortest valid window',
        how: 'Flip where the answer is recorded: shrink while the window is valid and update the minimum inside that loop, as in Minimum Window Substring.',
      },
    ],
    followUps: [
      {
        question: 'Why can `maxCount` stay stale in Longest Repeating Character Replacement?',
        answer:
          'A stale, too-high `maxCount` only keeps the window from shrinking; the window grows only when a real count beats the best, so the answer is still right and each step stays O(1).',
      },
      {
        question: 'Is it really O(n) with a while loop inside a for loop?',
        answer:
          'Yes: left only moves forward and never passes the end, so the inner loop runs at most n times in total across the whole scan. That is 2n steps, amortized O(1) each.',
      },
      {
        question: 'What if the alphabet is small and known?',
        answer:
          'Replace the set or map with a fixed array of 26 or 128 counts, or store the last index of each character and jump left to `max(left, last[c] + 1)`, since an old index can sit before the current window.',
      },
    ],
  },

  'binary-search': {
    why: 'Binary search works on any predicate that is false, false, ..., then true, true over the search space. Checking the middle rules out the half that cannot contain the first true, so the space halves every step and 1,000,000 candidates need about 20 checks. The array does not even need to exist: the space can be possible answers, like speeds or capacities.',
    examples: [
      {
        title: 'Binary Search',
        problem: 'Return the index of `target = 9` in the sorted array `[-1, 0, 3, 5, 9, 12]`, or -1 if it is absent.',
        insight: 'Compare with the middle; sorted order tells you which half cannot hold the target.',
        steps: [
          '`lo = 0`, `hi = 5`, so `mid = 2` holds 3. 3 < 9, so indices 0 to 2 are all too small: `lo = 3`.',
          'Now `lo = 3`, `hi = 5`, so `mid = 4` holds 9: found, return 4.',
          'Two comparisons for six elements. A million would need about 20.',
          'For an absent target like 2, the range shrinks until `lo > hi`, and lo then marks where 2 would be inserted.',
        ],
        visualize: { algorithmId: 'binary-search', input: { nums: [-1, 0, 3, 5, 9, 12], target: 9 } },
      },
      {
        title: 'Koko Eating Bananas',
        problem: 'Piles `[3, 6, 7, 11]` must be eaten in `h = 8` hours, one pile per hour at most. Find the minimum eating speed.',
        insight: 'Search the answer: if speed s finishes in time, every faster speed does too, so feasibility is monotonic in s.',
        steps: [
          'Speeds run from 1 to 11 (the largest pile). The hours at speed s are the sum of `ceil(p / s)`.',
          '`mid = 6`: 1 + 1 + 2 + 2 = 6 hours ≤ 8, feasible. Keep it as a candidate: `hi = 6`.',
          '`mid = 3`: 1 + 2 + 3 + 4 = 10 hours > 8, too slow: `lo = 4`.',
          '`mid = 5`: 1 + 2 + 2 + 3 = 8, feasible: `hi = 5`. Then `mid = 4`: also 8, feasible: `hi = 4`.',
          '`lo = hi = 4`: the answer is 4, after 4 checks of O(n) each.',
        ],
      },
      {
        title: 'Search in Rotated Sorted Array',
        problem: 'Find `target = 0` in `[4, 5, 6, 7, 0, 1, 2]`, a sorted array rotated at an unknown point, in O(log n).',
        insight: 'One half around mid is always sorted; check whether the target lies in that sorted half, otherwise go to the other.',
        steps: [
          '`lo = 0`, `hi = 6`, `mid = 3` holds 7. The left half `[4..7]` is sorted, and 0 is outside it: `lo = 4`.',
          '`mid = 5` holds 1. The left half `[0, 1]` is sorted and 0 is inside it: `hi = 4`.',
          '`mid = 4` holds 0: found, return 4.',
          'Each step still discards half, so it stays O(log n).',
        ],
      },
    ],
    variations: [
      {
        name: 'First or last occurrence',
        how: 'On a match do not return: record mid and continue with `hi = mid - 1` for the first copy or `lo = mid + 1` for the last. Two searches give a range.',
      },
      {
        name: 'Binary search on the answer',
        how: 'Search a range of candidate answers with `feasible(mid)`, keeping `hi = mid` when it passes and `lo = mid + 1` when it fails, as in Ship Packages Within D Days.',
      },
      {
        name: 'Lower bound (insert position)',
        how: 'Use `lo < hi` with `hi = n`, and keep mid when `a[mid] >= target`. The loop ends at the first index not less than target, which is also the insert position.',
      },
    ],
    followUps: [
      {
        question: 'Why write `lo + (hi - lo) / 2`?',
        answer:
          'In languages with fixed-size integers, `lo + hi` can overflow for large indices. The subtraction form stays in range. JavaScript numbers do not overflow here, but interviewers expect the habit.',
      },
      {
        question: 'How do you avoid an infinite loop?',
        answer:
          'Each branch must shrink the range. With `lo < hi` and mid rounding down, use `lo = mid + 1`; if you need `lo = mid`, round mid up instead.',
      },
      {
        question: 'What changes in a rotated array with duplicates?',
        answer:
          'When `a[lo] == a[mid] == a[hi]` you cannot tell which half is sorted, so shrink both ends by one. The worst case becomes O(n), for example on mostly equal values.',
      },
    ],
  },

  'prefix-sum': {
    why: 'With `pre[i]` the sum of the first i elements, any range sum is `pre[j + 1] - pre[i]`, one subtraction after an O(n) build. For counting subarrays, a subarray ending at i sums to k exactly when an earlier prefix equals `p - k`, so a hash map of prefix counts answers each position in O(1). Unlike a sliding window, this works with negative numbers.',
    examples: [
      {
        title: 'Subarray Sum Equals K',
        problem: 'Count the subarrays of `nums = [1, -1, 5, -2, 3]` that sum to `k = 3`.',
        insight: 'At each running sum p, the subarrays ending here with sum k correspond to earlier prefixes equal to `p - k`.',
        steps: [
          'Start with `count = {0: 1}` for the empty prefix, so subarrays starting at index 0 are counted.',
          'Index 0: p = 1, need -2, none. Index 1: p = 0, need -3, none. Now 0 has been seen twice.',
          'Index 2: p = 5, need 2, none.',
          'Index 3: p = 3, need 0, seen twice: `[1, -1, 5, -2]` and `[5, -2]`. Total 2.',
          'Index 4: p = 6, need 3, seen once at index 3: the subarray `[3]`. Total 3.',
        ],
        visualize: { algorithmId: 'subarray-sum-prefix', input: { nums: [1, -1, 5, -2, 3], k: 3 } },
      },
      {
        title: 'Range Sum Query',
        problem: 'For nums = [-2, 0, 3, -5, 2, -1], answer many queries `sumRange(i, j)`, such as (0, 2) and (2, 5).',
        insight: 'Build the prefix array once; each query subtracts two entries.',
        steps: [
          'Build pre = [0, -2, -2, 1, -4, -2, -3], where `pre[i]` is the sum of the first i elements.',
          '`sumRange(0, 2)` = `pre[3] - pre[0]` = 1 - 0 = 1, which is -2 + 0 + 3.',
          '`sumRange(2, 5)` = `pre[6] - pre[2]` = -3 - (-2) = -1, which is 3 - 5 + 2 - 1.',
          'The leading 0 means a range starting at index 0 needs no special case.',
          'Build O(n) once, then O(1) per query instead of O(n).',
        ],
      },
      {
        title: 'Product of Array Except Self',
        problem: "For `[1, 2, 3, 4]`, return each position's product of all other elements, without division.",
        insight: 'The answer at i is the product of everything left of i times everything right of i: a prefix and a suffix product.',
        steps: [
          'Left products (exclusive): `[1, 1, 2, 6]`.',
          'Right products (exclusive): `[24, 12, 4, 1]`.',
          'Multiply position by position: `[24, 12, 8, 6]`.',
          'Store the left products in the output, then sweep from the right with one running variable: O(n) time, O(1) extra space.',
        ],
      },
    ],
    variations: [
      {
        name: '2-D prefix sums',
        how: 'Let `P[r][c]` be the sum of the rectangle above and left of `(r, c)`. A region sum takes its bottom-right corner, subtracts the strips above and to the left, and adds back their doubly subtracted corner.',
      },
      {
        name: 'Longest subarray with sum k',
        how: 'Store the first index of each prefix instead of its count; at each p, if `p - k` was seen at index j, the length is `i - j`.',
      },
      {
        name: 'Divisible by k',
        how: 'Key the map by `((p % k) + k) % k`: two prefixes with equal remainders bound a subarray whose sum is divisible by k.',
      },
    ],
    followUps: [
      {
        question: 'Why not use a sliding window for Subarray Sum Equals K?',
        answer:
          'With negative numbers, adding an element can lower the sum, so there is no safe rule for when to shrink. The prefix map does not care about signs.',
      },
      {
        question: 'What if the array changes between queries?',
        answer:
          'An update would rewrite O(n) prefixes. Use a Fenwick tree or segment tree for O(log n) updates and O(log n) range queries.',
      },
      {
        question: 'Why must the map start as `{0: 1}`?',
        answer:
          'It stands for the empty prefix, so a subarray starting at index 0 with sum k is counted when p first equals k. Without it, those subarrays are missed.',
      },
    ],
  },

  'monotonic-stack': {
    why: 'The stack holds indices still waiting for an answer, and their values never increase from bottom to top. When a bigger value arrives, it is the first greater value for every smaller index on top, so those are popped and resolved. Each index is pushed once and popped at most once, so the whole scan is O(n) even with the inner while loop.',
    examples: [
      {
        title: 'Next Greater Element',
        problem: 'For `nums = [2, 1, 2, 4, 3]`, return the next strictly greater value to the right of each element, or -1.',
        insight: 'Keep unresolved indices on a stack with decreasing values; each new value pops everything smaller than it.',
        steps: [
          'Push index 0 (2). Value 1 is not bigger, so push index 1: the stack holds values 2, 1.',
          'Value 2 at index 2 pops index 1 (1 < 2), so `res[1] = 2`. The 2 below is not smaller, so stop and push.',
          'Value 4 pops index 2 and then index 0: both get 4. Push index 3.',
          'Value 3 is smaller than 4, so push index 4.',
          'Indices 3 and 4 never get popped, so they keep -1. Result: `[4, 2, 4, -1, -1]`.',
        ],
        visualize: { algorithmId: 'next-greater-element', input: { nums: [2, 1, 2, 4, 3] } },
      },
      {
        title: 'Daily Temperatures',
        problem: 'For temperatures [73, 74, 75, 71, 69, 72, 76, 73], return how many days each one waits for a warmer day, or 0.',
        insight: 'Same stack, but record the distance `i - j` when index j is popped, not the value.',
        steps: [
          '74 pops 73 (1 day). 75 pops 74 (1 day). Push 75.',
          '71 and 69 are colder, so both wait on the stack above 75.',
          '72 pops 69 (index 4, 1 day) and 71 (index 3, 2 days), then stops at 75.',
          '76 pops 72 (1 day) and 75 (index 2, 4 days). 73 is pushed and never resolved.',
          'Result: `[1, 1, 4, 2, 1, 1, 0, 0]` in one O(n) pass.',
        ],
      },
      {
        title: 'Largest Rectangle in Histogram',
        problem: 'For bar heights `[2, 1, 5, 6, 2, 3]`, return the area of the largest rectangle.',
        insight: 'Keep increasing heights; a popped bar extends from the new stack top to the current index, both exclusive.',
        steps: [
          'Height 1 pops the 2: it spans only index 0, area 2. Push 1, then 5 and 6.',
          'Height 2 at index 4 pops 6: the width is from index 2 to 4 exclusive, 1, area 6.',
          'It pops 5 too: the width runs from index 1 to 4 exclusive, 2 bars, area 10.',
          'After 3 is pushed, a final height 0 flushes the stack: 3 gives 3, 2 gives 2 × 4 = 8, 1 gives 1 × 6 = 6.',
          'Answer 10, from the bars 5 and 6.',
        ],
      },
    ],
    variations: [
      {
        name: 'Next smaller element',
        how: 'Flip the comparison: pop while `a[top] > a[i]`, so the stack keeps increasing values. Histogram and Sum of Subarray Minimums use this form.',
      },
      {
        name: 'Circular array',
        how: 'Loop `i` from 0 to `2n - 1` and read `a[i % n]`, pushing only during the first pass, so elements near the end can find answers at the start.',
      },
      {
        name: 'Previous greater (stock span)',
        how: 'After popping everything smaller or equal, the index left on top is the previous greater element; the span is `i - top`, or `i + 1` if the stack is empty.',
      },
    ],
    followUps: [
      {
        question: 'Why is it O(n) with a nested while loop?',
        answer:
          'Every index is pushed exactly once and popped at most once, so the total number of pops across the whole scan is at most n. The work is at most 2n operations.',
      },
      {
        question: 'Should the stack hold values or indices?',
        answer:
          'Indices: you can read the value from them, and many problems need distances or widths. Storing only values loses where each element was.',
      },
      {
        question: 'How do duplicates change things?',
        answer:
          'Pop with strict `<` if equal values should keep waiting, or `<=` if an equal value counts as resolving. In histograms and subarray minimums, pick one side strict to avoid double counting.',
      },
    ],
  },

  'fast-slow': {
    why: 'If the list ends, fast reaches the end first and there is no cycle. If there is a cycle, both pointers eventually enter it, and each step fast gains exactly one node on slow, so the gap shrinks by one each time and they must land on the same node within one lap. That gives O(n) time with O(1) memory, instead of a visited set.',
    examples: [
      {
        title: 'Linked List Cycle',
        problem: 'The list `3 → 2 → 0 → -4` has its tail linking back to the node at index 1 (value 2). Detect the cycle.',
        insight: 'Move slow one node and fast two nodes per step; they meet if and only if there is a cycle.',
        steps: [
          'Both start at 3.',
          'Step 1: slow moves to 2, fast moves to 0.',
          'Step 2: slow moves to 0; fast goes -4 then back to 2 through the cycle.',
          'Step 3: slow moves to -4; fast goes 0 then -4. They meet, so return true.',
          'Inside the loop of 3 nodes, fast closed the gap one node per step. A list that ends would have let `fast.next` become null.',
        ],
        visualize: { algorithmId: 'linked-list-cycle', input: { values: [3, 2, 0, -4], pos: 1 } },
      },
      {
        title: 'Middle of the Linked List',
        problem: 'Return the middle node of `1 → 2 → 3 → 4 → 5`, and the second middle for an even length.',
        insight: 'When fast has covered the whole list at double speed, slow has covered half of it.',
        steps: [
          'Both start at 1.',
          'Step 1: slow to 2, fast to 3.',
          'Step 2: slow to 3, fast to 5.',
          '`fast.next` is null, so stop: slow is at 3, the middle.',
          'For `1 → ... → 6`, fast runs off the end after the third step with slow at 4, the second middle.',
        ],
      },
      {
        title: 'Find the Duplicate Number',
        problem:
          '`nums = [1, 3, 4, 2, 2]` holds n + 1 values in 1..n. Find the repeated one in O(1) extra space without changing the array.',
        insight: 'Treat `i → nums[i]` as a linked list: two indices point to the duplicate, so it is the entrance of a cycle.',
        steps: [
          'From index 0 the path is 0 → 1 → 3 → 2 → 4 → 2 → 4 ..., a cycle through 2 and 4.',
          'Phase 1: slow visits 1, 3, 2, 4 while fast visits 3, 4, 4, 4. They meet at 4.',
          'Phase 2: reset slow to 0, and move both one step at a time.',
          'slow visits 1, 3, 2 while fast visits 2, 4, 2. They meet at 2.',
          'The meeting point is the cycle entrance, so the duplicate is 2.',
        ],
      },
    ],
    variations: [
      {
        name: 'Cycle start (Linked List Cycle II)',
        how: 'After slow and fast meet, restart one pointer at the head and move both one step at a time; they meet at the cycle entrance.',
      },
      {
        name: 'Happy Number',
        how: 'Replace `node.next` with the transform "sum of squared digits". If fast reaches 1 the number is happy; if slow meets fast elsewhere, it loops forever.',
      },
      {
        name: 'Palindrome Linked List',
        how: 'Use fast and slow to find the middle, reverse the second half in place, then compare the two halves node by node.',
      },
    ],
    followUps: [
      {
        question: 'Why does restarting from the head find the cycle start?',
        answer:
          'If the head is a nodes from the entrance and they meet b nodes into a cycle of length c, then 2(a + b) = a + b + kc, so a = kc - b. Walking a from the head and from the meeting point both end at the entrance.',
      },
      {
        question: 'How do you find the cycle length?',
        answer: 'After the meeting, keep one pointer still and step the other until it returns, counting the steps.',
      },
      {
        question: 'Why not just use a set of visited nodes?',
        answer:
          'It works in O(n) time but costs O(n) memory. Interviewers ask for Floyd because it is O(1) space, and some variants forbid modifying the list.',
      },
    ],
  },

  intervals: {
    why: 'After sorting by start, once an interval starts after the current block end, every later interval starts even later, so that block is final. So one pass comparing each start with the last end decides everything, and sorting dominates at O(n log n). Choosing the sort key is the real decision: start for merging, end for greedy selection.',
    examples: [
      {
        title: 'Merge Intervals',
        problem: 'Merge all overlapping intervals in [[1, 4], [0, 2], [3, 5], [6, 7], [7, 9]], where touching ends count as overlap.',
        insight: 'Sort by start; each interval either extends the last merged one or starts a new one.',
        steps: [
          'Sort: [0, 2], [1, 4], [3, 5], [6, 7], [7, 9]. Start with `[0, 2]`.',
          '`[1, 4]`: 1 ≤ 2, so it overlaps; extend to `[0, 4]`.',
          '`[3, 5]`: 3 ≤ 4, extend to `[0, 5]`.',
          '`[6, 7]`: 6 > 5, a gap, so push it as a new interval.',
          '`[7, 9]`: 7 ≤ 7 (touching), extend to `[6, 9]`. Result: `[0, 5], [6, 9]`.',
        ],
        visualize: {
          algorithmId: 'merge-intervals',
          input: {
            intervals: [
              [1, 4],
              [0, 2],
              [3, 5],
              [6, 7],
              [7, 9],
            ],
          },
        },
      },
      {
        title: 'Meeting Rooms II',
        problem: 'Meetings [[0, 30], [5, 10], [15, 20]] need rooms. What is the minimum number of rooms?',
        insight: 'Sort starts and ends separately; a meeting can reuse a room exactly when the earliest end has passed.',
        steps: [
          'Starts: `[0, 5, 15]`. Ends: `[10, 20, 30]`.',
          'Start 0: no meeting has ended (earliest end 10), so open room 1.',
          'Start 5: 5 < 10, still no free room, so open room 2.',
          'Start 15: 15 ≥ 10, so the meeting ending at 10 frees its room. Reuse it and move to end 20.',
          'The peak was 2 rooms. The same sweep with a min-heap of end times also works, O(n log n).',
        ],
      },
      {
        title: 'Non-overlapping Intervals',
        problem: 'Remove the fewest intervals from [[1, 2], [2, 3], [3, 4], [1, 3]] so the rest do not overlap.',
        insight: 'Sort by end and keep greedily: the interval that ends first leaves the most room for the rest.',
        steps: [
          'Sort by end: [1, 2], [2, 3], [1, 3], [3, 4]. Keep `[1, 2]`, end 2.',
          '`[2, 3]` starts at 2 ≥ 2, so keep it: end 3.',
          '`[1, 3]` starts at 1 < 3: it overlaps, so remove it (1 removal).',
          '`[3, 4]` starts at 3 ≥ 3: keep it. Answer: 1 removal.',
        ],
      },
    ],
    variations: [
      {
        name: 'Insert Interval',
        how: 'The input is already sorted: copy intervals ending before the new one, merge every one that overlaps into it, then copy the rest. O(n), no sort.',
      },
      {
        name: 'Minimum arrows (greedy by end)',
        how: 'Sort by end and shoot at the first end; skip every balloon whose start is at or before it, then shoot at the next end. Same shape as Non-overlapping Intervals.',
      },
      {
        name: 'Interval List Intersections',
        how: 'Two pointers over two sorted lists: the overlap is `[max(starts), min(ends)]` when it is non-empty, and the interval that ends first advances.',
      },
    ],
    followUps: [
      {
        question: 'Do touching intervals like `[1, 2]` and `[2, 3]` overlap?',
        answer:
          'It depends on the problem, so ask. Merge Intervals treats them as overlapping (`<=`), while meeting rooms free a room at the end time (`<`). The comparison operator encodes the answer.',
      },
      {
        question: 'What if intervals arrive one at a time in a stream?',
        answer:
          'Keep the merged intervals in a balanced tree keyed by start, and merge each arrival with its neighbors in O(log n) plus the intervals it absorbs.',
      },
      {
        question: 'Can you merge in less than O(n log n)?',
        answer:
          'Not in general, since the sort dominates. If the coordinates are small integers, a counting sort or a difference array over the coordinate range makes it linear.',
      },
    ],
  },

  heap: {
    why: 'A min-heap of size k keeps the k largest values seen so far, with the smallest of them at the root. A new value only matters if it beats the root, and replacing the root costs O(log k). So a pass over n values costs O(n log k) time and O(k) memory, which beats sorting when k is much smaller than n and works on a stream.',
    examples: [
      {
        title: 'Kth Largest Element in an Array',
        problem: 'Find the 2nd largest value in nums = [3, 2, 1, 5, 6, 4].',
        insight: 'Keep a min-heap of the 2 largest so far; its root is the answer, and anything smaller than the root is irrelevant.',
        steps: [
          'Push 3 and 2. The heap holds {2, 3}, root 2.',
          '1 is not bigger than the root 2, so skip it: it cannot be among the top 2.',
          '5 beats 2: replace the root and sift down. The heap holds {3, 5}, root 3.',
          '6 beats 3: replace and sift. The heap holds {5, 6}, root 5.',
          '4 does not beat 5, so skip it. The answer is the root: 5.',
        ],
        visualize: { algorithmId: 'kth-largest', input: { nums: [3, 2, 1, 5, 6, 4], k: 2 } },
      },
      {
        title: 'Top K Frequent Elements',
        problem: 'Return the `k = 2` most frequent values in `[1, 1, 1, 2, 2, 3]`.',
        insight: 'Count with a hash map, then keep a min-heap of size k ordered by count.',
        steps: [
          'Count: {1: 3, 2: 2, 3: 1}.',
          'Push (1, 3) and (2, 2). The root is (2, 2), the least frequent kept.',
          '(3, 1): count 1 does not beat the root count 2, so skip it.',
          'The heap holds 1 and 2: return `[1, 2]`. Cost O(n + u log k) for u distinct values.',
        ],
      },
      {
        title: 'Merge K Sorted Lists',
        problem: 'Merge `[1, 4, 5]`, `[1, 3, 4]` and `[2, 6]` into one sorted list.',
        insight: 'The next output is always one of the k current heads, so keep the heads in a min-heap.',
        steps: [
          'Heap of heads: {1a, 1b, 2c}.',
          'Pop 1a, push 4a. Pop 1b, push 3b. Pop 2c, push 6c.',
          'Pop 3b, push 4b. Pop 4a, push 5a.',
          'Pop 4b (list b is empty), 5a, then 6c.',
          'Output `[1, 1, 2, 3, 4, 4, 5, 6]`: N pops and pushes on a heap of size k, O(N log k).',
        ],
      },
    ],
    variations: [
      {
        name: 'K smallest (or closest)',
        how: 'Flip to a max-heap of size k and evict the root when a smaller value arrives. K Closest Points keys the heap on squared distance.',
      },
      {
        name: 'Running median (two heaps)',
        how: 'A max-heap holds the lower half and a min-heap the upper half, rebalanced so their sizes differ by at most one; the median comes from the roots.',
      },
      {
        name: 'Scheduling by next event',
        how: 'Put `[time, item]` pairs in a min-heap and always process the earliest, as in Task Scheduler, Meeting Rooms II, and Dijkstra.',
      },
    ],
    followUps: [
      {
        question: 'Why a min-heap for the k largest, not a max-heap?',
        answer:
          'The min-heap root is the weakest of the kept k, the one to evict, so the heap stays at size k and each step is O(log k). A max-heap of everything costs O(n) memory.',
      },
      {
        question: 'Can you beat O(n log k) for a single k-th largest query?',
        answer:
          'Quickselect partitions around a pivot and recurses into one side: O(n) average, O(n²) worst case, which a random pivot makes unlikely. It needs the whole array in memory.',
      },
      {
        question: 'Can Top K Frequent beat O(n log k)?',
        answer:
          'Yes, with bucket sort by frequency: no count exceeds n, so put each value in bucket `count` of an array of n + 1 lists, then read buckets from high to low until k values are collected. That is O(n) time and space.',
      },
    ],
  },
};
