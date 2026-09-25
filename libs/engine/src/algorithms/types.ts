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

export interface Prediction {
  /** Learner text: backticks mark code spans. */
  prompt: string;
  choices: string[];
  answer: number;
  /** The choices are a fixed menu, such as Yes / No, whose order means something, so review keeps it instead of shuffling. */
  ordered?: boolean;
  /** Learner text: backticks mark code spans. */
  explain: string;
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

export interface AlgorithmMeta {
  id: string;
  title: string;
  patternId: string;
  difficulty: Difficulty;
  /** Learner text: backticks mark code spans. */
  summary: string;
  complexity: { time: string; space: string };
  code: string[];
  fields: InputField[];
}

export type AlgorithmInput = Record<string, unknown>;

export interface AlgorithmDef<I extends AlgorithmInput = AlgorithmInput> extends AlgorithmMeta {
  defaultInput: I;
  randomInput(rand?: () => number): I;
  validate(input: unknown): I;
  trace(input: I): Frame[];
}

export class InputError extends Error {}
