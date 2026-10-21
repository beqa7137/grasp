import { InputError } from './types.js';
import { spansOf } from './annotate.js';
import { fixedChoices, rotatedChoices } from './choices.js';
import { asNumber, asNumbers } from './input.js';
import { randInt, shuffle } from './random.js';
import { listLayout } from './layout.js';
import type { AlgorithmDefinition, Frame, GraphEdge, GraphLegend, GraphNode, GraphView, Prediction } from './types.js';

type Input = { values: number[]; pos: number };

const MAX_NODES = 8;
const VALUE_POOL = Array.from({ length: 40 }, (_, i) => i + 1);
const MEET = ['Yes: slow === fast, return true', 'No: they are still apart'];
const LEGEND: GraphLegend = { active: 'slow', frontier: 'fast', done: 'slow = fast' };

const CODE = [
  'function hasCycle(head) {',
  '  let slow = head, fast = head;',
  '  while (fast?.next) {',
  '    slow = slow.next; fast = fast.next.next; // 1 step, 2 steps',
  '    if (slow === fast) return true;',
  '  }',
  '  return false;',
  '}',
];

const SPANS = spansOf(CODE, {
  2: 'let slow = head, fast = head',
  3: 'fast?.next',
  4: 'slow = slow.next; fast = fast.next.next',
  5: 'slow === fast',
  7: 'return false',
});

export const linkedListCycle: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [
    { key: 'values', label: 'Node values', kind: 'numbers', hint: `Up to ${MAX_NODES}, all different` },
    { key: 'pos', label: 'Last node links to', kind: 'number', hint: 'An index, or -1 for no cycle' },
  ],
  defaultInput: { values: [4, 7, 1, 9, 3, 6], pos: 2 },
  presets: [
    { label: 'No cycle', input: { values: [4, 7, 1, 9, 3, 6], pos: -1 } },
    { label: 'The tail links to the head', input: { values: [4, 7, 1, 9, 3, 6], pos: 0 } },
    { label: 'A loop of two nodes', input: { values: [4, 7, 1, 9, 3, 6], pos: 4 } },
  ],

  randomInput(rand = Math.random) {
    const n = randInt(rand, 5, MAX_NODES);
    const values = shuffle(rand, VALUE_POOL).slice(0, n);
    return { values, pos: rand() < 0.25 ? -1 : randInt(rand, 0, n - 2) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const values = asNumbers(raw['values'], 'values', { minValue: -99, maxValue: 99 });
    const n = values.length;
    if (n > MAX_NODES) throw new InputError(`values can hold at most ${MAX_NODES} nodes`);
    if (new Set(values).size !== n) throw new InputError('values must be distinct: each value names one node');
    const pos = asNumber(raw['pos'], 'pos');
    const allowed = n === 1 ? '-1' : n === 2 ? '-1 or 0' : `-1 or an index from 0 to ${n - 2}`;
    if (pos === n - 1) throw new InputError(`pos ${pos} would link the last node to itself, which the drawing cannot show: use ${allowed}`);
    if (pos < -1 || pos >= n) throw new InputError(`pos must be ${allowed}`);
    return { values, pos };
  },

  trace({ values, pos }) {
    const frames: Frame[] = [];
    const n = values.length;
    const loop = pos < 0 ? 0 : n - pos;
    const points = listLayout(n, pos);
    const next = (i: number): number | null => (i + 1 < n ? i + 1 : pos >= 0 ? pos : null);
    const name = (i: number | null) => (i === null ? 'null' : `node ${values[i]}`);
    let slow = 0;
    let fast: number | null = 0;
    let steps = 0;
    let skipPlain = false;
    let explained = false;
    let chapter = 'Set up';

    // Steps fast still needs to reach slow's node once both are in the loop; a full lap when they share a node.
    const gapOf = () => (fast !== null && pos >= 0 && slow >= pos ? ((slow - fast - 1 + loop) % loop) + 1 : null);

    const pointer = (i: number): Pick<GraphNode, 'state' | 'badge'> => {
      if (i === slow && i === fast) return steps ? { state: 'done', badge: 'slow = fast' } : { state: 'active', badge: 'slow, fast' };
      if (i === slow) return { state: 'active', badge: 'slow' };
      return i === fast ? { state: 'frontier', badge: 'fast' } : { state: 'idle' };
    };

    const graph = (walked: number[]): GraphView => ({
      nodes: values.map((value, i) => ({ id: `n${i}`, label: String(value), ...points[i], ...pointer(i) })),
      edges: values.flatMap((_, i): GraphEdge[] => {
        const to = next(i);
        return to === null ? [] : [{ from: `n${i}`, to: `n${to}`, directed: true, state: walked.includes(i) ? 'active' : 'idle' }];
      }),
      legend: LEGEND,
    });

    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}, walked: number[] = []) => {
      const gap = gapOf();
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { slow: values[slow], fast: fast === null ? 'null' : values[fast], steps, gap: steps && gap !== null ? gap % loop : null },
        graph: graph(walked),
        ...extra,
      });
    };

    const whereQuestion = (from: number, ahead: number, to: number | null, slowTo: number): Prediction => {
      const path = `${name(from)} → ${name(ahead)} → ${name(to)}`;
      const distractors = [ahead, from + 2 < n ? from + 2 : null, ...(to === null ? [] : [next(to)]), slowTo, from].map(name);
      return {
        ...rotatedChoices(`fast is on ${name(from)}. Where is fast after \`fast = fast.next.next\`?`, name(to), distractors),
        explain:
          to === null
            ? `fast steps from ${name(from)} to ${name(ahead)}, the last node, whose next is null. So fast becomes null: it ran off the end.`
            : from >= n - 2
              ? `fast follows two next pointers: ${path}. The last node links back to ${name(pos)}, so fast goes around the loop instead of reaching null.${to === from ? ' In a loop of two nodes that brings it back where it started.' : ''}`
              : `fast follows two next pointers: ${path}. slow follows only one, to ${name(slowTo)}.`,
      };
    };

    const meetQuestion = (gap: number, slowTo: number, to: number): Prediction => ({
      prompt: `slow is on ${name(slow)} and fast is on ${name(fast)}, both in the loop. Do slow and fast meet on this step?`,
      ...fixedChoices(MEET, gap === 1 ? 0 : 1),
      explain:
        gap === 1
          ? `fast is 1 node behind slow. slow steps to ${name(slowTo)} and fast's two steps land there too, so \`slow === fast\`. A gap of 1 always closes to 0: fast cannot jump over slow.`
          : `fast is 2 nodes behind slow. After this step slow is on ${name(slowTo)} and fast on ${name(to)}, 1 node behind. The gap drops by exactly one per step, so they meet on the next one.`,
    });

    const apartCaption = () => {
      if (fast === null) return 'fast is null, so the two cannot meet.';
      const gap = gapOf();
      if (gap === null)
        return pos < 0 ? 'Different nodes: fast pulls further ahead.' : 'Different nodes: slow has not reached the cycle yet.';
      return `Different nodes: fast is ${gap} behind slow in the cycle and gains 1 per move.`;
    };

    const apartNote = () => {
      if (fast === null) return 'fast is null, so it cannot be on the same node as slow.';
      const gap = gapOf();
      if (gap === null) {
        return pos < 0
          ? 'Different nodes, so keep going. fast pulls one node further ahead with every step.'
          : `Different nodes, so keep going. slow is still on its way to the loop, which starts at ${name(pos)}.`;
      }
      const nodes = `${gap} node${gap === 1 ? '' : 's'}`;
      if (explained) return `Different nodes. The gap is down to ${nodes}.`;
      explained = true;
      return `Different nodes. Both are in the loop now, and fast is ${nodes} behind slow. Each step fast moves 2 and slow moves 1, so the gap shrinks by exactly one: fast cannot jump over slow, and they must meet.`;
    };

    snap(
      2,
      `Both pointers start at the head, ${name(0)}.`,
      `Both pointers start at the head, ${name(0)}. Each step slow follows one next pointer and fast follows two. If the list ends, fast finds the end first; if it loops, fast laps around and catches slow from behind.`,
    );

    while (fast !== null && next(fast) !== null) {
      const from = fast;
      const ahead = next(from)!;
      const to = next(ahead);
      const slowTo = next(slow)!;
      chapter = `Move ${steps + 1}`;
      snap(
        3,
        'fast and the node after it exist, so fast can take two steps.',
        `fast is on ${name(from)} and \`fast.next\` is ${name(ahead)}. Both exist, so fast can take two steps.`,
        {
          lens: `fast.next → ${name(ahead)}`,
        },
      );

      const gap = gapOf();
      const meets = gap !== null && gap <= 2 && slow !== from;
      const plain = !meets && from < n - 2;
      const predict = meets ? meetQuestion(gap, slowTo, to!) : plain && skipPlain ? null : whereQuestion(from, ahead, to, slowTo);
      skipPlain = plain && !skipPlain;
      if (predict) snap(4, 'Move slow one node and fast two.', 'Move slow one node and fast two.', { predict });

      const walked = [slow, from, ahead];
      slow = slowTo;
      fast = to;
      steps++;
      snap(
        4,
        `slow moves to ${name(slow)}, and fast to ${name(fast)}.`,
        `slow moves to ${name(slow)}, and fast moves ${name(from)} → ${name(ahead)} → ${name(fast)}.`,
        { lens: `slow → ${name(slow)}, fast → ${name(fast)}` },
        walked,
      );

      if (slow === fast) {
        snap(
          5,
          `slow and fast meet on ${name(slow)}: the list has a cycle, so return true.`,
          `\`slow === fast\`: both are on ${name(slow)}, so the list loops. Return true. Inside the loop fast gains one node per step, so it catches slow within one lap: O(n) time, O(1) memory.${slow === pos ? '' : ` They met at ${name(slow)}, not at the loop's start, ${name(pos)}: finding the start needs a second phase.`}`,
          { lens: `${name(slow)} === ${name(fast)} → true` },
        );
        frames[frames.length - 1].vars['result'] = true;
        return frames;
      }
      snap(5, apartCaption(), apartNote(), { lens: `${name(slow)} === ${name(fast)} → false` });
    }

    chapter = 'Reach the end';
    snap(
      3,
      fast === null
        ? 'fast is null: it ran off the end, so the while loop ends.'
        : 'fast is on the last node, so it cannot take two steps: the while loop ends.',
      fast === null
        ? 'fast is null: it ran off the end, so `fast?.next` is undefined and the loop stops.'
        : `fast is on ${name(fast)}, the last node, and \`fast.next\` is null. Two more steps would run off the end, so the loop stops.`,
      { lens: fast === null ? 'fast → null' : 'fast.next → null' },
    );
    snap(
      7,
      'A list with an end has no cycle, so return false.',
      `fast reached the end, and a list with an end cannot loop. Return false after ${steps} step${steps === 1 ? '' : 's'}: O(n) time, and only two pointers, so O(1) memory.`,
    );
    frames[frames.length - 1].vars['result'] = false;
    return frames;
  },
};
