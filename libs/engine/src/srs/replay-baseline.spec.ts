import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { StoredEvent } from './events.js';
import { replay, type ProgressState } from './progress.js';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

/** The state minus the fields R4 derived from events that were already stored. */
function withoutDerived(state: ProgressState) {
  const { target: _target, interviews, coding, ...rest } = state;
  const { byTrack: _byTrack, ...counts } = interviews;
  return {
    ...rest,
    interviews: counts,
    coding: Object.fromEntries(Object.entries(coding).map(([id, { lastAt: _lastAt, ...record }]) => [id, record])),
  };
}

describe('replaying a log stored before R4', () => {
  // replay-baseline.json is what the engine of 6e04105 (before target.set) replayed replay-events.json to.
  const events: StoredEvent[] = fixture('replay-events.json');
  const state = replay(events);

  it('yields the state the previous engine did, apart from the new derived fields', () => {
    const baseline = fixture('replay-baseline.json');
    // A content change, not a replay one: R11 moved Consensus & Leaders off Your First Scale-Up, so passing it no longer
    // introduces the topic.
    delete baseline.introduced['sd-consensus'];
    expect(withoutDerived(state)).toEqual(baseline);
  });

  it('derives the new fields from events already stored', () => {
    expect(state.target).toBeNull();
    expect(state.interviews.byTrack).toEqual({
      coding: { at: '2026-09-04T09:00:00.000Z', verdict: 'lean-no-hire' },
      'system-design': { at: '2026-09-04T09:30:00.000Z', verdict: 'lean-hire' },
      behavioral: { at: '2026-09-07T09:00:00.000Z', verdict: 'hire' },
    });
    expect(state.coding['two-sum'].lastAt).toBe('2026-09-01T09:55:00.000Z');
    expect(state.coding['longest-unique-substring'].lastAt).toBe('2026-09-05T09:40:00.000Z');
  });

  it('derives the same fields in any arrival order', () => {
    expect(replay([...events].reverse())).toEqual(state);
  });
});
