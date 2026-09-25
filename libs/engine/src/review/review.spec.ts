import { describe, expect, it } from 'vitest';
import { getAlgorithm } from '../algorithms/index.js';
import { predictions, tracerFixture } from '../algorithms/tracer.fixture.js';
import { codeSpanProblems } from '../code-spans.js';
import { PATTERNS } from '../curriculum/patterns.js';
import { SD_TOPICS } from '../curriculum/sd-topics.js';
import { REVIEW_CATALOG, itemsForTopic } from './catalog.js';
import { REVIEW_ITEMS, describeItem, generateQuestion, getReviewItem } from './items.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 104_729 + 17);

describe('review item catalog', () => {
  it('has unique ids and valid topics', () => {
    expect(new Set(REVIEW_ITEMS.map((i) => i.id)).size).toBe(REVIEW_ITEMS.length);
    const topics = new Set([...PATTERNS.map((p) => p.id), ...SD_TOPICS.map((t) => t.id)]);
    for (const item of REVIEW_ITEMS) expect(topics.has(item.topic)).toBe(true);
  });

  it("REVIEW_ITEMS are the catalog's items, in its order, each with a label and a question builder", () => {
    expect(REVIEW_ITEMS).toHaveLength(REVIEW_CATALOG.length);
    expect(REVIEW_ITEMS.map(({ label: _label, generate: _generate, ...summary }) => summary)).toEqual(REVIEW_CATALOG);
    for (const item of REVIEW_ITEMS) {
      expect(item.label, item.id).toMatch(/\S/);
      expect(typeof item.generate, item.id).toBe('function');
    }
  });

  it('covers every pattern with several kinds of item and every design topic', () => {
    for (const p of PATTERNS) {
      const items = itemsForTopic(p.id);
      expect(items.length, p.id).toBeGreaterThanOrEqual(3);
      expect(new Set(items.map((i) => i.kind)).size, p.id).toBeGreaterThanOrEqual(2);
    }
    for (const t of SD_TOPICS) expect(itemsForTopic(t.id).length, t.id).toBeGreaterThanOrEqual(2);
  });

  it.each(REVIEW_ITEMS.map((i) => [i.id]))('%s generates valid, deterministic questions', (itemId) => {
    for (const seed of SEEDS) {
      const q = generateQuestion(itemId, seed);
      expect(q.itemId).toBe(itemId);
      expect(q.prompt.length).toBeGreaterThan(10);
      expect(q.explain.length).toBeGreaterThan(10);
      expect([q.prompt, q.explain].flatMap(codeSpanProblems)).toEqual([]);
      expect(q.choices.length).toBeGreaterThanOrEqual(q.kind === 'predict' ? 2 : 3);
      expect(new Set(q.choices).size).toBe(q.choices.length);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
      if (q.frame) expect(q.frame.predict).toBeUndefined();
      if (q.code?.blank !== undefined) expect(q.code.lines[q.code.blank]).toBeDefined();
    }
    expect(generateQuestion(itemId, 99)).toEqual(generateQuestion(itemId, 99));
  });

  it('moves the correct answer around between reviews so positions cannot be memorized', () => {
    for (const item of REVIEW_ITEMS.filter((i) => i.kind === 'recognition' || i.kind === 'cloze')) {
      const positions = new Set(SEEDS.map((s) => generateQuestion(item.id, s).answer));
      expect(positions.size, item.id).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(['binary-search', 'pair-sum-sorted', 'dijkstra', 'lcs'])('keeps the %s menu in the order the visualizer shows it', (id) => {
    const algo = getAlgorithm(id)!;
    const menu = predictions(tracerFixture(algo).traceOf(algo.defaultInput))[0].choices;
    for (const seed of SEEDS) expect(generateQuestion(`pred:${id}`, seed).choices).toEqual(menu);
  });

  it('keeps a fixed menu in order beside questions whose choices move around', () => {
    const algo = getAlgorithm('two-sum-hash')!;
    const menu = predictions(tracerFixture(algo).traceOf(algo.defaultInput)).find((p) => p.ordered)!.choices;
    const questions = SEEDS.map((seed) => generateQuestion('pred:two-sum-hash', seed));
    const fromMenu = questions.filter((q) => q.choices.every((c) => menu.includes(c)));
    expect(fromMenu.length).toBeGreaterThan(0);
    for (const q of fromMenu) expect(q.choices).toEqual(menu);
    const rotating = questions.filter((q) => !fromMenu.includes(q));
    expect(new Set(rotating.map((q) => q.answer)).size).toBeGreaterThanOrEqual(3);
  });

  it('generates genuinely different variants for predict and numeric design items', () => {
    const varied = REVIEW_ITEMS.filter(
      (i) =>
        i.kind === 'predict' ||
        ['sd:response-time', 'sd:bottleneck', 'sd:qps', 'sd:queue-drain', 'sd:spof', 'sd:token-bucket', 'sd:shard-count'].includes(i.id),
    );
    for (const item of varied) {
      const prompts = new Set(
        SEEDS.map((s) =>
          JSON.stringify([
            generateQuestion(item.id, s).prompt,
            generateQuestion(item.id, s).pipeline,
            generateQuestion(item.id, s).frame?.vars,
          ]),
        ),
      );
      expect(prompts.size, item.id).toBeGreaterThanOrEqual(5);
    }
  });

  it('cloze answers are the real template line', () => {
    for (const item of REVIEW_ITEMS.filter((i) => i.kind === 'cloze')) {
      const q = generateQuestion(item.id, 1);
      expect(q.choices[q.answer]).toBe(q.code!.lines[q.code!.blank!].trim());
    }
  });

  it('describes every item with a plain-text label, even one taken from a prompt with code spans', () => {
    expect(getReviewItem('sd:reshard')!.label).toContain('`hash(key) % N`');
    expect(describeItem(getReviewItem('sd:reshard')!).label).toContain('instead of hash(key) % N?');
    expect(REVIEW_ITEMS.map(describeItem).filter((item) => item.label.includes('`'))).toEqual([]);
  });

  it('exposes lookups', () => {
    expect(getReviewItem('rec:h1')?.kind).toBe('recognition');
    expect(getReviewItem('nope')).toBeUndefined();
    expect(() => generateQuestion('nope', 1)).toThrow();
  });
});

describe('answer-length tells', () => {
  it('the correct answer is not conspicuously the longest option', () => {
    let longest = 0;
    let total = 0;
    for (const item of REVIEW_ITEMS.filter((i) => i.kind === 'design' || i.kind === 'complexity')) {
      for (const seed of SEEDS.slice(0, 10)) {
        const q = generateQuestion(item.id, seed);
        const lengths = q.choices.map((c) => c.length);
        if (lengths[q.answer] === Math.max(...lengths) && lengths[q.answer] > 1.4 * Math.max(...lengths.filter((_, i) => i !== q.answer)))
          longest++;
        total++;
      }
    }
    expect(longest / total).toBeLessThan(0.15);
  });
});
