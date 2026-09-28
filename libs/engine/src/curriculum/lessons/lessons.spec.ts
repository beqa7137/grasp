import { describe, expect, it } from 'vitest';
import { ALGORITHMS } from '../../algorithms/index.js';
import { codeSpanProblems } from '../../code-spans.js';
import { PATTERN_CATALOG } from '../catalog.js';
import { LESSONS } from './index.js';

const texts = (id: string) => {
  const l = LESSONS[id as keyof typeof LESSONS];
  return [
    l.why,
    ...l.examples.flatMap((e) => [e.title, e.problem, e.insight, ...e.steps]),
    ...l.variations.flatMap((v) => [v.name, v.how]),
    ...l.followUps.flatMap((f) => [f.question, f.answer]),
  ];
};

describe('pattern lessons', () => {
  it('cover every pattern with two to five worked examples, three variations and three follow-ups', () => {
    for (const p of PATTERN_CATALOG) {
      const lesson = LESSONS[p.id];
      expect(lesson, p.id).toBeDefined();
      expect(lesson.examples.length, p.id).toBeGreaterThanOrEqual(2);
      expect(lesson.examples.length, p.id).toBeLessThanOrEqual(5);
      expect(lesson.variations, p.id).toHaveLength(3);
      expect(lesson.followUps, p.id).toHaveLength(3);
      for (const e of lesson.examples) {
        expect(e.steps.length, `${p.id} ${e.title}`).toBeGreaterThanOrEqual(3);
        expect(e.steps.length, `${p.id} ${e.title}`).toBeLessThanOrEqual(7);
      }
    }
    expect(Object.keys(LESSONS).sort()).toEqual(PATTERN_CATALOG.map((p) => p.id).sort());
  });

  it('replays each example in one of its own pattern visualizers, with an input the tracer accepts and a short trace', () => {
    for (const p of PATTERN_CATALOG) {
      for (const e of LESSONS[p.id].examples.filter((x) => x.visualize)) {
        const { algorithmId, input } = e.visualize!;
        expect(p.algorithmIds, `${p.id} ${e.title}`).toContain(algorithmId);
        const algo = ALGORITHMS.find((a) => a.id === algorithmId)!;
        const frames = algo.trace(algo.validate(input));
        expect(frames.length, `${p.id} ${e.title}`).toBeLessThanOrEqual(60);
      }
      expect(
        LESSONS[p.id].examples.some((x) => x.visualize),
        `${p.id} has a replayable example`,
      ).toBe(true);
    }
  });

  it('keeps code in balanced, short code spans', () => {
    const problems = PATTERN_CATALOG.flatMap((p) =>
      texts(p.id)
        .flatMap(codeSpanProblems)
        .map((m) => `${p.id}: ${m}`),
    );
    expect(problems).toEqual([]);
  });

  it('keeps every sentence plain: no em dash, no non-breaking space, nothing over 400 characters', () => {
    for (const p of PATTERN_CATALOG)
      for (const t of texts(p.id)) {
        expect(t, p.id).not.toMatch(/[— ]/);
        expect(t.length, `${p.id}: ${t.slice(0, 40)}`).toBeLessThanOrEqual(400);
      }
  });
});
