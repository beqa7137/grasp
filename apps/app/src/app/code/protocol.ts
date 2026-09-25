import type { Language, ParamType } from '@grasp/engine';
import type { Snap, TraceCall, TraceStep } from './snapshot';

export interface SourceLocation {
  line: number;
  column?: number;
}

export interface RunnerError {
  message: string;
  location?: SourceLocation;
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
  | { kind: 'done' }
  /** Python's interpreter died, in the test that started last if it has no result yet. The worker cannot run anything again. */
  | { kind: 'crashed'; error: RunnerError; logs: string[] }
  | {
      kind: 'trace-result';
      steps: TraceStep[];
      calls: TraceCall[];
      returned?: Snap;
      error?: RunnerError;
      truncated: boolean;
      logs: string[];
    };
