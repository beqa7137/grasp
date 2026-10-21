import { describe, expect, it } from 'vitest';
import { ALGORITHMS } from '../algorithms/index.js';
import { mulberry32 } from '../algorithms/random.js';
import type { AlgorithmDef, CellPick, Frame, Locator, Prediction } from '../algorithms/types.js';
import { ALGORITHM_ITEMS } from '../review/algorithm-items.js';
import { REVIEW_ITEMS } from '../review/items.js';
import { CHECKPOINT_CAP, choiceForCells, choiceForValue, isValueEntry, pickCheckpoints, pickLabel } from './checkpoints.js';

const ask = (skill: string, tier?: 1 | 2 | 3): Pick<Frame, 'predict'> => ({
  predict: { prompt: 'p', choices: ['a', 'b'], answer: 0, explain: 'e', skill, ...(tier ? { tier } : {}) },
});
const still: Pick<Frame, 'predict'> = {};
const run = (length: number, asks: Record<number, Pick<Frame, 'predict'>>) => Array.from({ length }, (_, i) => asks[i] ?? still);

function inputsOf(algo: AlgorithmDef, randoms: number) {
  const rand = mulberry32(2020);
  return [algo.defaultInput, ...algo.presets.map((p) => p.input), ...Array.from({ length: randoms }, () => algo.randomInput(rand))];
}

/**
 * Over each tracer's default input, its presets and 100 random inputs from seed 2020, as 81a2ca8 traced them: frames, frames
 * that ask, and the sum of their indices. The player asks fewer, but every frame that asked still asks for review.
 */
const COUNTS: Record<string, [number, number, number]> = {
  'binary-search': [1390, 317, 2411],
  'pair-sum-sorted': [1991, 622, 6818],
  'longest-unique-substring': [4523, 1159, 23089],
  'next-greater-element': [2966, 822, 10664],
  'grid-bfs': [6255, 785, 29094],
  'kth-largest': [2111, 926, 11297],
  lcs: [5392, 1049, 28375],
  'union-find': [2421, 571, 6830],
  'topo-sort': [2106, 630, 6734],
  trie: [4633, 1446, 32036],
  dijkstra: [1921, 669, 5844],
  'kruskal-mst': [2845, 522, 9399],
  'merge-intervals': [2517, 895, 12248],
  'subsets-backtracking': [2992, 465, 4681],
  'tree-traversal': [4526, 385, 6809],
  'jump-game': [2466, 864, 11950],
  'single-number-xor': [2156, 580, 6730],
  'two-sum-hash': [2750, 420, 5672],
  'subarray-sum-prefix': [3299, 907, 13640],
  'linked-list-cycle': [1944, 369, 3885],
  'linked-list-reversal': [2384, 489, 6832],
  'house-robber': [2105, 563, 6215],
  'minimum-xor-sum': [5082, 1136, 31433],
};

/** A hash of the frames 81a2ca8's review drew for each predict item over 30 seeds (line, caption and chapter of each). */
const DRAWS: Record<string, number> = {
  'pred:binary-search': -706422257,
  'pred:pair-sum-sorted': -155093996,
  'pred:longest-unique-substring': 1919047763,
  'pred:next-greater-element': -1911511208,
  'pred:grid-bfs': -853090492,
  'pred:kth-largest': 1778492869,
  'pred:lcs': -1814655144,
  'pred:union-find': -1465007158,
  'pred:topo-sort': -748613992,
  'pred:trie': 1938057224,
  'pred:dijkstra': 614963264,
  'pred:kruskal-mst': -2082561565,
  'pred:merge-intervals': -1682950016,
  'pred:subsets-backtracking': -1923294657,
  'pred:tree-traversal': 1826755442,
  'pred:jump-game': 1307707742,
  'pred:single-number-xor': -753759227,
  'pred:two-sum-hash': -392702893,
  'pred:subarray-sum-prefix': 2011547721,
  'pred:linked-list-cycle': 1816640998,
  'pred:linked-list-reversal': -435065956,
  'pred:house-robber': -190825084,
  'pred:minimum-xor-sum': 1869285487,
};

function inView(frame: Frame, at: Locator): boolean {
  if (at.view === 'array') return typeof at.at === 'number' && at.at >= 0 && at.at < (frame.array?.values.length ?? 0);
  if (at.view === 'grid') {
    const [r, c] = at.at as [number, number];
    return !!frame.grid && r >= 0 && c >= 0 && r < frame.grid.cells.length && c < frame.grid.cells[0].length;
  }
  return false;
}

function checkPick(frame: Frame, p: Prediction, where: string) {
  if (!p.pick) return;
  if (p.pick.on === 'value') {
    for (const c of p.choices) expect(c, `${where}: a value choice`).toMatch(/^(-?\d+|∞)$/);
    expect(choiceForValue(p, p.choices[p.answer]), where).toBe(p.answer);
    return;
  }
  const pick: CellPick = p.pick;
  expect(pick.ask.length, where).toBeGreaterThan(5);
  expect(pick.cells, where).toHaveLength(p.choices.length);
  expect(pick.cells[p.answer].length, `${where}: the answer has cells to tap`).toBeGreaterThan(0);
  const count = pick.count ?? 1;
  for (const [i, cells] of pick.cells.entries()) {
    for (const at of cells) expect(inView(frame, at), `${where}: choice ${i}'s cell is drawn`).toBe(true);
    if (count === 2) expect([0, 2], where).toContain(cells.length);
    if (count === 2 && cells.length) expect(choiceForCells(pick, cells), where).toBe(i);
    if (count === 1) for (const at of cells) expect(choiceForCells(pick, [at]), `${where}: one choice per cell`).toBe(i);
  }
}

describe('pickCheckpoints', () => {
  it('asks the first of each skill, at most five, at least a tenth of the run apart', () => {
    const frames = run(100, {
      2: ask('a'),
      4: ask('a'),
      20: ask('b'),
      21: ask('c'),
      40: ask('a'),
      60: ask('a'),
      80: ask('a'),
      95: ask('a'),
    });
    const chosen = pickCheckpoints(frames);
    expect(chosen.length).toBe(CHECKPOINT_CAP);
    expect(chosen).toContain(2);
    expect(chosen).toContain(20);
    expect(chosen).not.toContain(4);
    expect(chosen.some((at) => at === 21 || at === 20)).toBe(true);
    for (let i = 1; i < chosen.length; i++) expect(chosen[i] - chosen[i - 1]).toBeGreaterThanOrEqual(10);
  });

  it('takes the next ask of a skill whose first is too close to another', () => {
    expect(pickCheckpoints(run(20, { 1: ask('a'), 2: ask('b'), 9: ask('b') }))).toEqual([1, 9]);
  });

  it('escalates by tier, spreading the extra asks over the run', () => {
    const frames = run(100, { 0: ask('a'), 10: ask('a'), 30: ask('a', 3), 50: ask('a'), 90: ask('a') });
    expect(pickCheckpoints(frames)).toEqual([0, 10, 30, 50, 90]);
    const capped = run(100, { 0: ask('a'), 20: ask('a'), 40: ask('a'), 60: ask('a', 3), 70: ask('a'), 80: ask('a'), 99: ask('a') });
    const chosen = pickCheckpoints(capped);
    expect(chosen).toContain(60);
    expect(chosen).toContain(99);
  });

  it('asks a tier-1 ask only when the run has nothing else', () => {
    expect(pickCheckpoints(run(30, { 3: ask('a', 1), 12: ask('b'), 25: ask('a', 1) }))).toEqual([12]);
    expect(pickCheckpoints(run(30, { 3: ask('a', 1), 25: ask('a', 1) }))).toEqual([3]);
    expect(pickCheckpoints(run(30, {}))).toEqual([]);
  });

  it('reads only skill, tier and place, so no answer moves an ask', () => {
    for (const algo of ALGORITHMS as AlgorithmDef[]) {
      for (const input of inputsOf(algo, 20)) {
        const frames = algo.trace(algo.validate(input));
        const scrambled = frames.map((f) =>
          f.predict
            ? { predict: { ...f.predict, answer: (f.predict.answer + 1) % f.predict.choices.length, choices: [], prompt: '' } }
            : {},
        );
        expect(pickCheckpoints(scrambled), algo.id).toEqual(pickCheckpoints(frames));
      }
    }
  });

  it('asks every run of every tracer that has an ask, within the cap and the spacing', () => {
    for (const algo of ALGORITHMS as AlgorithmDef[]) {
      for (const input of inputsOf(algo, 100)) {
        const frames = algo.trace(algo.validate(input));
        const chosen = pickCheckpoints(frames);
        const gap = Math.ceil(frames.length / 10);
        expect(chosen.length > 0, algo.id).toBe(frames.some((f) => f.predict));
        expect(chosen.length, algo.id).toBeLessThanOrEqual(CHECKPOINT_CAP);
        for (const at of chosen) expect(frames[at].predict, algo.id).toBeDefined();
        for (let i = 1; i < chosen.length; i++) expect(chosen[i] - chosen[i - 1], algo.id).toBeGreaterThanOrEqual(gap);
      }
    }
  });
});

describe('asks', () => {
  it('name a skill, and their picks name drawn cells that choose the right choice', () => {
    for (const algo of ALGORITHMS as AlgorithmDef[]) {
      for (const [n, input] of inputsOf(algo, 200).entries()) {
        for (const [at, frame] of algo.trace(algo.validate(input)).entries()) {
          const p = frame.predict;
          if (!p) continue;
          expect(p.skill, algo.id).toMatch(/^[a-z-]+$/);
          checkPick(frame, p, `${algo.id} input ${n} frame ${at}`);
        }
      }
    }
  });

  it('grade a value read as indices by its own cells, never as the answer (Two Sum with nums[j] = i and nums[i] = j)', () => {
    const algo = (ALGORITHMS as AlgorithmDef[]).find((a) => a.id === 'two-sum-hash')!;
    const frames = algo.trace(algo.validate({ nums: [50, 2, 1], target: 3 }));
    const asking = frames.find((f) => f.predict?.pick?.on === 'cell')!;
    const p = asking.predict!;
    expect(p.choices).toContain('[2, 1]');
    checkPick(asking, p, 'two-sum-hash [50, 2, 1]');
    const pick = p.pick as CellPick;
    expect(
      choiceForCells(
        pick,
        [1, 2].map((at): Locator => ({ view: 'array', at })),
      ),
    ).toBe(p.answer);
  });

  // Which asks have a picture, and which tier they take, must never follow the answer: Binary Search once offered the picture
  // only when the answer's side had cells, and LCS's tier dropped one rule.
  it('offer the picture whatever the answer, and the asks a run asks never lean over 90% to one answer of a fixed menu', () => {
    for (const algo of ALGORITHMS as AlgorithmDef[]) {
      const rand = mulberry32(7);
      const picture = new Map<string, Map<string, [number, number]>>();
      const asked = new Map<string, Map<string, number>>();
      for (let n = 0; n < 600; n++) {
        const frames = algo.trace(algo.validate(algo.randomInput(rand)));
        for (const f of frames) {
          const p = f.predict;
          if (!p?.ordered) continue;
          const bySkill = picture.get(p.skill) ?? new Map<string, [number, number]>();
          picture.set(p.skill, bySkill);
          const [withPick, all] = bySkill.get(p.choices[p.answer]) ?? [0, 0];
          bySkill.set(p.choices[p.answer], [withPick + (p.pick ? 1 : 0), all + 1]);
        }
        for (const at of pickCheckpoints(frames)) {
          const p = frames[at].predict!;
          if (!p.ordered) continue;
          const answers = asked.get(p.skill) ?? new Map<string, number>();
          asked.set(p.skill, answers);
          answers.set(p.choices[p.answer], (answers.get(p.choices[p.answer]) ?? 0) + 1);
        }
      }
      // Within one skill, the asks with a picture and those without must each keep a mix of answers, or the picture's
      // presence would tell the answer.
      for (const [skill, byAnswer] of picture) {
        for (const has of [true, false]) {
          const counts = [...byAnswer.values()].map(([withPick, all]) => (has ? withPick : all - withPick));
          const total = counts.reduce((a, b) => a + b, 0);
          if (total >= 20)
            expect(Math.max(...counts) / total, `${algo.id} ${skill}: ${has ? 'with' : 'without'} a picture`).toBeLessThanOrEqual(0.9);
        }
      }
      for (const [skill, answers] of asked) {
        const counts = [...answers.values()];
        const total = counts.reduce((a, b) => a + b, 0);
        if (total >= 20) expect(Math.max(...counts) / total, `${algo.id} ${skill}: one answer`).toBeLessThanOrEqual(0.9);
      }
    }
  });

  // A rotated ask's answer slot hides its answer, but whether it offers the picture could still tell it, so every ask of a
  // skill offers it the same way (Binary Search's move, a fixed menu, is checked by its window below).
  it('offer the same picture on every rotated ask of a skill', () => {
    for (const algo of ALGORITHMS as AlgorithmDef[]) {
      const seen = new Map<string, string>();
      for (const input of inputsOf(algo, 300)) {
        for (const f of algo.trace(algo.validate(input))) {
          const p = f.predict;
          if (!p || p.ordered) continue;
          const pick = JSON.stringify([p.pick?.on, p.pick?.on === 'cell' ? [p.pick.count, p.pick.ask] : null]);
          expect(seen.get(p.skill) ?? pick, `${algo.id} ${p.skill}`).toBe(pick);
          seen.set(p.skill, pick);
        }
      }
    }
  });

  it("offer Binary Search's move on the picture by its window alone: both sides of mid have cells", () => {
    const algo = (ALGORITHMS as AlgorithmDef[]).find((a) => a.id === 'binary-search')!;
    for (const input of [{ nums: [1, 3, 5, 7], target: 4 }, { nums: [1, 3, 5, 7], target: 6 }, ...inputsOf(algo, 300)]) {
      for (const f of algo.trace(algo.validate(input))) {
        if (f.predict?.skill !== 'halve') continue;
        const [lo, hi] = f.array!.window!;
        const mid = f.array!.pointers['mid'];
        expect(!!f.predict.pick, JSON.stringify(input)).toBe(mid > lo && mid < hi);
      }
    }
  });

  it('pick on the array and the grid for Binary Search, Two Sum, Sliding Window and Grid BFS, and Grid BFS takes a value', () => {
    const kinds = (id: string) => {
      const algo = (ALGORITHMS as AlgorithmDef[]).find((a) => a.id === id)!;
      return new Set(
        inputsOf(algo, 20).flatMap((input) =>
          algo.trace(algo.validate(input)).flatMap((f) => (f.predict?.pick ? [f.predict.pick.on] : [])),
        ),
      );
    };
    for (const id of ['binary-search', 'two-sum-hash', 'longest-unique-substring', 'grid-bfs'])
      expect(kinds(id).has('cell'), id).toBe(true);
    expect(kinds('grid-bfs').has('value')).toBe(true);
  });
});

describe('picks and values', () => {
  const pick: CellPick = {
    on: 'cell',
    ask: 'Tap a cell.',
    cells: [[{ view: 'array', at: 4 }], [5, 6].map((at): Locator => ({ view: 'array', at })), []],
  };

  it('map a tapped cell to the choice that holds it, or to none', () => {
    expect(choiceForCells(pick, [{ view: 'array', at: 6 }])).toBe(1);
    expect(choiceForCells(pick, [{ view: 'array', at: 4 }])).toBe(0);
    expect(choiceForCells(pick, [{ view: 'array', at: 2 }])).toBeNull();
    const pair: CellPick = { ...pick, count: 2, cells: [[1, 3].map((at): Locator => ({ view: 'array', at })), []] };
    expect(
      choiceForCells(
        pair,
        [3, 1].map((at): Locator => ({ view: 'array', at })),
      ),
    ).toBe(0);
    expect(
      choiceForCells(
        pair,
        [1, 2].map((at): Locator => ({ view: 'array', at })),
      ),
    ).toBeNull();
  });

  it('label a pick no choice names as the tracers write cells', () => {
    expect(pickLabel([{ view: 'array', at: 7 }])).toBe('index 7');
    expect(pickLabel([3, 1].map((at): Locator => ({ view: 'array', at })))).toBe('[1, 3]');
    expect(pickLabel([{ view: 'grid', at: [2, 3] }])).toBe('(2,3)');
  });

  it('read a typed value as the choice it names', () => {
    const p = { choices: ['3', '-2', '∞', '0'] };
    expect(choiceForValue(p, ' 3 ')).toBe(0);
    expect(choiceForValue(p, '-2')).toBe(1);
    expect(choiceForValue(p, '∞')).toBe(2);
    expect(choiceForValue(p, '-0')).toBe(3);
    expect(choiceForValue(p, '+3')).toBe(0);
    expect(choiceForValue(p, '7')).toBeNull();
    expect(choiceForValue(p, 'three')).toBeNull();
    expect(isValueEntry('12')).toBe(true);
    expect(isValueEntry('-4')).toBe(true);
    expect(isValueEntry('1.5')).toBe(false);
    expect(isValueEntry('')).toBe(false);
    expect(isValueEntry('9'.repeat(400))).toBe(false);
    expect(choiceForValue(p, '9'.repeat(400))).toBeNull();
  });
});

describe('review after pickCheckpoints', () => {
  it('keeps every frame that asked, as 81a2ca8 traced them', () => {
    for (const algo of ALGORITHMS as AlgorithmDef[]) {
      let [frames, asks, at] = [0, 0, 0];
      for (const input of inputsOf(algo, 100)) {
        const trace = algo.trace(algo.validate(input));
        frames += trace.length;
        trace.forEach((f, i) => {
          if (f.predict) [asks, at] = [asks + 1, at + i];
        });
      }
      expect([frames, asks, at], algo.id).toEqual(COUNTS[algo.id]);
    }
    expect(Object.keys(COUNTS)).toHaveLength(ALGORITHMS.length);
  });

  it('keeps the review item ids and counts, and draws the same frames for each seed', () => {
    const predict = ALGORITHM_ITEMS.filter((i) => i.kind === 'predict');
    expect(ALGORITHM_ITEMS).toHaveLength(139);
    expect(REVIEW_ITEMS).toHaveLength(273);
    expect(predict.map((i) => i.id)).toEqual(Object.keys(DRAWS));
    for (const item of predict) {
      let text = '';
      for (let s = 0; s < 30; s++) {
        const q = item.generate(s * 7 + 1);
        text += `${q.frame!.line}|${q.frame!.caption}|${q.frame!.chapter};`;
      }
      let hash = 0;
      for (const c of text) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) | 0;
      expect(hash, item.id).toBe(DRAWS[item.id]);
    }
  });

  it('gives each predict question the frame after it, which asks nothing', () => {
    for (const item of ALGORITHM_ITEMS.filter((i) => i.kind === 'predict')) {
      for (let s = 0; s < 10; s++) {
        const q = item.generate(s * 13 + 5);
        expect(q.after, item.id).toBeDefined();
        expect(q.after!.predict, item.id).toBeUndefined();
        expect(q.after, item.id).not.toBe(q.frame);
      }
    }
  });
});
