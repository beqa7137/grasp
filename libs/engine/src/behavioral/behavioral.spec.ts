import { describe, expect, it } from 'vitest';
import { COMPETENCY_CATALOG } from './catalog.js';
import { COMPETENCIES, getCompetency } from './competencies.js';

const MAX_LENGTH = 220;
const MAX_WHY_LENGTH = 320;
const COMPANIES = /\b(amazon|google|meta|facebook|apple|microsoft|netflix)\b/i;

const questions = COMPETENCIES.flatMap((c) => c.questions);
const strings = COMPETENCIES.flatMap((c) => [
  ...c.strongSignals,
  ...c.redFlags,
  ...c.questions.flatMap((q) => [q.prompt, q.probes, ...q.followUps]),
]);

const duplicates = (items: string[]) => items.filter((item, i) => items.indexOf(item) !== i);

describe('behavioral guide', () => {
  it('covers the catalog in its order', () => {
    expect(COMPETENCIES.map((c) => c.id)).toEqual(COMPETENCY_CATALOG.map((c) => c.id));
    expect(getCompetency('conflict')?.id).toBe('conflict');
    expect(getCompetency('missing')).toBeUndefined();
  });

  it('gives each competency seven numbered questions and four or five signals and red flags', () => {
    for (const c of COMPETENCIES) {
      expect(c.questions.map((q) => q.id)).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `${c.id}-${n}`));
      expect(
        c.questions.every((q) => q.competencyId === c.id),
        c.id,
      ).toBe(true);
      expect(c.strongSignals.length, c.id).toBeGreaterThanOrEqual(4);
      expect(c.strongSignals.length, c.id).toBeLessThanOrEqual(5);
      expect(c.redFlags.length, c.id).toBeGreaterThanOrEqual(4);
      expect(c.redFlags.length, c.id).toBeLessThanOrEqual(5);
    }
  });

  it('never repeats a question id, a prompt or a follow-up, and gives each question three follow-ups', () => {
    expect(duplicates(questions.map((q) => q.id))).toEqual([]);
    expect(duplicates(questions.map((q) => q.prompt))).toEqual([]);
    expect(duplicates(questions.flatMap((q) => q.followUps))).toEqual([]);
    expect(questions.filter((q) => q.followUps.length !== 3).map((q) => q.id)).toEqual([]);
  });

  it('keeps every string short and free of company names', () => {
    const whys = COMPETENCIES.map((c) => c.why);
    expect(strings.filter((s) => s.length > MAX_LENGTH)).toEqual([]);
    expect(whys.filter((s) => s.length > MAX_WHY_LENGTH)).toEqual([]);
    expect([...whys, ...strings].filter((s) => COMPANIES.test(s))).toEqual([]);
  });
});
