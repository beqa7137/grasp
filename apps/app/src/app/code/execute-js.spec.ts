import { buildTree } from '@grasp/engine';
import { CompileError, compileJs, runJsTest, traceJs, type LogSink } from './execute-js';
import { pythonError } from './python-errors';
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
    expect(trace.steps[0]).toEqual({ line: 2, vars: { nums: { kind: 'array', items: [1, 3, 5, 7, 9], truncated: 0 }, target: 7 } });
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
    const frames = toFrames(trace.steps, { primary: 'nums', returned: trace.returned });
    const last = frames.at(-2)!;
    expect(last.array).toMatchObject({ values: [4, 5, 6], pointers: { lo: 0, hi: 2 }, window: [0, 2] });
    expect(last.stack).toEqual({ label: 'stack', items: [4] });
    expect(last.vars).toEqual({ lo: 0, hi: 2 });
    expect(frames.at(-1)!.note).toBe('Returned [4]');
    expect(frames[1].note).toBe('stack = []');
  });

  it('draws strings as arrays and grids of 0/1 as maps with the current cell', () => {
    const frames = toFrames(
      [
        { line: 2, vars: { s: 'abc', left: 0, i: 2 } },
        {
          line: 3,
          vars: {
            grid: {
              kind: 'array',
              truncated: 0,
              items: [
                { kind: 'array', truncated: 0, items: ['1', '0'] },
                { kind: 'array', truncated: 0, items: ['0', '1'] },
              ],
            },
            r: 1,
            c: 1,
          },
        },
      ],
      { primary: 's' },
    );
    expect(frames[0].array).toMatchObject({ values: ['a', 'b', 'c'], pointers: { left: 0, i: 2 } });
    expect(frames[1].grid!.cells).toEqual([
      ['path', 'open'],
      ['open', 'current'],
    ]);
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
});
