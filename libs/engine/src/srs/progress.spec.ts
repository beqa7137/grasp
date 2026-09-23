import { describe, expect, it } from 'vitest';
import { PATTERNS } from '../curriculum/patterns.js';
import { SD_TOPICS } from '../curriculum/sd-topics.js';
import { getReviewItem, itemsForTopic } from '../review/catalog.js';
import type { LegacyDrillReviewedEvent, StoredEvent } from './events.js';
import {
  MISSION_LADDER_DAYS,
  PREDICTION_MISS_PULL_MS,
  forecast,
  isUnlocked,
  masteryByTopic,
  missionRevisits,
  replay,
  trueRetention,
} from './progress.js';
import { RATING } from './scheduler.js';

const DAY = 86_400_000;
const t0 = Date.parse('2026-09-01T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
let seq = 0;
const id = () => `evt-${String(++seq).padStart(6, '0')}`;

const graded = (itemId: string, atMs: number, rating: 1 | 2 | 3 | 4 = RATING.good, durationMs = 8_000): StoredEvent => ({
  id: id(),
  at: iso(atMs),
  type: 'review.graded',
  itemId,
  rating,
  correct: rating > 1,
  durationMs,
});

describe('progress reducer', () => {
  it('is order-independent and JSON round-trippable', () => {
    const events: StoredEvent[] = [
      graded('rec:h1', t0),
      graded('rec:h1', t0 + 10 * 60_000),
      { id: id(), at: iso(t0 + DAY), type: 'predict.answered', algorithmId: 'binary-search', patternId: 'binary-search', correct: false },
      { id: id(), at: iso(t0 + 2 * DAY), type: 'scenario.completed', scenarioId: 'first-scale-up', monthlyCost: 2_000 },
    ];
    const a = replay(events);
    expect(replay([...events].reverse())).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('upcasts legacy SM-2 drill reviews into FSRS reviews', () => {
    const legacy: LegacyDrillReviewedEvent = { id: 'legacy-0001', at: iso(t0), type: 'drill.reviewed', cardId: 'h1', grade: 4 };
    const modern = graded('rec:h1', t0, RATING.good, 0);
    const a = replay([legacy]);
    const b = replay([{ ...modern, id: 'legacy-0001' }]);
    expect(a.cards['rec:h1']).toEqual(b.cards['rec:h1']);
    expect(replay([{ ...legacy, grade: 1 }]).cards['rec:h1'].phase).toBe('learning');
  });

  it('ignores reviews of items that no longer exist', () => {
    const s = replay([graded('rec:does-not-exist', t0)]);
    expect(s.cards).toEqual({});
    expect(s.eventCount).toBe(1);
  });

  it('practice never touches the schedule', () => {
    const s = replay([{ id: id(), at: iso(t0), type: 'practice.answered', itemId: 'rec:h1', correct: true, durationMs: 5_000 }]);
    expect(s.cards).toEqual({});
    expect(s.practice).toEqual({ correct: 1, total: 1 });
    expect(s.introduced['hashing']).toBeDefined();
  });

  it('a wrong prediction pulls the checkpoint forward (or boosts it if unseen)', () => {
    const miss = (atMs: number): StoredEvent => ({ id: id(), at: iso(atMs), type: 'predict.answered', algorithmId: 'grid-bfs', patternId: 'bfs', correct: false });
    const unseen = replay([miss(t0)]);
    expect(unseen.boosts['pred:grid-bfs']?.reason).toBe('prediction-miss');
    expect(isUnlocked(getReviewItem('pred:grid-bfs')!, unseen)).toBe(true);

    const learned = [graded('pred:grid-bfs', t0), graded('pred:grid-bfs', t0 + 10 * 60_000)];
    let s = replay(learned);
    for (let i = 0; i < 3; i++) s = replay([graded('pred:grid-bfs', Date.parse(s.cards['pred:grid-bfs'].due))], s);
    const dueBefore = Date.parse(s.cards['pred:grid-bfs'].due);
    const missAt = dueBefore - 20 * DAY;
    const after = replay([miss(missAt)], s);
    expect(Date.parse(after.cards['pred:grid-bfs'].due)).toBe(missAt + PREDICTION_MISS_PULL_MS);
    expect(after.cards['pred:grid-bfs'].stability).toBe(s.cards['pred:grid-bfs'].stability);
  });

  it('interview weak patterns make known items due now and boost unseen ones; reviewing clears the boost', () => {
    const base = [graded('rec:ms1', t0), graded('rec:ms1', t0 + 10 * 60_000)];
    const scoredAt = t0 + 3 * DAY;
    const s = replay([
      ...base,
      { id: id(), at: iso(scoredAt), type: 'interview.scored', sessionId: 's1', track: 'coding', verdict: 'lean-no-hire', weakPatterns: ['monotonic-stack'] },
    ]);
    expect(Date.parse(s.cards['rec:ms1'].due)).toBeLessThanOrEqual(scoredAt);
    for (const def of itemsForTopic('monotonic-stack')) expect(s.boosts[def.id]?.reason).toBe('interview');
    const reviewed = replay([graded('rec:ms2', scoredAt + 1_000)], s);
    expect(reviewed.boosts['rec:ms2']).toBeUndefined();
    expect(reviewed.boosts['rec:ms3']).toBeDefined();
  });

  it('schedules mission revisits on a 3 → 10 → 30 day ladder', () => {
    const done = (atMs: number, variant?: number): StoredEvent => ({
      id: id(),
      at: iso(atMs),
      type: 'scenario.completed',
      scenarioId: 'viral-feed',
      monthlyCost: 8_000,
      ...(variant ? { variant } : {}),
    });
    let s = replay([done(t0)]);
    expect(s.missions['viral-feed'].nextRevisitAt).toBe(iso(t0 + MISSION_LADDER_DAYS[0] * DAY));
    expect(missionRevisits(s, new Date(t0 + DAY))[0]).toMatchObject({ scenarioId: 'viral-feed', variant: 1, due: false });
    expect(missionRevisits(s, new Date(t0 + 4 * DAY))[0].due).toBe(true);

    s = replay([done(t0 + 3 * DAY, 2)], s);
    expect(s.missions['viral-feed'].revisitsDone).toBe(0);

    s = replay([done(t0 + 3 * DAY, 1)], s);
    expect(s.missions['viral-feed']).toMatchObject({ revisitsDone: 1, nextRevisitAt: iso(t0 + 13 * DAY) });
    s = replay([done(t0 + 13 * DAY, 2)], s);
    expect(s.missions['viral-feed'].nextRevisitAt).toBe(iso(t0 + 43 * DAY));
    s = replay([done(t0 + 43 * DAY, 3)], s);
    expect(s.missions['viral-feed'].nextRevisitAt).toBeNull();
    expect(missionRevisits(s, new Date(t0 + 400 * DAY))).toEqual([]);
  });

  it('unlocks items only after their idea was met elsewhere', () => {
    const fresh = replay([]);
    expect(isUnlocked(getReviewItem('rec:h1')!, fresh)).toBe(true);
    expect(isUnlocked(getReviewItem('cloze:hashing:1')!, fresh)).toBe(false);
    expect(isUnlocked(getReviewItem('pred:binary-search')!, fresh)).toBe(false);
    expect(isUnlocked(getReviewItem('sd:queue-drain')!, fresh)).toBe(false);

    const s = replay([
      graded('rec:h1', t0),
      { id: id(), at: iso(t0), type: 'predict.answered', algorithmId: 'binary-search', patternId: 'binary-search', correct: true },
      { id: id(), at: iso(t0), type: 'scenario.completed', scenarioId: 'flash-sale', monthlyCost: 5_000 },
    ]);
    expect(isUnlocked(getReviewItem('cloze:hashing:1')!, s)).toBe(true);
    expect(isUnlocked(getReviewItem('pred:binary-search')!, s)).toBe(true);
    expect(isUnlocked(getReviewItem('sd:queue-drain')!, s)).toBe(true);
    expect(isUnlocked(getReviewItem('sd:cache-math')!, s)).toBe(false);
  });

  it('computes mastery for every pattern and system design topic', () => {
    const now = new Date(t0 + 2 * DAY);
    const empty = masteryByTopic(replay([]), now);
    expect(empty).toHaveLength(PATTERNS.length + SD_TOPICS.length);
    expect(empty.every((m) => m.mastery === 0)).toBe(true);

    let s = replay([graded('rec:h1', t0), graded('rec:h1', t0 + 10 * 60_000)]);
    for (let i = 0; i < 4; i++) s = replay([graded('rec:h1', Date.parse(s.cards['rec:h1'].due))], s);
    const m = masteryByTopic(s, new Date(s.cards['rec:h1'].lastReview!)).find((x) => x.topic === 'hashing')!;
    expect(m.mastery).toBeGreaterThan(0);
    expect(m.mastery).toBeLessThanOrEqual(1);
    expect(m.itemsSeen).toBe(1);
  });

  it('reports true retention only with enough mature reviews', () => {
    let s = replay([graded('rec:h1', t0), graded('rec:h1', t0 + 10 * 60_000)]);
    expect(trueRetention(s, new Date(t0))).toBeNull();
    for (let i = 0; i < 12; i++) {
      const due = Date.parse(s.cards['rec:h1'].due);
      s = replay([graded('rec:h1', due, i % 4 === 0 ? RATING.again : RATING.good)], s);
      if (s.cards['rec:h1'].phase !== 'review') s = replay([graded('rec:h1', Date.parse(s.cards['rec:h1'].due))], s);
    }
    const r = trueRetention(s, new Date(Date.parse(s.cards['rec:h1'].lastReview!)), 3650);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.5);
    expect(r!).toBeLessThan(1);
  });

  it('tracks answer-time moving averages per item kind, ignoring outliers', () => {
    const s = replay([graded('rec:h1', t0, RATING.good, 10_000), graded('rec:h2', t0 + 1, RATING.good, 20_000), graded('rec:h3', t0 + 2, RATING.good, 900_000)]);
    expect(s.durations.recognition).toBe(Math.round(10_000 + 0.2 * (20_000 - 10_000) + 0.2 * (120_000 - 12_000)));
  });

  it('forecasts due reviews per day', () => {
    const s = replay([graded('rec:h1', t0), graded('rec:h2', t0, RATING.again)]);
    const f = forecast(s, new Date(t0 + DAY), 7);
    expect(f).toHaveLength(7);
    expect(f[0].count).toBe(1);
    expect(f[1].count).toBe(1);
  });
});
