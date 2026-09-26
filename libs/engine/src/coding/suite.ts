import { mulberry32 } from '../algorithms/random.js';
import { buildTree, type LevelOrder } from './tree.js';
import type { Args, CodingProblem, CompareMode, Language, ParamType, TestCase } from './types.js';

export const RANDOM_CASES = 20;

/** Per-test time limits. Python runs in WebAssembly, several times slower than native CPython. */
export const TIME_LIMIT_MS: Record<Language, number> = { javascript: 2_000, typescript: 2_000, python: 8_000 };

export function paramTypes(problem: CodingProblem): ParamType[] {
  return problem.params.map((p) => p.type);
}

export function entryArgs(types: readonly ParamType[], args: Args): unknown[] {
  return args.map((arg, i) => (types[i] === 'tree' ? buildTree(arg as LevelOrder) : structuredClone(arg)));
}

function testCase(problem: CodingProblem, args: Args, kind: TestCase['kind']): TestCase {
  return { args, expected: problem.solve(...entryArgs(paramTypes(problem), args)), kind };
}

/**
 * Deterministic cases for a problem: the examples, hand-picked edge cases, seeded random cases and one
 * large performance case. Expected values always come from the reference solution.
 */
export function buildSuite(
  problem: CodingProblem,
  { seed = 1, performance = true }: { seed?: number; performance?: boolean } = {},
): TestCase[] {
  const rand = mulberry32(seed);
  const cases = [
    ...exampleCases(problem),
    ...problem.edgeCases.map((args) => testCase(problem, args, 'edge')),
    ...Array.from({ length: RANDOM_CASES }, () => testCase(problem, problem.randomCase(rand), 'random')),
  ];
  if (performance) cases.push(testCase(problem, problem.performanceCase(rand), 'performance'));
  return cases;
}

export function exampleCases(problem: CodingProblem): TestCase[] {
  return problem.examples.map((e) => testCase(problem, e.args, 'example'));
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v === undefined ? null : v));
}

export function outputsMatch(expected: unknown, actual: unknown, mode: CompareMode): boolean {
  if (mode === 'unordered-nested' && Array.isArray(expected) && Array.isArray(actual)) {
    const sortInner = (list: unknown[]) => list.map((item) => (Array.isArray(item) ? [...item].sort((a, b) => a - b) : item));
    return outputsMatch(sortInner(expected), sortInner(actual), 'unordered');
  }
  if (mode === 'unordered' && Array.isArray(expected) && Array.isArray(actual)) {
    const sort = (list: unknown[]) => list.map(canonical).sort();
    return canonical(sort(expected)) === canonical(sort(actual));
  }
  return canonical(expected) === canonical(actual);
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Short, single-line rendering of a value for test results. */
export function preview(value: unknown, max = 120): string {
  return clip(value === undefined ? 'undefined' : canonical(value), max);
}

const quantity = (n: number, noun: string) => `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`;

/** How big an argument is, such as `100,000 nodes` or `5,000 items`, or null for a single value. */
export function inputSize(type: ParamType, value: unknown): string | null {
  if (type === 'tree') {
    const values = value as LevelOrder;
    let nodes = 0;
    for (let i = 0; i < values.length; i++) if (values[i] !== null) nodes++;
    return quantity(nodes, 'node');
  }
  return Array.isArray(value) || typeof value === 'string' ? quantity(value.length, 'item') : null;
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
  'string[]': 'string[]',
  'char[][]': 'string[][]',
  bool: 'boolean',
  tree: 'TreeNode | null',
};

const PY_TYPES: Record<ParamType, string> = {
  int: 'int',
  'int[]': 'list[int]',
  'int[][]': 'list[list[int]]',
  string: 'str',
  'string[]': 'list[str]',
  'char[][]': 'list[list[str]]',
  bool: 'bool',
  tree: 'Optional[TreeNode]',
};

const TREE_NODE_HEADER: Record<Language, string> = {
  javascript: '// TreeNode: { val, left, right }, where left and right are a TreeNode or null\n\n',
  typescript: 'interface TreeNode {\n  val: number;\n  left: TreeNode | null;\n  right: TreeNode | null;\n}\n\n',
  python: '# TreeNode (val, left, right) and Optional are predefined; left and right are a TreeNode or None\n\n',
};

export function starterCode(problem: CodingProblem, language: Language): string {
  const prefix = paramTypes(problem).includes('tree') ? TREE_NODE_HEADER[language] : '';
  return prefix + entryFunction(problem, language);
}

function entryFunction(problem: CodingProblem, language: Language): string {
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
 * Runs before a Python submission, in its namespace. Before Python 3.14 an annotation such as `Optional[TreeNode]` is
 * evaluated when the function is defined, so both names must exist first. Trees are built from the class captured
 * here, so a learner's own `TreeNode` cannot change how inputs are built.
 */
export const PYTHON_PRELUDE = `from typing import Optional


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

    def __repr__(self):
        return f"TreeNode({self.val!r})"


__grasp_TreeNode = TreeNode


def __grasp_tree(values):
    if not values or values[0] is None:
        return None
    root = __grasp_TreeNode(values[0])
    queue, head, i = [root], 0, 1
    while i < len(values):
        parent = queue[head]
        head += 1
        if values[i] is not None:
            parent.left = __grasp_TreeNode(values[i])
            queue.append(parent.left)
        i += 1
        if i < len(values) and values[i] is not None:
            parent.right = __grasp_TreeNode(values[i])
            queue.append(parent.right)
        i += 1
    return root
`;

/**
 * Appended to Python submissions after PYTHON_PRELUDE: calls the entry function with JSON-encoded arguments and returns
 * JSON. The same text runs in the browser (Pyodide) and in the engine tests (CPython).
 */
export function pythonHarness(entry: string, types: readonly ParamType[]): string {
  const trees = types.flatMap((type, i) => (type === 'tree' ? [i] : []));
  return `
import json as __grasp_json

__grasp_trees = [${trees.join(', ')}]

def __grasp_default(value):
    if isinstance(value, (set, frozenset)):
        return sorted(value, key=repr)
    return repr(value)

def __grasp_call(__grasp_args):
    __grasp_values = __grasp_json.loads(__grasp_args)
    for __grasp_i in __grasp_trees:
        __grasp_values[__grasp_i] = __grasp_tree(__grasp_values[__grasp_i])
    return __grasp_json.dumps(${entry}(*__grasp_values), default=__grasp_default)
`;
}
