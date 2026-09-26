/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mulberry32, randInt } from '../algorithms/random.js';
import { CODING_PROBLEMS } from './problems/index.js';
import { randomTree } from './problems/inputs.js';
import { PYTHON_REFERENCE } from './python-reference.fixture.js';
import { PYTHON_PRELUDE, buildSuite, entryName, outputsMatch, paramTypes, preview, pythonHarness } from './suite.js';
import type { LevelOrder } from './tree.js';

const hasPython = spawnSync('python3', ['--version']).status === 0;

describe.runIf(hasPython)('Python harness (CPython)', () => {
  it.each(CODING_PROBLEMS.map((p) => [p.id, p] as const))('%s: the Python reference passes the full suite', (_id, problem) => {
    const suite = buildSuite(problem, { seed: 9 });
    const script = `${PYTHON_PRELUDE}\n${PYTHON_REFERENCE[problem.id]}\n${pythonHarness(entryName(problem, 'python'), paramTypes(problem))}
import sys, json
for line in sys.stdin:
    print(__grasp_call(line))
`;
    const run = spawnSync('python3', ['-c', script], {
      input: suite.map((t) => JSON.stringify(t.args)).join('\n'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    expect(run.stderr).toBe('');
    const outputs = run.stdout
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    suite.forEach((t, i) =>
      expect(outputsMatch(t.expected, outputs[i], problem.compare), `${problem.id} #${i} ${preview(t.args)}`).toBe(true),
    );
  });

  it('builds the same trees as buildTree, with TreeNode and Optional in scope for annotations', () => {
    const rand = mulberry32(5);
    const trees: LevelOrder[] = [
      [],
      [1],
      [1, null, 2],
      [1, 2, null, 3, null, 4],
      ...Array.from({ length: 40 }, () => randomTree(rand, randInt(rand, 1, 20), -9, 9)),
    ];
    const script = `${PYTHON_PRELUDE}
def echo(root: Optional[TreeNode], k: int) -> list:
    values, queue = [], [root]
    for node in queue:
        values.append(node.val if node else None)
        if node:
            queue += [node.left, node.right]
    while values and values[-1] is None:
        values.pop()
    return values + [k]
${pythonHarness('echo', ['tree', 'int'])}
import sys
for line in sys.stdin:
    print(__grasp_call(line))
`;
    const run = spawnSync('python3', ['-c', script], { input: trees.map((t, k) => JSON.stringify([t, k])).join('\n'), encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(
      run.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual(trees.map((t, k) => [...t, k]));
  });
});
