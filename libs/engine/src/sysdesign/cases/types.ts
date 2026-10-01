/** One answer to a design decision, with the reason it is strong or weak for this system. */
export interface CaseOption {
  label: string;
  /** Exactly one option per decision is the best fit; the others can still be defensible. */
  best?: boolean;
  why: string;
}

export interface CaseDecision {
  question: string;
  options: readonly CaseOption[];
}

/** A back-of-envelope number the learner commits to before seeing the arithmetic. */
export interface CaseEstimate {
  question: string;
  answer: number;
  unit: string;
  /** How the number falls out, one line at a time. */
  working: readonly string[];
}

/** A model the learner runs inside a stage, opened once the stage's decision and estimate are answered. */
export type CaseWidget = 'retries' | 'hot-account' | 'reconcile' | 'bucketing' | 'propagation' | 'cells' | 'quadtree';

export type CaseStageKind = 'requirements' | 'estimation' | 'api' | 'data' | 'design' | 'deep-dive' | 'wrap-up';

export interface CaseStage {
  kind: CaseStageKind;
  title: string;
  /** What to think about before revealing the model answer. */
  prompt: string;
  /** The model answer, revealed one point at a time. */
  points: readonly string[];
  decision?: CaseDecision;
  estimate?: CaseEstimate;
  widget?: CaseWidget;
  /** Offers the case's Design Lab build at this stage. */
  lab?: true;
}

export interface CaseStudy {
  id: string;
  stages: readonly CaseStage[];
  /** Mistakes that cost candidates this question. */
  pitfalls: readonly string[];
  followUps: readonly { question: string; answer: string }[];
}
