import type { AlgorithmSummary } from './catalog.js';

export type Scalar = number | string | boolean | null;

export interface ArrayView {
  values: Scalar[];
  pointers: Record<string, number>;
  window?: [number, number];
  active?: number[];
  settled?: number[];
  found?: number[];
}

export interface StackView {
  label: string;
  items: Scalar[];
}

export interface SetView {
  label: string;
  entries: string[];
  active?: string;
}

export type CellState = 'open' | 'wall' | 'start' | 'goal' | 'visited' | 'frontier' | 'current' | 'path';

export interface GridView {
  cells: CellState[][];
  distances: (number | null)[][];
}

/** What each table highlight means, in legend order. */
export type TableLegend = Partial<Record<'active' | 'deps' | 'path', string>>;

/** A table of values, such as a DP table; null cells are not computed yet. */
export interface TableView {
  rowLabels: string[];
  colLabels: string[];
  cells: (Scalar | null)[][];
  active?: [number, number];
  /** Highlighted cells, such as those the active cell reads from; the legend says what they mean. */
  deps?: [number, number][];
  /** Highlighted cells, such as the reconstructed answer; the legend says what they mean. */
  path?: [number, number][];
  /** Without it the table has no legend. */
  legend?: TableLegend;
}

export type NodeState = 'idle' | 'frontier' | 'active' | 'done';
export type EdgeState = 'idle' | 'active' | 'chosen' | 'skipped';

export interface GraphNode {
  id: string;
  label: string;
  /** Layout position in a 0..1 box. */
  x: number;
  y: number;
  state?: NodeState;
  /** Small value drawn next to the node: a distance, an in-degree. */
  badge?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  directed: boolean;
  label?: string;
  state?: EdgeState;
}

/** What each node style means, in legend order. */
export type GraphLegend = Partial<Record<NodeState, string>>;

export interface GraphView {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Without it the graph has no legend. */
  legend?: GraphLegend;
}

/** What each node style means, in legend order. */
export type TreeLegend = Partial<Record<NodeState | 'marked', string>>;

/**
 * A rooted forest; the component lays it out. A `blank` holds the empty side of a node with one child, so left and right
 * read correctly; it is drawn faintly and not counted as a node.
 */
export interface TreeView {
  nodes: { id: string; label: string; parent: string | null; state?: NodeState; badge?: string; marked?: boolean; blank?: boolean }[];
  /** Without it the tree has no legend. */
  legend?: TreeLegend;
}

/** One element of a frame's drawing: an array, table or grid cell by index, or a graph or tree node by id. */
export type Locator = { view: 'array' | 'table' | 'grid'; at: number | [number, number] } | { view: 'graph' | 'tree'; id: string };

export interface Prediction {
  /** Learner text: backticks mark code spans. */
  prompt: string;
  choices: string[];
  answer: number;
  /** The choices are a fixed menu, such as Yes / No, whose order means something, so review keeps it instead of shuffling. */
  ordered?: boolean;
  /** Learner text: backticks mark code spans. */
  explain: string;
  /** What the question is about: while it is asked, the rest of the drawing dims. */
  focus?: Locator[];
}

export interface Frame {
  line: number;
  vars: Record<string, Scalar>;
  /** Learner text: backticks mark code spans. */
  note: string;
  array?: ArrayView;
  stack?: StackView;
  set?: SetView;
  grid?: GridView;
  queue?: StackView;
  output?: StackView;
  table?: TableView;
  graph?: GraphView;
  tree?: TreeView;
  predict?: Prediction;
  /** The part of the run this frame belongs to, such as "Row 3 of 7"; consecutive frames share it. */
  chapter?: string;
  /** Learner text, at most 80 characters: the one-line narration, where `note` is the long explanation. */
  caption?: string;
  /** The columns of `line` being evaluated, from the first to one past the last. */
  span?: [number, number];
  /** The evaluated expression with its values, such as "16 < 23 → true"; never on a frame that asks, which it would answer. */
  lens?: string;
}

export type InputKind =
  'numbers' | 'sortedNumbers' | 'number' | 'text' | 'grid' | 'edges' | 'directedEdges' | 'weightedEdges' | 'words' | 'intervals';

export interface InputField {
  key: string;
  label: string;
  kind: InputKind;
  hint?: string;
  /** Values the player offers in a picker instead of a text box. */
  options?: string[];
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface AlgorithmMeta extends AlgorithmSummary {
  code: string[];
  fields: InputField[];
}

export type AlgorithmInput = Record<string, unknown>;

export interface AlgorithmDef<I extends AlgorithmInput = AlgorithmInput> extends AlgorithmMeta {
  defaultInput: I;
  randomInput(rand?: () => number): I;
  validate(input: unknown): I;
  trace(input: I): Frame[];
  /** A few inputs worth watching, such as an edge case, offered beside Random. */
  presets?: { label: string; input: I }[];
}

/** What a tracer module defines: everything but its catalog entry's fields. */
export type AlgorithmDefinition<I extends AlgorithmInput = AlgorithmInput> = Omit<AlgorithmDef<I>, keyof AlgorithmSummary>;

export class InputError extends Error {}
