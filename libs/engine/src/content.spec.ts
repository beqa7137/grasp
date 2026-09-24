import { describe, expect, it } from 'vitest';
import { CODING_PROBLEMS } from './coding/problems.js';
import { CLOZES } from './curriculum/clozes.js';
import { COMPLEXITY_FACTS } from './curriculum/complexity.js';
import { DRILL_CARDS } from './curriculum/drills.js';
import { PATTERNS } from './curriculum/patterns.js';
import { SD_TOPICS } from './curriculum/sd-topics.js';
import { REVIEW_ITEMS, generateQuestion } from './review/catalog.js';
import { COMPONENTS, SHARD_KEYS } from './sysdesign/catalog.js';
import { SCENARIOS } from './sysdesign/scenarios.js';

const EM_DASH = '\u2014';
const SEEDS = Array.from({ length: 20 }, (_, i) => i * 7_919 + 3);

type Entry = [id: string, value: unknown];

const byId = (kind: string, items: { id: string }[]) => items.map((item): Entry => [`${kind} ${item.id}`, item]);
const byKey = (kind: string, record: Record<string, unknown>) =>
  Object.entries(record).map(([key, value]): Entry => [`${kind} ${key}`, value]);

/** Every learner-facing export, each named so a failure points at the entry to fix. */
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
    ...byId('coding problem', CODING_PROBLEMS),
    ...REVIEW_ITEMS.flatMap((item) => SEEDS.map((seed): Entry => [`review item ${item.id}`, generateQuestion(item.id, seed)])),
  ];
}

describe('learner-facing content', () => {
  it('never shows an em dash', () => {
    const offenders = learnerContent()
      .filter(([, value]) => JSON.stringify(value).includes(EM_DASH))
      .map(([id]) => id);
    expect([...new Set(offenders)]).toEqual([]);
  });
});
