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
  predict?: Prediction;
}

export type InputKind = 'numbers' | 'sortedNumbers' | 'number' | 'text' | 'grid';

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
