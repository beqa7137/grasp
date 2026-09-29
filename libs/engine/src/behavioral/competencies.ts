import { AMBIGUITY } from './competencies/ambiguity.js';
import { COLLABORATION } from './competencies/collaboration.js';
import { CONFLICT } from './competencies/conflict.js';
import { CUSTOMER } from './competencies/customer.js';
import { DELIVERY } from './competencies/delivery.js';
import { FAILURE } from './competencies/failure.js';
import { FEEDBACK } from './competencies/feedback.js';
import { INFLUENCE } from './competencies/influence.js';
import { LEADERSHIP } from './competencies/leadership.js';
import { LEARNING } from './competencies/learning.js';
import { OWNERSHIP } from './competencies/ownership.js';
import { TECHNICAL_DEPTH } from './competencies/technical-depth.js';
import { TRADEOFFS } from './competencies/tradeoffs.js';
import type { Competency } from './types.js';

export const COMPETENCIES: readonly Competency[] = [
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

export function getCompetency(id: string): Competency | undefined {
  return COMPETENCIES.find((c) => c.id === id);
}
