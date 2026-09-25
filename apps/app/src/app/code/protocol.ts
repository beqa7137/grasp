import type { Language, ParamType } from '@grasp/engine';
import type { Snap, TraceCall, TraceStep } from './snapshot';

export const MAX_LOG_LINES = 100;

export interface SourceLocation {
  line: number;
  column?: number;
}

export interface RunnerError {
  message: string;
  location?: SourceLocation;
}

export interface TraceOutcome {
  steps: TraceStep[];
  calls: TraceCall[];
  returned?: Snap;
  error?: RunnerError;
  truncated: boolean;
  logs: string[];
}

export type WorkerRequest =
  | { kind: 'run'; language: Language; code: string; entry: string; params: ParamType[]; tests: unknown[][] }
  | {
      kind: 'trace';
      language: Exclude<Language, 'python'>;
      code: string;
      entry: string;
      params: ParamType[];
      args: unknown[];
      maxSteps: number;
    };

export type WorkerMessage =
  | { kind: 'loading'; message: string }
  | { kind: 'compile-error'; error: RunnerError }
  | { kind: 'test-start'; index: number }
  | { kind: 'test-result'; index: number; ok: true; output: unknown; ms: number; logs: string[] }
  | { kind: 'test-result'; index: number; ok: false; error: RunnerError; ms: number; logs: string[] }
  /** Ends a run whose worker can run again. */
  | { kind: 'done' }
  /**
   * Ends a run whose worker is unusable, such as after the Python interpreter died. The crash belongs to the last started
   * test that has no result.
   */
  | { kind: 'crashed'; error: RunnerError; logs: string[] }
  | ({ kind: 'trace-result' } & TraceOutcome);
