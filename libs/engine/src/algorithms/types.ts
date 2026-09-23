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

/** A dynamic-programming table; null cells are not computed yet. */
export interface TableView {
  rowLabels: string[];
  colLabels: string[];
  cells: (Scalar | null)[][];
  active?: [number, number];
  /** Cells the active cell reads from. */
  deps?: [number, number][];
  /** Cells on the reconstructed answer. */
  path?: [number, number][];
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

export interface GraphView {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** A rooted forest (heap, trie, union-find); the component lays it out. */
export interface TreeView {
  nodes: { id: string; label: string; parent: string | null; state?: NodeState; badge?: string; marked?: boolean }[];
}

export interface Prediction {
  prompt: string;
  choices: string[];
  answer: number;
  explain: string;
}

export interface Frame {
  line: number;
  vars: Record<string, Scalar>;
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

export type InputKind = 'numbers' | 'sortedNumbers' | 'number' | 'text' | 'grid' | 'edges' | 'directedEdges' | 'weightedEdges' | 'words';

export interface InputField {
  key: string;
  label: string;
  kind: InputKind;
  hint?: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface AlgorithmMeta {
  id: string;
  title: string;
  patternId: string;
  difficulty: Difficulty;
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
