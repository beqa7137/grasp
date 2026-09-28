import { withChoices, type Rand } from './random.js';
import type { Question } from './types.js';

type Spec = Omit<Question, 'itemId' | 'kind' | 'topic' | 'seed' | 'eyebrow'>;

export interface DesignItemDefinition {
  label: string;
  build: (rand: Rand) => Spec;
}

export function item(label: string, build: (rand: Rand) => Spec): DesignItemDefinition {
  return { label, build };
}

export const concept = (prompt: string, correct: string, distractors: string[], explain: string) =>
  item(prompt, (rand) => ({ prompt, ...withChoices(rand, correct, distractors), explain }));
