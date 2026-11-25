import { ID_WINDOW_US, type IdMint } from '@grasp/engine';

/** The mint plays the stated clock's 8 ms in 8 s; an answer that changes only the layout holds its play this long. */
export const MINT_SECONDS = 8;
export const LAYOUT_PLAY_SECONDS = 1.6;

/**
 * The play's clock at its last event: the largest moment an id was made at or before `t` µs. The stage redraws only
 * when this changes, so nothing is drawn for an event before it happens; the now line alone moves every frame.
 */
export function momentOf(m: IdMint, t: number): number {
  let at = 0;
  for (const x of m.ids) if (x.issued < ID_WINDOW_US && x.issued <= t + 1e-9 && x.issued > at) at = x.issued;
  return at;
}
