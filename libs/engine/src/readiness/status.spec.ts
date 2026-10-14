import { describe, expect, it } from 'vitest';
import type { Story } from '../behavioral/stories.js';
import { itemsForTopic } from '../review/catalog.js';
import type { LearningEvent } from '../srs/events.js';
import { replay } from '../srs/progress.js';
import { problemsForPattern } from '../coding/catalog.js';
import { problemsAtBar } from './bar.js';
import { LEVEL_PROFILES } from './levels.js';
import {
  CASE_READY_RULE,
  caseStatus,
  closeEstimatesNeeded,
  competencyStatus,
  patternStatus,
  READY_RULES,
  recallSummary,
  topicStatus,
  type StatusContext,
} from './status.js';

const t0 = Date.parse('2026-09-01T09:00:00.000Z');
const DAY = 86_400_000;
let seq = 0;
const at = (ms: number) => new Date(ms).toISOString();
type Body = LearningEvent extends infer E ? (E extends unknown ? Omit<E, 'id' | 'at'> : never) : never;
const ev = (ms: number, body: Body) => ({ id: `status-${++seq}`, at: at(ms), ...body }) as LearningEvent;
const solve = (ms: number, problemId: string, passed = 4) =>
  ev(ms, { type: 'code.submitted', problemId, language: 'python', passed, total: 4 });
const grade = (ms: number, itemId: string) => ev(ms, { type: 'review.graded', itemId, rating: 3, correct: true, durationMs: 9000 });
const ctx = (events: LearningEvent[], now = t0 + DAY, stories: Story[] = [], level: 'early' | 'mid' | 'senior' = 'mid'): StatusContext => ({
  state: replay(events),
  stories,
  now: new Date(now),
  profile: LEVEL_PROFILES[level],
});
const gradeFirst = (topic: string, n: number, ms = t0) =>
  itemsForTopic(topic)
    .filter((i) => i.kind !== 'predict')
    .slice(0, n)
    .map((i, k) => grade(ms + k * 1000, i.id));

const [medium1, medium2] = problemsAtBar('two-pointers', 'medium');
const easy = problemsAtBar('two-pointers', 'easy').find((p) => p.difficulty === 'easy')!;
/** Two own solves on different days, one at the bar, then enough items graded to pass the recall check. */
const readyEvents = (first = medium1.id) => [
  solve(t0, first),
  solve(t0 + DAY, medium2.id),
  ...gradeFirst('two-pointers', READY_RULES.patternPassing, t0 + DAY + 1000),
];

describe('pattern status', () => {
  it('is New with nothing, Learning once introduced, attempted or visualized', () => {
    expect(patternStatus('two-pointers', ctx([])).state).toBe('new');
    expect(patternStatus('two-pointers', ctx([grade(t0, 'rec:tp1')])).state).toBe('learning');
    expect(patternStatus('two-pointers', ctx([solve(t0, medium1.id, 1)])).state).toBe('learning');
    const predicted = ev(t0, { type: 'predict.answered', algorithmId: 'pair-sum-sorted', patternId: 'two-pointers', correct: true });
    expect(patternStatus('two-pointers', ctx([predicted])).state).toBe('learning');
  });

  it('is Practiced after one full solve of its own problem, any difficulty; a cross-listed solve does not count', () => {
    expect(patternStatus('two-pointers', ctx([solve(t0, easy.id)])).state).toBe('practiced');
    const crossListed = problemsForPattern('greedy').find((p) => p.patternIds[0] !== 'greedy')!;
    expect(patternStatus('greedy', ctx([solve(t0, crossListed.id)])).state).toBe('learning');
  });

  it('is Ready with two own solves on different days, one at the bar, and enough items passing the recall check', () => {
    expect(patternStatus('two-pointers', ctx(readyEvents(), t0 + 2 * DAY)).state).toBe('ready');
    const sameDay = [solve(t0, medium1.id), solve(t0 + 60_000, medium2.id), ...gradeFirst('two-pointers', 3, t0 + 120_000)];
    expect(patternStatus('two-pointers', ctx(sameDay, t0 + 2 * DAY)).state).toBe('practiced');
    const fewItems = readyEvents().slice(0, -1);
    expect(patternStatus('two-pointers', ctx(fewItems, t0 + 2 * DAY)).state).toBe('practiced');
  });

  it('needs one solve at the bar, medium or harder, at every level: an easy first solve counts once a medium follows', () => {
    const easyOnly = [
      solve(t0, easy.id),
      solve(t0 + DAY, problemsAtBar('two-pointers', 'easy').filter((p) => p.difficulty === 'easy')[1].id),
    ];
    const graded = gradeFirst('two-pointers', READY_RULES.patternPassing, t0 + DAY + 1000);
    for (const level of ['early', 'mid', 'senior'] as const)
      expect(patternStatus('two-pointers', ctx([...easyOnly, ...graded], t0 + 2 * DAY, [], level)).state, level).toBe('practiced');
    expect(patternStatus('two-pointers', ctx(readyEvents(easy.id), t0 + 2 * DAY, [], 'early')).state).toBe('ready');
  });

  it('caps a flagged pattern at Practiced until a fresh solve resolves the flag', () => {
    const flag = ev(t0 + DAY + 60_000, {
      type: 'interview.scored',
      sessionId: 's1',
      track: 'coding',
      verdict: 'no-hire',
      weakPatterns: ['two-pointers'],
    });
    expect(patternStatus('two-pointers', ctx([...readyEvents(), flag], t0 + 2 * DAY))).toEqual({
      kind: 'pattern',
      id: 'two-pointers',
      state: 'practiced',
      flagged: true,
    });
    const fresh = solve(t0 + DAY + 120_000, problemsAtBar('two-pointers', 'medium')[2].id);
    expect(patternStatus('two-pointers', ctx([...readyEvents(), flag, fresh], t0 + 2 * DAY)).flagged).toBe(false);
  });
});

describe('the recall check', () => {
  const graded = gradeFirst('binary-search', 3);
  const dueOf = (state: ReturnType<typeof replay>) => Math.max(...Object.values(state.cards).map((c) => Date.parse(c.due)));

  it('passes a card graded Good until it is more than 2 days overdue', () => {
    const state = replay(graded);
    const due = dueOf(state);
    expect(recallSummary('binary-search', state, new Date(due + DAY)).passing).toBe(3);
    expect(recallSummary('binary-search', state, new Date(due + 2 * DAY)).passing).toBe(3);
    expect(recallSummary('binary-search', state, new Date(due + 60 * DAY)).passing).toBe(0);
  });

  it('fails a card whose last grade was Again until its recall probability is back near the target', () => {
    const item = itemsForTopic('binary-search')[0].id;
    const again = ev(t0 + 60_000, { type: 'review.graded', itemId: item, rating: 1, correct: false, durationMs: 9000 });
    const state = replay([grade(t0, item), again]);
    expect(state.cards[item].phase).not.toBe('review');
    expect(recallSummary('binary-search', state, new Date(t0 + 3 * DAY)).passing).toBe(0);
  });

  it("never drops a Ready skill on the morning its cards fall due, before that day's reviews", () => {
    const state = replay(readyEvents());
    const firstDue = Math.min(...Object.values(state.cards).map((c) => Date.parse(c.due)));
    const morning = { ...ctx(readyEvents()), now: new Date(firstDue + 60_000) };
    expect(patternStatus('two-pointers', morning).state).toBe('ready');
  });
});

describe('topic status', () => {
  const finishCase = (ms: number, bestChoices = 5) =>
    ev(ms, {
      type: 'case.completed',
      caseId: 'url-shortener',
      topics: ['sd-estimation', 'sd-caching', 'sd-sharding'],
      bestChoices,
      decisions: 5,
      closeEstimates: 4,
      estimates: 4,
    });

  it('is New, then Learning once introduced', () => {
    expect(topicStatus('sd-caching', ctx([])).state).toBe('new');
    expect(
      topicStatus('sd-caching', ctx([ev(t0, { type: 'practice.answered', itemId: 'sd:cdn', correct: true, durationMs: 9000 })])).state,
    ).toBe('learning');
  });

  it('is Practiced once a finished mission or case covers it, or 2 of its items are graded', () => {
    expect(topicStatus('sd-caching', ctx([finishCase(t0)])).state).toBe('practiced');
    expect(
      topicStatus('sd-latency', ctx([ev(t0, { type: 'scenario.completed', scenarioId: 'first-scale-up', monthlyCost: 900 })])).state,
    ).toBe('practiced');
    expect(topicStatus('sd-caching', ctx(gradeFirst('sd-caching', 1))).state).toBe('learning');
    expect(topicStatus('sd-caching', ctx(gradeFirst('sd-caching', 2))).state).toBe('practiced');
  });

  it('is Ready when covered with enough items graded, all passing; a topic with fewer items needs them all', () => {
    expect(itemsForTopic('sd-caching')).toHaveLength(3);
    expect(topicStatus('sd-caching', ctx([finishCase(t0), ...gradeFirst('sd-caching', 2, t0 + 1000)])).state).toBe('practiced');
    expect(topicStatus('sd-caching', ctx([finishCase(t0), ...gradeFirst('sd-caching', 3, t0 + 1000)])).state).toBe('ready');
    expect(topicStatus('sd-caching', ctx(gradeFirst('sd-caching', 3))).state).toBe('practiced');
    expect(topicStatus('sd-caching', ctx([finishCase(t0), ...gradeFirst('sd-caching', 3, t0 + 1000)], t0 + 200 * DAY)).state).toBe(
      'practiced',
    );
    expect(itemsForTopic('sd-consistency').length).toBeGreaterThan(READY_RULES.topicPassing);
  });
});

describe('case status', () => {
  const finished = (bestChoices: number, closeEstimates: number) =>
    ev(t0, { type: 'case.completed', caseId: 'chat', topics: ['sd-queues'], bestChoices, decisions: 10, closeEstimates, estimates: 4 });

  it('is New until finished, since stage progress lives on the device', () => {
    expect(caseStatus('chat', ctx([])).state).toBe('new');
  });

  it('is Practiced when finished, and Ready with 70% best choices and 70% close estimates', () => {
    expect(caseStatus('chat', ctx([finished(6, 4)])).state).toBe('practiced');
    expect(caseStatus('chat', ctx([finished(7, 2)])).state).toBe('practiced');
    expect(caseStatus('chat', ctx([finished(7, 3)])).state).toBe('ready');
  });

  it('allows one missed estimate when a case has 3 or fewer, where 70% would ask for every one', () => {
    expect([1, 2, 3, 4, 5, 10].map(closeEstimatesNeeded)).toEqual([0, 1, 2, 3, 4, 7]);
    const small = (closeEstimates: number) =>
      ev(t0, {
        type: 'case.completed',
        caseId: 'chat',
        topics: ['sd-queues'],
        bestChoices: 7,
        decisions: 10,
        closeEstimates,
        estimates: 3,
      });
    expect(caseStatus('chat', ctx([small(2)])).state).toBe('ready');
    expect(caseStatus('chat', ctx([small(1)])).state).toBe('practiced');
    expect(CASE_READY_RULE).toContain('all but one');
  });
});

describe('competency status', () => {
  const story = (overrides: Partial<Story> = {}): Story => ({
    id: 'st1',
    title: 'Outage',
    competencyIds: ['conflict'],
    draft: { situation: 'S', task: '', action: '', result: '', reflection: '' },
    updatedAt: at(t0),
    ...overrides,
  });
  const empty = { situation: '', task: '', action: '', result: '', reflection: '' };
  const asked = (verdict: string, weak: string[] = []) =>
    ev(t0, {
      type: 'interview.scored',
      sessionId: 'b1',
      track: 'behavioral',
      verdict,
      weakPatterns: [],
      competencyId: 'conflict',
      weakCompetencies: weak,
    });

  it('is New, then Learning with a tagged story or an interview that asked it', () => {
    expect(competencyStatus('conflict', ctx([])).state).toBe('new');
    expect(competencyStatus('conflict', ctx([], t0, [story({ draft: empty })])).state).toBe('learning');
    expect(competencyStatus('conflict', ctx([asked('lean-no-hire')])).state).toBe('learning');
    expect(competencyStatus('conflict', ctx([], t0, [story({ deleted: true })])).state).toBe('new');
  });

  it('is Practiced with a rehearsable tagged story told at least once', () => {
    expect(competencyStatus('conflict', ctx([], t0, [story()])).state).toBe('learning');
    expect(competencyStatus('conflict', ctx([], t0, [story({ rehearsal: { step: 0, told: 1, due: at(t0 + DAY) } })])).state).toBe(
      'practiced',
    );
  });

  it('is Ready at rehearsal step 1, or after an interview on it at Lean hire or better', () => {
    expect(competencyStatus('conflict', ctx([], t0, [story({ rehearsal: { step: 1, told: 2, due: at(t0 + 3 * DAY) } })])).state).toBe(
      'ready',
    );
    expect(competencyStatus('conflict', ctx([], t0, [story({ rehearsal: { step: 0, told: 3, due: at(t0 + DAY) } })])).state).toBe(
      'practiced',
    );
    expect(competencyStatus('conflict', ctx([asked('lean-hire')])).state).toBe('ready');
    expect(competencyStatus('conflict', ctx([asked('strong-hire')])).state).toBe('ready');
  });

  it('counts only the first 3 tags of a story', () => {
    const tags = ['ownership', 'delivery', 'ambiguity', 'conflict'];
    const told = story({ competencyIds: tags, rehearsal: { step: 1, told: 2, due: at(t0 + 3 * DAY) } });
    expect(competencyStatus('ambiguity', ctx([], t0, [told])).state).toBe('ready');
    expect(competencyStatus('conflict', ctx([], t0, [told])).state).toBe('new');
  });

  it('caps a flagged competency at Practiced', () => {
    expect(competencyStatus('conflict', ctx([asked('hire', ['conflict'])]))).toEqual({
      kind: 'competency',
      id: 'conflict',
      state: 'practiced',
      flagged: true,
    });
  });
});
