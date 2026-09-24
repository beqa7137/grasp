import { describe, expect, it } from 'vitest';
import { codeSpans } from '../code-spans.js';
import { ALGORITHMS, getAlgorithm } from './index.js';
import { formatField, mulberry32, parseField } from './input.js';
import { InputError, type Frame } from './types.js';

const EM_DASH = '\u2014';
// A walled-off goal, a cycle with no free node or an isolated source can end these before there is anything to predict.
const MAY_ASK_NOTHING = new Set(['grid-bfs', 'topo-sort', 'dijkstra']);
// A code span never wraps, so a longer one would overflow a phone-width line.
const MAX_CODE_SPAN = 24;

/** Every way a learner text would render badly: backticks mark code spans, so they must pair up. */
const textProblems = (field: string, text: string) =>
  [
    text.includes('\u00a0') && 'a non-breaking space',
    codeSpans(text).some((part) => part.text.includes('`')) && 'an unbalanced backtick',
    ...codeSpans(text).map(
      ({ text: span, code }) => code && span.length > MAX_CODE_SPAN && `a code span over ${MAX_CODE_SPAN} characters: ${span}`,
    ),
  ].flatMap((problem) => (problem ? [`${field} has ${problem}`] : []));

/** Every way a trace breaks the frame contract, so a single expect per trace reports them all. */
const frameProblems = (frames: Frame[], lines: number) =>
  frames.flatMap((f, k) => {
    const p = f.predict;
    return [
      (f.line < 1 || f.line > lines) && `line ${f.line} is outside the code`,
      !f.note && 'empty note',
      p && k === frames.length - 1 && 'the last frame asks a prediction',
      p && (p.choices.length < 2 || p.choices.length > 4) && `${p.choices.length} choices`,
      p && new Set(p.choices).size !== p.choices.length && 'repeated choices',
      p && !(p.answer >= 0 && p.answer < p.choices.length) && `answer ${p.answer} is not a choice`,
      p && (p.prompt.length <= 10 || p.explain.length <= 10) && 'prompt or explain too short',
      ...textProblems('note', f.note),
      ...(p ? [...textProblems('prompt', p.prompt), ...textProblems('explain', p.explain)] : []),
    ].flatMap((problem) => (problem ? [`frame ${k}: ${problem}`] : []));
  });

const reference: Record<string, (input: any) => unknown> = {
  'kth-largest': ({ nums, k }) => [...nums].sort((a: number, b: number) => b - a)[k - 1],
  lcs: ({ a, b }) => {
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    return dp[a.length][b.length];
  },
  'union-find': ({ n, edges }) => {
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const [a, b] of edges) {
      adj[a].push(b);
      adj[b].push(a);
    }
    const seen = new Set<number>();
    let count = 0;
    for (let s = 0; s < n; s++) {
      if (seen.has(s)) continue;
      count++;
      const stack = [s];
      seen.add(s);
      while (stack.length)
        for (const v of adj[stack.pop()!])
          if (!seen.has(v)) {
            seen.add(v);
            stack.push(v);
          }
    }
    return count;
  },
  'topo-sort': ({ n, edges }) => {
    const color = Array(n).fill(0);
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const [u, v] of edges) adj[u].push(v);
    const cyclic = (u: number): boolean => {
      color[u] = 1;
      for (const v of adj[u]) if (color[v] === 1 || (color[v] === 0 && cyclic(v))) return true;
      color[u] = 2;
      return false;
    };
    return [...Array(n).keys()].some((u) => color[u] === 0 && cyclic(u)) ? 'cycle' : 'acyclic';
  },
  trie: ({ words, query }) => words.includes(query),
  dijkstra: ({ n, edges, source }) => {
    const dist = Array(n).fill(Infinity);
    dist[source] = 0;
    for (let round = 0; round < n; round++)
      for (const [a, b, w] of edges) {
        if (dist[a] + w < dist[b]) dist[b] = dist[a] + w;
        if (dist[b] + w < dist[a]) dist[a] = dist[b] + w;
      }
    return `[${dist.map((d) => (d === Infinity ? '∞' : d)).join(', ')}]`;
  },
  'binary-search': ({ nums, target }) => {
    const i = nums.indexOf(target);
    return i;
  },
  'pair-sum-sorted': ({ nums, target }) => {
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === target) return true;
    return false;
  },
  'longest-unique-substring': ({ s }) => {
    let best = 0;
    for (let i = 0; i < s.length; i++) {
      const seen = new Set<string>();
      for (let j = i; j < s.length && !seen.has(s[j]); j++) {
        seen.add(s[j]);
        best = Math.max(best, j - i + 1);
      }
    }
    return best;
  },
  'next-greater-element': ({ nums }) =>
    `[${nums.map((x: number, i: number) => nums.slice(i + 1).find((y: number) => y > x) ?? -1).join(', ')}]`,
  'grid-bfs': ({ grid }) => {
    const rows = grid.length;
    const cols = grid[0].length;
    const dist = new Map<string, number>();
    let start = '';
    let goal = '';
    grid.forEach((row: string, r: number) =>
      [...row].forEach((ch, c) => {
        if (ch === 'S') start = `${r},${c}`;
        if (ch === 'G') goal = `${r},${c}`;
      }),
    );
    const q = [start];
    dist.set(start, 0);
    while (q.length) {
      const k = q.shift()!;
      const [r, c] = k.split(',').map(Number);
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nr = r + dr;
        const nc = c + dc;
        const nk = `${nr},${nc}`;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || grid[nr][nc] === '#' || dist.has(nk)) continue;
        dist.set(nk, dist.get(k)! + 1);
        q.push(nk);
      }
    }
    return dist.get(goal) ?? -1;
  },
  // Walks the number line in half steps instead of sorting, so [1, 3] and [3, 5] join while [1, 3] and [4, 5] stay apart.
  'merge-intervals': ({ intervals }) => {
    const covered = (x: number) => intervals.some(([s, e]: number[]) => s <= x && x <= e);
    const merged: string[] = [];
    for (let x = 0; x <= 99; x += 0.5)
      if (covered(x) && !covered(x - 0.5)) {
        let end = x;
        while (covered(end + 0.5)) end += 0.5;
        merged.push(`[${x}, ${end}]`);
      }
    return `[${merged.join(', ')}]`;
  },
  'subsets-backtracking': ({ nums }) => {
    const all = (rest: number[]): number[][] => {
      if (rest.length === 0) return [[]];
      const tail = all(rest.slice(1));
      return [...tail.map((subset) => [rest[0], ...subset]), ...tail];
    };
    return `[${all(nums)
      .map((subset) => `[${subset.join(', ')}]`)
      .join(', ')}]`;
  },
  // The first value inserted is the root, and the smaller and larger values form its subtrees in the same relative order.
  'tree-traversal': ({ values, order }) => {
    const walk = (vals: number[]): number[] => {
      if (!vals.length) return [];
      const [root, ...rest] = vals;
      const left = walk(rest.filter((v) => v < root));
      const right = walk(rest.filter((v) => v > root));
      return order === 'preorder' ? [root, ...left, ...right] : order === 'inorder' ? [...left, root, ...right] : [...left, ...right, root];
    };
    return `[${walk(values).join(', ')}]`;
  },
  'jump-game': ({ nums }) => {
    const reachable = nums.map((_: number, i: number) => i === 0);
    for (let i = 0; i < nums.length; i++)
      if (reachable[i]) for (let j = i + 1; j <= Math.min(i + nums[i], nums.length - 1); j++) reachable[j] = true;
    return reachable[nums.length - 1];
  },
  'single-number-xor': ({ nums }) => nums.reduce((x: number, n: number) => x ^ n, 0),
  // The smallest i that completes a pair wins, and seen keeps the newest index of a repeated value, so j counts down from i - 1.
  'two-sum-hash': ({ nums, target }) => {
    for (let i = 0; i < nums.length; i++) for (let j = i - 1; j >= 0; j--) if (nums[j] + nums[i] === target) return `[${j}, ${i}]`;
    return '[]';
  },
  'subarray-sum-prefix': ({ nums, k }) => {
    let count = 0;
    for (let i = 0; i < nums.length; i++)
      for (let j = i, sum = 0; j < nums.length; j++) {
        sum += nums[j];
        if (sum === k) count++;
      }
    return count;
  },
  'linked-list-cycle': ({ values, pos }) => {
    const next = (node: number) => (node + 1 < values.length ? node + 1 : pos >= 0 ? pos : null);
    const seen = new Set<number>();
    for (let node: number | null = 0; node !== null; node = next(node)) {
      if (seen.has(node)) return true;
      seen.add(node);
    }
    return false;
  },
  // Tries every set of houses as a bitmask and keeps the richest one with no two neighbours.
  'house-robber': ({ nums }) => {
    const loot = (mask: number) => nums.reduce((sum: number, x: number, k: number) => ((mask >> k) & 1 ? sum + x : sum), 0);
    let best = 0;
    for (let mask = 0; mask < 1 << nums.length; mask++) if ((mask & (mask << 1)) === 0) best = Math.max(best, loot(mask));
    return best;
  },
};

describe.each(ALGORITHMS.map((a) => [a.id, a] as const))('%s', (id, algo) => {
  const check = (input: any) => {
    const frames = algo.trace(algo.validate(input));
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.length).toBeLessThan(600);
    expect(frameProblems(frames, algo.code.length)).toEqual([]);
    const result = frames[frames.length - 1].vars['result'];
    const expected = reference[id](algo.validate(input));
    if (id === 'pair-sum-sorted') {
      expect(result !== null).toBe(expected);
      if (result !== null) {
        const [l, r] = JSON.parse(String(result));
        const { nums, target } = algo.validate(input) as any;
        expect(nums[l] + nums[r]).toBe(target);
      }
    } else if (id === 'topo-sort') {
      const { n, edges } = algo.validate(input) as any;
      if (expected === 'cycle') expect(result).toBe('cycle');
      else {
        const order = String(result).split(' → ').map(Number);
        expect([...order].sort((x, y) => x - y)).toEqual([...Array(n).keys()]);
        for (const [u, v] of edges) expect(order.indexOf(u)).toBeLessThan(order.indexOf(v));
      }
    } else if (id === 'binary-search' && result !== -1) {
      const { nums, target } = algo.validate(input) as any;
      expect(nums[result as number]).toBe(target);
    } else {
      expect(result).toEqual(expected);
    }
    return frames;
  };

  it('writes a summary the player can render', () => {
    expect(textProblems('summary', algo.summary)).toEqual([]);
  });

  it('traces the default input correctly and asks at least one prediction', () => {
    const frames = check(algo.defaultInput);
    expect(frames.some((f) => f.predict)).toBe(true);
  });

  it('matches a reference implementation on 300 random inputs, with well-formed frames that ask a prediction', () => {
    const rand = mulberry32(id.length * 7919);
    for (let i = 0; i < 300; i++) {
      const frames = check(algo.randomInput(rand));
      if (!MAY_ASK_NOTHING.has(id)) expect(frames.some((f) => f.predict)).toBe(true);
    }
  });

  it('never shows an em dash', () => {
    const rand = mulberry32(id.length);
    const traces = [algo.defaultInput, ...Array.from({ length: 20 }, () => algo.randomInput(rand))].map((input) =>
      algo.trace(algo.validate(input)),
    );
    expect(JSON.stringify([algo, traces])).not.toContain(EM_DASH);
  });

  it('emits frames that survive a JSON round-trip', () => {
    const rand = mulberry32(id.length);
    for (const input of [algo.defaultInput, ...Array.from({ length: 20 }, () => algo.randomInput(rand))]) {
      const frames = algo.trace(algo.validate(input));
      expect(JSON.parse(JSON.stringify(frames))).toEqual(frames);
    }
  });

  it('gives the same input and trace for the same seed', () => {
    const run = () => {
      const input = algo.randomInput(mulberry32(99));
      return [input, algo.trace(algo.validate(input))];
    };
    expect(run()).toEqual(run());
  });

  it('keeps the default input through the text the input fields show', () => {
    const drafts = algo.fields.map((f) => [f.key, parseField(f.kind, formatField(f.kind, algo.defaultInput[f.key]))]);
    expect(algo.validate(Object.fromEntries(drafts))).toEqual(algo.defaultInput);
  });

  it('is exposed through the registry', () => {
    expect(getAlgorithm(id)).toBe(algo);
  });
});

describe('input validation', () => {
  it('rejects bad inputs with InputError', () => {
    expect(() => getAlgorithm('binary-search')!.validate({ nums: 'a,b', target: 1 })).toThrow(InputError);
    expect(() => getAlgorithm('grid-bfs')!.validate({ grid: ['S..', '..'] })).toThrow(InputError);
    expect(() => getAlgorithm('longest-unique-substring')!.validate({ s: '' })).toThrow(InputError);
    expect(() => getAlgorithm('longest-unique-substring')!.validate({ s: 'a`bc`d' })).toThrow(
      new InputError('s cannot contain a backtick'),
    );
  });

  it('sorts inputs that must be sorted', () => {
    expect(getAlgorithm('binary-search')!.validate({ nums: '9, 1, 5', target: 5 })).toEqual({ nums: [1, 5, 9], target: 5 });
  });
});
