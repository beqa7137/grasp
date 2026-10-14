import { describe, expect, it } from 'vitest';
import { EMPTY_STAR_DRAFT } from './star-check.js';
import { rehearsalQuestion } from './rehearsal-question.js';
import { REHEARSAL_DAYS, dueStories, isDue, rehearse, whenNext } from './rehearsal.js';
import type { Story } from './stories.js';

const now = new Date('2026-09-29T12:00:00Z');
const day = 86_400_000;
const story = (id: string, competencyIds = ['ownership'], text = 'I fixed it.'): Story => ({
  id,
  title: id,
  competencyIds,
  draft: { ...EMPTY_STAR_DRAFT, action: text },
  updatedAt: '2026-09-01T00:00:00.000Z',
});
const daysUntil = (s: Story) => (new Date(s.rehearsal!.due).getTime() - now.getTime()) / day;

describe('story rehearsal', () => {
  it('is due at once when never told, but only with a tag and some text', () => {
    expect(isDue(story('a'), now)).toBe(true);
    expect(isDue(story('b', []), now)).toBe(false);
    expect(isDue(story('c', ['ownership'], '  '), now)).toBe(false);
  });

  it('climbs the ladder on each good telling, stays at its top, and starts again tomorrow after one that needs work', () => {
    let s = story('a');
    const gaps: number[] = [];
    for (let i = 0; i < REHEARSAL_DAYS.length + 1; i++) {
      s = rehearse(s, true, now);
      gaps.push(daysUntil(s));
    }
    expect(gaps).toEqual([...REHEARSAL_DAYS, REHEARSAL_DAYS.at(-1)]);
    s = rehearse(s, false, now);
    expect(daysUntil(s)).toBe(1);
    expect(daysUntil(rehearse(s, true, now))).toBe(REHEARSAL_DAYS[1]);
    expect(Date.parse(s.updatedAt)).toBeGreaterThanOrEqual(now.getTime());
    expect(s.rehearsal?.told).toBe(REHEARSAL_DAYS.length + 2);
  });

  it('lists due stories, longest overdue first, and leaves out ones not yet due', () => {
    const later = rehearse(story('later'), true, now);
    const overdue = { ...story('overdue'), rehearsal: { step: 2, told: 3, due: new Date(now.getTime() - 5 * day).toISOString() } };
    const recent = { ...story('recent'), rehearsal: { step: 0, told: 1, due: new Date(now.getTime() - day).toISOString() } };
    expect(dueStories([recent, later, overdue, story('new')], now).map((s) => s.id)).toEqual(['new', 'overdue', 'recent']);
  });

  it('says when a story is next told', () => {
    expect(whenNext(story('a'), now)).toBe('now');
    expect(whenNext(rehearse(story('a'), true, now), now)).toBe('tomorrow');
    expect(whenNext(rehearse(rehearse(story('a'), true, now), true, now), now)).toBe('in 3 days');
    const evening = new Date(2026, 8, 29, 21);
    expect(whenNext(rehearse(story('a'), true, evening), new Date(2026, 8, 30, 8))).toBe('later today');
    expect(whenNext(story('b', []), now)).toBe('once it has a competency');
    expect(whenNext(story('c', ['ownership'], ' '), now)).toBe('once some of it is written');
  });

  it('asks a different question from its competencies on each telling', () => {
    const s = story('a', ['ownership', 'conflict']);
    const first = questionId(s);
    const second = questionId(rehearse(s, true, now));
    expect(first).toMatch(/^(ownership|conflict)-\d$/);
    expect(second).not.toBe(first);
    expect(rehearsalQuestion(story('b', []))).toBeUndefined();
  });
});

describe('rehearsal after an interview flags a competency', () => {
  const toldAt = new Date(now.getTime() - day / 2);
  const flaggedAt = (ms: number) => ({ conflict: { weakSince: new Date(ms).toISOString() } });

  it('brings a story forward when a tagged competency was flagged after its last telling, whichever way it was graded, and for nothing else', () => {
    for (const toldWell of [true, false]) {
      const told = rehearse(rehearse(story('a', ['ownership', 'conflict']), true, toldAt), toldWell, toldAt);
      expect(isDue(told, now)).toBe(false);
      expect(isDue(told, now, flaggedAt(toldAt.getTime() + 1))).toBe(true);
      expect(isDue(told, now, flaggedAt(toldAt.getTime() - 1))).toBe(false);
    }
    expect(isDue(rehearse(story('b', ['ownership']), true, toldAt), now, flaggedAt(now.getTime()))).toBe(false);
    expect(isDue(rehearse(story('c', ['conflict']), true, toldAt), now, { conflict: { weakSince: null } })).toBe(false);
    expect(isDue(story('d', ['conflict'], ' '), now, flaggedAt(now.getTime()))).toBe(false);
  });

  it('says a flagged story is told now', () => {
    const told = rehearse(story('a', ['conflict']), true, toldAt);
    expect(whenNext(told, now)).toBe('tomorrow');
    expect(whenNext(told, now, flaggedAt(toldAt.getTime() + 1))).toBe('now');
  });

  it('lists flagged stories among the due ones, longest scheduled first', () => {
    const flagged = rehearse(rehearse(story('flagged', ['conflict']), true, toldAt), true, toldAt);
    const waiting = rehearse(story('waiting', ['ownership']), true, toldAt);
    const overdue = { ...story('overdue'), rehearsal: { step: 0, told: 1, due: new Date(now.getTime() - day).toISOString() } };
    expect(dueStories([flagged, waiting, overdue], now, flaggedAt(toldAt.getTime() + day)).map((s) => s.id)).toEqual([
      'overdue',
      'flagged',
    ]);
  });
});

function questionId(s: Story) {
  return rehearsalQuestion(s)?.id;
}

describe('rehearsal on a clock that runs behind', () => {
  it('still dates the telling after the story last changed', () => {
    const later = { ...story('a'), updatedAt: '2026-09-29T13:00:00.000Z' };
    expect(rehearse(later, true, now).updatedAt).toBe('2026-09-29T13:00:00.001Z');
  });
});
