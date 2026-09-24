import { describe, expect, it } from 'vitest';
import { mulberry32 } from './input.js';
import { jumpGame } from './jump-game.js';
import { InputError, type Frame } from './types.js';

const EM_DASH = String.fromCharCode(0x2014);

const canReachEnd = (nums: number[]) => {
  const reachable = nums.map((_, i) => i === 0);
  for (let i = 0; i < nums.length; i++) {
    if (!reachable[i]) continue;
    for (let j = i + 1; j <= Math.min(i + nums[i], nums.length - 1); j++) reachable[j] = true;
  }
  return reachable[nums.length - 1];
};

const traceOf = (input: unknown) => jumpGame.trace(jumpGame.validate(input));
const predictions = (frames: Frame[]) => frames.flatMap((f) => (f.predict ? [f.predict] : []));
const correctChoices = (frames: Frame[]) => predictions(frames).map((p) => p.choices[p.answer]);

function expectWellFormed(frames: Frame[], n: number) {
  expect(frames.length).toBeGreaterThan(1);
  expect(frames.length).toBeLessThan(600);
  for (const f of frames) {
    expect(f.line).toBeGreaterThanOrEqual(1);
    expect(f.line).toBeLessThanOrEqual(jumpGame.code.length);
    expect(f.note.length).toBeGreaterThan(0);
    expect(f.note).not.toContain(EM_DASH);
    const { values, pointers, window } = f.array!;
    expect(values).toHaveLength(n);
    for (const index of Object.values(pointers)) expect(index >= 0 && index < n).toBe(true);
    expect(window![0]).toBe(0);
    expect(window![1]).toBeGreaterThanOrEqual(0);
    expect(window![1]).toBeLessThan(n);
    if (f.predict) {
      const { prompt, choices, answer, explain } = f.predict;
      expect(choices.length).toBeGreaterThanOrEqual(2);
      expect(choices.length).toBeLessThanOrEqual(4);
      expect(new Set(choices).size).toBe(choices.length);
      expect(answer).toBeGreaterThanOrEqual(0);
      expect(answer).toBeLessThan(choices.length);
      expect(prompt.length).toBeGreaterThan(10);
      expect(explain.length).toBeGreaterThan(10);
      expect([prompt, explain, ...choices].join(' ')).not.toContain(EM_DASH);
    }
  }
  expect(frames.at(-1)!.predict).toBeUndefined();
  expect(JSON.parse(JSON.stringify(frames))).toEqual(frames);
}

describe('jump-game', () => {
  it('traces the default input to true, asking for new reaches and one continue check', () => {
    const frames = traceOf(jumpGame.defaultInput);
    expectWellFormed(frames, 5);
    expect(frames).toHaveLength(17);
    expect(correctChoices(frames)).toEqual(['4', '4', '4', 'Continue: this index is reachable', '8']);
    const end = frames.at(-1)!;
    expect(end.line).toBe(7);
    expect(end.vars['result']).toBe(true);
    expect(end.vars['reach']).toBe(8);
    expect(end.array!.pointers).toEqual({ reach: 4 });
    expect(end.array!.found).toEqual([4]);
  });

  it('offers the Math.max traps as distractors when reach should not shrink', () => {
    const shrink = predictions(traceOf(jumpGame.defaultInput)).find((p) => p.prompt.startsWith('i = 2,'))!;
    expect(shrink.choices[shrink.answer]).toBe('4');
    expect([...shrink.choices].sort()).toEqual(['3', '4', '5']);
  });

  it('stops at the first index past reach on an unreachable input', () => {
    const frames = traceOf({ nums: '3, 2, 1, 0, 4' });
    expectWellFormed(frames, 5);
    expect(correctChoices(frames).slice(-2)).toEqual(['Continue: this index is reachable', 'Return false: nothing reaches this index']);
    const end = frames.at(-1)!;
    expect(end.line).toBe(4);
    expect(end.vars['result']).toBe(false);
    expect(end.array!.pointers).toEqual({ i: 4, reach: 3 });
    expect(end.array!.window).toEqual([0, 3]);
    expect(end.array!.found).toEqual([]);
  });

  it('handles a single index without asking anything', () => {
    const frames = traceOf({ nums: [0] });
    expectWellFormed(frames, 1);
    expect(frames.at(-1)!.vars['result']).toBe(true);
    expect(predictions(frames)).toEqual([]);
  });

  it('matches a reachability reference on 300 seeded random inputs, both reachable and not', () => {
    const rand = mulberry32(2026);
    const outcomes = new Set<boolean>();
    for (let k = 0; k < 300; k++) {
      const input = jumpGame.randomInput(rand);
      const { nums } = jumpGame.validate(input);
      const frames = traceOf(input);
      expectWellFormed(frames, nums.length);
      expect(predictions(frames).length).toBeGreaterThan(0);
      expect(frames.at(-1)!.vars['result']).toBe(canReachEnd(nums));
      outcomes.add(canReachEnd(nums));
    }
    expect(outcomes).toEqual(new Set([true, false]));
  });

  it('varies its prediction prompts across review seeds', () => {
    const prompts = new Set(
      Array.from({ length: 40 }, (_, k) => predictions(jumpGame.trace(jumpGame.randomInput(mulberry32(k * 104_729 + 17))))[0].prompt),
    );
    expect(prompts.size).toBeGreaterThanOrEqual(5);
  });

  it('is deterministic for a seed and an input', () => {
    expect(jumpGame.randomInput(mulberry32(7))).toEqual(jumpGame.randomInput(mulberry32(7)));
    expect(traceOf({ nums: [1, 2, 0, 1, 0, 3] })).toEqual(traceOf({ nums: [1, 2, 0, 1, 0, 3] }));
  });

  it('records frames as independent snapshots', () => {
    const frames = traceOf(jumpGame.defaultInput);
    frames[0].array!.values[0] = 99;
    frames[0].array!.settled!.push(3);
    expect(frames[1].array!.values[0]).toBe(2);
    expect(frames[1].array!.settled).toEqual([]);
  });

  it('rejects bad inputs with InputError', () => {
    expect(() => jumpGame.validate({ nums: [2, -1, 3] })).toThrow(new InputError('nums must contain integers between 0 and 999'));
    expect(() => jumpGame.validate({ nums: '' })).toThrow(InputError);
    expect(() => jumpGame.validate({ nums: 'a, b' })).toThrow(InputError);
    expect(() => jumpGame.validate({ nums: [1.5, 2] })).toThrow(InputError);
    expect(() => jumpGame.validate({ nums: Array(25).fill(1) })).toThrow(InputError);
    expect(() => jumpGame.validate({})).toThrow(InputError);
    expect(() => jumpGame.validate(null)).toThrow(InputError);
  });

  it('accepts typed, edited and random inputs', () => {
    expect(jumpGame.validate({ nums: '2, 3 1 1,4' })).toEqual({ nums: [2, 3, 1, 1, 4] });
    expect(jumpGame.validate(jumpGame.defaultInput)).toEqual(jumpGame.defaultInput);
    const rand = mulberry32(11);
    for (let k = 0; k < 50; k++) {
      const input = jumpGame.randomInput(rand);
      expect(jumpGame.validate(input)).toEqual(input);
    }
  });

  it('keeps the code free of em dashes', () => {
    expect([jumpGame.summary, jumpGame.title, ...jumpGame.code].join('\n')).not.toContain(EM_DASH);
  });
});
