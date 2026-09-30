import type { Lesson } from './types.js';

export const BITMASK_DP_LESSON: Lesson = {
  why: 'Bit i of a number from 0 to 2ⁿ - 1 says whether item i is in a subset, so every subset gets one index. When the best way to finish depends only on which items are used, and perhaps which came last, there are 2ⁿ or 2ⁿ · n states instead of n! orders. Adding item j sets bit j and makes the number larger, so counting masks up from 0 solves every state before any state built on it.',
  examples: [
    {
      title: 'Minimum XOR Sum of Two Arrays',
      problem:
        'Pair each value of `nums1 = [1, 0, 3]` with a different value of `nums2 = [5, 3, 4]` so that the sum of the XORs of the pairs is as small as possible.',
      insight:
        'Pair nums1 in order. If mask marks the values of nums2 already used, popcount(mask) of them went to nums1[0], nums1[1] and so on, so the next index is `i = popcount(mask)` and `dp[mask]` alone is the state.',
      steps: [
        'Masks are written in binary with nums2[0] as the rightmost bit. The costs `nums1[i] ^ nums2[j]` are 4, 2, 5 for nums1[0] = 1, then 5, 3, 4 for 0 and 6, 0, 7 for 3. Start with `dp[000] = 0` and every other mask at infinity.',
        'Mask 000 pairs nums1[0] = 1 with each value: `dp[001] = 4`, `dp[010] = 2` and `dp[100] = 5`.',
        'One bit set means i = 1. From 001: `dp[011] = 4 + 3 = 7` and `dp[101] = 4 + 4 = 8`. From 010: 2 + 5 = 7 only ties 011, and `dp[110] = 2 + 4 = 6`. From 100: 5 + 5 = 10 and 5 + 3 = 8 improve neither.',
        'Two bits set means i = 2, the 3, and one value is left. `dp[111]` is the least of 7 + 7 = 14 (from 011), 8 + 0 = 8 (from 101) and 6 + 6 = 12 (from 110), so 8.',
        'Return 8: 1 with 5, 0 with 4 and 3 with 3. Giving each value its cheapest free partner pairs 1 with 3 first and ends at 12, so greedy fails.',
        '2ⁿ masks with n tries each is O(2ⁿ · n): 229,376 steps at n = 14, where trying every order of nums2 is 14!, about 87 billion.',
      ],
      visualize: { algorithmId: 'minimum-xor-sum', input: { nums1: [1, 0, 3], nums2: [5, 3, 4] } },
    },
    {
      title: 'Shortest Path Visiting All Nodes',
      problem:
        'Node 0 is joined to nodes 1, 2 and 3, and there are no other edges: `[[1,2,3],[0],[0],[0]]`. Find the length of the shortest walk that visits every node, starting and ending anywhere and reusing nodes and edges as needed.',
      insight:
        'A walk may come back to a node, so the node alone is not a state. Use (node, mask of nodes visited): run BFS over those n · 2ⁿ states from every start at once, and the first state whose mask has every bit set gives the answer.',
      steps: [
        'Start from every node at distance 0: (0, 0001), (1, 0010), (2, 0100) and (3, 1000), with node 0 as the rightmost bit. Mark each state as seen.',
        'Distance 1: node 0 steps to each leaf, giving (1, 0011), (2, 0101) and (3, 1001), and each leaf steps to 0, giving (0, 0011), (0, 0101) and (0, 1001).',
        'Distance 2: a leaf can only step back to 0, and those states are seen. From (0, 0011) the walk reaches (2, 0111) and (3, 1011), and the other two states at node 0 add four more.',
        'Distance 3: each of those six steps back to 0, giving (0, 0111), (0, 1011) and (0, 1101). Node 0 is worth visiting again because the mask has grown.',
        'Distance 4: (0, 0111) steps to (3, 1111), the first state with every bit set. Return 4, the walk 1-0-2-0-3.',
        'Each of the n · 2ⁿ states is dequeued once and scans its edges: O(2ⁿ · n²) time and O(2ⁿ · n) space, 49,152 states at n = 12.',
      ],
    },
    {
      title: 'Partition to K Equal Sum Subsets',
      problem: 'Can `[1, 2, 3, 4]` be split into k = 2 groups with equal sums?',
      insight:
        'Fill the groups one at a time. The items in mask then fill some groups exactly and part of one more, so `fill[mask]`, how full that group is, depends on mask alone. An item may join only if it fits in the current group.',
      steps: [
        'The total is 10, so each group must sum to 5. Let `fill[mask]` be how full the current group is once the items in mask are placed, or -1 if they cannot be. Start with `fill[0000] = 0`, with the 1 as the rightmost bit.',
        'One item: each fits in an empty group, so the fills of masks 0001, 0010, 0100 and 1000 are 1, 2, 3 and 4.',
        'Two items: 1 + 4 = 5 fills a group exactly, so `fill[1001] = 0` and the next group starts empty, and 2 + 3 gives `fill[0110] = 0`. But 3 + 4 = 7 overflows 5 in either order, so `fill[1100]` stays -1.',
        'From `fill[1001] = 0`, the 2 gives `fill[1011] = 2`, and then the 3 gives 2 + 3 = 5, so `fill[1111] = 0`.',
        'Every item is placed and the last group is exactly full, so the answer is true: {1, 4} and {2, 3}. Each of the 2ⁿ masks tries n items, O(2ⁿ · n), where trying each item in each group is kⁿ.',
      ],
    },
    {
      title: 'Number of Ways to Wear Different Hats to Each Other',
      problem:
        'Person 0 likes hats 3 and 4, person 1 likes hats 4 and 5, and person 2 likes hat 5. In how many ways can each wear a hat they like, with no two wearing the same hat?',
      insight:
        'There are up to 40 hats but only 10 people, so put the people in the mask and loop over the hats: `ways[mask]` counts the ways to give out the hats so far to exactly the people in mask.',
      steps: [
        'Start with `ways[000] = 1`, with person 0 as the rightmost bit: one way to give nobody a hat. Each hat then goes to nobody, or to one person who likes it and has none yet.',
        'Hat 3, liked only by person 0: `ways[001] = 1`.',
        'Hat 4, liked by persons 0 and 1. Read the counts from before this hat, so it goes to one person at most: `ways[001] = 1 + 1 = 2`, `ways[010] = 1` and `ways[011] = 1`.',
        'Hat 5, liked by persons 1 and 2, is the last hat anyone likes. Mask 111 comes from 011 by giving it to person 2 (101, via person 1, has 0 ways), so `ways[111] = 1`.',
        'The answer is 1: hat 3 to person 0, hat 4 to person 1 and hat 5 to person 2. The loop is 40 hats × 2ⁿ masks × n people, about 400,000 steps for 10 people, where a mask of the 40 hats would need 2⁴⁰ states.',
      ],
    },
  ],
  variations: [
    {
      name: 'Iterating submasks',
      how: 'When a state splits its set into one group and the rest, as in Parallel Courses II or Fair Distribution of Cookies, start at `sub = mask` and step `sub = (sub - 1) & mask` until 0. That visits every nonempty submask once, O(3ⁿ) steps over all masks, since each item is in sub, in the rest of mask, or outside it.',
    },
    {
      name: 'Row by row',
      how: 'For a grid at most about 8 wide, as in Maximum Students Taking Exam, let a mask be the seats taken in one row. `dp[row][mask]` builds on every mask of the row before that fits with it, O(rows · 4^cols), and a mask with two neighbouring bits, `mask & (mask << 1)`, is skipped at once.',
    },
    {
      name: 'Top-down with a memo',
      how: 'Write `solve(mask, last)` recursively and cache it in an array of 2ⁿ · n entries. It fills only the states it reaches, and the recursion is at most n deep, so the stack is never a problem.',
    },
  ],
  followUps: [
    {
      question: 'Why not try every order?',
      answer:
        'n! orders against 2ⁿ · n states: at n = 12, 479 million orders against 49,152 states. The DP works because the best way to finish depends only on which items are used and which came last, not on the order before.',
    },
    {
      question: 'When is bitmask DP the wrong tool?',
      answer:
        'When n is past about 20: 2ⁿ · n is about 21 million at n = 20 and doubles with each item. Look for structure instead, such as a greedy rule, a DP over sums or positions, or a matching algorithm: the Hungarian algorithm assigns n tasks to n people in O(n³).',
    },
    {
      question: 'How much memory does it need?',
      answer:
        'One number per state. At n = 20, 2ⁿ 32-bit values take about 4 MB, but with a last item 2ⁿ · n of them take about 84 MB (twice that as 64-bit floats, which is what Infinity needs; use an Int32Array with a large sentinel instead). Drop the last item when the order does not matter, and keep one layer when each step reads only the one before.',
    },
  ],
};
