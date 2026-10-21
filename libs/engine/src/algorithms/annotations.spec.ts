import { describe, expect, it } from 'vitest';
import { getAlgorithm } from './index.js';
import { mulberry32 } from './random.js';
import type { AlgorithmDef, Frame } from './types.js';

const MAX_CAPTION = 80;
const MAX_LENS = 40;
const MAX_CHAPTER = 24;
const MAX_PRESET_LABEL = 32;
const SWEEP = 300;

/** Each annotated tracer's default input as it was before annotations: frame count and the frames that ask (REDESIGN.md 3.8). */
const BASE: Record<string, { frames: number; asks: number[] }> = {
  'two-sum-hash': { frames: 21, asks: [4, 8, 13, 18, 19] },
  'pair-sum-sorted': { frames: 7, asks: [2, 5] },
  'longest-unique-substring': { frames: 42, asks: [1, 4, 7, 10, 14, 18, 22, 27, 32, 35, 38] },
  'binary-search': { frames: 13, asks: [3, 7, 11] },
  'subarray-sum-prefix': { frames: 30, asks: [3, 6, 8, 12, 15, 17, 21, 25] },
  'next-greater-element': { frames: 27, asks: [2, 4, 6, 13, 15, 17, 24] },
  'linked-list-cycle': { frames: 16, asks: [2, 9, 13] },
  'linked-list-reversal': { frames: 25, asks: [5, 12, 15, 20, 22] },
  'merge-intervals': { frames: 23, asks: [5, 6, 9, 10, 13, 16, 19, 20] },
  'kth-largest': { frames: 22, asks: [5, 7, 8, 10, 12, 13, 15, 16, 17, 19] },
  'single-number-xor': { frames: 16, asks: [4, 7, 10, 13] },
};

const traceOf = (algo: AlgorithmDef, input: unknown) => algo.trace(algo.validate(input));

/** Every way a frame breaks the annotation contract, so one expect per trace reports them all. */
const annotationProblems = (frames: Frame[], code: string[]) =>
  frames.flatMap((f, k) => {
    const line = code[f.line - 1] ?? '';
    const [start, end] = f.span ?? [-1, -1];
    return [
      !f.caption && 'no caption',
      f.caption && f.caption.length > MAX_CAPTION && `a caption of ${f.caption.length} characters: ${f.caption}`,
      !f.chapter && 'no chapter',
      f.chapter && f.chapter.length > MAX_CHAPTER && `a chapter of ${f.chapter.length} characters: ${f.chapter}`,
      !(start >= 0 && start < end && end <= line.length) && `span ${f.span} outside line ${f.line} (${line.length} characters)`,
      f.lens !== undefined && f.lens.length > MAX_LENS && `a lens of ${f.lens.length} characters: ${f.lens}`,
      f.lens !== undefined && f.predict && 'a lens on a frame that asks, which would answer it',
    ].flatMap((problem) => (problem ? [`frame ${k}: ${problem}`] : []));
  });

/** A constant fallback caption would pass every per-frame check, so a trace needs one distinct caption per two distinct steps. */
const captionsPerStep = (frames: Frame[]) =>
  new Set(frames.map((f) => f.caption)).size / new Set(frames.map((f) => `${f.line} ${f.chapter}`)).size;

const chaptersOf = (frames: Frame[]) => new Set(frames.map((f) => f.chapter));

describe.each(Object.keys(BASE))('%s annotations', (id) => {
  const algo = getAlgorithm(id)!;
  const presets = algo.presets ?? [];
  const inputs = () => {
    const rand = mulberry32(id.length * 104729);
    return [algo.defaultInput, ...presets.map((p) => p.input), ...Array.from({ length: SWEEP }, () => algo.randomInput(rand))];
  };

  it('captions, chapters and spans every frame, with lenses only where nothing is asked', () => {
    for (const input of inputs()) expect(annotationProblems(traceOf(algo, input), algo.code), JSON.stringify(input)).toEqual([]);
  });

  it('writes captions that change with the step: at least one distinct caption per two distinct lines and chapters', () => {
    for (const input of inputs()) expect(captionsPerStep(traceOf(algo, input)), JSON.stringify(input)).toBeGreaterThanOrEqual(0.5);
  });

  it('splits the default input and every preset into at least two chapters, each one run of frames', () => {
    for (const input of [algo.defaultInput, ...presets.map((p) => p.input)]) {
      const frames = traceOf(algo, input);
      const runs = frames.filter((f, k) => k === 0 || f.chapter !== frames[k - 1].chapter).map((f) => f.chapter);
      expect(chaptersOf(frames).size, JSON.stringify(input)).toBeGreaterThanOrEqual(2);
      expect(runs, JSON.stringify(input)).toEqual([...new Set(runs)]);
    }
  });

  it('asks on the same frames of the default input as before the annotations', () => {
    const frames = traceOf(algo, algo.defaultInput);
    expect({ frames: frames.length, asks: frames.flatMap((f, k) => (f.predict ? [k] : [])) }).toEqual(BASE[id]);
  });

  it('offers three presets, each valid as written and asking at least one prediction', () => {
    expect(presets).toHaveLength(3);
    expect(new Set(presets.map((p) => p.label)).size).toBe(3);
    for (const { label, input } of presets) {
      expect(label.length, label).toBeLessThanOrEqual(MAX_PRESET_LABEL);
      expect(algo.validate(input), label).toEqual(input);
      expect(input, label).not.toEqual(algo.defaultInput);
      expect(
        traceOf(algo, input).some((f) => f.predict),
        label,
      ).toBe(true);
    }
  });
});
