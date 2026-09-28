import type { WorkedExample } from '../../curriculum/lessons/types.js';

export type SdWidget = 'queue-latency' | 'cache' | 'hash-ring' | 'queue-backlog';

export interface SdLesson {
  /** Why the topic decides interviews and outages, in two or three sentences. */
  why: string;
  widget: {
    kind: SdWidget;
    /** Experiments to run with the widget, each naming what to set and what to notice. */
    tryThis: readonly string[];
  };
  /** The ideas to name out loud in an interview, one short paragraph each. */
  concepts: readonly { title: string; body: string }[];
  examples: readonly WorkedExample[];
  pitfalls: readonly string[];
  followUps: readonly { question: string; answer: string }[];
}
