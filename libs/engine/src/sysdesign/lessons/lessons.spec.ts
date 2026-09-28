import { describe, expect, it } from 'vitest';
import { codeSpanProblems } from '../../code-spans.js';
import { SD_TOPICS } from '../../curriculum/sd-topics.js';
import { SD_LESSONS } from './index.js';

const texts = (l: (typeof SD_LESSONS)[string]) => [
  l.why,
  ...l.widget.tryThis,
  ...l.concepts.flatMap((c) => [c.title, c.body]),
  ...l.examples.flatMap((e) => [e.title, e.problem, e.insight, ...e.steps]),
  ...l.pitfalls,
  ...l.followUps.flatMap((f) => [f.question, f.answer]),
];

describe('system design lessons', () => {
  it('teach existing topics, each with a widget, experiments, concepts, examples, pitfalls and follow-ups', () => {
    const topics = new Set(SD_TOPICS.map((t) => t.id));
    for (const [id, l] of Object.entries(SD_LESSONS)) {
      expect(topics.has(id), id).toBe(true);
      expect(l.widget.tryThis.length, id).toBeGreaterThanOrEqual(2);
      expect(l.concepts.length, id).toBeGreaterThanOrEqual(3);
      expect(l.examples.length, id).toBeGreaterThanOrEqual(2);
      expect(l.examples.length, id).toBeLessThanOrEqual(4);
      for (const e of l.examples) expect(e.steps.length, `${id} ${e.title}`).toBeGreaterThanOrEqual(3);
      expect(l.pitfalls.length, id).toBeGreaterThanOrEqual(3);
      expect(l.followUps.length, id).toBeGreaterThanOrEqual(2);
      expect(new Set(Object.values(SD_LESSONS).map((x) => x.widget.kind)).size).toBe(Object.keys(SD_LESSONS).length);
    }
  });

  it.each(Object.entries(SD_LESSONS))('%s keeps its code spans balanced and short', (_id, lesson) => {
    expect(texts(lesson).flatMap(codeSpanProblems)).toEqual([]);
  });
});
