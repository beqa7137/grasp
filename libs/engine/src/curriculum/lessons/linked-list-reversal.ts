import type { Lesson } from './types.js';

export const LINKED_LIST_REVERSAL_LESSON: Lesson = {
  why: 'The loop splits the list in two: prev heads the part already reversed and curr heads the part still to go. Each step saves `curr.next`, points curr back at prev and moves both one node on, so one node crosses over and nothing is lost. When curr is null, prev heads the whole list reversed, after one pass with three pointers: O(n) time, O(1) space.',
  examples: [
    {
      title: 'Reverse Linked List',
      problem: 'Reverse `1 → 2 → 3 → 4 → 5` in place and return its new head.',
      insight: 'Turn one link around per step, and save the next node first so the rest of the list is not lost.',
      steps: [
        'Start with `prev = null` and `curr` on 1. Nothing is reversed yet.',
        'Step 1: save next = 2, point 1 at null, then prev moves to 1 and curr to 2. Reversed: 1. Still to go: `2 → 3 → 4 → 5`.',
        'Step 2: save 3, point 2 at 1, prev moves to 2 and curr to 3. Reversed: `2 → 1`.',
        'Steps 3 to 5 do the same for 3, 4 and 5, each pointing back at the node before it.',
        'curr is null, so stop and return prev: `5 → 4 → 3 → 2 → 1`. Each node was visited once, with three pointers of memory.',
      ],
      visualize: { algorithmId: 'linked-list-reversal', input: { values: [1, 2, 3, 4, 5], left: 1, right: 5 } },
    },
    {
      title: 'Reverse Linked List II',
      problem: 'Reverse the nodes from position 2 to position 4 of `1 → 2 → 3 → 4 → 5`, in one pass.',
      insight: 'Stop a pointer on the node before the sublist, reverse exactly `right - left + 1` nodes, then reconnect both ends.',
      steps: [
        'A dummy node in front of 1 gives every position a node before it, even position 1. Move before from the dummy `left - 1 = 1` step: before is on 1.',
        'Run the reversal loop 3 times from 2. Now prev is on 4, heading `4 → 3 → 2`, and curr is on 5, the first node after the sublist.',
        'The ends are loose: 1 still points to 2, and 2 points to null.',
        '`before.next` is still 2, the old first node and now the last, so `before.next.next = curr` points 2 at 5.',
        '`before.next = prev` points 1 at 4. The list is `1 → 4 → 3 → 2 → 5`; return `dummy.next`.',
      ],
      visualize: { algorithmId: 'linked-list-reversal', input: { values: [1, 2, 3, 4, 5], left: 2, right: 4 } },
    },
    {
      title: 'Reverse Nodes in k-Group',
      problem: 'Reverse `1 → 2 → 3 → 4 → 5` in groups of k = 2, leaving a last group shorter than k as it is.',
      insight: 'Each group is a sublist reversal: check that k nodes remain, reverse them, and link the group to the nodes around it.',
      steps: [
        'Keep groupPrev, the node before the current group, starting on a dummy in front of 1.',
        'Count k = 2 nodes past groupPrev: 1 and 2 exist, so reverse them. The dummy now points to 2, and 1 points to 3.',
        'groupPrev moves to 1, the new tail of that group. 3 and 4 exist: reverse them, so 1 points to 4 and 3 points to 5.',
        'groupPrev moves to 3. Only 5 is left, fewer than k, so it stays where it is.',
        'Result: `2 → 1 → 4 → 3 → 5`. Each node is counted once and reversed once: O(n) time, O(1) space.',
      ],
    },
    {
      title: 'Palindrome Linked List',
      problem: 'Does `1 → 2 → 3 → 2 → 1` read the same backwards? Use O(1) extra space.',
      insight: 'Find the middle with slow and fast pointers, reverse the second half in place, then walk both halves together.',
      steps: [
        'Move slow 1 node and fast 2 while fast and `fast.next` exist: slow stops on 3, the middle.',
        'Reverse the list from slow. The second half now reads `1 → 2 → 3`, and the first half still reads 1, 2, 3, since 2 still points to the middle.',
        'Walk from the head and from the reversed half together: 1 and 1, 2 and 2, then the middle with itself. No mismatch, so it is a palindrome.',
        'For `1 → 2 → 2 → 1`, slow stops on the second 2 and the reversed half is `1 → 2`. The walk stops when that half runs out, after comparing 1 with 1 and 2 with 2.',
        'If the caller still needs the list, reverse the second half again to restore it.',
      ],
    },
  ],
  variations: [
    {
      name: 'Swap Nodes in Pairs',
      how: 'Groups of 2: point the first node at the node after the pair, the second at the first, and the node before the pair at the second, then move on to the next pair.',
    },
    {
      name: 'Recursive reversal',
      how: 'Reverse everything after the head first, then set `head.next.next = head` and `head.next = null`. The same O(n) time, but the call stack holds n frames.',
    },
    {
      name: 'Reorder List',
      how: 'To reach L0, Ln, L1, Ln-1 and so on, find the middle, reverse the second half in place, then weave the two halves together one node from each.',
    },
  ],
  followUps: [
    {
      question: 'Why save next before turning the link around?',
      answer:
        'After `curr.next = prev`, nothing points to the rest of the list any more: in a singly linked list that link was the only way there. The saved next keeps it reachable; without it, `curr = curr.next` would walk back to prev instead.',
    },
    {
      question: 'Why use a dummy node for Reverse Linked List II?',
      answer:
        'When left is 1 there is no node before the sublist, and the head itself changes. A dummy in front of the head makes that case like every other: reconnect the ends, then return `dummy.next`.',
    },
    {
      question: 'Is the recursive version just as good?',
      answer:
        "It is shorter but uses O(n) stack. A list of 2·10^5 nodes is far past Python's recursion limit (1,000 by default) and can overflow a JavaScript or Java stack, so give the iterative loop when O(1) space is asked for.",
    },
  ],
};
