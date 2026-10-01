import { describe, expect, it } from 'vitest';
import { ALGORITHMS, mulberry32, type AlgorithmDef } from './algorithms/index.js';
import { COMPETENCY_CATALOG } from './behavioral/catalog.js';
import { COMPETENCIES } from './behavioral/competencies.js';
import { EXAMPLES } from './behavioral/examples.js';
import { codeSpanProblems, codeSpans } from './code-spans.js';
import { CODING_PROBLEMS } from './coding/problems/index.js';
import { CLOZES } from './curriculum/clozes.js';
import { COMPLEXITY_FACTS } from './curriculum/complexity.js';
import { DRILL_CARDS } from './curriculum/drills.js';
import { PATTERNS } from './curriculum/patterns.js';
import { SD_TOPICS } from './curriculum/sd-topics.js';
import { REVIEW_ITEMS, generateQuestion } from './review/items.js';
import type { ItemDef } from './review/types.js';
import { COMPONENTS, SHARD_KEYS } from './sysdesign/catalog.js';
import { CASE_BRIEFS } from './sysdesign/case-briefs.js';
import { CASE_CATALOG } from './sysdesign/case-catalog.js';
import {
  CASE_STUDIES,
  CELL_PRECISIONS,
  DENSITIES,
  MAX_ATTEMPTS,
  RECON_ACTIONS,
  ROLLOUT_STAGES,
  bucketingCheckpoint,
  cellSearchCheckpoint,
  explainRow,
  hotAccountCheckpoint,
  propagationCheckpoint,
  quadtreeCheckpoint,
  reconcile,
  reconciliationDay,
  retryCheckpoint,
  retryRun,
  type Assignment,
  type AttemptFate,
  type KeyMode,
  type PollPayload,
} from './sysdesign/cases/index.js';
import { SD_LESSONS } from './sysdesign/lessons/index.js';
import { SCENARIOS } from './sysdesign/scenarios.js';

const BANNED: [name: string, char: string][] = [
  ['an em dash', '\u2014'],
  ['a non-breaking space', '\u00a0'],
];
/** A comparison or assignment between operands, a property access or an index: the code a pattern's or a problem's prose names. */
const CODE_OUTSIDE_SPANS = /\w\s*(?:[=!<>]=?=?|>>>?)\s*\w|\w\.\w|\w\[\w*\]/;
const RANDOM_TRACES = 20;
const REVIEW_SEEDS = Array.from({ length: 20 }, (_, i) => i * 7_919 + 3);

type Entry = [name: string, value: unknown];

const codeOutsideSpans = (text: string) =>
  codeSpans(text)
    .filter((part) => !part.code && CODE_OUTSIDE_SPANS.test(part.text))
    .map((part) => `code outside a code span: ${part.text}`);

const byId = (kind: string, items: { id: string }[]) => items.map((item): Entry => [`${kind} ${item.id}`, item]);
const byKey = (kind: string, record: Record<string, unknown>) =>
  Object.entries(record).map(([key, value]): Entry => [`${kind} ${key}`, value]);

const traces = (algo: AlgorithmDef) => {
  const rand = mulberry32(algo.id.length);
  const inputs = [algo.defaultInput, ...Array.from({ length: RANDOM_TRACES }, () => algo.randomInput(rand))];
  return inputs.map((input) => algo.trace(algo.validate(input)));
};

function* attemptSequences(length: number): Generator<AttemptFate[]> {
  if (!length) return yield [];
  for (const rest of attemptSequences(length - 1)) for (const fate of ['ok', 'lost', 'dropped'] as const) yield [...rest, fate];
}

/** The text the payment ledger case's widgets build from their settings: every retry run, and checkpoints and days over a sweep. */
function caseWidgetText(): unknown {
  const modes: KeyMode[] = ['none', 'per-attempt', 'per-payment'];
  const retries = [1, 2, 3, MAX_ATTEMPTS].flatMap((n) =>
    [...attemptSequences(n)].flatMap((fates) => modes.map((mode) => [retryRun(fates, mode), retryCheckpoint(fates, mode)])),
  );
  const contention = [100, 2_300, 20_000].flatMap((offered) =>
    [1, 5, 20].flatMap((lockMs) =>
      [1, 64].flatMap((subAccounts) => [1, 50].map((batch) => hotAccountCheckpoint({ offered, lockMs, subAccounts, batch }))),
    ),
  );
  const days = REVIEW_SEEDS.map((seed) => {
    const day = reconciliationDay(seed);
    return reconcile(day).map((row) => explainRow(row, day.cutoff));
  });
  return { retries, contention, days, actions: RECON_ACTIONS };
}

/** The text the feature flag case's widgets build: each scheme and stage, fresh and after one change, and propagation over a sweep. */
function flagWidgetText(): unknown {
  const schemes: Assignment[] = ['flag-salt', 'user-only', 'random'];
  const bucketing = schemes.flatMap((scheme) =>
    ROLLOUT_STAGES.flatMap((percent) => [
      bucketingCheckpoint({ scheme, percent, saltVersion: 1 }, null),
      bucketingCheckpoint({ scheme, percent, saltVersion: 1 }, { percent: percent === 10 ? 25 : 10, saltVersion: 1 }),
      bucketingCheckpoint({ scheme, percent, saltVersion: 2 }, { percent, saltVersion: 1 }),
    ]),
  );
  const payloads: PollPayload[] = ['full', 'etag', 'delta'];
  const propagation = [1_000, 20_000, 100_000].flatMap((instances) =>
    [5, 30, 300].flatMap((intervalS) =>
      [0, 1, 2, 30].flatMap((changesPerMin) => [
        ...payloads.flatMap((payload) =>
          [false, true].map((cdn) => propagationCheckpoint({ instances, delivery: 'poll', intervalS, payload, cdn, changesPerMin })),
        ),
        propagationCheckpoint({ instances, delivery: 'stream', intervalS, payload: 'full', cdn: false, changesPerMin }),
      ]),
    ),
  );
  return { bucketing, propagation };
}

/** The text the proximity case's widgets build: both scopes at every precision over a range of radii, and the quadtree over capacities. */
function proximityWidgetText(): unknown {
  const cells = CELL_PRECISIONS.flatMap((precision) =>
    [0.1, 0.5, 1, 2.5, 5].flatMap((radiusKm) =>
      (['own', 'neighbours'] as const).map((scope) => cellSearchCheckpoint({ precision, radiusKm, scope })),
    ),
  );
  const quadtree = DENSITIES.flatMap((density) => [5, 10, 15, 100, 400].map((capacity) => quadtreeCheckpoint({ capacity, density })));
  return { cells, quadtree };
}

// A prediction's frames come from the tracers, which have entries of their own, so one seed covers the text it adds itself.
const questions = (item: ItemDef) =>
  (item.kind === 'predict' ? REVIEW_SEEDS.slice(0, 1) : REVIEW_SEEDS).map((seed) => generateQuestion(item.id, seed));

/**
 * All learner-facing content, one entry per item so a failure names the one to fix: the curriculum, design, coding and
 * behavioral catalogs; every tracer's metadata with its default trace and seeded random ones; and every review item with its
 * generated questions.
 */
function learnerContent(): Entry[] {
  return [
    ...byId('pattern', PATTERNS),
    ...byId('drill card', DRILL_CARDS),
    ...byKey('clozes for', CLOZES),
    ...byId('complexity fact', COMPLEXITY_FACTS),
    ...byId('design topic', SD_TOPICS),
    ...byId('scenario', SCENARIOS),
    ...byKey('component', COMPONENTS),
    ...byKey('shard key', SHARD_KEYS),
    ...byId('case summary', [...CASE_CATALOG]),
    ...byId('case brief', [...CASE_BRIEFS]),
    ...byId('case study', [...CASE_STUDIES]),
    ['payment ledger case widgets', caseWidgetText()],
    ['feature flag case widgets', flagWidgetText()],
    ['proximity case widgets', proximityWidgetText()],
    ...byKey('design lesson', SD_LESSONS),
    ...byId('coding problem', CODING_PROBLEMS),
    ...byId('competency summary', [...COMPETENCY_CATALOG]),
    ...byId('competency', [...COMPETENCIES]),
    ...EXAMPLES.map((e): Entry => [`behavioral examples for ${e.competencyId}`, e]),
    ...ALGORITHMS.map((algo): Entry => [`tracer ${algo.id}`, { ...algo, traces: traces(algo) }]),
    ...REVIEW_ITEMS.map((item): Entry => [`review item ${item.id}`, { ...item, questions: questions(item) }]),
  ];
}

describe('learner-facing content', () => {
  it('never shows an em dash or a non-breaking space', () => {
    const problems = learnerContent().flatMap(([name, value]) => {
      const json = JSON.stringify(value);
      return BANNED.filter(([, char]) => json.includes(char)).map(([problem]) => `${name} has ${problem}`);
    });
    expect(problems).toEqual([]);
  });

  it('marks the code in pattern one-liners, cues and pitfalls as code spans the pattern page can set', () => {
    const problems = PATTERNS.flatMap((pattern) =>
      [pattern.oneLiner, ...pattern.cues, ...pattern.pitfalls]
        .flatMap((text) => [...codeSpanProblems(text), ...codeOutsideSpans(text)])
        .map((problem) => `pattern ${pattern.id} has ${problem}`),
    );
    expect(problems).toEqual([]);
  });

  // Not example explanations: arithmetic such as `1 + 3 = 4` would match as an assignment.
  it('marks the code in coding problem statements and approaches as code spans', () => {
    const problems = CODING_PROBLEMS.flatMap((p) =>
      [...p.statement, p.approach].flatMap(codeOutsideSpans).map((problem) => `coding problem ${p.id} has ${problem}`),
    );
    expect(problems).toEqual([]);
  });

  it('keeps the code spans in coding problem statements, explanations and approaches balanced and short enough to fit the line', () => {
    const problems = CODING_PROBLEMS.flatMap((p) =>
      [...p.statement, ...p.examples.flatMap((e) => e.explanation ?? []), p.approach]
        .flatMap(codeSpanProblems)
        .map((problem) => `coding problem ${p.id} has ${problem}`),
    );
    expect(problems).toEqual([]);
  });
});
