import { InputError } from './types.js';
import { spansOf } from './annotate.js';
import { rotatedChoices } from './choices.js';
import { asNumber, asNumbers } from './input.js';
import { randInt, shuffle } from './random.js';
import { dipLayout } from './layout.js';
import type { AlgorithmDefinition, Frame, GraphEdge, GraphLegend, GraphNode, GraphView, Prediction, Scalar } from './types.js';

type Input = { values: number[]; left: number; right: number };
type Node = number | null;

const MAX_NODES = 5;
const VALUE_POOL = Array.from({ length: 40 }, (_, i) => i + 1);
const LEGEND: GraphLegend = { active: 'curr', frontier: 'next', done: 'reversed' };
const DUMMY = 0;
const POINTERS = ['dummy', 'before', 'prev', 'curr', 'next'] as const;

type Pointers = Partial<Record<(typeof POINTERS)[number], Node>>;

const CODE = [
  'function reverseBetween(head, left, right) {',
  '  const dummy = new ListNode(0, head);',
  '  let before = dummy;',
  '  for (let i = 1; i < left; i++) before = before.next;',
  '  let prev = null, curr = before.next;',
  '  for (let i = left; i <= right; i++) {',
  '    const next = curr.next; // save the rest',
  '    curr.next = prev; // turn the link around',
  '    prev = curr;',
  '    curr = next;',
  '  }',
  '  before.next.next = curr; // old first → rest',
  '  before.next = prev; // before → new first',
  '  return dummy.next;',
  '}',
];

const SPANS = spansOf(CODE, {
  2: 'const dummy = new ListNode(0, head)',
  3: 'let before = dummy',
  4: 'before = before.next',
  5: 'let prev = null, curr = before.next',
  6: 'i <= right',
  7: 'const next = curr.next',
  8: 'curr.next = prev',
  9: 'prev = curr',
  10: 'curr = next',
  12: 'before.next.next = curr',
  13: 'before.next = prev',
  14: 'return dummy.next',
});

export const linkedListReversal: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [
    { key: 'values', label: 'Node values', kind: 'numbers', hint: `Up to ${MAX_NODES}, all different, 1 to 99` },
    { key: 'left', label: 'left', kind: 'number', hint: 'Position of the first node to reverse, from 1' },
    { key: 'right', label: 'right', kind: 'number', hint: 'Position of the last node to reverse' },
  ],
  defaultInput: { values: [7, 2, 9, 4, 6], left: 2, right: 4 },
  presets: [
    { label: 'Reverse the whole list', input: { values: [7, 2, 9, 4, 6], left: 1, right: 5 } },
    { label: 'Reverse up to the tail', input: { values: [7, 2, 9, 4, 6], left: 3, right: 5 } },
    { label: 'Two nodes swap', input: { values: [7, 2, 9, 4, 6], left: 2, right: 3 } },
  ],

  randomInput(rand = Math.random) {
    const n = randInt(rand, 2, MAX_NODES);
    const values = shuffle(rand, VALUE_POOL).slice(0, n);
    if (rand() < 0.3) return { values, left: 1, right: n };
    const left = randInt(rand, 1, n - 1);
    return { values, left, right: randInt(rand, left + 1, n) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const values = asNumbers(raw['values'], 'values', { minValue: 1, maxValue: 99 });
    const n = values.length;
    if (n > MAX_NODES) throw new InputError(`values can hold at most ${MAX_NODES} nodes`);
    if (new Set(values).size !== n) throw new InputError('values must be distinct: each value names one node');
    const left = asNumber(raw['left'], 'left');
    if (left < 1 || left > n) throw new InputError(n === 1 ? 'left must be 1' : `left must be from 1 to ${n}`);
    const right = asNumber(raw['right'], 'right');
    if (right < left || right > n) throw new InputError(left === n ? `right must be ${n}` : `right must be from ${left} to ${n}`);
    return { values, left, right };
  },

  trace({ values, left, right }) {
    const frames: Frame[] = [];
    const n = values.length;
    const points = dipLayout(n + 1, left, right);
    const link: Node[] = Array.from({ length: n + 1 }, (_, i) => (i < n ? i + 1 : null));
    const at: Pointers = { dummy: DUMMY };
    const reversed = new Set<number>();
    let loop: number | null = null;
    let chapter = 'Find the node before';

    const name = (i: Node) => (i === null ? 'null' : i === DUMMY ? 'the dummy' : `node ${values[i - 1]}`);
    const capitalName = (i: Node) => name(i).replace(/^./, (c) => c.toUpperCase());
    const shown = (i: Node | undefined): Scalar => (i === undefined ? null : i === null ? 'null' : i === DUMMY ? 'dummy' : values[i - 1]);
    const chain = (from: Node) => {
      const labels: number[] = [];
      for (let i = from; i !== null; i = link[i]) labels.push(values[i - 1]);
      return labels.join(' → ');
    };

    const style = (i: number): Pick<GraphNode, 'state' | 'badge'> => {
      const badge = POINTERS.filter((p) => at[p] === i).join(', ') || undefined;
      const state = i === at.curr ? 'active' : i === at.next ? 'frontier' : reversed.has(i) ? 'done' : 'idle';
      return { state, ...(badge ? { badge } : {}) };
    };

    const graph = (changed: number | null): GraphView => ({
      nodes: points.map((point, i) => ({ id: `n${i}`, label: i === DUMMY ? '0' : String(values[i - 1]), ...point, ...style(i) })),
      edges: link.flatMap((to, i): GraphEdge[] =>
        to === null ? [] : [{ from: `n${i}`, to: `n${to}`, directed: true, state: i === changed ? 'active' : 'idle' }],
      ),
      legend: LEGEND,
    });

    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}, changed: number | null = null) => {
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: {
          left,
          right,
          i: loop,
          before: shown(at.before),
          prev: shown(at.prev),
          curr: shown(at.curr),
          next: shown(at.next),
        },
        graph: graph(changed),
        ...extra,
      });
    };

    // prev is not named in the prompt, and a node pointing to itself is offered only when the list has too few other nodes.
    const flipQuestion = (curr: number, prev: Node, next: Node): Prediction => {
      const others = [
        name(next),
        name(at.before!),
        'null',
        ...(next === null ? [] : [name(link[next])]),
        ...(prev === null ? [] : [name(link[prev])]),
        ...points.flatMap((_, i) => (i === curr ? [] : [name(i)])),
      ];
      const pool = new Set([name(prev), ...others]).size < 3 ? [...others, name(curr)] : others;
      return {
        ...rotatedChoices(`curr is on ${name(curr)}. After \`curr.next = prev\`, what does ${name(curr)} point to?`, name(prev), pool),
        explain:
          (prev === null
            ? `prev is null on the first step, so ${name(curr)} now ends the reversed part and points to null.`
            : `prev is on ${name(prev)}, the head of the reversed part, so the link turns around to it.`) +
          (next === null ? '' : ` The old link to ${name(next)} is gone, but next still holds it.`),
        skill: 'flip',
      };
    };

    const stepQuestion = (curr: number, next: Node): Prediction => {
      const back = link[curr];
      return {
        ...rotatedChoices(`${capitalName(curr)} now points back to ${name(back)}. Where does \`curr = next\` move curr?`, name(next), [
          name(back),
          name(curr),
          next === null ? name(at.before!) : name(link[next]),
        ]),
        explain: `next saved ${name(next)} before the link turned around, so curr moves forward to it. \`curr = curr.next\` would follow the turned link back to ${name(back)}.`,
        skill: 'advance',
      };
    };

    const linkChoice = (from: Node, to: Node) => `${name(from)} → ${name(to)}`;

    snap(
      2,
      `A dummy node goes in front of the head, ${name(1)}.`,
      `A dummy node goes in front of ${name(1)}, so every position has a node before it, even position 1. The head may change, and the dummy still leads to it.`,
    );
    at.before = DUMMY;
    snap(
      3,
      left === 1
        ? 'before starts on the dummy and stays there, since left is 1.'
        : `before starts on the dummy and walks ${left - 1} step${left === 2 ? '' : 's'}.`,
      left === 1
        ? 'before starts on the dummy. left is 1, so it stays there: the part to reverse starts at the head.'
        : `before starts on the dummy and walks ${left - 1} step${left === 2 ? '' : 's'}, to the node just before position ${left}.`,
    );
    for (let i = 1; i < left; i++) {
      loop = i;
      at.before = link[at.before!];
      snap(
        4,
        `before moves to ${name(at.before)}, position ${i}.`,
        i === left - 1
          ? `before moves to ${name(at.before)}, position ${i}: the node just before the part to reverse.`
          : `before moves to ${name(at.before)}, position ${i}.`,
      );
    }
    loop = null;
    const before = at.before!;
    const first = left;
    at.prev = null;
    at.curr = link[before];
    snap(
      5,
      `prev starts as null, and curr on ${name(at.curr)}, the first node to reverse.`,
      `prev starts as null: the reversed part is empty. curr is on ${name(at.curr)}, the first node to reverse.`,
    );

    for (let i = left; i <= right; i++) {
      const k = i - left;
      loop = i;
      const curr: number = at.curr!;
      const prev: Node = at.prev!;
      const next: Node = link[curr];
      at.next = next;
      chapter = `Reverse ${name(curr)}`;
      snap(
        7,
        next === null ? `next saves null: ${name(curr)} is the last node.` : `next saves ${name(next)} before the link turns around.`,
        next === null
          ? `next saves null: ${name(curr)} is the last node of the list.`
          : `next saves ${name(next)}. Once ${name(curr)} points back, next is the only way to reach the rest of the list.`,
        { lens: `next = ${name(next)}` },
      );
      if (k % 2 === 0) {
        const ask =
          prev === null
            ? "Turn curr's link around to point at prev, where the setup left it."
            : "Turn curr's link around to point at prev.";
        snap(8, ask, 'Turn the link of curr around, to point at prev.', {
          predict: flipQuestion(curr, prev, next),
        });
      }
      link[curr] = prev;
      reversed.add(curr);
      snap(
        8,
        prev === null ? `${capitalName(curr)} now points to null.` : `${capitalName(curr)} now points back to ${name(prev)}.`,
        prev === null
          ? `${capitalName(curr)} now points to null. It is the last node of the reversed part until the end links it to the rest.`
          : `${capitalName(curr)} now points back to ${name(prev)}, so the reversed part reads ${chain(curr)}.`,
        { lens: `curr.next = ${name(prev)}` },
        curr,
      );
      at.prev = curr;
      snap(
        9,
        `prev moves to ${name(curr)}, the head of the reversed part.`,
        `prev moves to ${name(curr)}, the head of the reversed part.`,
        {
          lens: `prev = ${name(curr)}`,
        },
      );
      if (k % 2 === 1)
        snap(10, 'Move curr on to the rest of the list.', 'Move curr on to the rest of the list.', { predict: stepQuestion(curr, next) });
      at.curr = next;
      snap(
        10,
        next === null ? 'curr moves to null: no node comes after the part.' : `curr moves to ${name(next)}, which next saved.`,
        next === null ? 'curr moves to null: no node comes after the part to reverse.' : `curr moves to ${name(next)}, which next saved.`,
        { lens: `curr = ${name(next)}` },
      );
      at.next = undefined;
    }

    loop = right + 1;
    const prev = at.prev!;
    const after = at.curr!;
    chapter = 'Reconnect';
    snap(
      6,
      'i is past right, so the loop stops. Both ends of the part are still loose.',
      `i is ${right + 1}, past right, so the loop stops. The reversed part reads ${chain(prev)}, but its ends are loose: ${name(before)} still points to ${name(first)}, and ${name(first)} points to null.`,
      { lens: `${right + 1} <= ${right} → false` },
    );
    loop = null;

    snap(
      12,
      'Link the old first node of the part to the rest of the list.',
      'Link the old first node of the part to the rest of the list.',
      {
        predict: {
          ...rotatedChoices(
            `before is on ${name(before)}, prev on ${name(prev)} and curr ${after === null ? 'is null' : `on ${name(after)}`}. Which link does \`before.next.next = curr\` set?`,
            linkChoice(first, after),
            [
              linkChoice(before, after),
              linkChoice(prev, after),
              ...(first === prev ? [] : [linkChoice(first, prev)]),
              linkChoice(first, null),
              linkChoice(first, before),
            ],
          ),
          explain: `\`before.next\` is still ${name(first)}, the old first node of the part and now its last. Pointing it at ${name(after)} joins the reversed part to the rest.`,
          skill: 'reconnect-tail',
        },
      },
    );
    link[first] = after;
    snap(
      12,
      `${capitalName(first)} now points to ${name(after)}.`,
      `${capitalName(first)} now points to ${name(after)}. ${after === null ? 'Nothing comes after the reversed part, so it ends the list.' : 'The reversed part runs into the rest of the list.'}`,
      { lens: `before.next.next = ${name(after)}` },
      first,
    );

    snap(13, 'Link the node before the part to its new first node.', 'Link the node before the part to its new first node.', {
      predict: {
        ...rotatedChoices('Which link does `before.next = prev` set?', linkChoice(before, prev), [
          linkChoice(before, first),
          linkChoice(before, after),
          ...(first === prev ? [] : [linkChoice(first, prev)]),
          linkChoice(before, null),
          linkChoice(prev, before),
        ]),
        explain: `prev is on ${name(prev)}, the new first node of the reversed part, so ${name(before)} now leads into it.`,
        skill: 'reconnect-head',
      },
    });
    link[before] = prev;
    snap(
      13,
      `${capitalName(before)} now points to ${name(prev)}: both ends are joined.`,
      `${capitalName(before)} now points to ${name(prev)}. Both ends are connected again.`,
      { lens: `before.next = ${name(prev)}` },
      before,
    );

    const result = chain(link[DUMMY]);
    snap(
      14,
      `Return dummy.next: ${result}.`,
      `Return \`dummy.next\`: ${result}. ${left === 1 && right > left ? `The head changed to ${name(prev)}, which is why the code returns \`dummy.next\` and not head. ` : ''}One pass with a few pointers: O(n) time, O(1) space.`,
    );
    frames[frames.length - 1].vars['result'] = `[${result.split(' → ').join(', ')}]`;
    return frames;
  },
};
