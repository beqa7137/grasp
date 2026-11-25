import { describe, expect, it } from 'vitest';
import { COMPETENCY_CATALOG } from '../behavioral/catalog.js';
import { QUESTION_PROMPTS } from '../behavioral/question-prompts.js';
import { OFFERED_COMPANIES, TARGET_COMPANIES } from '../plan/options.js';
import { COMPANY_NAMES } from './companies.js';
import { COMPANY_CULTURES, attributesOfCompetency, attributesOfQuestion, cultureFor, notCovered } from './culture.js';
import { COMPANY_LOOPS } from './loops.js';
import { FREQUENCY_WORDS } from './wording.js';

const competencies = new Set(COMPETENCY_CATALOG.map((c) => c.id));
const questions = new Map(QUESTION_PROMPTS.map((q) => [q.id, q.competencyId]));
const COMPANIES = new RegExp(`\\b(${Object.values(COMPANY_NAMES).join('|')})\\b`, 'i');
const plain = (text: string) => !/[\u2014\u00a0]/.test(text) && !FREQUENCY_WORDS.test(text);

describe('company cultures', () => {
  it('are offered for exactly the companies with a mapping', () => {
    expect([...OFFERED_COMPANIES].sort()).toEqual(Object.keys(COMPANY_CULTURES).sort());
    for (const c of OFFERED_COMPANIES) expect(TARGET_COMPANIES).toContain(c);
  });

  it("name Microsoft's five culture attributes in its order", () => {
    expect(cultureFor('microsoft').map((a) => a.name)).toEqual([
      'Growth mindset',
      'Customer obsessed',
      'Diverse and inclusive',
      'One Microsoft',
      'Making a difference',
    ]);
    expect(cultureFor(undefined)).toEqual([]);
    expect(cultureFor('amazon')).toEqual([]);
  });

  it('map every attribute with a reason, or list it as not covered by a competency', () => {
    for (const a of Object.values(COMPANY_CULTURES).flat()) {
      expect(a.competencies.length + a.questions.length, a.id).toBeGreaterThan(0);
      for (const p of [...a.competencies, ...a.questions]) {
        expect(p.reason.trim(), `${a.id} ${p.id}`).not.toBe('');
        expect(p.reason.length, `${a.id} ${p.id}`).toBeLessThanOrEqual(120);
      }
    }
    expect(notCovered('microsoft').map((a) => a.id)).toEqual(['diverse-inclusive']);
  });

  it('point only at real competencies and questions, once each, never a question its own competency already maps', () => {
    for (const a of Object.values(COMPANY_CULTURES).flat()) {
      const ids = [...a.competencies, ...a.questions].map((p) => p.id);
      expect(new Set(ids).size, a.id).toBe(ids.length);
      for (const c of a.competencies) expect(competencies.has(c.id), c.id).toBe(true);
      for (const q of a.questions) {
        expect(questions.has(q.id), q.id).toBe(true);
        expect(
          a.competencies.map((c) => c.id),
          q.id,
        ).not.toContain(questions.get(q.id));
      }
    }
  });

  it('find the attributes of a question through its competency or on its own', () => {
    expect(attributesOfQuestion('microsoft', 'learning-1', 'learning').map((a) => a.id)).toEqual(['growth-mindset']);
    expect(attributesOfQuestion('microsoft', 'feedback-3', 'feedback').map((a) => a.id)).toEqual(['growth-mindset']);
    expect(attributesOfQuestion('microsoft', 'delivery-4', 'delivery').map((a) => a.id)).toEqual(['one-microsoft']);
    expect(attributesOfQuestion('microsoft', 'tradeoffs-1', 'tradeoffs')).toEqual([]);
    expect(attributesOfQuestion(undefined, 'learning-1', 'learning')).toEqual([]);
    expect(attributesOfCompetency('microsoft', 'collaboration').map((a) => a.id)).toEqual(['one-microsoft']);
  });

  it('keep reasons and probes in plain punctuation, free of frequency words, with probes naming no company', () => {
    for (const a of Object.values(COMPANY_CULTURES).flat()) {
      for (const text of [a.name, a.probe, ...[...a.competencies, ...a.questions].map((p) => p.reason)])
        expect(plain(text), text).toBe(true);
      expect(a.probe, a.id).not.toMatch(COMPANIES);
      expect(a.probe.endsWith('?'), a.id).toBe(true);
    }
  });
});

describe('company loops', () => {
  it('describe each offered company with a title for every level, in plain punctuation', () => {
    for (const company of OFFERED_COMPANIES) {
      const loop = COMPANY_LOOPS[company]!;
      expect(loop.lines.length, company).toBeGreaterThan(0);
      expect(Object.keys(loop.levels).sort()).toEqual(['early', 'mid', 'senior']);
      for (const text of [...loop.lines, ...Object.values(loop.levels)]) expect(plain(text), text).toBe(true);
    }
  });
});
