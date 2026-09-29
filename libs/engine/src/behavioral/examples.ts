import { AMBIGUITY } from './examples/ambiguity.js';
import { COLLABORATION } from './examples/collaboration.js';
import { CONFLICT } from './examples/conflict.js';
import { CUSTOMER } from './examples/customer.js';
import { DELIVERY } from './examples/delivery.js';
import { FAILURE } from './examples/failure.js';
import { FEEDBACK } from './examples/feedback.js';
import { INFLUENCE } from './examples/influence.js';
import { LEADERSHIP } from './examples/leadership.js';
import { LEARNING } from './examples/learning.js';
import { OWNERSHIP } from './examples/ownership.js';
import { TECHNICAL_DEPTH } from './examples/technical-depth.js';
import { TRADEOFFS } from './examples/tradeoffs.js';
import type { CompetencyExamples } from './types.js';

export const EXAMPLES: readonly CompetencyExamples[] = [
  OWNERSHIP,
  DELIVERY,
  AMBIGUITY,
  CONFLICT,
  INFLUENCE,
  COLLABORATION,
  FEEDBACK,
  FAILURE,
  LEARNING,
  CUSTOMER,
  LEADERSHIP,
  TRADEOFFS,
  TECHNICAL_DEPTH,
];

export function examplesFor(competencyId: string): CompetencyExamples | undefined {
  return EXAMPLES.find((e) => e.competencyId === competencyId);
}
