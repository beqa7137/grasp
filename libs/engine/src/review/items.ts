import { ALGORITHM_ITEMS } from './algorithm-items.js';
import { REVIEW_CATALOG } from './catalog.js';
import { DESIGN_ITEMS } from './design-items.js';
import type { ItemDef, Question, ReviewItem } from './types.js';

const byId = new Map([...ALGORITHM_ITEMS, ...DESIGN_ITEMS].map((i) => [i.id, i]));

export const REVIEW_ITEMS: ItemDef[] = REVIEW_CATALOG.map((summary) => byId.get(summary.id)!);

export function getReviewItem(id: string): ItemDef | undefined {
  return byId.get(id);
}

export function generateQuestion(itemId: string, seed: number): Question {
  const def = byId.get(itemId);
  if (!def) throw new Error(`Unknown review item ${itemId}`);
  return def.generate(seed);
}

/** The item as it leaves the engine. Labels show as plain text, so the code-span backticks some borrow from a prompt are dropped. */
export function describeItem(def: ItemDef): ReviewItem {
  const { id, kind, topic, label, order, algorithmId } = def;
  return { id, kind, topic, label: label.replaceAll('`', ''), order, ...(algorithmId ? { algorithmId } : {}) };
}
