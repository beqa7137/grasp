import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../algorithms/input.js';
import { PATTERNS } from '../curriculum/patterns.js';
import { getReviewItem, itemsForTopic } from '../review/catalog.js';
import { diagnosticItems, isDiagnosticItem, placementFromAnswers } from './diagnostic.js';
import type { DiagnosticAnswer, DiagnosticOutcome, StoredEvent } from './events.js';
import { isUnlocked, replay } from './progress.js';
import { RATING } from './scheduler.js';
import { buildSession, newCandidates, newIntroducedToday } from './session.js';

const t0 = Date.parse('2026-09-01T09:00:00Z');
let seq = 0;
const id = () => `evt-${String(++seq).padStart(7, '0')}`;

const recognitionOf = (patternId: string) => itemsForTopic(patternId).find((d) => d.kind === 'recognition')!.id;
const answer = (patternId: string, outcome: DiagnosticOutcome, durationMs = 9_000): DiagnosticAnswer => ({
  itemId: recognitionOf(patternId),
  outcome,
  durationMs,
});
const diagnostic = (answers: DiagnosticAnswer[], atMs = t0): StoredEvent => ({
  id: id(),
  at: new Date(atMs).toISOString(),
  type: 'diagnostic.completed',
  answers,
});
const checkWith = (strong: string[], otherwise: DiagnosticOutcome = 'wrong') =>
  diagnostic(PATTERNS.map((p) => answer(p.id, strong.includes(p.id) ? 'correct' : otherwise)));

describe('placement check questions', () => {
  it('asks one recognition question per pattern, in curriculum order', () => {
    const items = diagnosticItems(mulberry32(1)).map((itemId) => getReviewItem(itemId)!);
    expect(items.map((d) => d.topic)).toEqual(PATTERNS.map((p) => p.id));
    expect(items.every((d) => d.kind === 'recognition')).toBe(true);
  });

  it('is reproducible from a seed and varies the question between seeds', () => {
    expect(diagnosticItems(mulberry32(7))).toEqual(diagnosticItems(mulberry32(7)));
    const variants = new Set(Array.from({ length: 20 }, (_, seed) => diagnosticItems(mulberry32(seed)).join()));
    expect(variants.size).toBeGreaterThan(1);
  });

  it('only accepts recognition items', () => {
    expect(isDiagnosticItem(recognitionOf('heap'))).toBe(true);
    expect(isDiagnosticItem(itemsForTopic('heap').find((d) => d.kind === 'complexity')!.id)).toBe(false);
    expect(isDiagnosticItem('rec:does-not-exist')).toBe(false);
  });
});

describe('placement from answers', () => {
  it('places a pattern as strong only when it was answered right', () => {
    expect(
      placementFromAnswers([answer('hashing', 'correct'), answer('two-pointers', 'wrong'), answer('sliding-window', 'skipped')]),
    ).toEqual({ hashing: 'strong', 'two-pointers': 'weak', 'sliding-window': 'weak' });
  });

  it('lets any miss on a pattern outweigh right answers, whatever the order', () => {
    const second = itemsForTopic('heap').filter((d) => d.kind === 'recognition')[1].id;
    const hit = answer('heap', 'correct');
    const miss: DiagnosticAnswer = { itemId: second, outcome: 'wrong', durationMs: 5_000 };
    expect(placementFromAnswers([hit, miss])).toEqual({ heap: 'weak' });
    expect(placementFromAnswers([miss, hit])).toEqual({ heap: 'weak' });
  });

  it('ignores items that no longer exist', () => {
    expect(placementFromAnswers([{ itemId: 'rec:gone', outcome: 'correct', durationMs: 1_000 }])).toEqual({});
  });
});

describe('a completed placement check', () => {
  it('records the placement without creating review cards', () => {
    const s = replay([checkWith(['hashing', 'heap'])]);
    expect(s.diagnosedAt).toBe(new Date(t0).toISOString());
    expect(s.placement.hashing).toBe('strong');
    expect(s.placement.heap).toBe('strong');
    expect(s.placement.trie).toBe('weak');
    expect(Object.keys(s.placement)).toHaveLength(PATTERNS.length);
    expect(s.cards).toEqual({});
    expect(newIntroducedToday(s, new Date(t0))).toBe(0);
  });

  it('unlocks template and complexity cards of strong patterns only', () => {
    const s = replay([checkWith(['heap'])]);
    const deeper = (patternId: string) => itemsForTopic(patternId).filter((d) => d.kind === 'cloze' || d.kind === 'complexity');
    expect(deeper('heap').length).toBeGreaterThan(0);
    expect(deeper('heap').every((d) => isUnlocked(d, s))).toBe(true);
    expect(deeper('trie').some((d) => isUnlocked(d, s))).toBe(false);
  });

  it('learns answer times from real answers, not from skips', () => {
    const s = replay([
      diagnostic([answer('hashing', 'correct', 12_000), answer('heap', 'wrong', 14_000), answer('trie', 'skipped', 1_500)]),
    ]);
    expect(s.durations.recognition).toBe(12_400);
  });

  it('is replaced by a retake, while patterns already started stay started', () => {
    const s = replay(
      [checkWith(['heap']), checkWith(['trie'], 'skipped')].map((e, i) => ({ ...e, at: new Date(t0 + i * 86_400_000).toISOString() })),
    );
    expect(s.placement.heap).toBe('weak');
    expect(s.placement.trie).toBe('strong');
    expect(s.introduced.heap).toBeDefined();
    expect(s.diagnosedAt).toBe(new Date(t0 + 86_400_000).toISOString());
  });

  it('replays the same whatever the arrival order, and survives JSON', () => {
    const events: StoredEvent[] = [
      checkWith(['hashing']),
      {
        id: id(),
        at: new Date(t0 + 60_000).toISOString(),
        type: 'review.graded',
        itemId: recognitionOf('trie'),
        rating: RATING.good,
        correct: true,
        durationMs: 8_000,
      },
    ];
    const s = replay(events);
    expect(replay([...events].reverse())).toEqual(s);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('new cards after a placement check', () => {
  it('start with the weak patterns', () => {
    const weak = ['dp-1d', 'trie', 'union-find'];
    const s = replay([checkWith(PATTERNS.map((p) => p.id).filter((p) => !weak.includes(p)))]);
    const weakItems = weak.flatMap((p) => itemsForTopic(p)).filter((d) => isUnlocked(d, s));
    const first = newCandidates(s).slice(0, weakItems.length);
    expect(new Set(first.map((d) => d.topic))).toEqual(new Set(weak));
  });

  it('keep the curriculum order for a learner who is new to everything', () => {
    expect(newCandidates(replay([checkWith([], 'skipped')])).map((d) => d.id)).toEqual(newCandidates(replay([])).map((d) => d.id));
  });

  it('bring deeper cards of strong patterns forward and their recognition cards last', () => {
    const s = replay([checkWith(['hashing'])]);
    const order = newCandidates(s).map((d) => d.id);
    const hashingRecognition = itemsForTopic('hashing').filter((d) => d.kind === 'recognition');
    expect(order.slice(-hashingRecognition.length).sort()).toEqual(hashingRecognition.map((d) => d.id).sort());
    const firstStrongDeepCard = order.findIndex((itemId) => getReviewItem(itemId)!.topic === 'hashing');
    expect(getReviewItem(order[firstStrongDeepCard])!.kind).not.toBe('recognition');
    expect(firstStrongDeepCard).toBeLessThan(order.length - hashingRecognition.length);
  });

  it('stay within the daily new-card cap and the time budget', () => {
    const s = replay([checkWith(['hashing', 'two-pointers'])]);
    const plan = buildSession(s, { now: new Date(t0 + 60_000), newPerDay: 5, budgetMinutes: 60 });
    expect(plan.newIncluded).toBe(5);
    expect(plan.boostedIncluded).toBe(0);
    const short = buildSession(s, { now: new Date(t0 + 60_000), budgetMinutes: 2 });
    expect(short.estimatedMinutes).toBeLessThanOrEqual(2);
  });
});
