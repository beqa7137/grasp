import { buildTree } from '@grasp/engine';
import { CompileError, compileJs, runJsTest, traceJs, type LogSink } from './execute-js';
import type { TraceOutcome } from './protocol';
import { isFatal, pythonCrash, pythonError } from './python-errors';
import { describeSnap, snapshot, type TreeSnap } from './snapshot';
import { toFrames } from './trace-frames';

const BINARY_SEARCH = `function search(nums, target) {
  let lo = 0, hi = nums.length - 1;
  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] === target) return mid;
    if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}`;

const DIAMETER = `function diameterOfBinaryTree(root) {
  let best = 0;
  const height = (node) => {
    if (!node) return 0;
    const left = height(node.left);
    const right = height(node.right);
    best = Math.max(best, left + right);
    return 1 + Math.max(left, right);
  };
  height(root);
  return best;
}`;

const ISLANDS = `function numIslands(grid) {
  let count = 0;
  const sink = (r, c) => {
    if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length || grid[r][c] !== '1') return;
    grid[r][c] = '0';
    sink(r + 1, c);
    sink(r, c + 1);
  };
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[0].length; c++)
      if (grid[r][c] === '1') {
        count++;
        sink(r, c);
      }
  return count;
}`;

const compileError = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof CompileError) return e.error;
    throw e;
  }
  throw new Error('expected a compile error');
};

describe('running JavaScript and TypeScript', () => {
  const sink: LogSink = { lines: [] };

  it('runs the entry function on a copy of the arguments and captures console output', () => {
    const fn = compileJs('function f(a) { console.log("len", a.length, { x: 1 }); a.push(9); return a; }', 'javascript', 'f', sink);
    const args = [[1, 2]];
    const result = runJsTest(fn, [], args, sink);
    expect(result).toMatchObject({ ok: true, output: [1, 2, 9], logs: ['len 2 {"x":1}'] });
    expect(args).toEqual([[1, 2]]);
  });

  it('accepts arrow functions and strips TypeScript types without moving lines', () => {
    expect(
      runJsTest(compileJs('const f = (a: number[]): number => a.length;', 'typescript', 'f', sink), [], [[1, 2, 3]], sink),
    ).toMatchObject({
      ok: true,
      output: 3,
    });
    const fn = compileJs('interface P { x: number }\nfunction f(p: P): number {\n  throw new Error("boom");\n}', 'typescript', 'f', sink);
    const result = runJsTest(fn, [], [{ x: 1 }], sink);
    expect(result).toMatchObject({ ok: false, error: { message: 'Error: boom', location: { line: 3 } } });
  });

  it('reports syntax errors with their line and column', () => {
    expect(compileError(() => compileJs('function f(a) {\n  return a +;\n}', 'javascript', 'f', sink))).toMatchObject({
      location: { line: 2 },
    });
    expect(compileError(() => compileJs('function f(a: number {\n}', 'typescript', 'f', sink)).message).toContain('SyntaxError');
    expect(compileError(() => compileJs('function g() {}', 'javascript', 'f', sink)).message).toBe('Define a function named f.');
  });

  it('hides network and messaging globals from learner code', () => {
    const fn = compileJs('function f() { return [typeof fetch, typeof postMessage, typeof XMLHttpRequest]; }', 'javascript', 'f', sink);
    expect(runJsTest(fn, [], [], sink)).toMatchObject({ ok: true, output: ['undefined', 'undefined', 'undefined'] });
  });

  it('turns undefined, Sets and Maps into comparable JSON', () => {
    const fn = compileJs(
      'function f(k) { return k === 0 ? undefined : k === 1 ? new Set([1, 2]) : new Map([["a", 1]]); }',
      'javascript',
      'f',
      sink,
    );
    expect(runJsTest(fn, [], [0], sink)).toMatchObject({ ok: true, output: undefined });
    expect(runJsTest(fn, [], [1], sink)).toMatchObject({ ok: true, output: [1, 2] });
    expect(runJsTest(fn, [], [2], sink)).toMatchObject({ ok: true, output: { a: 1 } });
  });

  it('hands a tree parameter to the entry function as linked TreeNodes built from its level order', () => {
    const fn = compileJs(DIAMETER, 'javascript', 'diameterOfBinaryTree', sink);
    const args = [[1, 2, null, 3, 4, 5, null, null, 6]];
    expect(runJsTest(fn, ['tree'], args, sink)).toMatchObject({ ok: true, output: 4 });
    expect(args).toEqual([[1, 2, null, 3, 4, 5, null, null, 6]]);

    const shape = compileJs(
      'interface TreeNode { val: number; left: TreeNode | null; right: TreeNode | null }\nfunction f(root: TreeNode | null, k: number): number[] {\n  return root ? [root.val, root.left?.val ?? -1, root.right?.val ?? -1, k] : [k];\n}',
      'typescript',
      'f',
      sink,
    );
    expect(runJsTest(shape, ['tree', 'int'], [[1, null, 2], 7], sink)).toMatchObject({ ok: true, output: [1, -1, 2, 7] });
    expect(runJsTest(shape, ['tree', 'int'], [[], 7], sink)).toMatchObject({ ok: true, output: [7] });
  });
});

describe('tracing learner code', () => {
  it('records the line and every variable in scope before each statement', () => {
    const trace = traceJs(BINARY_SEARCH, 'javascript', 'search', [], [[1, 3, 5, 7, 9], 7], 500);
    expect(trace.truncated).toBe(false);
    expect(trace.returned).toBe(3);
    expect(trace.steps[0]).toEqual({
      line: 2,
      vars: { nums: { kind: 'array', items: [1, 3, 5, 7, 9], truncated: 0 }, target: 7 },
      call: 0,
    });
    const lines = trace.steps.map((s) => s.line);
    expect(lines.slice(0, 5)).toEqual([2, 3, 4, 5, 6]);
    const firstMid = trace.steps.find((s) => 'mid' in s.vars)!;
    expect(firstMid.vars).toMatchObject({ lo: 0, hi: 4, mid: 2 });
    expect(trace.steps.at(-1)).toMatchObject({ line: 5, vars: { mid: 3 } });
  });

  it('sees outer variables from nested helpers and single-statement bodies', () => {
    const code = `function count(grid) {
  let n = 0;
  const sink = (r) => { if (r < 0 || grid[r] !== 1) return; grid[r] = 0; sink(r - 1); };
  for (let i = 0; i < grid.length; i++) if (grid[i] === 1) { n++; sink(i); }
  return n;
}`;
    const trace = traceJs(code, 'javascript', 'count', [], [[1, 1, 0, 1]], 500);
    expect(trace.returned).toBe(3);
    const inHelper = trace.steps.find((s) => s.line === 3 && 'r' in s.vars)!;
    expect(inHelper.vars).toMatchObject({ n: 1, r: 0 });
    expect(trace.steps.some((s) => s.line === 4 && s.vars['i'] === 3)).toBe(true);
  });

  it('runs function declarations as the untraced code does, even beside a var of the same name or declared twice', () => {
    const shared = 'function f() {\n  var g = 1;\n  function g() {}\n  return g;\n}';
    const twice =
      "function f() {\n  'use strict';\n  function g() {\n    return 1;\n  }\n  function g() {\n    return 2;\n  }\n  return g();\n}";
    const closure = 'function f() {\n  let count = 0;\n  add();\n  function add() {\n    count++;\n  }\n  return count;\n}';
    expect([shared, twice, closure].map((code) => traceJs(code, 'javascript', 'f', [], [], 50).returned)).toEqual([1, 2, 1]);
  });

  it('skips variables still in their temporal dead zone', () => {
    const trace = traceJs('function f() {\n  const a = 1;\n  const b = a + 1;\n  return b;\n}', 'javascript', 'f', [], [], 50);
    expect(trace.steps.map((s) => Object.keys(s.vars))).toEqual([[], ['a'], ['a', 'b']]);
  });

  it('stops infinite loops at the step limit and reports runtime errors at the last line', () => {
    expect(traceJs('function f() {\n  let i = 0;\n  while (true) i++;\n}', 'javascript', 'f', [], [], 100)).toMatchObject({
      truncated: true,
    });
    const failed = traceJs('function f(a) {\n  const x = a.b.c;\n  return x;\n}', 'javascript', 'f', [], [{}], 100);
    expect(failed.error).toMatchObject({ location: { line: 2 } });
    expect(failed.error!.message).toContain('TypeError');
  });

  it('traces TypeScript on the original line numbers', () => {
    const trace = traceJs(
      'function f(xs: number[]): number {\n  let total: number = 0;\n  for (const x of xs) total += x;\n  return total;\n}',
      'typescript',
      'f',
      [],
      [[1, 2]],
      50,
    );
    expect(trace.returned).toBe(3);
    expect(trace.steps.map((s) => s.line)).toEqual([2, 3, 3, 3, 4]);
  });

  it('snapshots tree variables by identity, so the node a variable points at is found in the tree', () => {
    const trace = traceJs(DIAMETER, 'javascript', 'diameterOfBinaryTree', ['tree'], [[1, 2, 3]], 200);
    expect(trace.returned).toBe(2);
    const root = trace.steps[0].vars['root'] as TreeSnap;
    expect(root).toMatchObject({ kind: 'tree', clipped: false, nodes: [{ val: 1 }, { val: 2 }, { val: 3 }] });
    const atTwo = trace.steps.find((s) => (s.vars['node'] as TreeSnap | null)?.nodes?.[0].val === 2)!;
    expect((atTwo.vars['node'] as TreeSnap).nodes[0].id).toBe(root.nodes[1].id);
  });
});

describe('tree snapshots', () => {
  it("keep at most 63 nodes of a variable's tree, and only the node itself inside a list", () => {
    const root = buildTree(Array.from({ length: 100 }, (_, i) => i));
    const snap = snapshot(root) as TreeSnap;
    expect(snap.nodes).toHaveLength(63);
    expect(snap.clipped).toBe(true);
    expect(describeSnap(snap)).toBe('TreeNode(0)');
    expect(snapshot([root])).toMatchObject({
      kind: 'array',
      items: [{ kind: 'tree', nodes: [{ val: 0, left: 2, right: 3 }], clipped: true }],
    });
  });

  it("stop at a cycle a learner's code made", () => {
    const node: { val: number; left: unknown; right: null } = { val: 1, left: null, right: null };
    node.left = node;
    expect(snapshot(node)).toEqual({ kind: 'tree', nodes: [{ id: 1, val: 1, left: 1, right: null }], clipped: false });
  });
});

describe('turning traces into frames', () => {
  it('draws the input array with index pointers, a window and a stack', () => {
    const code = `function f(nums) {
  const stack = [];
  let lo = 0, hi = nums.length - 1;
  stack.push(nums[lo]);
  return stack;
}`;
    const trace = traceJs(code, 'javascript', 'f', [], [[4, 5, 6]], 50);
    const frames = toFrames(trace, [{ name: 'nums', type: 'int[]' }]);
    const last = frames.at(-2)!;
    expect(last.array).toMatchObject({ values: [4, 5, 6], pointers: { lo: 0, hi: 2 }, window: [0, 2] });
    expect(last.stack).toEqual({ label: 'stack', items: [4] });
    expect(last.vars).toEqual({ lo: 0, hi: 2 });
    expect(frames.at(-1)!.note).toBe('Returned [4]');
    expect(frames[1].note).toBe('stack = []');
  });

  it('draws strings as arrays', () => {
    const frames = toFrames(traceJs('function f(s) {\n  let left = 0, i = 2;\n  return i;\n}', 'javascript', 'f', [], ['abc'], 50), [
      { name: 's', type: 'string' },
    ]);
    expect(frames[1].array).toMatchObject({ values: ['a', 'b', 'c'], pointers: { left: 0, i: 2 } });
  });

  it('draws a char[][] grid as a table: the cell (r, c) points at, and the cells the code changed', () => {
    const trace = traceJs(
      ISLANDS,
      'javascript',
      'numIslands',
      [],
      [
        [
          ['1', '0'],
          ['1', '1'],
        ],
      ],
      500,
    );
    const frames = toFrames(trace, [{ name: 'grid', type: 'char[][]' }]);
    const sunk = frames.find((f) => f.note === 'grid[1][0] = "0"')!;
    expect(sunk.table).toMatchObject({
      cells: [
        ['0', '0'],
        ['0', '1'],
      ],
      active: [1, 0],
      path: [
        [0, 0],
        [1, 0],
      ],
      legend: { active: 'grid[r][c]', path: 'changed by your code' },
    });
    expect(sunk.array).toBeUndefined();
  });

  it('draws a grid parameter as a table under the name the learner gives it', () => {
    const trace = traceJs(
      ISLANDS.replaceAll('grid', 'land'),
      'javascript',
      'numIslands',
      [],
      [
        [
          ['1', '0'],
          ['1', '1'],
        ],
      ],
      500,
    );
    const frames = toFrames(trace, [{ name: 'grid', type: 'char[][]' }]);
    expect(frames.every((f) => f.table && !f.output)).toBe(true);
    expect(frames.find((f) => f.note === 'land[1][0] = "0"')!.table).toMatchObject({ active: [1, 0], legend: { active: 'land[r][c]' } });
  });

  it('keeps a list of pairs such as edges as an array, never as a grid', () => {
    const trace = traceJs(
      'function f(times, n) {\n  let total = 0;\n  for (const [u, v, w] of times) total += w;\n  return total;\n}',
      'javascript',
      'f',
      [],
      [
        [
          [2, 1, 1],
          [2, 3, 1],
        ],
        3,
      ],
      50,
    );
    const frames = toFrames(trace, [
      { name: 'times', type: 'int[][]' },
      { name: 'n', type: 'int' },
    ]);
    expect(frames[0].array!.values).toEqual(['[2, 1, 1]', '[2, 3, 1]']);
    expect(frames.some((f) => f.table)).toBe(false);
  });

  it('gives the output list to a value the code made before an input, such as a list of edges', () => {
    const code =
      'function f(n, edges) {\n  const uf = { parent: [0, 1, 2] };\n  for (const [a, b] of edges) uf.parent[a] = b;\n  return uf.parent[0];\n}';
    const trace = traceJs(code, 'javascript', 'f', [], [3, [[0, 1]]], 50);
    const frames = toFrames(trace, [
      { name: 'n', type: 'int' },
      { name: 'edges', type: 'int[][]' },
    ]);
    expect(frames[0].output!.label).toBe('edges');
    expect(frames.at(-2)!.output).toEqual({ label: 'uf', items: ['{parent: [1, 1, 2]}'] });
  });

  it('draws a DP table the code builds, named like one', () => {
    const code =
      'function f(n) {\n  const dp = [[0, 0], [0, 0]];\n  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) dp[i][j] = i + j;\n  return dp[1][1];\n}';
    const frames = toFrames(traceJs(code, 'javascript', 'f', [], [2], 100), [{ name: 'n', type: 'int' }]);
    expect(frames.at(-2)!.table).toMatchObject({
      cells: [
        [0, 1],
        [1, 2],
      ],
      legend: { active: 'dp[i][j]' },
    });
  });

  it('draws a 2D local as a grid when its name has a grid word, unless it ends in a list word', () => {
    const drawn = (name: string) => {
      const trace = traceJs(`function f() {\n  const ${name} = [[0, 1], [1, 0]];\n  return 0;\n}`, 'javascript', 'f', [], [], 50);
      return !!toFrames(trace, []).at(-2)!.table;
    };
    const grids = ['dpTable', 'DPTable', 'seen', 'visited', 'visitedCells', 'newGrid', 'gridCopy', 'grid2', 'grid2D', 'is_visited', 'DP'];
    const lists = ['seenEdges', 'gridPairs', 'dp_list', 'format', 'pairs'];
    expect([...grids, ...lists].filter(drawn)).toEqual(grids);
  });
});

describe('the call stack of a trace', () => {
  const stack = (trace: TraceOutcome, i: number) => {
    const names: string[] = [];
    for (let c: number | null = trace.steps[i].call; c !== null; c = trace.calls[c].caller) names.unshift(trace.calls[c].name);
    return names.join(' > ');
  };
  const stacks = (trace: TraceOutcome) => [...new Set(trace.steps.map((_, i) => stack(trace, i)))];

  it('records the call each step runs in, with its caller and depth', () => {
    const trace = traceJs(DIAMETER, 'javascript', 'diameterOfBinaryTree', ['tree'], [[1, 2]], 500);
    expect(trace.calls[0]).toEqual({ name: 'diameterOfBinaryTree', params: ['root'], caller: null, depth: 1 });
    expect(stacks(trace)).toEqual([
      'diameterOfBinaryTree',
      'diameterOfBinaryTree > height',
      'diameterOfBinaryTree > height > height',
      'diameterOfBinaryTree > height > height > height',
    ]);
    expect(stack(trace, trace.steps.length - 1)).toBe('diameterOfBinaryTree');
  });

  it('names callbacks after the call they are passed to, and constructors after their class', () => {
    const code = `class Box {
  constructor(n: number) {
    this.n = n;
  }
  n: number;
  twice(): number {
    return 2 * this.n;
  }
}
function f(nums: number[]): number {
  const boxes = nums.map((n) => new Box(n));
  boxes.sort((a, b) => a.n - b.n);
  return boxes[0].twice();
}`;
    const trace = traceJs(code, 'typescript', 'f', [], [[2, 1]], 100);
    expect(stacks(trace)).toEqual([
      'f',
      'f > nums.map callback',
      'f > nums.map callback > new Box',
      'f > boxes.sort callback',
      'f > twice',
    ]);
  });

  it('leaves a function stored under a computed key anonymous, as a stack trace does', () => {
    const code =
      "function f() {\n  const o = {};\n  const k = 'x';\n  o[k] = function () {\n    return 1;\n  };\n  o.y = () => 2;\n  return o.x() + o.y();\n}";
    expect(stacks(traceJs(code, 'javascript', 'f', [], [], 50))).toEqual(['f', 'f > (anonymous)', 'f > y']);
  });

  it('takes a paused generator or async function off the stack until it runs again', () => {
    const code = `function* inorder(node) {
  if (!node) return;
  yield* inorder(node.left);
  yield node.val;
  yield* inorder(node.right);
}
function id(x) {
  return x;
}
async function later(x) {
  await null;
  return x;
}
function f(root) {
  const it = inorder(root);
  const first = id(it.next().value);
  later(first);
  const second = id(it.next().value);
  return first + second;
}`;
    const trace = traceJs(code, 'javascript', 'f', ['tree'], [[2, 1]], 200);
    expect(trace.returned).toBe(3);
    expect(stacks(trace)).toEqual(['f', 'f > inorder', 'f > inorder > inorder', 'f > inorder > inorder > inorder', 'f > id', 'f > later']);
    expect(trace.steps.filter((_, i) => stack(trace, i) === 'f > id')).toHaveLength(2);
  });

  it('resumes a generator on the call that resumes it, not on a paused call that started it', () => {
    const code = `function* count() {
  yield 1;
  yield 2;
}
async function start(it) {
  it.next();
  await null;
}
function id(x) {
  return x;
}
function f() {
  const it = count();
  start(it);
  return id(it.next().value);
}`;
    const trace = traceJs(code, 'javascript', 'f', [], [], 100);
    expect(trace.returned).toBe(2);
    expect(stacks(trace)).toEqual(['f', 'f > start', 'f > start > count', 'f > count', 'f > id']);
  });

  it('nests a call in the rest of a resumed yield under the generator', () => {
    const code = `function helper(x) {
  return x;
}
function* g() {
  helper(yield 1);
}
function f() {
  const it = g();
  it.next();
  it.next(5);
  return 0;
}`;
    expect(stacks(traceJs(code, 'javascript', 'f', [], [], 100))).toEqual(['f', 'f > g', 'f > g > helper']);
  });

  it('keeps a generator the same call, with its tree argument on the stack, when the same call resumes it', () => {
    const code = `function* inorder(node) {
  if (!node) return;
  yield* inorder(node.left);
  yield node.val;
  yield* inorder(node.right);
}
function f(root) {
  const out = [];
  for (const v of inorder(root)) out.push(v);
  return out;
}`;
    const trace = traceJs(code, 'javascript', 'f', ['tree'], [[2, 1, 3]], 200);
    const frames = toFrames(trace, [{ name: 'root', type: 'tree' }]);
    expect(trace.calls.filter((c) => c.name === 'inorder')).toHaveLength(7);
    const resumed = frames.filter((f) => f.note === 'Back in inorder(TreeNode(3))').at(-1)!;
    expect(resumed.calls!.items).toEqual(['f(TreeNode(2))', 'inorder(TreeNode(2))', 'inorder(TreeNode(3))']);
    expect(resumed.tree!.nodes.find((n) => n.label === '2')!.state).toBe('frontier');
  });

  it('leaves the stack right when an exception unwinds through calls', () => {
    const code =
      'function g(n) {\n  if (n === 0) throw new Error("x");\n  return g(n - 1);\n}\nfunction f() {\n  try {\n    g(2);\n  } catch {\n    return -1;\n  }\n}';
    const trace = traceJs(code, 'javascript', 'f', [], [], 100);
    expect(trace.returned).toBe(-1);
    expect(stack(trace, trace.steps.length - 1)).toBe('f');
  });

  it('does not trace code that runs while the solution loads', () => {
    const trace = traceJs('enum Dir { Up, Down }\nfunction f(): number {\n  return Dir.Down;\n}', 'typescript', 'f', [], [], 50);
    expect(trace.steps).toEqual([{ line: 3, vars: {}, call: 0 }]);
  });

  it('shows up to six calls, the running one on top, and counts the rest', () => {
    const trace = traceJs('function f(n) {\n  return n === 0 ? 0 : f(n - 1);\n}', 'javascript', 'f', [], [9], 100);
    const frames = toFrames(trace, [{ name: 'n', type: 'int' }]);
    expect(frames[0].calls).toEqual({ items: ['f(9)'], more: 0 });
    expect(frames.at(-2)!.calls).toEqual({ items: ['f(5)', 'f(4)', 'f(3)', 'f(2)', 'f(1)', 'f(0)'], more: 4 });
    expect(frames.at(-1)!.calls).toEqual({ items: [], more: 0 });
    expect(frames[1].note).toBe('Called f(8)');
  });

  it('narrates a return by naming the call the trace is back in', () => {
    const trace = traceJs(
      'function f(n) {\n  const x = g(n);\n  return x;\n}\nfunction g(n) {\n  return n + 1;\n}',
      'javascript',
      'f',
      [],
      [1],
      50,
    );
    expect(toFrames(trace, []).map((f) => f.note)).toEqual(['Called with n = 1', 'Called g(1)', 'Back in f(1) · x = 2', 'Returned 2']);
  });

  it('has no call stack when nothing is called beyond the entry function', () => {
    const trace = traceJs(BINARY_SEARCH, 'javascript', 'search', [], [[1, 3], 3], 100);
    expect(toFrames(trace, []).some((f) => f.calls)).toBe(false);
  });
});

describe('Python errors', () => {
  it('keeps only the learner frames of a traceback', () => {
    const error = new Error(`Traceback (most recent call last):
  File "/lib/python314.zip/_pyodide/_base.py", line 597, in eval_code
    .run(globals, locals)
     ^^^^^^^^^^^^^^^^^^^^
  File "harness.py", line 10, in __grasp_call
    return __grasp_json.dumps(two_sum(*args))
  File "solution.py", line 3, in two_sum
    return nums[10]
           ~~~~^^^^
IndexError: list index out of range`);
    expect(pythonError(error)).toEqual({
      message:
        'Traceback (most recent call last):\n  File "solution.py", line 3, in two_sum\n    return nums[10]\n           ~~~~^^^^\nIndexError: list index out of range',
      location: { line: 3 },
    });
    expect(pythonError(new Error('Traceback...\nNameError: boom'))).toEqual({ message: 'NameError: boom', location: undefined });
  });

  it('knows the error that killed the interpreter, and keeps the crash dump out of the log', () => {
    const fatal = Object.assign(new RangeError('Maximum call stack size exceeded'), { pyodide_fatal_error: true });
    expect([fatal, new Error('Pyodide already fatally failed and can no longer be used.'), new Error('boom')].map(isFatal)).toEqual([
      true,
      true,
      false,
    ]);
    const crash = pythonCrash(fatal, [
      'building',
      'Stack (most recent call first):',
      '  File "solution.py", line 8 in <module>',
      '  File "/lib/python314.zip/_pyodide/_base.py", line 366 in run',
    ]);
    expect(crash.logs).toEqual(['building']);
    expect(crash.error.location).toEqual({ line: 8 });
    expect(crash.error.message).toContain('functools.cache or functools.lru_cache');
    expect(crash.error.message).toContain('dict memo or a bottom-up table');
    expect(crash.error.message).toContain('Python restarts on your next run');
  });
});
