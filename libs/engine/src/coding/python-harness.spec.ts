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
  it('allows plain recursive solutions deeper than Python defaults to', () => {
    const script = `${PYTHON_PRELUDE}
def descend(n):
    return 0 if n == 0 else 1 + descend(n - 1)
print(descend(3000))`;
    const run = spawnSync('python3', ['-c', script], { encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.stdout.trim()).toBe('3000');
  });

  it.each(CODING_PROBLEMS.map((p) => [p.id, p] as const))('%s: the Python reference passes the full suite', (_id, problem) => {
    const suite = buildSuite(problem, { seed: 9 });
    const script = `${PYTHON_PRELUDE}\n${PYTHON_REFERENCE[problem.id]}\n${pythonHarness(entryName(problem, 'python'), paramTypes(problem), problem.returns)}
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
${pythonHarness('echo', ['tree', 'int'], 'int[]')}
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

  it('builds lists as ListNodes, reads a returned list as its values, and reports one that loops or is not a list', () => {
    const script = `${PYTHON_PRELUDE}
def echo(head: Optional[ListNode], mode: str) -> Optional[ListNode]:
    if mode == "loop":
        head.next.next = head
    if mode == "array":
        return [1, 2]
    if mode == "number":
        return 7
    if mode == "bad link":
        head.next = 5
    return head
${pythonHarness('echo', ['list', 'string'], 'list')}
import sys, json
for line in sys.stdin:
    try:
        print(__grasp_call(line))
    except (ValueError, TypeError) as error:
        print(json.dumps(str(error)))
`;
    const inputs = [
      [[], ''],
      [[1, 2, 3], ''],
      [[4, 5, 6], 'loop'],
      [[1, 2], 'array'],
      [[1, 2], 'number'],
      [[1, 2], 'bad link'],
    ];
    const run = spawnSync('python3', ['-c', script], { input: inputs.map((args) => JSON.stringify(args)).join('\n'), encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(
      run.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual([
      [],
      [1, 2, 3],
      'The returned list loops: after 2 nodes it comes back to a node with value 4.',
      'Return the head ListNode (or null/None), not an array.',
      'Return the head ListNode (or null/None), not a value of type int.',
      'A next link must be a ListNode or null/None, not a value of type int.',
    ]);
  });

  // CPython frees a long chain without trouble, but browser Python overflows its stack, so every node must be unlinked.
  it("unlinks every ListNode a call made, inputs and the learner's own copies alike, even one never returned", () => {
    const script = `${PYTHON_PRELUDE}
kept = []

def is_palindrome(head: Optional[ListNode]) -> bool:
    rev, node = None, head
    while node:
        rev = ListNode(node.val, rev)
        kept.append(rev)
        node = node.next
    kept.append(head)
    while head:
        if head.val != rev.val:
            return False
        head, rev = head.next, rev.next
    return True
${pythonHarness('is_palindrome', ['list'], 'bool')}
import sys, json
for line in sys.stdin:
    print(__grasp_call(line))
print(json.dumps([len(kept), all(node.next is None for node in kept), len(_grasp_made)]))
`;
    const inputs = [[[1, 2, 2, 1]], [[1, 2, 3]], [[5]]];
    const run = spawnSync('python3', ['-c', script], { input: inputs.map((args) => JSON.stringify(args)).join('\n'), encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(
      run.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual([true, false, true, [11, true, 0]]);
  });
});
