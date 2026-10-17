import { describe, expect, it } from 'vitest';
import type { StoredEvent } from './events.js';
import { replay } from './progress.js';
import { planReminders } from './reminders.js';
import { RATING, relativeWorkload } from './scheduler.js';
import { buildSession } from './session.js';
import { DEFAULT_STUDY_SETTINGS, mergeSettings } from './settings.js';

const DAY = 86_400_000;
const t0 = Date.parse('2026-09-01T09:00:00Z');
let seq = 0;
const id = () => `evt-${String(++seq).padStart(7, '0')}`;
const iso = (ms: number) => new Date(ms).toISOString();
const graded = (itemId: string, at: number, rating: 1 | 2 | 3 | 4 = RATING.good): StoredEvent => ({
  id: id(),
  at: iso(at),
  type: 'review.graded',
  itemId,
  rating,
  correct: rating > 1,
  durationMs: 8_000,
});
const settings = (at: number, change: object): StoredEvent => ({ id: id(), at: iso(at), type: 'settings.changed', settings: change });

/** Three good reviews spaced out, so the card reaches the review phase with a real stability. */
const matured = (itemId: string) => [graded(itemId, t0), graded(itemId, t0 + 3 * DAY), graded(itemId, t0 + 12 * DAY)];
const nextInterval = (events: StoredEvent[], itemId: string, at: number) => {
  const card = replay([...events, graded(itemId, at)]).cards[itemId];
  return (Date.parse(card.due) - at) / DAY;
};

describe('study settings', () => {
  it('starts from the defaults and ignores values outside the offered options', () => {
    expect(replay([]).settings).toEqual(DEFAULT_STUDY_SETTINGS);
    expect(mergeSettings(DEFAULT_STUDY_SETTINGS, { retention: 0.5, budgetMinutes: 7, newPerDay: 20 })).toEqual({
      ...DEFAULT_STUDY_SETTINGS,
      newPerDay: 20,
    });
  });

  it('a higher target retention shortens intervals for reviews graded after the change', () => {
    const base = matured('rec:h1');
    const at = t0 + 40 * DAY;
    const normal = nextInterval(base, 'rec:h1', at);
    const strict = nextInterval([...base, settings(at - DAY, { retention: 0.95 })], 'rec:h1', at);
    const relaxed = nextInterval([...base, settings(at - DAY, { retention: 0.8 })], 'rec:h1', at);
    expect(strict).toBeLessThan(normal * 0.7);
    expect(relaxed).toBeGreaterThan(normal * 1.4);
  });

  it('does not rewrite history: reviews before the change keep their schedule', () => {
    const base = matured('rec:h1');
    const before = replay(base).cards['rec:h1'];
    const after = replay([...base, settings(t0 + 13 * DAY, { retention: 0.95 })]).cards['rec:h1'];
    expect(after).toEqual(before);
  });

  it('estimates the review load of each target relative to the default', () => {
    expect(relativeWorkload(0.9)).toBeCloseTo(1);
    expect(relativeWorkload(0.95)).toBeGreaterThan(1.8);
    expect(relativeWorkload(0.8)).toBeLessThan(0.6);
  });

  it('changing settings is not study: it does not extend the streak', () => {
    const s = replay([settings(t0, { newPerDay: 5 })]);
    expect(s.streak.current).toBe(0);
    expect(s.settings.newPerDay).toBe(5);
  });

  it('sessions follow the budget and new-card settings unless overridden', () => {
    const now = new Date(t0);
    const none = replay([settings(t0 - 1000, { newPerDay: 0 })]);
    expect(buildSession(none, { now }).items).toHaveLength(0);
    const short = replay([settings(t0 - 1000, { budgetMinutes: 5, newPerDay: 30 })]);
    const long = replay([settings(t0 - 1000, { budgetMinutes: 30, newPerDay: 30 })]);
    expect(buildSession(short, { now }).items.length).toBeLessThan(buildSession(long, { now }).items.length);
    expect(buildSession(none, { now, newPerDay: 3 }).items).toHaveLength(3);
  });
});

describe('reminders', () => {
  it('offers new cards to a brand-new learner', () => {
    const [r] = planReminders(replay([]), [new Date(t0)]);
    expect(r.title).toBe('10 new cards ready');
    expect(r.body).toMatch(/^About \d+ min\./);
  });

  it('skips days with nothing to do and counts reviews once they fall due', () => {
    const events = [settings(t0 - 1000, { newPerDay: 0 }), graded('rec:h1', t0), graded('rec:tp1', t0)];
    const state = replay(events);
    const times = [1, 2, 3, 4, 5, 6, 7].map((d) => new Date(t0 + d * DAY));
    const reminders = planReminders(state, times);
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.length).toBeLessThan(times.length);
    expect(reminders[0].title).toMatch(/^\d+ reviews? due$/);
    const firstDue = Math.min(...Object.values(state.cards).map((c) => Date.parse(c.due)));
    expect(reminders[0].at.getTime()).toBeGreaterThanOrEqual(firstDue);
  });

  it('mentions a due Design Lab revisit', () => {
    const events: StoredEvent[] = [
      settings(t0 - 1000, { newPerDay: 0 }),
      { id: id(), at: iso(t0), type: 'scenario.completed', scenarioId: 'viral-feed', monthlyCost: 8_000 },
    ];
    const [r] = planReminders(replay(events), [new Date(t0 + 4 * DAY)]);
    expect(r.title).toBe('A Lab revisit is waiting');
  });
});
