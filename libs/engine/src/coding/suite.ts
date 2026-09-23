import { mulberry32 } from '../algorithms/input.js';
import type { CodingProblem, CompareMode, Language, ParamType, TestCase } from './types.js';

export const RANDOM_CASES = 20;

/** Per-test time limits. Python runs in WebAssembly, several times slower than native CPython. */
export const TIME_LIMIT_MS: Record<Language, number> = { javascript: 2_000, typescript: 2_000, python: 8_000 };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Deterministic cases for a problem: the examples, hand-picked edge cases, seeded random cases and one
 * large performance case. Expected values always come from the reference solution.
 */
export function buildSuite(
  problem: CodingProblem,
  { seed = 1, performance = true }: { seed?: number; performance?: boolean } = {},
): TestCase[] {
  const rand = mulberry32(seed);
  const withExpected = (args: unknown[], kind: TestCase['kind']): TestCase => ({ args, expected: problem.solve(...clone(args)), kind });
  const cases = [
    ...problem.examples.map((e) => withExpected(e.args, 'example')),
    ...problem.edgeCases.map((args) => withExpected(args, 'edge')),
    ...Array.from({ length: RANDOM_CASES }, () => withExpected(problem.randomCase(rand), 'random')),
  ];
  if (performance) cases.push(withExpected(problem.performanceCase(rand), 'performance'));
  return cases;
}

export function exampleCases(problem: CodingProblem): TestCase[] {
  return problem.examples.map((e) => ({ args: e.args, expected: problem.solve(...clone(e.args)), kind: 'example' as const }));
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v === undefined ? null : v));
}

export function outputsMatch(expected: unknown, actual: unknown, mode: CompareMode): boolean {
  if (mode === 'unordered' && Array.isArray(expected) && Array.isArray(actual)) {
    const sort = (list: unknown[]) => list.map(canonical).sort();
    return canonical(sort(expected)) === canonical(sort(actual));
  }
  return canonical(expected) === canonical(actual);
}

/** Short, single-line rendering of a value for test results. */
export function preview(value: unknown, max = 120): string {
  const text = value === undefined ? 'undefined' : canonical(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function entryName(problem: CodingProblem, language: Language): string {
  return language === 'python' ? snakeCase(problem.entry) : problem.entry;
}

const TS_TYPES: Record<ParamType, string> = {
  int: 'number',
  'int[]': 'number[]',
  'int[][]': 'number[][]',
  string: 'string',
  'char[][]': 'string[][]',
  bool: 'boolean',
};

const PY_TYPES: Record<ParamType, string> = {
  int: 'int',
  'int[]': 'list[int]',
  'int[][]': 'list[list[int]]',
  string: 'str',
  'char[][]': 'list[list[str]]',
  bool: 'bool',
};

export function starterCode(problem: CodingProblem, language: Language): string {
  const names = problem.params.map((p) => p.name);
  switch (language) {
    case 'javascript':
      return `function ${problem.entry}(${names.join(', ')}) {\n  \n}\n`;
    case 'typescript':
      return `function ${problem.entry}(${problem.params.map((p) => `${p.name}: ${TS_TYPES[p.type]}`).join(', ')}): ${TS_TYPES[problem.returns]} {\n  \n}\n`;
    case 'python':
      return `def ${snakeCase(problem.entry)}(${problem.params.map((p) => `${p.name}: ${PY_TYPES[p.type]}`).join(', ')}) -> ${PY_TYPES[problem.returns]}:\n    pass\n`;
  }
}

/**
 * Appended to Python submissions: calls the entry function with JSON-encoded arguments and returns
 * JSON. The same text runs in the browser (Pyodide) and in the engine tests (CPython).
 */
export function pythonHarness(entry: string): string {
  return `
import json as __grasp_json

def __grasp_default(value):
    if isinstance(value, (set, frozenset)):
        return sorted(value, key=repr)
    return repr(value)

def __grasp_call(__grasp_args):
    return __grasp_json.dumps(${entry}(*__grasp_json.loads(__grasp_args)), default=__grasp_default)
`;
}
