import type { Frame, Scalar } from '../algorithms/types.js';

/** One value a variable took, from the step where it took it. */
export interface HistoryEntry {
  /** The frame's index. */
  step: number;
  value: Scalar | undefined;
  line: number;
}

/**
 * Each value `name` took up to frame `upTo`, with the step and line that set it (REDESIGN.md 3.3, `g-why`). Only the past:
 * a later value could answer a checkpoint still ahead.
 */
export function valueHistory(frames: readonly Frame[], name: string, upTo: number): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  frames.slice(0, upTo + 1).forEach((frame, step) => {
    const value = frame.vars[name];
    const last = out.at(-1);
    if (last ? last.value !== value : value !== undefined) out.push({ step, value, line: frame.line });
  });
  return out;
}
