import type { Locator } from '@grasp/engine';

/** The elements a checkpoint is about, while it is asked; null when nothing dims. */
export type Focus = readonly Locator[] | null;

const same = (a: Locator, b: Locator) =>
  a.view === b.view && ('id' in a && 'id' in b ? a.id === b.id : 'at' in a && 'at' in b && String(a.at) === String(b.at));

/** Whether the element at `at` dims (REDESIGN.md 3.6): a checkpoint with a focus dims the rest, never the current element. */
export function dims(focus: Focus, at: Locator, current = false): boolean {
  return !!focus?.length && !current && !focus.some((f) => same(f, at));
}

/**
 * A dimmed HTML cell keeps its text at full strength in the discarded ink, and fades its fill and border to
 * `--g-viz-dim` under a layer of the stage's colour, since an opacity would fade the text too.
 */
export const DIM_CELL = `
  .dim {
    position: relative;
    isolation: isolate;
  }
  .dim::before {
    content: '';
    position: absolute;
    inset: -1px;
    z-index: -1;
    border-radius: inherit;
    background: var(--g-viz-stage);
    opacity: calc(1 - var(--g-viz-dim));
    pointer-events: none;
  }
`;
