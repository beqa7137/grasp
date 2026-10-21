import type { Frame, NodeState, Scalar } from '../algorithms/types.js';
import { listItems, LIST_NAMES } from './keys.js';
import type { At, VizEvent } from './diff.js';

/** One table of a frame's Describe view: a header row, then rows whose first cell names the row. */
export interface DescribeTable {
  title: string;
  columns: string[];
  rows: string[][];
}

const show = (value: Scalar | undefined) => (value === undefined || value === null ? '–' : String(value));
const words = (parts: (string | false | undefined)[]) => parts.filter(Boolean).join(', ');

const ARRAY_STATES = { active: 'current', settled: 'done with', found: 'answer' } as const;
const NODE_STATES: Record<NodeState, string> = { idle: '', frontier: 'waiting', active: 'current', done: 'done' };
const CELL_STATES: Record<string, string> = {
  open: '',
  wall: 'wall',
  start: 'start',
  goal: 'goal',
  visited: 'expanded',
  frontier: 'in queue',
  current: 'current',
  path: 'shortest path',
};

/**
 * The frame's narration for Describe: on a frame that asks, until it is answered, its caption, which leads to the question
 * without answering it; the note can hold the answer ("via 0 costs 0 + 7 = 7").
 */
export const describedNote = (frame: Frame, asking: boolean): string => (asking ? (frame.caption ?? '') : frame.note);

/** The frame's values as data tables, one per view, for the Describe panel and screen readers (REDESIGN.md 3.3). */
export function describeFrame(frame: Frame): DescribeTable[] {
  const tables: DescribeTable[] = [];
  const array = frame.array;
  if (array) {
    const pointersAt = (i: number) => Object.keys(array.pointers).filter((name) => array.pointers[name] === i);
    tables.push({
      title: 'Array',
      columns: ['Index', 'Value', 'Marks'],
      rows: array.values.map((value, i) => [
        String(i),
        show(value),
        words([
          ...pointersAt(i),
          ...(['active', 'settled', 'found'] as const).map((s) => array[s]?.includes(i) && ARRAY_STATES[s]),
          array.window && i >= array.window[0] && i <= array.window[1] && 'in window',
        ]),
      ]),
    });
  }
  const lists = LIST_NAMES.flatMap((list) => {
    const items = listItems(frame, list);
    if (!items) return [];
    const label = list === 'set' ? frame.set!.label : frame[list]!.label;
    const active = list === 'set' ? frame.set!.active : undefined;
    const text = items.map((item) => (item === active ? `${show(item)} (current)` : show(item))).join(', ');
    const end = list === 'stack' && items.length ? `; top ${show(items.at(-1))}` : '';
    return [[label, items.length ? `${text}${end}` : 'empty']];
  });
  if (lists.length) tables.push({ title: 'Lists', columns: ['List', 'Items'], rows: lists });
  const grid = frame.grid;
  if (grid) {
    const cols = grid.cells[0]?.length ?? 0;
    tables.push({
      title: 'Grid',
      columns: ['Row', ...Array.from({ length: cols }, (_, c) => `Column ${c}`)],
      rows: grid.cells.map((row, r) => [
        String(r),
        ...row.map(
          (state, c) =>
            words([CELL_STATES[state], state !== 'wall' && grid.distances[r][c] !== null && `distance ${grid.distances[r][c]}`]) || 'open',
        ),
      ]),
    });
  }
  const table = frame.table;
  if (table) {
    const has = (cells: [number, number][] | undefined, r: number, c: number) => cells?.some(([y, x]) => y === r && x === c);
    tables.push({
      title: 'Table',
      columns: ['', ...table.colLabels],
      rows: table.cells.map((row, r) => [
        table.rowLabels[r] ?? String(r),
        ...row.map((value, c) => {
          const marks = words([
            table.active?.[0] === r && table.active[1] === c && (table.legend?.active ?? 'current'),
            has(table.deps, r, c) && (table.legend?.deps ?? 'highlighted'),
            has(table.path, r, c) && (table.legend?.path ?? 'highlighted'),
          ]);
          return marks ? `${show(value)} (${marks})` : show(value);
        }),
      ]),
    });
  }
  const graph = frame.graph;
  if (graph) {
    const state = (s: NodeState | undefined) => (s && s !== 'idle' ? (graph.legend?.[s] ?? NODE_STATES[s]) : '');
    tables.push({
      title: 'Nodes',
      columns: ['Node', 'Value', 'State'],
      rows: graph.nodes.map((n) => [n.label, n.badge ?? '–', state(n.state)]),
    });
    tables.push({
      title: 'Edges',
      columns: ['Edge', 'Weight', 'State'],
      rows: graph.edges.map((e) => [
        `${e.from} ${e.directed ? '→' : '–'} ${e.to}`,
        e.label ?? '–',
        e.state && e.state !== 'idle' ? e.state : '',
      ]),
    });
  }
  const tree = frame.tree;
  if (tree) {
    const label = new Map(tree.nodes.map((n) => [n.id, n.label]));
    const state = (s: NodeState | undefined) => (s ? (tree.legend?.[s] ?? NODE_STATES[s]) : '');
    tables.push({
      title: 'Tree',
      columns: ['Node', 'Parent', 'Value', 'State'],
      rows: tree.nodes
        .filter((n) => !n.blank)
        .map((n) => [
          n.label,
          n.parent === null ? 'root' : (label.get(n.parent) ?? n.parent),
          n.badge ?? '–',
          words([state(n.state), n.marked && (tree.legend?.marked ?? 'marked')]),
        ]),
    });
  }
  const vars = Object.entries(frame.vars);
  if (vars.length) tables.push({ title: 'Variables', columns: ['Name', 'Value'], rows: vars.map(([name, value]) => [name, show(value)]) });
  return tables;
}

const place = (at: At) => (typeof at === 'number' ? `${at}` : typeof at === 'string' ? at : `(${at[0]}, ${at[1]})`);

function span(at: readonly At[]): string {
  const numbers = at.every((x) => typeof x === 'number') ? [...(at as number[])].sort((a, b) => a - b) : null;
  if (numbers && numbers.length > 2 && numbers.at(-1)! - numbers[0] === numbers.length - 1) return `${numbers[0]} to ${numbers.at(-1)}`;
  return at.map(place).join(', ');
}

const NOUN: Record<string, string> = { array: 'cell', grid: 'cell', table: 'cell', graph: 'node', tree: 'node' };

/** The word for a state in the frame's own terms: its legend's, where it has one. */
function stateWord(frame: Frame, view: string, state: string): string {
  if (view === 'array') return ARRAY_STATES[state as keyof typeof ARRAY_STATES] ?? state;
  if (view === 'grid') return CELL_STATES[state] || state;
  if (view === 'table') return frame.table?.legend?.[state as 'active'] ?? state;
  if (view === 'graph' || view === 'tree') {
    const node = state as NodeState;
    const legend = view === 'graph' ? frame.graph?.legend : frame.tree?.legend;
    return legend?.[node] ?? (NODE_STATES[node] || (node === 'idle' ? 'not reached' : state));
  }
  return state;
}

/**
 * State changes, one sentence per group of elements that made the same change: "cells (0, 1), (1, 0): in queue → current".
 * An element can hold several states (an array cell both current and done with), so each change is read per state.
 */
function markSentences(events: readonly VizEvent[], frame: Frame, names: (at: readonly At[]) => string): string[] {
  const changes = new Map<string, { view: string; noun: string; at: At[]; from: string[]; to: string[] }>();
  for (const e of events) {
    if (e.kind !== 'mark') continue;
    const edge = e.state.startsWith('edge ');
    const word = stateWord(frame, e.view, e.state.replace(/^edge /, ''));
    const noun = edge ? 'edge' : (NOUN[e.view] ?? 'item');
    for (const [list, added] of [
      [e.removed, false],
      [e.added, true],
    ] as const)
      for (const at of list) {
        const id = `${e.view} ${noun} ${JSON.stringify(at)}`;
        const change = changes.get(id) ?? { view: e.view, noun, at: [at], from: [], to: [] };
        (added ? change.to : change.from).push(word);
        changes.set(id, change);
      }
  }
  const groups = new Map<string, { noun: string; at: At[]; text: string }>();
  for (const change of changes.values()) {
    const from = change.from.join(' and ');
    const to = change.to.join(' and ');
    const text = !to ? `no longer ${from}` : !from || from === 'not reached' ? to : `${from} → ${to}`;
    const id = `${change.view} ${change.noun} ${text}`;
    const group = groups.get(id) ?? { noun: change.noun, at: [], text };
    group.at.push(...change.at);
    groups.set(id, group);
  }
  return [...groups.values()].map((g) => `${g.at.length === 1 ? g.noun : `${g.noun}s`} ${names(g.at)}: ${g.text}.`);
}

/** What changed in a step into `frame`, one short sentence each: what moved and was written, then states, then variables. */
export function describeEvents(events: readonly VizEvent[], frame: Frame): string[] {
  const labels = new Map<string, string>([...(frame.graph?.nodes ?? []), ...(frame.tree?.nodes ?? [])].map((n) => [n.id, n.label]));
  const name = (at: At) => (typeof at === 'string' ? (labels.get(at) ?? at.replace('->', ' → ')) : place(at));
  const names = (at: readonly At[]) => (at.every((x) => typeof x === 'string') ? at.map(name).join(', ') : span(at));
  const sentences = events.flatMap((e): string[] => {
    switch (e.kind) {
      case 'compare':
        return [`Compare ${e.text}.`];
      case 'move':
        if (e.from === null) return [`${e.pointer} appears at ${e.to}.`];
        if (e.to === null) return [`${e.pointer} leaves ${e.from}.`];
        return [`${e.pointer} moves from ${e.from} to ${e.to}.`];
      case 'window':
        return [e.to ? `The window is ${e.to[0]} to ${e.to[1]}.` : 'The window closes.'];
      case 'swap':
        return [e.view === 'array' ? `Cells ${e.a} and ${e.b} swap.` : `In the ${e.view}, items ${e.a} and ${e.b} swap.`];
      case 'shift':
        return [e.view === 'array' ? `The value at ${e.from} moves to ${e.to}.` : `In the ${e.view}, item ${e.from} moves to ${e.to}.`];
      case 'write': {
        const where = e.view in NOUN ? `${NOUN[e.view]} ${name(e.at)}` : `${e.view}[${place(e.at)}]`;
        return [e.from === undefined ? `${where} = ${show(e.to)}.` : `${where}: ${show(e.from)} → ${show(e.to)}.`];
      }
      case 'push':
        return [`${show(e.value)} joins the ${e.view}.`];
      case 'pop':
        return [`${show(e.value)} leaves the ${e.view}.`];
      case 'add':
        return [`New: ${names(e.at)}.`];
      case 'remove':
        return [`Gone: ${names(e.at)}.`];
      case 'link':
        if (e.view === 'graph') return [`Edge ${name(e.at)} ${e.to === null ? 'is gone' : 'appears'}.`];
        return [`${name(e.at)} now hangs under ${e.to === null ? 'nothing' : name(e.to)}.`];
      case 'mark':
      case 'var':
      case 'label':
      case 'show':
      case 'hide':
        return [];
    }
  });
  const vars = events.flatMap((e) =>
    e.kind === 'var' ? [e.from === undefined ? `${e.name} = ${show(e.to)}.` : `${e.name}: ${show(e.from)} → ${show(e.to)}.`] : [],
  );
  return [...sentences, ...markSentences(events, frame, names), ...vars];
}
