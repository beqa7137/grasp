import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../algorithms/input.js';
import { getReviewItem, itemsForTopic } from '../review/catalog.js';
import type { StoredEvent } from './events.js';
import { replay, trueRetention, type ProgressState } from './progress.js';
import { RATING, retrievability } from './scheduler.js';
import { buildSession, interleave, newCandidates, practiceSet } from './session.js';

const DAY = 86_400_000;
const t0 = Date.parse('2026-09-01T09:00:00Z');
let seq = 0;
const graded = (itemId: string, atMs: number, rating: 1 | 2 | 3 | 4 = RATING.good): StoredEvent => ({
  id: `evt-${String(++seq).padStart(7, '0')}`,
  at: new Date(atMs).toISOString(),
  type: 'review.graded',
  itemId,
  rating,
  correct: rating > 1,
  durationMs: 10_000,
});

const noSameTopicNeighbours = (ids: string[]) =>
  ids.every((idv, i) => i === 0 || getReviewItem(idv)!.topic !== getReviewItem(ids[i - 1])!.topic);

describe('session builder', () => {
  it('starts a brand-new learner on interleaved recognition cards within the daily cap', () => {
    const plan = buildSession(replay([]), { now: new Date(t0), budgetMinutes: 30 });
    expect(plan.items.length).toBe(10);
    expect(plan.items.every((i) => i.reason === 'new' && i.itemId.startsWith('rec:'))).toBe(true);
    expect(noSameTopicNeighbours(plan.items.map((i) => i.itemId))).toBe(true);
    expect(plan.newRemainingToday).toBe(0);
  });

  it('respects the time budget', () => {
    const plan = buildSession(replay([]), { now: new Date(t0), budgetMinutes: 2 });
    expect(plan.items.length).toBe(4);
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(2);
  });

  it('counts items introduced today against the new-item cap', () => {
    const events = ['rec:h1', 'rec:tp1', 'rec:sw1'].map((i, n) => graded(i, t0 + n * 1000));
    const plan = buildSession(replay(events), { now: new Date(t0 + 60_000), newPerDay: 5, budgetMinutes: 60 });
    expect(plan.newIncluded).toBe(2);
  });

  it('serves due items first, most-forgotten first, and pulls in relearning items due soon', () => {
    const events: StoredEvent[] = [];
    for (const [i, itemId] of ['rec:h1', 'rec:tp1', 'rec:sw1'].entries()) {
      events.push(graded(itemId, t0 - (30 - i * 10) * DAY), graded(itemId, t0 - (30 - i * 10) * DAY + 10 * 60_000));
    }
    events.push(graded('rec:bs1', t0 - 5 * 60_000, RATING.again));
    const s = replay(events);
    const now = new Date(t0);
    const plan = buildSession(s, { now, newPerDay: 0, budgetMinutes: 60 });
    const due = plan.items.filter((i) => i.reason === 'due').map((i) => i.itemId);
    expect(new Set(due)).toEqual(new Set(['rec:h1', 'rec:tp1', 'rec:sw1']));
    expect(plan.items.some((i) => i.itemId === 'rec:bs1' && i.reason === 'relearn')).toBe(true);
    const rs = due.map((i) => retrievability(i, s.cards[i], now));
    expect(Math.min(...rs)).toBe(retrievability('rec:h1', s.cards['rec:h1'], now));
  });

  it('introduces boosted items before the regular curriculum order', () => {
    const s = replay([
      {
        id: 'evt-boost-1',
        at: new Date(t0).toISOString(),
        type: 'interview.scored',
        sessionId: 'x',
        track: 'coding',
        verdict: 'no-hire',
        weakPatterns: ['union-find'],
      },
    ]);
    const first = newCandidates(s).slice(0, itemsForTopic('union-find').length);
    expect(first.every((d) => d.topic === 'union-find')).toBe(true);
  });

  it('boosted items are introduced even after the daily new-item cap is used up', () => {
    const today = ['rec:h1', 'rec:tp1', 'rec:sw1', 'rec:bs1'].map((i, n) => graded(i, t0 + n * 1000));
    const miss: StoredEvent = {
      id: 'evt-miss-1',
      at: new Date(t0 + 5_000).toISOString(),
      type: 'predict.answered',
      algorithmId: 'grid-bfs',
      patternId: 'bfs',
      correct: false,
    };
    const plan = buildSession(replay([...today, miss]), { now: new Date(t0 + 60_000), newPerDay: 4, budgetMinutes: 60 });
    expect(plan.items.some((i) => i.itemId === 'pred:grid-bfs' && i.reason === 'boosted')).toBe(true);
    expect(plan.items.filter((i) => i.reason === 'new')).toHaveLength(0);
  });

  it('interleave avoids same-topic neighbours when possible', () => {
    const defs = ['a', 'a', 'a', 'b', 'b', 'c'].map((topic, i) => ({ def: { topic, kind: 'recognition' as const }, i }));
    const out = interleave(defs).map((x) => x.def.topic);
    expect(out.every((t, i) => i === 0 || t !== out[i - 1])).toBe(true);
  });

  it('practice sets include every item of the topic, locked or not', () => {
    const set = practiceSet('bfs', mulberry32(1));
    expect(new Set(set)).toEqual(new Set(itemsForTopic('bfs').map((d) => d.id)));
    expect(set.some((i) => i.startsWith('pred:'))).toBe(true);
  });
});

describe('long-run simulation', () => {
  /**
   * A synthetic learner whose true recall probability is exactly FSRS's model. Studying daily for 90 days,
   * observed retention should land near the 90% target and daily workload should stay bounded.
   */
  it('keeps retention near target with a sustainable daily workload', () => {
    const rand = mulberry32(42);
    let state: ProgressState = replay([]);
    const dailyCounts: number[] = [];
    for (let day = 0; day < 90; day++) {
      let now = t0 + day * DAY;
      let count = 0;
      for (let round = 0; round < 3; round++) {
        const plan = buildSession(state, { now: new Date(now), budgetMinutes: 15 });
        if (plan.items.length === 0) break;
        const events: StoredEvent[] = [];
        for (const item of plan.items) {
          const card = state.cards[item.itemId];
          const p = card && card.phase !== 'new' ? retrievability(item.itemId, card, new Date(now)) : 0.6;
          const rating = rand() < p ? RATING.good : RATING.again;
          events.push(graded(item.itemId, now, rating));
          now += 20_000;
          count++;
        }
        state = replay(events, state);
        now += 15 * 60_000;
      }
      dailyCounts.push(count);
    }
    const retention = trueRetention(state, new Date(t0 + 90 * DAY), 60)!;
    expect(retention).toBeGreaterThan(0.84);
    expect(retention).toBeLessThan(0.96);
    expect(Math.max(...dailyCounts.slice(30))).toBeLessThan(80);
    expect(Object.keys(state.cards).length).toBeGreaterThan(40);
  });
});
