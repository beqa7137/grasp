import type { WidgetHeights } from './lazy-widget.component';

/**
 * Each lazily loaded lesson widget's height at the widths it lays out for, measured at rest (no experiment open), keyed
 * by the width the widget gets: what its placeholder holds while its chunk loads. Measure again when a widget's layout
 * changes.
 */
export const WIDGET_HEIGHTS = {
  latency: [
    [0, 520],
    [340, 472],
    [520, 458],
  ],
  cache: [
    [0, 1130],
    [290, 1126],
    [340, 1122],
    [520, 748],
    [690, 740],
  ],
  queue: [
    [0, 639],
    [290, 610],
    [340, 528],
    [520, 506],
    [690, 484],
  ],
  replica: [
    [0, 893],
    [340, 839],
    [520, 667],
  ],
  overload: [
    [0, 1066],
    [290, 1024],
    [340, 886],
    [520, 766],
    [690, 690],
  ],
  lease: [
    [0, 842],
    [290, 822],
    [340, 656],
    [520, 638],
    [690, 576],
  ],
  balancer: [
    [0, 1655],
    [340, 1611],
    [520, 1023],
    [900, 645],
  ],
  feedModel: [
    [0, 2601],
    [322, 2386],
    [444, 2341],
    [522, 1864],
    [880, 1468],
  ],
  quorum: [
    [0, 1874],
    [273, 1863],
    [303, 1859],
    [334, 1841],
    [340, 1837],
    [343, 1819],
    [383, 1803],
    [406, 1781],
    [459, 1763],
    [484, 1745],
    [522, 1585],
    [556, 1365],
    [557, 1347],
    [580, 1343],
    [608, 1387],
    [614, 1361],
    [623, 1343],
    [654, 1339],
    [868, 1218],
    [916, 998],
    [917, 980],
    [974, 954],
    [983, 936],
  ],
} as const satisfies Record<string, WidgetHeights>;
