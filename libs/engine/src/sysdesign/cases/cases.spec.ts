import { describe, expect, it } from 'vitest';
import { codeSpanProblems } from '../../code-spans.js';
import { SD_TOPICS } from '../../curriculum/sd-topics.js';
import { CASE_CATALOG } from '../case-catalog.js';
import { COMPONENTS } from '../catalog.js';
import { SCENARIOS } from '../scenarios.js';
import { simulate } from '../simulate.js';
import { CASE_LABS, CASE_STUDIES, type CaseStudy } from './index.js';

const texts = (study: CaseStudy): string[] => [
  ...study.stages.flatMap((s) => [
    s.title,
    s.prompt,
    ...s.points,
    ...(s.decision ? [s.decision.question, ...s.decision.options.flatMap((o) => [o.label, o.why])] : []),
    ...(s.estimate ? [s.estimate.question, ...s.estimate.working] : []),
  ]),
  ...study.pitfalls,
  ...study.followUps.flatMap((f) => [f.question, f.answer]),
];

describe('system design case studies', () => {
  it('lists every study once, each with a Design Lab build', () => {
    const ids = CASE_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CASE_STUDIES.map((s) => s.id)).toEqual(ids);
    expect(Object.keys(CASE_LABS).sort()).toEqual([...ids].sort());
  });

  it('tags each study with design topics that exist', () => {
    const topics = new Set(SD_TOPICS.map((t) => t.id));
    for (const c of CASE_CATALOG)
      expect(
        c.topics.filter((t) => !topics.has(t)),
        c.id,
      ).toEqual([]);
  });

  it.each(CASE_STUDIES.map((s) => [s.id, s] as const))('%s walks the interview from requirements to a wrap-up', (_id, study) => {
    const kinds = study.stages.map((s) => s.kind);
    expect(kinds[0]).toBe('requirements');
    expect(kinds.at(-1)).toBe('wrap-up');
    expect(kinds).toContain('estimation');
    expect(study.stages.filter((s) => s.lab)).toHaveLength(1);
    for (const stage of study.stages) expect(stage.points.length, stage.title).toBeGreaterThanOrEqual(2);
    expect(study.pitfalls.length).toBeGreaterThanOrEqual(3);
    expect(study.followUps.length).toBeGreaterThanOrEqual(2);
  });

  it.each(CASE_STUDIES.map((s) => [s.id, s] as const))('%s has one best option per decision and positive estimates', (_id, study) => {
    for (const { decision, estimate, title } of study.stages) {
      if (decision) {
        expect(decision.options.length, title).toBeGreaterThanOrEqual(2);
        expect(decision.options.length, title).toBeLessThanOrEqual(4);
        expect(
          decision.options.filter((o) => o.best),
          title,
        ).toHaveLength(1);
      }
      if (estimate) {
        expect(Number.isFinite(estimate.answer) && estimate.answer > 0, title).toBe(true);
        expect(estimate.working.length, title).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it.each(CASE_STUDIES.map((s) => [s.id, s] as const))('%s keeps its code spans balanced and short', (_id, study) => {
    expect(texts(study).flatMap(codeSpanProblems)).toEqual([]);
  });

  it.each(Object.entries(CASE_LABS))('the %s build is wired legally and carries its load without a single point of failure', (_id, lab) => {
    const kinds = new Map(lab.design.nodes.map((n) => [n.id, n.kind]));
    for (const e of lab.design.edges) expect(COMPONENTS[kinds.get(e.from)!].connectsTo, `${e.from} to ${e.to}`).toContain(kinds.get(e.to));
    for (const n of lab.design.nodes) expect(n.instances, n.id).toBeLessThanOrEqual(COMPONENTS[n.kind].maxInstances);
    // The Design Lab fits its board to the view, so a build wider or taller than the missions' starters opens clipped.
    const widest = Math.max(...SCENARIOS.flatMap((s) => s.starter.nodes.map((n) => n.x)));
    for (const n of lab.design.nodes) {
      expect(n.x, n.id).toBeLessThanOrEqual(widest);
      // Nodes are 132 units wide and 70 tall; closer centres make neighbours touch.
      const crowded = lab.design.nodes.filter((o) => o !== n && Math.abs(o.x - n.x) < 150 && Math.abs(o.y - n.y) < 100);
      expect(
        crowded.map((o) => o.id),
        n.id,
      ).toEqual([]);
      expect(n.y, n.id).toBeGreaterThanOrEqual(60);
      expect(n.y, n.id).toBeLessThanOrEqual(420);
    }
    const result = simulate(lab.design, lab.workload);
    expect(result.metrics.errorRate).toBeLessThanOrEqual(0.001);
    expect(result.metrics.p99Ms).toBeLessThanOrEqual(250);
    expect(result.insights.filter((i) => i.severity !== 'tip').map((i) => i.title)).toEqual([]);
  });
});
