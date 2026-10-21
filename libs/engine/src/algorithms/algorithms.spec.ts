import { describe, expect, it } from 'vitest';
import { codeSpanProblems } from '../code-spans.js';
import { rotatedChoices } from './choices.js';
import { ALGORITHMS, getAlgorithm } from './index.js';
import { formatField, parseField } from './input.js';
import { mulberry32 } from './random.js';
import { InputError, type AlgorithmDef, type Frame } from './types.js';

// A walled-off goal, a cycle with no free node or an isolated source can end these before there is anything to predict.
const MAY_ASK_NOTHING = new Set(['grid-bfs', 'topo-sort', 'dijkstra']);
const SWEEP = 300;
const MIN_INPUTS_ASKED = 30;
const MAX_SLOT_SHARE = 0.6;

/** The seeded random inputs every tracer is checked on. */
const sweepInputs = (algo: AlgorithmDef) => {
  const rand = mulberry32(algo.id.length * 7919);
  return Array.from({ length: SWEEP }, () => algo.randomInput(rand));
};

/** The code-span problems, plus a non-breaking space, which stops a line wrapping on a narrow screen. */
const textProblems = (field: string, text: string) =>
  [...(text.includes('\u00a0') ? ['a non-breaking space'] : []), ...codeSpanProblems(text)].map((problem) => `${field} has ${problem}`);

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
      ...(f.caption ? textProblems('caption', f.caption) : []),
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
  // Tries every set of n - 1 edges and keeps the lightest one that reaches every node.
  'kruskal-mst': ({ n, edges }) => {
    let best = -1;
    for (let mask = 0; mask < 1 << edges.length; mask++) {
      const picked = edges.filter((_: number[], i: number) => (mask >> i) & 1);
      if (picked.length !== n - 1) continue;
      const reached = new Set([0]);
      for (let grew = true; grew;) {
        grew = false;
        for (const [a, b] of picked)
          if (reached.has(a) !== reached.has(b)) {
            reached.add(a).add(b);
            grew = true;
          }
      }
      const weight = picked.reduce((sum: number, [, , w]: number[]) => sum + w, 0);
      if (reached.size === n && (best < 0 || weight < best)) best = weight;
    }
    return best;
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
  'linked-list-reversal': ({ values, left, right }) =>
    `[${[...values.slice(0, left - 1), ...values.slice(left - 1, right).reverse(), ...values.slice(right)].join(', ')}]`,
  // Tries every set of houses as a bitmask and keeps the richest one with no two neighbours.
  'house-robber': ({ nums }) => {
    const loot = (mask: number) => nums.reduce((sum: number, x: number, k: number) => ((mask >> k) & 1 ? sum + x : sum), 0);
    let best = 0;
    for (let mask = 0; mask < 1 << nums.length; mask++) if ((mask & (mask << 1)) === 0) best = Math.max(best, loot(mask));
    return best;
  },
  // Tries every order of nums2 against nums1 and keeps the smallest XOR sum.
  'minimum-xor-sum': ({ nums1, nums2 }) => {
    const orders = (rest: number[]): number[][] =>
      rest.length ? rest.flatMap((x, k) => orders([...rest.slice(0, k), ...rest.slice(k + 1)]).map((order) => [x, ...order])) : [[]];
    return Math.min(...orders(nums2).map((order) => order.reduce((sum, x, i) => sum + (nums1[i] ^ x), 0)));
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

  it('asks each question from an ordered, fixed menu or with its answer placed by rotatedChoices', () => {
    const unplaced = sweepInputs(algo).flatMap((input) =>
      algo.trace(algo.validate(input)).flatMap(({ predict: p }) => {
        if (!p || p.ordered) return [];
        const options = [...p.choices.slice(p.answer), ...p.choices.slice(0, p.answer)];
        const placed = rotatedChoices(p.prompt, options[0], options.slice(1));
        return placed.choices.join('\n') === p.choices.join('\n') ? [] : [p.prompt];
      }),
    );
    expect(unplaced).toEqual([]);
  });

  it('flags only a real fixed menu as ordered: the line that asks it offers the same choices whatever the input', () => {
    const menus = new Map<number, Set<string>>();
    for (const input of sweepInputs(algo)) {
      for (const { line, predict: p } of algo.trace(algo.validate(input))) {
        if (p?.ordered) menus.set(line, (menus.get(line) ?? new Set()).add(p.choices.join(' / ')));
      }
    }
    const varying = [...menus].filter(([, seen]) => seen.size > 1).map(([line, seen]) => `line ${line}: ${[...seen].join(' | ')}`);
    expect(varying).toEqual([]);
  });

  it(`matches a reference implementation on ${SWEEP} random inputs, with well-formed frames that ask a prediction`, () => {
    for (const input of sweepInputs(algo)) {
      const frames = check(input);
      if (!MAY_ASK_NOTHING.has(id)) expect(frames.some((f) => f.predict)).toBe(true);
    }
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

describe('answer slots', () => {
  it(`never puts the first rotated multi-choice answer in one slot on more than ${MAX_SLOT_SHARE * 100}% of the random inputs`, () => {
    const crowded = ALGORITHMS.flatMap((algo) => {
      // A fixed menu, like pair sum's l++ / r--, gives each answer its own slot, so there the slot follows the data.
      const firstQuestions = sweepInputs(algo).flatMap((input) => {
        const first = algo.trace(algo.validate(input)).find((f) => f.predict && !f.predict.ordered && f.predict.choices.length >= 3);
        return first ? [first.predict!] : [];
      });
      if (firstQuestions.length < MIN_INPUTS_ASKED) return [];
      const worst = Math.max(...[0, 1, 2, 3].map((slot) => firstQuestions.filter((p) => p.answer === slot).length)) / firstQuestions.length;
      return worst > MAX_SLOT_SHARE ? [`${algo.id}: ${Math.round(worst * 100)}% in one slot`] : [];
    });
    expect(crowded).toEqual([]);
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
