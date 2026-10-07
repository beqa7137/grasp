import { HOLD_PX, THUMB, dragTo, tickX, valueAt, type Drag } from './scrub';

/** Drags through `xs` from `value`, collecting what each position did. */
function drag(xs: number[], { value = 0, max, width, ticks }: { value?: number; max: number; width: number; ticks: number[] }) {
  const pending = new Set(ticks);
  let state: Drag = { value, holding: null, holdX: 0 };
  const skipped: number[] = [];
  const holds: number[] = [];
  const values: number[] = [];
  for (const x of xs) {
    const step = dragTo(state, x, max, width, (v) => pending.has(v));
    state = step.drag;
    if (step.skipped !== null) {
      skipped.push(step.skipped);
      pending.delete(step.skipped);
    }
    if (step.held) holds.push(state.value);
    values.push(state.value);
  }
  return { state, skipped, holds, values };
}

const range = (from: number, to: number, by = 1) => Array.from({ length: Math.floor((to - from) / by) + 1 }, (_, i) => from + i * by);

describe('the scrub geometry', () => {
  it('puts a value under the native thumb, and reads it back', () => {
    expect(tickX(0, 10, 216)).toBe(THUMB / 2);
    expect(tickX(10, 10, 216)).toBe(216 - THUMB / 2);
    expect(tickX(5, 10, 216)).toBe(108);
    for (let v = 0; v <= 10; v++) expect(valueAt(tickX(v, 10, 216), 10, 216)).toBe(v);
    expect(valueAt(-50, 10, 216)).toBe(0);
    expect(valueAt(999, 10, 216)).toBe(10);
    expect(tickX(0, 0, 216)).toBe(THUMB / 2);
  });
});

describe('the scrub guard', () => {
  const max = 20;
  const width = 216;
  const at = (v: number) => tickX(v, max, width);

  it('holds on an unanswered checkpoint for 24px of drag, then skips it and moves on', () => {
    const { values, holds, skipped, state } = drag([at(3), at(6), at(6) + 10, at(6) + HOLD_PX - 1, at(6) + HOLD_PX, at(12)], {
      max,
      width,
      ticks: [6],
    });
    expect(values).toEqual([3, 6, 6, 6, valueAt(at(6) + HOLD_PX, max, width), 12]);
    expect(holds).toEqual([6]);
    expect(skipped).toEqual([6]);
    expect(state.holding).toBeNull();
  });

  it('holds at the first unanswered checkpoint a jump crosses, not where the pointer is', () => {
    const { values, state } = drag([at(15)], { max, width, ticks: [4, 9] });
    expect(values).toEqual([4]);
    expect(state.holding).toBe(4);
  });

  it('never holds going back, and lets go of a hold the pointer goes back past', () => {
    expect(drag([at(2)], { value: 10, max, width, ticks: [5] }).values).toEqual([2]);
    const back = drag([at(5), at(4)], { value: 0, max, width, ticks: [5] });
    expect(back.values).toEqual([5, 4]);
    expect(back.skipped).toEqual([]);
    expect(back.state.holding).toBeNull();
  });

  it('skips nothing that is answered, and holds nothing it starts on', () => {
    expect(drag([at(20)], { max, width, ticks: [] }).values).toEqual([20]);
    expect(drag([at(20)], { value: 6, max, width, ticks: [6] }).values).toEqual([20]);
  });

  it('holds each of two adjacent checkpoints in turn, 24px apart', () => {
    const xs = range(at(7), at(7) + 3 * HOLD_PX, 2);
    const { holds, skipped, values } = drag(xs, { max, width, ticks: [7, 8] });
    expect(holds).toEqual([7, 8]);
    expect(skipped).toEqual([7, 8]);
    const firstSkip = xs.findIndex((x) => x - at(7) >= HOLD_PX);
    expect(values.slice(0, firstSkip)).toEqual(Array(firstSkip).fill(7));
  });

  it('skips at most one checkpoint per 24px in a fast fling across close ticks, as LCS has at 320px', () => {
    // 86 frames on a track about 290px wide with a checkpoint every 6 frames: ticks about 19px apart.
    const lcs = { max: 85, width: 290, ticks: [5, 11, 17, 23, 29, 35, 41, 47, 53, 59, 65, 71, 77, 83] };
    const end = tickX(85, lcs.max, lcs.width);
    const { holds, skipped, state } = drag(range(0, end, 40), lcs);
    const travelled = end;
    expect(skipped.length).toBeLessThanOrEqual(Math.floor(travelled / HOLD_PX));
    expect(holds[0]).toBe(5);
    // Every checkpoint crossed was held, and every one but the last held skipped: none passed silently.
    expect(new Set(holds)).toEqual(new Set(lcs.ticks.slice(0, holds.length)));
    expect(skipped).toEqual(holds.slice(0, skipped.length));
    expect(state.value).toBe(state.holding ?? state.value);
    expect(state.value).toBeLessThanOrEqual(lcs.ticks[holds.length - 1]);
  });
});
