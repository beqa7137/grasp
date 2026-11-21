/**
 * Each box's reserved content height by stage width, at the widths where one changes: `[from width, load balancers, app
 * servers, database, served]`. Generated from `planReserve` at every width from 248 to 1,000 px, each box taking the most
 * any stage at least as wide needs, so the stage never grows taller as it widens; the layout spec holds it to the plan
 * at a stride of widths.
 */
export const CAPACITY_RESERVES: readonly (readonly [from: number, lb: number, app: number, db: number, sink: number])[] = [
  [0, 178, 286, 508, 40],
  [249, 178, 286, 491, 40],
  [251, 178, 286, 474, 40],
  [257, 158, 286, 474, 40],
  [259, 158, 266, 474, 40],
  [261, 158, 266, 457, 40],
  [265, 141, 266, 457, 40],
  [268, 141, 249, 457, 40],
  [271, 141, 249, 454, 40],
  [272, 141, 249, 440, 40],
  [273, 141, 249, 440, 20],
  [277, 141, 232, 440, 20],
  [293, 141, 232, 423, 20],
  [296, 141, 232, 406, 20],
  [311, 141, 232, 389, 20],
  [314, 141, 232, 386, 20],
  [320, 141, 215, 386, 20],
  [330, 141, 200, 386, 20],
  [362, 124, 200, 386, 20],
  [369, 124, 183, 386, 20],
  [384, 124, 183, 369, 20],
  [424, 124, 183, 369, 0],
  [444, 124, 183, 349, 0],
  [484, 124, 166, 349, 0],
  [506, 124, 166, 332, 0],
  [508, 124, 166, 315, 0],
  [520, 107, 166, 315, 0],
  [573, 107, 166, 298, 0],
  [668, 107, 166, 281, 0],
  [815, 107, 149, 281, 0],
];
