import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, expectedEffects, retryCheckpoint, retryRun, type AttemptFate, type KeyMode } from './retries.js';

const FATES: readonly AttemptFate[] = ['ok', 'lost', 'dropped'];
const MODES: readonly KeyMode[] = ['none', 'per-attempt', 'per-payment'];

function* sequences(length: number): Generator<AttemptFate[]> {
  if (length === 0) {
    yield [];
    return;
  }
  for (const rest of sequences(length - 1)) for (const fate of FATES) yield [...rest, fate];
}

describe('payment retries', () => {
  it('posts twice without a key when the first response is lost, and once with one key per payment', () => {
    expect(retryRun(['lost', 'ok'], 'none')).toMatchObject({ entries: 2, confirmed: true });
    expect(retryRun(['lost', 'ok'], 'per-attempt')).toMatchObject({ entries: 2, confirmed: true });
    const keyed = retryRun(['lost', 'lost', 'ok'], 'per-payment');
    expect(keyed).toMatchObject({ entries: 1, confirmed: true });
    expect(keyed.steps.map((s) => s.posted)).toEqual([true, false, false]);
    expect(keyed.steps[1].text).toContain('returns the stored entry');
  });

  it('stops at the first response and posts nothing when no attempt arrives', () => {
    expect(retryRun(['ok', 'lost', 'lost'], 'none').steps).toHaveLength(1);
    expect(retryRun(['dropped', 'dropped', 'dropped', 'dropped'], 'per-payment')).toMatchObject({ entries: 0, confirmed: false });
    expect(retryRun(['dropped', 'lost', 'dropped', 'lost'], 'none')).toMatchObject({ entries: 2, confirmed: false });
    expect(retryRun(['dropped', 'lost', 'dropped', 'lost'], 'per-payment')).toMatchObject({ entries: 1, confirmed: false });
  });

  it('takes one to four attempts', () => {
    expect(() => retryRun([], 'none')).toThrow();
    expect(() =>
      retryRun(
        Array.from({ length: MAX_ATTEMPTS + 1 }, () => 'ok'),
        'none',
      ),
    ).toThrow();
  });

  it('never posts more than once with one key per payment, and posts every arriving attempt without one', () => {
    for (let n = 1; n <= MAX_ATTEMPTS; n++)
      for (const fates of sequences(n)) {
        const run = retryRun(fates, 'per-payment');
        const sent = fates.slice(0, run.steps.length);
        expect(run.entries).toBe(sent.some((f) => f !== 'dropped') ? 1 : 0);
        expect(retryRun(fates, 'none').entries).toBe(sent.filter((f) => f !== 'dropped').length);
        expect(retryRun(fates, 'per-attempt').entries).toBe(retryRun(fates, 'none').entries);
      }
  });

  it('expects as many effects as weighing every sequence of attempt outcomes by its probability', () => {
    for (const [lost, dropped] of [
      [0.001, 0],
      [0.02, 0.01],
      [0.3, 0.2],
    ])
      for (let retries = 0; retries < MAX_ATTEMPTS; retries++)
        for (const mode of MODES) {
          const p = { ok: 1 - lost - dropped, lost, dropped };
          let expected = 0;
          for (const fates of sequences(retries + 1))
            expected += fates.reduce((product, f) => product * p[f], 1) * retryRun(fates, mode).entries;
          expect(expectedEffects(lost, dropped, retries, mode), `${lost} ${dropped} ${retries} ${mode}`).toBeCloseTo(expected, 12);
        }
    expect(expectedEffects(0.001, 0, 3, 'none')).toBeCloseTo(1.001001001, 12);
    expect(expectedEffects(0.001, 0, 3, 'per-payment')).toBe(1);
  });
});

describe('retry checkpoint', () => {
  it('asks for the number of entries from a menu with room for every attempt, and explains it', () => {
    for (let n = 1; n <= MAX_ATTEMPTS; n++)
      for (const fates of sequences(n))
        for (const mode of MODES) {
          const c = retryCheckpoint(fates, mode);
          const run = retryRun(fates, mode);
          expect(c.choices.length).toBeGreaterThanOrEqual(Math.max(3, run.steps.length + 1));
          expect(c.answer).toBe(run.entries);
          expect(c.explain).toContain(run.confirmed ? 'got a response' : 'gave up');
        }
    expect(retryCheckpoint(['lost', 'ok'], 'none').choices[2]).toBe('Posted twice');
    expect(retryCheckpoint(['lost', 'ok'], 'per-payment').answer).toBe(1);
  });
});
