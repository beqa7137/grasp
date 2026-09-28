import { describe, expect, it } from 'vitest';
import { COMPETENCY_CATALOG } from './catalog.js';
import { getCompetency } from './competencies.js';
import { EXAMPLES, examplesFor } from './examples.js';
import { ANSWER_FLAWS, FLAW_CHECKS } from './flaws.js';
import { reviewStar, type StarCheck } from './star-check.js';
import type { AnswerFlaw, ExampleAnswer } from './types.js';

const MAPPED = Object.entries(FLAW_CHECKS) as [AnswerFlaw, StarCheck['id']][];

const review = ({ situation, task, action, result, reflection }: ExampleAnswer) =>
  reviewStar({ situation, task, action, result, reflection });

const failing = (answer: ExampleAnswer) =>
  review(answer)
    .checks.filter((check) => !check.ok)
    .map((check) => check.id);

describe('behavioral examples', () => {
  it('has one entry per competency in catalog order', () => {
    expect(EXAMPLES.map((e) => e.competencyId)).toEqual(COMPETENCY_CATALOG.map((c) => c.id));
    expect(examplesFor('conflict')?.competencyId).toBe('conflict');
    expect(examplesFor('missing')).toBeUndefined();
  });

  const strongs = EXAMPLES.flatMap((e) => e.strong.map((answer) => ({ ...answer, competencyId: e.competencyId })));
  const weaks = EXAMPLES.flatMap((e) => e.weak.map((answer) => ({ ...answer, competencyId: e.competencyId })));

  it.each(EXAMPLES)('$competencyId has a strong answer per career stage and two weak ones, each to a different question', (e) => {
    expect(e.strong.map((a) => a.level)).toEqual(['early', 'mid', 'senior']);
    expect(e.weak).toHaveLength(2);
    const ids = getCompetency(e.competencyId)?.questions.map((q) => q.id);
    const asked = [...e.strong, ...e.weak].map((a) => a.questionId);
    for (const id of asked) expect(ids).toContain(id);
    expect(new Set(asked).size).toBe(asked.length);
  });

  it.each(strongs)('$competencyId $level strong answer passes every check at a speakable length', (strong) => {
    const { seconds } = review(strong);
    expect(failing(strong)).toEqual([]);
    expect(seconds).toBeGreaterThanOrEqual(90);
    expect(seconds).toBeLessThanOrEqual(180);
  });

  it.each(weaks)('$competencyId weak answer to $questionId fails exactly the checks of its mapped flaws', (weak) => {
    const failed = failing(weak);
    expect(failed).not.toContain('complete');
    for (const [flaw, check] of MAPPED) expect([flaw, failed.includes(check)]).toEqual([flaw, weak.flaws.includes(flaw)]);
  });

  it.each(weaks)('$competencyId weak answer to $questionId explains each of its 2 or 3 flaws', (weak) => {
    expect(weak.flaws.length).toBeGreaterThanOrEqual(2);
    expect(weak.flaws.length).toBeLessThanOrEqual(3);
    expect(Object.keys(weak.why).sort()).toEqual([...weak.flaws].sort());
    expect(weak.fix).not.toBe('');
  });

  it('uses every flaw in at least 5 weak answers', () => {
    const uses = ANSWER_FLAWS.map(({ id }) => [id, weaks.filter((w) => w.flaws.includes(id)).length] as const);
    expect(uses.filter(([, n]) => n < 5)).toEqual([]);
  });

  it('never uses an em dash or a non-breaking space', () => {
    expect(JSON.stringify(EXAMPLES)).not.toMatch(/[\u2014\u00a0]/);
  });
});
