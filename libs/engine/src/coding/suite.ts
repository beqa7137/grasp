import { mulberry32 } from '../algorithms/random.js';
import { buildList, listValues } from './list.js';
import { buildTree, type LevelOrder } from './tree.js';
import type { Args, CodingProblem, CompareMode, Language, ParamType, TestCase } from './types.js';

export const RANDOM_CASES = 20;

/** Per-test time limits. Python runs in WebAssembly, several times slower than native CPython. */
export const TIME_LIMIT_MS: Record<Language, number> = { javascript: 2_000, typescript: 2_000, python: 8_000 };

export function paramTypes(problem: CodingProblem): ParamType[] {
  return problem.params.map((p) => p.type);
}

export function entryArgs(types: readonly ParamType[], args: Args): unknown[] {
  return args.map((arg, i) =>
    types[i] === 'tree' ? buildTree(arg as LevelOrder) : types[i] === 'list' ? buildList(arg as number[]) : structuredClone(arg),
  );
}

/** What a test compares: a returned list as its values, which throws for anything but a list that ends, and anything else as it is. */
export function entryOutput(returns: ParamType, value: unknown): unknown {
  return returns === 'list' ? listValues(value) : value;
}

function testCase(problem: CodingProblem, args: Args, kind: TestCase['kind']): TestCase {
  return { args, expected: entryOutput(problem.returns, problem.solve(...entryArgs(paramTypes(problem), args))), kind };
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

// No replacer: calling one per value doubles the cost of comparing a large output, such as Subsets' 131,072 lists.
// Only a bare undefined (or function) stringifies to undefined, and it reads as null, as it does inside an array.
function canonical(value: unknown): string {
  return JSON.stringify(value) ?? 'null';
}

export function outputsMatch(expected: unknown, actual: unknown, mode: CompareMode): boolean {
  if (mode === 'unordered-nested' && Array.isArray(expected) && Array.isArray(actual)) {
    const sortInner = (list: unknown[]) => list.map((item) => (Array.isArray(item) ? [...item].sort() : item));
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
  if (type === 'list') return quantity((value as unknown[]).length, 'node');
  if (typeof value === 'string') return quantity(value.length, 'character');
  // The other 2-D inputs are lists of pairs or triples, so wide rows identify performance grids.
  if ((type === 'int[][]' || type === 'char[][]') && Array.isArray(value) && Array.isArray(value[0]) && value[0].length > 4)
    return `${value.length.toLocaleString('en-US')} × ${value[0].length.toLocaleString('en-US')} grid`;
  return Array.isArray(value) ? quantity(value.length, 'item') : null;
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
  list: 'ListNode | null',
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
  list: 'Optional[ListNode]',
};

const TREE_NODE_HEADER: Record<Language, string> = {
  javascript: '// TreeNode: { val, left, right }, where left and right are a TreeNode or null\n\n',
  typescript: 'interface TreeNode {\n  val: number;\n  left: TreeNode | null;\n  right: TreeNode | null;\n}\n\n',
  python: '# TreeNode (val, left, right) and Optional are predefined; left and right are a TreeNode or None\n\n',
};

// A class in the starter code rather than a runner global, so a solution that declares its own ListNode still loads.
const LIST_NODE_HEADER: Record<Language, string> = {
  javascript: 'class ListNode {\n  constructor(val = 0, next = null) {\n    this.val = val;\n    this.next = next;\n  }\n}\n\n',
  typescript:
    'class ListNode {\n  val: number;\n  next: ListNode | null;\n\n  constructor(val = 0, next: ListNode | null = null) {\n    this.val = val;\n    this.next = next;\n  }\n}\n\n',
  python: '# ListNode (val, next) and Optional are predefined; next is a ListNode or None\n\n',
};

export function starterCode(problem: CodingProblem, language: Language): string {
  const types = [...paramTypes(problem), problem.returns];
  const prefix = (types.includes('tree') ? TREE_NODE_HEADER[language] : '') + (types.includes('list') ? LIST_NODE_HEADER[language] : '');
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
 * evaluated when the function is defined, so both names must exist first. Trees and lists are built from the classes
 * captured here, so a learner's own `TreeNode` or `ListNode` cannot change how inputs are built.
 *
 * Browser Python frees a chain of objects recursively and overflows its stack past a few thousand links, so every list
 * node made during a call (each ListNode registers itself in `_grasp_made`, a name that is not mangled inside the class)
 * and every node of the list returned, which may be a learner's own class, is unlinked one at a time before the chain
 * can be freed.
 */
export const PYTHON_PRELUDE = `import sys
from typing import Optional

sys.setrecursionlimit(10_000)


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


_grasp_made = []


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
        _grasp_made.append(self)

    def __repr__(self):
        return f"ListNode({self.val!r})"


__grasp_ListNode = ListNode


def __grasp_list(values):
    head = None
    for value in reversed(values):
        head = __grasp_ListNode(value, head)
    return head


def __grasp_kind(value):
    return "an array" if isinstance(value, (list, tuple)) else f"a value of type {type(value).__name__}"


def __grasp_is_node(value):
    return hasattr(value, "val") and hasattr(value, "next")


def __grasp_list_values(head, nodes):
    if head is not None and not __grasp_is_node(head):
        raise TypeError(f"Return the head ListNode (or null/None), not {__grasp_kind(head)}.")
    values, seen = [], set()
    while head is not None:
        if not __grasp_is_node(head):
            raise TypeError(f"A next link must be a ListNode or null/None, not {__grasp_kind(head)}.")
        if id(head) in seen:
            raise ValueError(f"The returned list loops: after {len(values)} nodes it comes back to a node with value {head.val!r}.")
        seen.add(id(head))
        nodes.append(head)
        values.append(head.val)
        head = head.next
    return values


def __grasp_unlink(nodes):
    for node in nodes:
        node.next = None
    nodes.clear()
`;

/**
 * Appended to Python submissions after PYTHON_PRELUDE: calls the entry function with JSON-encoded arguments and returns
 * JSON. The same text runs in the browser (Pyodide) and in the engine tests (CPython).
 */
export function pythonHarness(entry: string, types: readonly ParamType[], returns: ParamType): string {
  const indices = (kind: ParamType) => types.flatMap((type, i) => (type === kind ? [i] : [])).join(', ');
  return `
import json as __grasp_json

__grasp_trees = [${indices('tree')}]
__grasp_lists = [${indices('list')}]
__grasp_returns_list = ${returns === 'list' ? 'True' : 'False'}

def __grasp_default(value):
    if isinstance(value, (set, frozenset)):
        return sorted(value, key=repr)
    return repr(value)

def __grasp_call(__grasp_args):
    __grasp_values = __grasp_json.loads(__grasp_args)
    __grasp_nodes = []
    _grasp_made.clear()
    for __grasp_i in __grasp_trees:
        __grasp_values[__grasp_i] = __grasp_tree(__grasp_values[__grasp_i])
    for __grasp_i in __grasp_lists:
        __grasp_values[__grasp_i] = __grasp_list(__grasp_values[__grasp_i])
    try:
        __grasp_result = ${entry}(*__grasp_values)
        if __grasp_returns_list:
            __grasp_result = __grasp_list_values(__grasp_result, __grasp_nodes)
        return __grasp_json.dumps(__grasp_result, default=__grasp_default)
    finally:
        __grasp_unlink(__grasp_nodes)
        __grasp_unlink(_grasp_made)
`;
}
