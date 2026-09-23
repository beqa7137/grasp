import { describe, expect, it } from 'vitest';
import { RATING, SCHEDULER_CONFIG, formatInterval, previewDue, pullForward, retrievability, review, type CardState } from './scheduler.js';

const t0 = new Date('2026-09-01T12:00:00Z');
const at = (iso: string) => new Date(iso);

function graduate(itemId: string): CardState {
  let card = review(itemId, undefined, RATING.good, t0);
  card = review(itemId, card, RATING.good, at(card.due));
  return card;
}

describe('FSRS scheduler', () => {
  it('graduates a correct first answer and re-shows a miss after one short learning step', () => {
    const first = review('rec:h1', undefined, RATING.good, t0);
    expect(first.phase).toBe('review');
    expect(first.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(first.firstReview).toBe(t0.toISOString());

    const miss = review('rec:h2', undefined, RATING.again, t0);
    expect(miss.phase).toBe('learning');
    expect(Date.parse(miss.due) - t0.getTime()).toBe(10 * 60_000);
    const retry = review('rec:h2', miss, RATING.good, at(miss.due));
    expect(retry.phase).toBe('review');
  });

  it('grows intervals with successful reviews and shrinks stability on a lapse', () => {
    let card = graduate('rec:h1');
    const intervals: number[] = [];
    for (let i = 0; i < 3; i++) {
      card = review('rec:h1', card, RATING.good, at(card.due));
      intervals.push(card.scheduledDays);
    }
    expect(Math.max(...intervals)).toBeLessThanOrEqual(SCHEDULER_CONFIG.maximumIntervalDays);
    expect(intervals).toEqual([...intervals].sort((a, b) => a - b));
    expect(intervals.at(-1)!).toBeGreaterThan(intervals[0]);

    const lapsed = review('rec:h1', card, RATING.again, at(card.due));
    expect(lapsed.phase).toBe('relearning');
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.stability).toBeLessThan(card.stability);
    expect(Date.parse(lapsed.due) - Date.parse(card.due)).toBe(10 * 60_000);
  });

  it('is deterministic — the same history always produces the same schedule', () => {
    const run = () => {
      let card = graduate('cloze:bfs:1');
      for (let i = 0; i < 6; i++) card = review('cloze:bfs:1', card, i % 3 === 0 ? RATING.hard : RATING.good, at(card.due));
      return card;
    };
    expect(run()).toEqual(run());
  });

  it('previews intervals in rating order', () => {
    const card = graduate('rec:tp1');
    const p = previewDue('rec:tp1', card, at(card.due));
    expect(Date.parse(p[1])).toBeLessThan(Date.parse(p[2]));
    expect(Date.parse(p[2])).toBeLessThanOrEqual(Date.parse(p[3]));
    expect(Date.parse(p[3])).toBeLessThanOrEqual(Date.parse(p[4]));
  });

  it('schedules reviews when recall probability decays to about the target retention', () => {
    let card = graduate('rec:sw1');
    for (let i = 0; i < 3; i++) card = review('rec:sw1', card, RATING.good, at(card.due));
    const r = retrievability('rec:sw1', card, at(card.due));
    expect(r).toBeGreaterThan(SCHEDULER_CONFIG.requestRetention - 0.05);
    expect(r).toBeLessThan(SCHEDULER_CONFIG.requestRetention + 0.05);
    expect(retrievability('rec:sw1', undefined, t0)).toBe(0);
  });

  it('pullForward only moves due dates earlier and never touches memory state', () => {
    const card = graduate('rec:bs1');
    const earlier = pullForward(card, t0);
    expect(earlier.due).toBe(t0.toISOString());
    expect(earlier.stability).toBe(card.stability);
    expect(earlier.difficulty).toBe(card.difficulty);
    expect(pullForward(card, new Date(Date.parse(card.due) + 86_400_000))).toBe(card);
  });

  it('formats intervals compactly', () => {
    const base = '2026-09-01T00:00:00Z';
    expect(formatInterval(base, '2026-09-01T00:10:00Z')).toBe('10m');
    expect(formatInterval(base, '2026-09-01T05:00:00Z')).toBe('5h');
    expect(formatInterval(base, '2026-09-04T00:00:00Z')).toBe('3d');
    expect(formatInterval(base, '2026-11-01T00:00:00Z')).toBe('2mo');
  });
});
