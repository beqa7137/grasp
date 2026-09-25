import type { Frame } from '../algorithms/types.js';

export type ItemKind = 'recognition' | 'predict' | 'cloze' | 'complexity' | 'design';

export const ITEM_KINDS: ItemKind[] = ['recognition', 'predict', 'cloze', 'complexity', 'design'];

export const KIND_LABELS: Record<ItemKind, string> = {
  recognition: 'Recognize the pattern',
  predict: 'Predict the next step',
  cloze: 'Recall the template',
  complexity: 'Complexity',
  design: 'System design',
};

export interface ReviewItem {
  id: string;
  kind: ItemKind;
  /** A pattern id or a system design topic id. */
  topic: string;
  label: string;
  /** Curriculum position used to order new items. */
  order: number;
  algorithmId?: string;
}

export interface PipelineStage {
  name: string;
  detail: string;
}

export interface Question {
  itemId: string;
  kind: ItemKind;
  topic: string;
  seed: number;
  eyebrow: string;
  /** Learner text: backticks mark code spans. */
  prompt: string;
  choices: string[];
  answer: number;
  /** Learner text: backticks mark code spans. */
  explain: string;
  frame?: Frame;
  code?: { lines: string[]; blank?: number; highlight?: number };
  pipeline?: PipelineStage[];
  facts?: { label: string; value: string }[];
  link?: { label: string; path: string[] };
}

/** A review item without its label or question builder, which scheduling, sessions and mastery never read. */
export type ReviewItemSummary = Omit<ReviewItem, 'label'>;

export interface ItemDef extends ReviewItem {
  /** Builds a fresh variant. The same seed always yields the same question. */
  generate(seed: number): Question;
}
