import type { Difficulty } from '../algorithms/types.js';

export type Language = 'javascript' | 'typescript' | 'python';
export const LANGUAGES: Language[] = ['python', 'javascript', 'typescript'];

/** `tree` is a binary tree: tests carry it as a `LevelOrder` array, and the entry function receives linked `TreeNode`s. */
export type ParamType = 'int' | 'int[]' | 'int[][]' | 'string' | 'string[]' | 'char[][]' | 'bool' | 'tree';

export interface Param {
  name: string;
  type: ParamType;
}

/** How a returned value is checked: exactly, or as a list whose order does not matter. */
export type CompareMode = 'exact' | 'unordered';

export type Args = unknown[];

export interface Example {
  args: Args;
  explanation?: string;
}

export interface TestCase {
  args: Args;
  expected: unknown;
  kind: 'example' | 'edge' | 'random' | 'performance';
}

export interface CodingProblem {
  id: string;
  title: string;
  difficulty: Difficulty;
  patternIds: string[];
  /** Visualizer showing the canonical solution, when one exists. */
  algorithmId?: string;
  statement: string[];
  constraints: string[];
  /** Function name in JavaScript/TypeScript; Python uses the snake_case form. */
  entry: string;
  params: Param[];
  /** Trees are inputs only: every output travels as JSON and is compared by value. */
  returns: Exclude<ParamType, 'tree'>;
  compare: CompareMode;
  examples: Example[];
  edgeCases: Args[];
  randomCase(rand: () => number): Args;
  /** A large input that an asymptotically slower solution cannot finish within the time limit. */
  performanceCase(rand: () => number): Args;
  /** Reference implementation; its output defines the expected result for every case. */
  solve(...args: any[]): unknown;
  /** One-line summary of the intended approach, shown after a full pass. */
  approach: string;
  complexity: { time: string; space: string };
}
