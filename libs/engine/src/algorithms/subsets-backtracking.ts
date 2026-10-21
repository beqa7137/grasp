import { spansOf } from './annotate.js';
import { InputError } from './types.js';
import { rotatedChoices } from './choices.js';
import { asNumbers } from './input.js';
import { shuffle } from './random.js';
import type { AlgorithmDefinition, Frame, NodeState, Prediction, TreeLegend, TreeView } from './types.js';

type Input = { nums: number[] };

interface CallNode {
  id: string;
  label: string;
  parent: string | null;
  badge?: string;
}

const MAX_NUMS = 3;
// A leaf's badge lists its whole subset, so values stay two characters wide to keep neighboring badges apart.
const VALUE_RANGE = { minValue: -9, maxValue: 99 };
const LEGEND: TreeLegend = { active: 'running', frontier: 'on the call stack', done: 'returned' };

const bracket = (items: (number | string)[]) => `[${items.join(', ')}]`;

const CODE = [
  'function subsets(nums) {',
  '  const out = [], path = [];',
  '  function go(i) {',
  '    if (i === nums.length) { out.push([...path]); return; }',
  '    path.push(nums[i]); go(i + 1); path.pop(); // take nums[i]',
  '    go(i + 1); // skip nums[i]',
  '  }',
  '  go(0);',
  '  return out;',
  '}',
];

const SPANS = spansOf(CODE, {
  2: 'const out = [], path = []',
  4: 'out.push([...path])',
  5: 'path.push(nums[i]); go(i + 1)',
  6: 'go(i + 1)',
  8: 'go(0)',
  9: 'return out',
});
const POP_SPAN = spansOf(CODE, { 5: 'path.pop()' })[5];

export const subsetsBacktracking: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [{ key: 'nums', label: 'Numbers', kind: 'numbers', hint: `Up to ${MAX_NUMS}, all different` }],
  defaultInput: { nums: [1, 2, 3] },
  presets: [
    { label: 'One number', input: { nums: [7] } },
    { label: 'Two numbers', input: { nums: [4, 9] } },
    { label: 'Unsorted, with a negative', input: { nums: [5, -3, 0] } },
  ],

  randomInput(rand = Math.random) {
    const size = rand() < 0.75 ? 3 : 2;
    const nums = shuffle(rand, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, size);
    return { nums: nums.sort((a, b) => a - b) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const nums = asNumbers(raw['nums'], 'nums', VALUE_RANGE);
    if (nums.length > MAX_NUMS) throw new InputError(`nums can hold at most ${MAX_NUMS} numbers: each one doubles the tree`);
    if (new Set(nums).size !== nums.length) throw new InputError('nums must not repeat a value');
    return { nums };
  },

  trace({ nums }) {
    const frames: Frame[] = [];
    const n = nums.length;
    const total = 2 ** n;
    const out: number[][] = [];
    const path: number[] = [];
    const taken: (boolean | null)[] = nums.map(() => null);
    const nodes: CallNode[] = [];
    const calls: string[] = [];
    let askedUndo = false;

    // nums[0] is the highest bit, so counting a mask down from all ones follows the order go() records subsets in.
    const subsetOf = (mask: number) => nums.filter((_, k) => (mask >> (n - 1 - k)) & 1);

    const stateOf = (id: string): NodeState => (id === calls[calls.length - 1] ? 'active' : calls.includes(id) ? 'frontier' : 'done');
    const tree = (): TreeView | undefined =>
      nodes.length ? { nodes: nodes.map((node) => ({ ...node, state: stateOf(node.id) })), legend: LEGEND } : undefined;
    const indicesWhere = (value: boolean) => taken.flatMap((t, k) => (t === value ? [k] : []));

    let chapter = 'Set up';
    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}) => {
      const i = calls.length - 1;
      const inRange = i >= 0 && i < n;
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { i: i >= 0 ? i : null, 'nums[i]': inRange ? nums[i] : null, path: bracket(path), 'out.length': out.length },
        array: {
          values: [...nums],
          pointers: inRange ? { i } : {},
          active: inRange ? [i] : [],
          found: indicesWhere(true),
          settled: indicesWhere(false),
        },
        tree: tree(),
        stack: { label: 'path', items: [...path] },
        output: { label: 'out', items: out.map(bracket) },
        ...extra,
      });
    };

    const call = (label: string, run: () => void) => {
      const id = `call${nodes.length}`;
      nodes.push({ id, label, parent: calls.length ? calls[calls.length - 1] : null });
      calls.push(id);
      run();
      calls.pop();
    };

    const recordNext = (mask: number): Prediction => {
      const next = subsetOf(mask - 1);
      const j = taken.lastIndexOf(true);
      const nearby = [mask - 2, mask - 3, mask + 1].filter((m) => m >= 0).map(subsetOf);
      return {
        ...rotatedChoices(
          `\`nums = ${bracket(nums)}\`. The search just recorded ${bracket(path)}. Which subset does it record next?`,
          bracket(next),
          [path.slice(0, -1), ...nearby].map(bracket),
        ),
        explain: `Every call deeper than go(${j}) is finished, so control returns to go(${j}). It pops ${nums[j]} and skips it, and each call below takes its number first: ${bracket(next)}.`,
        skill: 'next-subset',
      };
    };

    const go = (i: number) => {
      if (i === n) {
        out.push([...path]);
        nodes[nodes.length - 1].badge = path.length ? path.join(',') : '[]';
        const mask = taken.reduce<number>((m, t) => m * 2 + (t ? 1 : 0), 0);
        const predict = mask > 0 && !taken[n - 1] ? recordNext(mask) : undefined;
        snap(
          4,
          `Every number is decided: record ${bracket(path)}, subset ${out.length} of ${total}, and return.`,
          out.length === 1
            ? `Every number is decided, so record ${bracket(path)} and return. Push a copy: path keeps changing after this.`
            : `Every number is decided: record ${bracket(path)} (subset ${out.length} of ${total}) and return.`,
          predict ? { predict } : { lens: `out.push(${bracket(path)})` },
        );
        chapter = `Subset ${out.length + 1} of ${total}`;
        return;
      }

      const x = nums[i];
      path.push(x);
      taken[i] = true;
      snap(
        5,
        `go(${i}) takes ${x} first: path is ${bracket(path)}, then go(${i + 1}) decides the rest.`,
        `go(${i}) takes ${x} first: push it, so path is ${bracket(path)}, and call go(${i + 1}).`,
        { lens: `path.push(${x}) → ${bracket(path)}` },
      );
      call(String(x), () => go(i + 1));

      if (!askedUndo) {
        askedUndo = true;
        snap(
          5,
          `go(${i}) resumes: the branch that took ${x} is fully explored.`,
          `go(${i}) resumes: the branch that took ${x} is fully explored.`,
          {
            span: POP_SPAN,
            predict: {
              ...rotatedChoices(
                `go(${i}) is back from the branch that took ${x}, and path is ${bracket(path)}. What does it do next?`,
                `Pop ${x}, then call go(${i + 1}) to skip it`,
                [`Return: go(${i}) is done`, `Call go(${i + 1}) again with ${x} still in path`],
              ),
              explain: `Choose, explore, un-choose: pop ${x} to get back to ${bracket(path.slice(0, -1))}, then explore every subset without ${x}. Returning now would miss them, and keeping ${x} would leak it into all of them.`,
              skill: 'undo',
            },
          },
        );
      }
      path.pop();
      taken[i] = null;
      snap(
        5,
        `Pop ${x} to undo the take, so path is back to ${bracket(path)}.`,
        `Back in go(${i}): pop ${x} to undo the take, so path is ${bracket(path)} again.`,
        { span: POP_SPAN, lens: `path.pop() → ${x}` },
      );

      taken[i] = false;
      snap(
        6,
        `Now skip ${x}: go(${i + 1}) runs again on path ${bracket(path)}, without ${x}.`,
        `Now skip ${x}: call go(${i + 1}) with path ${bracket(path)} unchanged (a dash in the tree).`,
      );
      call('–', () => go(i + 1));
      taken[i] = null;
    };

    snap(
      2,
      'path holds the numbers taken so far; out collects each finished subset.',
      'path holds the numbers taken so far and out collects finished subsets. Every number gets two branches: take it, or skip it.',
    );
    call('[]', () => {
      snap(
        8,
        `Call go(0) with an empty path: ${n === 1 ? 'the one number is' : n === 2 ? 'both numbers are' : `all ${n} numbers are`} still undecided.`,
        'Call go(0) with an empty path. In the tree, blue is the running call, amber calls wait for it to return, and green calls are finished.',
        {
          predict: {
            ...rotatedChoices(
              `\`nums = ${bracket(nums)}\`. go(0) starts with an empty path. Which subset is recorded first?`,
              bracket(nums),
              [[], [nums[0]], nums.slice(0, -1)].map(bracket),
            ),
            explain: `Each call takes its number before it tries skipping it, so the first path takes everything on the way down: ${bracket(nums)}. Nothing is recorded until every number is decided.`,
            skill: 'first-subset',
          },
        },
      );
      chapter = `Subset 1 of ${total}`;
      go(0);
    });

    chapter = 'Result';
    snap(
      9,
      n === 1
        ? 'Done: 2 subsets, since the one number is either in or out.'
        : `Done: ${total} subsets, since each of the ${n} numbers doubles the count.`,
      `Done: ${total} subsets from ${n} number${n === 1 ? '' : 's'}, because each number doubles the leaves. Copying each subset costs up to O(n), so the total is O(n · 2ⁿ).`,
    );
    frames[frames.length - 1].vars['result'] = bracket(out.map(bracket));
    return frames;
  },
};
