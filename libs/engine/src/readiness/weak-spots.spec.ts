import { describe, expect, it } from 'vitest';
import { seeded } from '../review/random.js';
import { itemsForTopic } from '../review/catalog.js';
import type { LearningEvent } from '../srs/events.js';
import { replay } from '../srs/progress.js';
import { practiceMix, weakSpots } from './weak-spots.js';

const t0 = Date.parse('2026-09-01T09:00:00.000Z');
const DAY = 86_400_000;
let seq = 0;
type Body = LearningEvent extends infer E ? (E extends unknown ? Omit<E, 'id' | 'at'> : never) : never;
const ev = (body: Body, ms = t0) => ({ id: `weak-${++seq}`, at: new Date(ms).toISOString(), ...body }) as LearningEvent;
const flag = (patterns: string[], ms: number) =>
  ev({ type: 'interview.scored', sessionId: `s${ms}`, track: 'coding', verdict: 'no-hire', weakPatterns: patterns }, ms);
const predict = (patternId: string, algorithmId: string, correct: boolean) =>
  ev({ type: 'predict.answered', patternId, algorithmId, correct });
const grade = (itemId: string) => ev({ type: 'review.graded', itemId, rating: 3, correct: true, durationMs: 9000 });

describe('weak spots', () => {
  it('lists unresolved flags newest first, then mostly missed predictions, then fading cards, at most 3', () => {
    const events = [
      flag(['heap'], t0),
      flag(['trie'], t0 + DAY),
      predict('greedy', 'jump-game', false),
      predict('greedy', 'jump-game', false),
      predict('greedy', 'jump-game', true),
      predict('dp-1d', 'house-robber', false),
      predict('dp-1d', 'house-robber', true),
      ...itemsForTopic('binary-search')
        .slice(0, 3)
        .map((i) => grade(i.id)),
    ];
    const spots = weakSpots(replay(events), new Date(t0 + 120 * DAY));
    expect(spots.map((s) => [s.topic, s.reason.kind])).toEqual([
      ['trie', 'flagged'],
      ['heap', 'flagged'],
      ['greedy', 'predictions'],
    ]);
    expect(spots[2].reason).toEqual({ kind: 'predictions', missed: 2, total: 3 });
    expect(spots[0].cards).toBe(itemsForTopic('trie').length);
  });

  it('names fading topics by how many graded cards fell below the recall target', () => {
    const events = itemsForTopic('binary-search')
      .slice(0, 3)
      .map((i) => grade(i.id));
    expect(weakSpots(replay(events), new Date(t0 + DAY))).toEqual([]);
    expect(weakSpots(replay(events), new Date(t0 + 120 * DAY))).toEqual([
      { topic: 'binary-search', reason: { kind: 'fading', below: 3, graded: 3 }, cards: itemsForTopic('binary-search').length },
    ]);
  });

  it('drops a flag once a fresh solve resolves it', () => {
    const solve = ev({ type: 'code.submitted', problemId: 'kth-largest-element', language: 'python', passed: 2, total: 2 }, t0 + DAY);
    expect(weakSpots(replay([flag(['heap'], t0), solve]), new Date(t0 + DAY))).toEqual([]);
  });
});

describe('practice mix', () => {
  it('takes every item of each topic, in turns', () => {
    const mix = practiceMix(['binary-search', 'sd-caching'], seeded(7));
    expect(mix.slice().sort()).toEqual([...itemsForTopic('binary-search'), ...itemsForTopic('sd-caching')].map((i) => i.id).sort());
    expect(new Set(mix.slice(0, 2).map((id) => id.startsWith('sd:')))).toEqual(new Set([true, false]));
  });
});
