import { randInt } from '../../algorithms/random.js';
import { ListNode } from '../list.js';
import type { CodingProblemDefinition } from '../types.js';
import { ints } from './inputs.js';

const LIMIT = 100_000;
const LONG_LIST = 'The list can hold 2·10^5 nodes, deep enough to overflow the call stack of a recursive solution, so use a loop.';

/** A performance-sized list: every approach that walks back from the head per node is quadratic on it. */
const longList = (rand: () => number, lo = -LIMIT, hi = LIMIT) => ints(rand, randInt(rand, 180_000, 200_000), lo, hi);

/** Reverses count nodes from head, and returns the new first node and the node after them. */
function reverseRun(head: ListNode | null, count: number): [ListNode | null, ListNode | null] {
  let prev: ListNode | null = null;
  let curr = head;
  for (let i = 0; i < count && curr; i++) {
    const next: ListNode | null = curr.next;
    curr.next = prev;
    prev = curr;
    curr = next;
  }
  return [prev, curr];
}

export const reverseList: CodingProblemDefinition = {
  statement: [
    'Given the `head` of a singly linked list, reverse the list in place and return its new head, so that reading from the new head gives the values in the opposite order.',
    `Change the \`next\` links rather than the values, in one pass with O(1) extra space. ${LONG_LIST}`,
  ],
  constraints: ['0 ≤ number of nodes ≤ 2·10^5', '-10^5 ≤ Node.val ≤ 10^5'],
  entry: 'reverseList',
  params: [{ name: 'head', type: 'list' }],
  returns: 'list',
  compare: 'exact',
  examples: [
    { args: [[1, 2, 3, 4, 5]], explanation: 'Every link turns around, so the old last node, 5, is the new head' },
    { args: [[1, 2]], explanation: '2 now points to 1, and 1 points to nothing' },
    { args: [[]], explanation: 'An empty list is its own reverse' },
  ],
  edgeCases: [[[7]], [[1, 1]], [[3, -3, 3]], [[-LIMIT, LIMIT]], [[5, 4, 3, 2, 1]], [[0, 0, 1]]],
  randomCase: (rand) => [ints(rand, randInt(rand, 0, 12), -9, 9)],
  performanceCase: (rand) => [longList(rand)],
  solve(head: ListNode | null) {
    return reverseRun(head, Infinity)[0];
  },
  approach:
    'Walk the list once with three pointers: save `curr.next` in `next`, point `curr.next` back at `prev`, then move `prev` and `curr` one node on. When `curr` runs off the end, `prev` is on the old last node, the new head.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const reverseBetween: CodingProblemDefinition = {
  statement: [
    'Given the `head` of a singly linked list and two positions `left` and `right`, counted from 1 at the head, reverse the nodes from position `left` to position `right` and return the head of the list.',
    `The nodes before and after that stretch keep their order. Do it in one pass with O(1) extra space. ${LONG_LIST}`,
  ],
  constraints: ['1 ≤ n ≤ 2·10^5, where n is the number of nodes', '-10^5 ≤ Node.val ≤ 10^5', '1 ≤ left ≤ right ≤ n'],
  entry: 'reverseBetween',
  params: [
    { name: 'head', type: 'list' },
    { name: 'left', type: 'int' },
    { name: 'right', type: 'int' },
  ],
  returns: 'list',
  compare: 'exact',
  examples: [
    { args: [[1, 2, 3, 4, 5], 2, 4], explanation: 'Positions 2 to 4 hold 2, 3 and 4, which come back as 4, 3 and 2 between 1 and 5' },
    { args: [[5], 1, 1], explanation: 'Reversing a single node changes nothing' },
    { args: [[3, 5], 1, 2], explanation: 'left is 1, so the head itself changes' },
  ],
  edgeCases: [
    [[7], 1, 1],
    [[1, 2], 1, 1],
    [[1, 2], 2, 2],
    [[1, 2], 1, 2],
    [[1, 2, 3], 1, 3],
    [[1, 2, 3], 2, 3],
    [[1, 2, 3], 1, 2],
    [[4, 4, 4, 5], 2, 4],
    [[9, 8, 7, 6, 5, 4], 3, 3],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 12);
    const left = randInt(rand, 1, n);
    return [ints(rand, n, -9, 9), left, randInt(rand, left, n)];
  },
  // The stretch spans nearly the whole list, so swapping values from its two ends, walking from the head to each, is quadratic.
  performanceCase: (rand) => {
    const values = longList(rand);
    const n = values.length;
    const edge = Math.floor(n / 20);
    return [values, randInt(rand, 1, edge), randInt(rand, n - edge, n)];
  },
  solve(head: ListNode | null, left: number, right: number) {
    const dummy = new ListNode(0, head);
    let before = dummy;
    for (let i = 1; i < left; i++) before = before.next!;
    const first = before.next!;
    const [reversed, after] = reverseRun(first, right - left + 1);
    first.next = after;
    before.next = reversed;
    return dummy.next;
  },
  approach:
    "Put a dummy node in front of the head and walk `before` to position `left - 1`. Reverse the next `right - left + 1` nodes with `prev`, `curr` and `next`, then link the old first node of the stretch to `curr`, the node after the stretch, and `before` to `prev`, the stretch's new first node. The dummy makes `left = 1` like any other case.",
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const reverseKGroup: CodingProblemDefinition = {
  statement: [
    'Given the `head` of a singly linked list and a positive integer `k`, reverse the nodes in consecutive groups of `k` and return the new head. If the last group has fewer than `k` nodes, it keeps its original order.',
    `Change only the links, not the values, and aim for O(1) extra space. ${LONG_LIST}`,
  ],
  constraints: ['1 ≤ k ≤ n ≤ 2·10^5, where n is the number of nodes', '-10^5 ≤ Node.val ≤ 10^5'],
  entry: 'reverseKGroup',
  params: [
    { name: 'head', type: 'list' },
    { name: 'k', type: 'int' },
  ],
  returns: 'list',
  compare: 'exact',
  examples: [
    { args: [[1, 2, 3, 4, 5], 2], explanation: '1, 2 and 3, 4 are reversed; 5 is a group of 1, shorter than k, so it stays' },
    { args: [[1, 2, 3, 4, 5], 3], explanation: '1, 2, 3 is reversed; 4, 5 has only 2 nodes and keeps its order' },
  ],
  edgeCases: [
    [[1], 1],
    [[1, 2], 1],
    [[1, 2], 2],
    [[1, 2, 3], 3],
    [[1, 2, 3], 2],
    [[1, 2, 3, 4], 2],
    [[1, 2, 3, 4, 5, 6, 7], 3],
    [[5, 5, 6, 6], 4],
    [[1, 2, 3, 4, 5], 5],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 12);
    return [ints(rand, n, -9, 9), randInt(rand, 1, n)];
  },
  // Large groups: reversing each by swapping values from its two ends, walking from the group's start to each, costs n · k / 2.
  performanceCase: (rand) => [longList(rand), randInt(rand, 64_000, 90_000)],
  solve(head: ListNode | null, k: number) {
    const dummy = new ListNode(0, head);
    let groupPrev = dummy;
    for (;;) {
      let last: ListNode | null = groupPrev;
      for (let i = 0; i < k && last; i++) last = last.next;
      if (!last) return dummy.next;
      const first = groupPrev.next!;
      const [reversed, after] = reverseRun(first, k);
      first.next = after;
      groupPrev.next = reversed;
      groupPrev = first;
    }
  },
  approach:
    'Keep `groupPrev`, the node before the current group, starting on a dummy. Walk `k` nodes ahead; if the list ends first, stop. Otherwise reverse those `k` nodes in place, link `groupPrev` to their new first node and their old first node, now last, to the node after the group, and move `groupPrev` to that old first node.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const swapPairs: CodingProblemDefinition = {
  statement: [
    'Given the `head` of a singly linked list, swap every two adjacent nodes and return the new head: the first and second nodes trade places, then the third and fourth, and so on. A last node without a partner stays where it is.',
    `Swap the nodes by changing links, not by swapping their values, and use O(1) extra space. ${LONG_LIST}`,
  ],
  constraints: ['0 ≤ number of nodes ≤ 2·10^5', '-10^5 ≤ Node.val ≤ 10^5'],
  entry: 'swapPairs',
  params: [{ name: 'head', type: 'list' }],
  returns: 'list',
  compare: 'exact',
  examples: [
    { args: [[1, 2, 3, 4]], explanation: '1 and 2 trade places, then 3 and 4' },
    { args: [[1, 2, 3]], explanation: '3 has no partner, so it stays last' },
    { args: [[]], explanation: 'There is nothing to swap' },
  ],
  edgeCases: [[[1]], [[1, 2]], [[1, 1, 2]], [[1, 2, 3, 4, 5]], [[-1, 0, -1, 0]], [[6, 5, 4, 3, 2, 1]]],
  randomCase: (rand) => [ints(rand, randInt(rand, 0, 12), -9, 9)],
  performanceCase: (rand) => [longList(rand)],
  solve(head: ListNode | null) {
    const dummy = new ListNode(0, head);
    let prev = dummy;
    while (prev.next && prev.next.next) {
      const first = prev.next;
      const second = prev.next.next;
      first.next = second.next;
      second.next = first;
      prev.next = second;
      prev = first;
    }
    return dummy.next;
  },
  approach:
    'Keep `prev`, the node before the next pair, starting on a dummy. For the pair `first` and `second`, point `first.next` at the node after the pair, `second.next` at `first` and `prev.next` at `second`, then move `prev` to `first`, now the second node of the pair.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const isPalindromeList: CodingProblemDefinition = {
  statement: [
    'Given the `head` of a singly linked list of digits, return `true` if its values read the same from the head to the end as from the end back to the head, and `false` otherwise.',
    `Aim for O(n) time and O(1) extra space. ${LONG_LIST}`,
  ],
  constraints: ['1 ≤ number of nodes ≤ 2·10^5', '0 ≤ Node.val ≤ 9'],
  entry: 'isPalindrome',
  params: [{ name: 'head', type: 'list' }],
  returns: 'bool',
  compare: 'exact',
  examples: [
    { args: [[1, 2, 2, 1]], explanation: 'Read backwards it is 1, 2, 2, 1 again' },
    { args: [[1, 2]], explanation: 'Backwards it reads 2, 1' },
    { args: [[1, 2, 3, 2, 1]], explanation: 'The middle 3 is compared with itself' },
  ],
  edgeCases: [[[7]], [[1, 1]], [[1, 2, 1]], [[1, 2, 3, 1]], [[1, 0, 0]], [[2, 2, 2, 3]], [[3, 1, 2, 1, 3]], [[1, 2, 1, 2]]],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 12);
    if (rand() < 0.5) return [ints(rand, n, 0, 2)];
    const half = ints(rand, Math.floor(n / 2), 0, 9);
    const values = [...half, ...ints(rand, n % 2, 0, 9), ...[...half].reverse()];
    if (rand() < 0.3 && n > 1) values[randInt(rand, 0, n - 1)] = randInt(rand, 0, 9);
    return [values];
  },
  // A palindrome, or one broken only at the middle pair, so comparing each pair by walking from the head finds no early mismatch.
  performanceCase: (rand) => {
    const half = ints(rand, randInt(rand, 90_000, 100_000), 0, 9);
    const values = [...half, ...ints(rand, randInt(rand, 0, 1), 0, 9), ...[...half].reverse()];
    if (rand() < 0.5) values[half.length - 1] = (values[half.length - 1] + 1) % 10;
    return [values];
  },
  solve(head: ListNode) {
    let slow: ListNode | null = head;
    let fast: ListNode | null = head;
    while (fast && fast.next) {
      slow = slow!.next;
      fast = fast.next.next;
    }
    let right = reverseRun(slow, Infinity)[0];
    for (let left: ListNode | null = head; right; left = left!.next, right = right.next) if (left!.val !== right.val) return false;
    return true;
  },
  approach:
    'Move `slow` one node and `fast` two until `fast` runs out, so `slow` stops at the middle. Reverse the list from `slow` in place, then walk from the head and from the reversed half together, comparing values until the reversed half ends. Reverse it back if the list must be left as it was.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};
