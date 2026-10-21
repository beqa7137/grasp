import { spansOf } from './annotate.js';
import { fixedChoices } from './choices.js';
import { InputError } from './types.js';
import { asNumber, asNumbers } from './input.js';
import { randInt } from './random.js';
import type { AlgorithmDefinition, Frame, TreeView } from './types.js';

type Input = { nums: number[]; k: number };

const ENTER = ['Yes: replace the root and sift down', 'No: skip it'];
const SIFT = ['Swap with the smaller child', 'Stop: heap order holds'];

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

function treeOf(heap: number[], active: number | null, settled = false): TreeView {
  return {
    nodes: heap.map((value, i) => ({
      id: `h${i}`,
      label: String(value),
      parent: i === 0 ? null : `h${Math.floor((i - 1) / 2)}`,
      state: i === active ? 'active' : settled && i === 0 ? 'done' : 'idle',
      badge: i === 0 ? 'min' : undefined,
    })),
  };
}

const CODE = [
  'function kthLargest(nums, k) {',
  '  const heap = []; // min-heap of the k largest so far',
  '  for (const x of nums) {',
  '    if (heap.length < k) push(heap, x); // then sift up',
  '    else if (x > heap[0]) {',
  '      heap[0] = x;',
  '      siftDown(heap, 0);',
  '    }',
  '  }',
  '  return heap[0];',
  '}',
];

const SPANS = spansOf(CODE, {
  2: 'const heap = []',
  4: 'push(heap, x)',
  5: 'x > heap[0]',
  6: 'heap[0] = x',
  7: 'siftDown(heap, 0)',
  10: 'return heap[0]',
});

export const kthLargest: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [
    { key: 'nums', label: 'Numbers', kind: 'numbers' },
    { key: 'k', label: 'k', kind: 'number', hint: 'Between 1 and the number of values' },
  ],
  defaultInput: { nums: [7, 2, 9, 4, 11, 5, 8, 3, 10], k: 3 },
  presets: [
    { label: 'k = 1: the largest', input: { nums: [5, 1, 9, 3, 7], k: 1 } },
    { label: 'Rising values: every one gets in', input: { nums: [1, 2, 3, 4, 5, 6], k: 2 } },
    { label: 'Repeated values', input: { nums: [4, 4, 4, 2, 6, 4], k: 2 } },
  ],

  randomInput(rand = Math.random) {
    const nums = Array.from({ length: randInt(rand, 7, 11) }, () => randInt(rand, 1, 40));
    return { nums, k: randInt(rand, 2, Math.min(4, nums.length)) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const nums = asNumbers(raw['nums'], 'nums');
    const k = asNumber(raw['k'], 'k');
    if (k < 1 || k > nums.length) throw new InputError(`k must be between 1 and ${nums.length}`);
    return { nums, k };
  },

  trace({ nums, k }) {
    const frames: Frame[] = [];
    const heap: number[] = [];
    let i = -1;
    let chapter = 'Set up';
    const topK = k === 1 ? 'the largest' : `among the ${k} largest`;

    const snap = (line: number, caption: string, note: string, active: number | null = null, extra: Partial<Frame> = {}) => {
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { x: i >= 0 && i < nums.length ? nums[i] : null, k, size: heap.length, root: heap.length ? heap[0] : null },
        array: { values: [...nums], pointers: i >= 0 && i < nums.length ? { i } : {}, active: i >= 0 && i < nums.length ? [i] : [] },
        tree: treeOf(heap, active),
        output: { label: 'heap array', items: [...heap] },
        ...extra,
      });
    };

    const swap = (a: number, b: number) => ([heap[a], heap[b]] = [heap[b], heap[a]]);

    snap(
      2,
      k === 1
        ? 'The heap will keep the largest value; its root is that value.'
        : `The heap will keep the ${k} largest values; its root is the smallest.`,
      k === 1
        ? 'The heap will hold the largest value seen so far, at its root.'
        : `The heap will hold the ${k} largest values seen so far. Its root is the smallest of them.`,
    );

    for (i = 0; i < nums.length; i++) {
      const x = nums[i];
      if (heap.length < k) {
        chapter = 'Fill the heap';
        heap.push(x);
        let c = heap.length - 1;
        snap(4, `The heap has room: add ${x} at the bottom.`, `Heap not full yet: add ${x} at the bottom.`, c, {
          lens: `${c} < ${k} → push ${x}`,
        });
        while (c > 0) {
          const p = Math.floor((c - 1) / 2);
          if (heap[p] <= heap[c]) break;
          swap(p, c);
          snap(
            4,
            `${heap[p]} is smaller than its parent, ${heap[c]}: sift ${heap[p]} up.`,
            `${heap[p]} is smaller than its parent ${heap[c]}: swap them up.`,
            p,
            {
              lens: `${heap[p]} < ${heap[c]} → swap`,
            },
          );
          c = p;
        }
        continue;
      }

      chapter = `Offer nums[${i}] = ${x}`;
      const enters = x > heap[0];
      snap(
        5,
        `The heap is full: compare ${x} with the root, ${heap[0]}.`,
        `Heap is full. Compare ${x} with the root ${heap[0]}, the smallest of the top ${k}.`,
        0,
        {
          predict: {
            prompt:
              k === 1
                ? `The heap keeps the largest so far, ${heap[0]}. Does ${x} get in?`
                : `The heap keeps the ${k} largest so far; its smallest is ${heap[0]}. Does ${x} get in?`,
            ...fixedChoices(ENTER, enters ? 0 : 1),
            explain: enters
              ? `${x} > ${heap[0]}, so ${heap[0]} is no longer ${topK}. Replace the root and restore heap order.`
              : `${x} ≤ ${heap[0]}. It cannot be ${topK}, so the heap is unchanged.`,
            skill: 'enter',
          },
        },
      );
      if (!enters) continue;

      const old = heap[0];
      heap[0] = x;
      snap(6, `${x} replaces the root, ${old}.`, `Replace the root with ${x}.`, 0, { lens: `heap[0] = ${x}` });
      let p = 0;
      let asked = false;
      for (;;) {
        const l = 2 * p + 1;
        const r = l + 1;
        if (l >= heap.length) break;
        const child = r < heap.length && heap[r] < heap[l] ? r : l;
        const swapDown = heap[child] < heap[p];
        snap(
          7,
          `Sift down: ${heap[p]} against its smaller child, ${heap[child]}.`,
          `Sift down: ${heap[p]} against its smaller child ${heap[child]}.`,
          p,
          asked
            ? { lens: `${heap[child]} < ${heap[p]} → ${swapDown ? 'swap' : 'stop'}` }
            : {
                predict: {
                  prompt: `${heap[p]} sits above children ${[l, r]
                    .filter((c) => c < heap.length)
                    .map((c) => heap[c])
                    .join(' and ')}. What happens next?`,
                  ...fixedChoices(SIFT, swapDown ? 0 : 1),
                  explain: swapDown
                    ? `A parent must not be larger than its children. Swap with the smaller child ${heap[child]} so the new parent is the minimum of the three.`
                    : `${heap[p]} is not larger than either child, so the heap is valid again.`,
                  skill: 'sift',
                },
              },
        );
        asked = true;
        if (!swapDown) break;
        swap(p, child);
        snap(7, `Swap: ${heap[p]} moves up and ${heap[child]} moves down.`, `Swap ${heap[child]} down and ${heap[p]} up.`, child);
        p = child;
      }
    }

    i = nums.length;
    chapter = 'Result';
    snap(
      10,
      `The root, ${heap[0]}, is the ${k === 1 ? '' : `${ordinal(k)} `}largest value.`,
      `Done. The root ${heap[0]} is the ${k === 1 ? '' : `${ordinal(k)} `}largest value. Each of the n values cost at most one O(log k) sift.`,
      0,
    );
    frames[frames.length - 1].tree = treeOf(heap, null, true);
    frames[frames.length - 1].vars['result'] = heap[0];
    return frames;
  },
};
