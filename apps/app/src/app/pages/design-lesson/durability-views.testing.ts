import type { StageView } from './durability-draw';
import { NOTHING_HIDDEN } from './durability-words';

/** The stage at rest, nothing hidden: what every durability spec's view starts from. */
export const REST: StageView = {
  hid: NOTHING_HIDDEN,
  kind: 'repair',
  tau: null,
  live: false,
  step: null,
  ghost: null,
  challenge: false,
  met: false,
  focus: [],
};
