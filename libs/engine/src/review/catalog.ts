import { ALGORITHM_ITEMS } from './algorithm-items.js';
import { DESIGN_ITEMS } from './design-items.js';
import type { ItemDef, Question, ReviewItem } from './types.js';

export const REVIEW_ITEMS: ItemDef[] = [...ALGORITHM_ITEMS, ...DESIGN_ITEMS].sort((a, b) => a.order - b.order);

const byId = new Map(REVIEW_ITEMS.map((i) => [i.id, i]));

export function getReviewItem(id: string): ItemDef | undefined {
  return byId.get(id);
}

export function itemsForTopic(topic: string): ItemDef[] {
  return REVIEW_ITEMS.filter((i) => i.topic === topic);
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
