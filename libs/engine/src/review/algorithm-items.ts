import { ALGORITHMS } from '../algorithms/index.js';
import { CLOZES } from '../curriculum/clozes.js';
import { COMPLEXITY_FACTS } from '../curriculum/complexity.js';
import { DRILL_CARDS } from '../curriculum/drills.js';
import { PATTERNS, getPattern } from '../curriculum/patterns.js';
import { seeded, withChoices } from './random.js';
import { clozeSummary, complexitySummary, predictSummary, recognitionSummary } from './summaries.js';
import { KIND_LABELS, type ItemDef } from './types.js';

const patternName = (id: string) => getPattern(id)?.name ?? id;
const patternLink = (id: string) => ({ label: `Review ${patternName(id)}`, path: ['/learn/pattern', id] });

const recognitionItems: ItemDef[] = DRILL_CARDS.map((card, i) => ({
  ...recognitionSummary(card, i),
  label: card.prompt.length > 70 ? `${card.prompt.slice(0, 67)}…` : card.prompt,
  generate(seed) {
    const rand = seeded(seed);
    const names = [card.patternId, ...card.distractors].map(patternName);
    const { choices, answer } = withChoices(rand, names[0], names.slice(1));
    return {
      itemId: this.id,
      kind: 'recognition',
      topic: card.patternId,
      seed,
      eyebrow: KIND_LABELS.recognition,
      prompt: card.prompt,
      choices,
      answer,
      explain: card.tell,
      link: patternLink(card.patternId),
    };
  },
}));

const complexityItems: ItemDef[] = COMPLEXITY_FACTS.map((fact, i) => ({
  ...complexitySummary(fact, i),
  label: fact.question,
  generate(seed) {
    const { choices, answer } = withChoices(seeded(seed), fact.answer, fact.distractors);
    return {
      itemId: this.id,
      kind: 'complexity',
      topic: fact.patternId,
      seed,
      eyebrow: `${KIND_LABELS.complexity} · ${patternName(fact.patternId)}`,
      prompt: fact.question,
      choices,
      answer,
      explain: fact.why,
      link: patternLink(fact.patternId),
    };
  },
}));

const clozeItems: ItemDef[] = PATTERNS.flatMap((pattern) =>
  CLOZES[pattern.id].map((cloze, n): ItemDef => ({
    ...clozeSummary(pattern.id, n),
    label: `${pattern.name} template, line ${cloze.line + 1}`,
    generate(seed) {
      const correct = pattern.template[cloze.line].trim();
      const { choices, answer } = withChoices(
        seeded(seed),
        correct,
        cloze.distractors.map((d) => d.trim()),
      );
      return {
        itemId: this.id,
        kind: 'cloze',
        topic: pattern.id,
        seed,
        eyebrow: `${KIND_LABELS.cloze} · ${pattern.name}`,
        prompt: `Which line completes the ${pattern.name} template${cloze.hint ? ` (${cloze.hint})` : ''}?`,
        code: { lines: pattern.template, blank: cloze.line },
        choices,
        answer,
        explain: cloze.why,
        link: patternLink(pattern.id),
      };
    },
  })),
);

const predictItems: ItemDef[] = ALGORITHMS.map((algo) => ({
  ...predictSummary(algo),
  label: `${algo.title}: call the next move`,
  generate(seed) {
    for (let attempt = 0; attempt < 25; attempt++) {
      const rand = seeded(seed + attempt * 7919);
      const frames = algo.trace(algo.validate(algo.randomInput(rand)));
      const decisions = frames.filter((f) => f.predict);
      if (decisions.length === 0) continue;
      const frame = decisions[Math.floor(rand() * decisions.length)];
      const p = frame.predict!;
      const { choices, answer } = p.ordered
        ? p
        : withChoices(
            rand,
            p.choices[p.answer],
            p.choices.filter((_, i) => i !== p.answer),
          );
      return {
        itemId: this.id,
        kind: 'predict',
        topic: algo.patternId,
        seed,
        eyebrow: `${KIND_LABELS.predict} · ${algo.title}`,
        prompt: p.prompt,
        frame: { ...frame, predict: undefined },
        code: { lines: algo.code, highlight: frame.line },
        choices,
        answer,
        explain: p.explain,
        link: { label: `Open the ${algo.title} visualizer`, path: ['/visualize', algo.id] },
      };
    }
    throw new Error(`Could not generate a prediction for ${algo.id}`);
  },
}));

export const ALGORITHM_ITEMS: ItemDef[] = [...recognitionItems, ...complexityItems, ...clozeItems, ...predictItems];
