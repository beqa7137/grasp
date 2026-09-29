import type { WorkedExample } from '../../curriculum/lessons/types.js';
import type { CaseEstimate } from '../cases/types.js';

export type SdWidget =
  | 'queue-latency'
  | 'cache'
  | 'hash-ring'
  | 'queue-backlog'
  | 'replica-lag'
  | 'rate-limiter'
  | 'availability'
  | 'estimate-drill'
  | 'pipeline'
  | 'quorum'
  | 'partition'
  | 'id-layout'
  | 'inverted-index'
  | 'stream-windows'
  | 'storage-engine'
  | 'cdn'
  | 'multi-region'
  | 'error-budget'
  | 'pagination'
  | 'password-hash'
  | 'transactions'
  | 'batch-job';

export interface SdLesson {
  /** Why the topic decides interviews and outages, in two or three sentences. */
  why: string;
  widget: {
    kind: SdWidget;
    /** Experiments to run with the widget, each naming what to set and what to notice. */
    tryThis: readonly string[];
    /** The estimate drill's questions, typed and judged one at a time. */
    drill?: readonly CaseEstimate[];
  };
  /** The ideas to name out loud in an interview, one short paragraph each. */
  concepts: readonly { title: string; body: string }[];
  examples: readonly WorkedExample[];
  pitfalls: readonly string[];
  followUps: readonly { question: string; answer: string }[];
}
