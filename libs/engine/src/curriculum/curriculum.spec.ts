import { describe, expect, it } from 'vitest';
import { ALGORITHMS, getAlgorithm } from '../algorithms/index.js';
import { CLOZES } from './clozes.js';
import { COMPLEXITY_FACTS } from './complexity.js';
import { DRILL_CARDS, cardChoices } from './drills.js';
import { PATTERNS } from './patterns.js';

const patternIds = new Set(PATTERNS.map((p) => p.id));

describe('curriculum content', () => {
  it('drill cards reference real patterns with distinct distractors', () => {
    expect(new Set(DRILL_CARDS.map((c) => c.id)).size).toBe(DRILL_CARDS.length);
    for (const c of DRILL_CARDS) {
      expect(patternIds.has(c.patternId)).toBe(true);
      expect(new Set([c.patternId, ...c.distractors]).size).toBe(4);
      c.distractors.forEach((d) => expect(patternIds.has(d)).toBe(true));
      const { choices, answer } = cardChoices(c);
      expect(choices[answer]).toBe(c.patternId);
    }
    for (const p of PATTERNS) expect(DRILL_CARDS.filter((c) => c.patternId === p.id).length).toBeGreaterThanOrEqual(2);
  });

  it('every pattern has a cloze whose distractors differ from the real line', () => {
    for (const p of PATTERNS) {
      const clozes = CLOZES[p.id];
      expect(clozes?.length, p.id).toBeGreaterThanOrEqual(1);
      for (const c of clozes) {
        const line = p.template[c.line]?.trim();
        expect(line, `${p.id} line ${c.line}`).toBeTruthy();
        expect(new Set([line, ...c.distractors.map((d) => d.trim())]).size, p.id).toBe(4);
      }
    }
  });

  it('links every visualizer from its own pattern', () => {
    for (const p of PATTERNS) for (const id of p.algorithmIds) expect(getAlgorithm(id)?.patternId, id).toBe(p.id);
    for (const a of ALGORITHMS) expect(PATTERNS.find((p) => p.id === a.patternId)?.algorithmIds, a.id).toContain(a.id);
  });

  it('complexity facts reference real patterns and have unique answers', () => {
    expect(new Set(COMPLEXITY_FACTS.map((f) => f.id)).size).toBe(COMPLEXITY_FACTS.length);
    for (const f of COMPLEXITY_FACTS) {
      expect(patternIds.has(f.patternId)).toBe(true);
      expect(new Set([f.answer, ...f.distractors]).size).toBe(4);
    }
  });
});
