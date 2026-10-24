import { RENAME_PLAY_MS, REPLAY_CAP_MS, readReplay, renameSlowdown } from './feed-replay';

describe('readReplay', () => {
  it('slows every trip by the same factor, so a trip lasts at least 150 ms on screen', () => {
    const n1 = readReplay(21, 1);
    const join = readReplay(1, 1);
    expect([n1.slowdown, n1.durationMs, join.durationMs]).toEqual([150, 3_150, 150]);
    expect(n1.caption).toBe('shown 150× slower');
    expect(readReplay(21, 0.1).slowdown).toBe(1_500);
    expect(readReplay(21, 30).slowdown).toBe(20);
  });

  it('caps a long replay at 4 s by speeding up after the sixth trip', () => {
    const far = readReplay(21, 30);
    expect(far.durationMs).toBe(REPLAY_CAP_MS);
    expect(far.caption).toBe('shown 20× slower, then faster');
    expect(far.at(600 * 6).trip).toBeCloseTo(6, 9);
    expect(far.at(REPLAY_CAP_MS).trip).toBeCloseTo(21, 9);
    expect(far.at(300)).toEqual({ trip: 0.5, tripMs: 600 });
    const big = readReplay(101, 1);
    expect(big.durationMs).toBe(REPLAY_CAP_MS);
    expect(big.at(900).trip).toBeCloseTo(6, 9);
  });

  it('names how a rename is shown: 30× slower at 100 ms, 7× faster at 20 s', () => {
    expect(renameSlowdown(100)).toBe(30);
    expect(Math.round(1 / renameSlowdown(20_000))).toBe(7);
    expect(RENAME_PLAY_MS).toBe(3_000);
  });
});
