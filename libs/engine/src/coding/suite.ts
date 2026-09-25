import { mulberry32 } from '../algorithms/input.js';
import { buildTree, type LevelOrder } from './tree.js';
import type { Args, CodingProblem, CompareMode, Language, ParamType, TestCase } from './types.js';

export const RANDOM_CASES = 20;

/** Per-test time limits. Python runs in WebAssembly, several times slower than native CPython. */
export const TIME_LIMIT_MS: Record<Language, number> = { javascript: 2_000, typescript: 2_000, python: 8_000 };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function paramTypes(problem: CodingProblem): ParamType[] {
  return problem.params.map((p) => p.type);
}

/** The arguments as the entry function receives them: a tree arrives as linked `TreeNode`s built from its level order. */
export function entryArgs(types: readonly ParamType[], args: Args): unknown[] {
  return args.map((arg, i) => (types[i] === 'tree' ? buildTree(arg as LevelOrder) : arg));
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
  const types = paramTypes(problem);
  const withExpected = (args: unknown[], kind: TestCase['kind']): TestCase => ({
    args,
    expected: problem.solve(...entryArgs(types, clone(args))),
    kind,
  });
  const cases = [
    ...problem.examples.map((e) => withExpected(e.args, 'example')),
    ...problem.edgeCases.map((args) => withExpected(args, 'edge')),
    ...Array.from({ length: RANDOM_CASES }, () => withExpected(problem.randomCase(rand), 'random')),
  ];
  if (performance) cases.push(withExpected(problem.performanceCase(rand), 'performance'));
  return cases;
}

export function exampleCases(problem: CodingProblem): TestCase[] {
  const types = paramTypes(problem);
  return problem.examples.map((e) => ({
    args: e.args,
    expected: problem.solve(...entryArgs(types, clone(e.args))),
    kind: 'example' as const,
  }));
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

/** Shown above the entry function when a parameter is a tree, so the learner knows the node's fields. */
const TREE_NODE: Record<Language, string> = {
  javascript: '// TreeNode: { val, left, right }, where left and right are a TreeNode or null\n\n',
  typescript: 'interface TreeNode {\n  val: number;\n  left: TreeNode | null;\n  right: TreeNode | null;\n}\n\n',
  python: '# TreeNode (val, left, right) and Optional are predefined; left and right are a TreeNode or None\n\n',
};

export function starterCode(problem: CodingProblem, language: Language): string {
  const prefix = paramTypes(problem).includes('tree') ? TREE_NODE[language] : '';
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
 * Appended to Python submissions: calls the entry function with JSON-encoded arguments, building the tree
 * parameters with the prelude, and returns JSON. The same text runs in the browser (Pyodide) and in the engine
 * tests (CPython).
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
