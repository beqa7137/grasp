import { describe, expect, it } from 'vitest';
import { jumpGame } from './jump-game.js';
import { correctChoices, predictions, resultOf, tracerFixture } from './tracer.fixture.js';
import { InputError, type Frame } from './types.js';

const { traceOf, randomInputs } = tracerFixture(jumpGame);

/** Every frame draws all n values, keeps its pointers on them and shades a reachable window that starts at index 0. */
const arrayInSync = (frames: Frame[], n: number) =>
  frames.every(({ array }) => {
    const { values, pointers, window } = array!;
    const [from, to] = window!;
    return values.length === n && Object.values(pointers).every((k) => k >= 0 && k < n) && from === 0 && to >= 0 && to < n;
  });

describe('jump-game', () => {
  it('traces the default input to true, asking for new reaches and one continue check', () => {
    const frames = traceOf(jumpGame.defaultInput);
    expect(arrayInSync(frames, 5)).toBe(true);
    expect(frames).toHaveLength(17);
    expect(correctChoices(frames)).toEqual(['4', '4', '4', 'Continue: this index is reachable', '8']);
    const end = frames.at(-1)!;
    expect(end.line).toBe(7);
    expect(resultOf(frames)).toBe(true);
    expect(end.vars['reach']).toBe(8);
    expect(end.array!.pointers).toEqual({ reach: 4 });
    expect(end.array!.found).toEqual([4]);
  });

  it('offers the Math.max traps as distractors when reach should not shrink', () => {
    const shrink = predictions(traceOf(jumpGame.defaultInput)).find((p) => p.prompt.startsWith('`i = 2`,'))!;
    expect(shrink.choices[shrink.answer]).toBe('4');
    expect([...shrink.choices].sort()).toEqual(['3', '4', '5']);
  });

  it('stops at the first index past reach on an unreachable input', () => {
    const frames = traceOf({ nums: '3, 2, 1, 0, 4' });
    expect(arrayInSync(frames, 5)).toBe(true);
    expect(correctChoices(frames).slice(-2)).toEqual(['Continue: this index is reachable', 'Return false: nothing reaches this index']);
    const end = frames.at(-1)!;
    expect(end.line).toBe(4);
    expect(resultOf(frames)).toBe(false);
    expect(end.array!.pointers).toEqual({ i: 4, reach: 3 });
    expect(end.array!.window).toEqual([0, 3]);
    expect(end.array!.found).toEqual([]);
  });

  it('handles a single index without asking anything', () => {
    const frames = traceOf({ nums: [0] });
    expect(arrayInSync(frames, 1)).toBe(true);
    expect(resultOf(frames)).toBe(true);
    expect(predictions(frames)).toEqual([]);
  });

  it('keeps the array in sync on random inputs, both reachable and not', () => {
    const outcomes = new Set<unknown>();
    for (const input of randomInputs(2026, 60)) {
      const frames = traceOf(input);
      expect(arrayInSync(frames, input.nums.length)).toBe(true);
      outcomes.add(resultOf(frames));
    }
    expect(outcomes).toEqual(new Set([true, false]));
  });

  it('records frames as independent snapshots', () => {
    const frames = traceOf(jumpGame.defaultInput);
    frames[0].array!.values[0] = 99;
    frames[0].array!.settled!.push(3);
    expect(frames[1].array!.values[0]).toBe(2);
    expect(frames[1].array!.settled).toEqual([]);
  });

  it('rejects negative jump lengths', () => {
    expect(() => jumpGame.validate({ nums: [2, -1, 3] })).toThrow(new InputError('nums must contain integers between 0 and 999'));
  });
});
