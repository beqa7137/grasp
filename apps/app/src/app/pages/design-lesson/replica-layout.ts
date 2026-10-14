import { TIMELINE, timelineHeight, type TimelineEvent, type TimelineMessage, type TimelineSpan } from '../../viz/kit/timeline.component';
import { legendLines, placeEventLabels, placeLaneLabels } from '../../viz/kit/timeline-layout';
import { focusBoxes, overlaps, union, type Box, type Focus } from './focus-layout';

export type ReplicaRegion = 'replica' | 'read' | 'band' | 'window';
export const REPLICA_LANES = [
  { id: 'you', label: 'You' },
  { id: 'primary', label: 'Primary' },
  { id: 'replica', label: 'Replica' },
] as const;

const PAD = 8;
const TOP = 8;
/** A stage this wide gets the larger label type. */
export const LARGE_FROM = 600;
/** The verdict's lines and the count of stale reads under them, with room below for a "Look here" tag. */
const READOUT_H = 98;

/** Every span label the widget can show, so the legend's room never changes. */
export const REPLICA_LEGEND = ['has your write', 'your reads go to the primary', 'without your write', 'a read here is stale'];

export interface ReplicaLayout {
  width: number;
  large: boolean;
  /** The lane labels' gutter, left of the time axis. */
  gutter: number;
  legendLines: number;
  height: number;
  timeline: { x: number; y: number; width: number };
  readout: { x: number; y: number };
  focus: readonly Focus<ReplicaRegion>[];
}

export interface ReplicaPicture {
  /** The timeline's own x for a time, from its left edge. */
  x: (ms: number) => number;
  events: readonly TimelineEvent[];
  messages: readonly TimelineMessage[];
  spans: readonly TimelineSpan[];
  /** The end of the pin to the primary, or 0 when read-your-writes is off. */
  pin: number;
  staleFrom: number;
  staleTo: number;
  /** The verdict's lines, so its outline takes them all in. */
  readout: readonly string[];
}

/** The gutter for the lane labels at a stage width. */
export const replicaGutter = (width: number) => (width >= LARGE_FROM ? 70 : 58);

/**
 * The Replication widget's stage: the timeline across the top, with its lane labels in a gutter at its left, and the
 * read's verdict under it. Every y is fixed, so the height is too. Focus outlines take a lane's row, or the part of it a
 * region spans, grown to take in any label they would cut; their tags keep clear of every label the timeline places,
 * every event and span, and the verdict.
 */
export function replicaLayout(width: number, p: ReplicaPicture): ReplicaLayout {
  const large = width >= LARGE_FROM;
  const gutter = replicaGutter(width);
  const timeline = { x: PAD, y: TOP, width: width - 2 * PAD };
  const lines = legendLines(REPLICA_LEGEND, timeline.width - 2 * TIMELINE.pad, large);
  const bottom = TOP + timelineHeight(REPLICA_LANES.length, lines);
  const axisY = bottom - TIMELINE.axis - lines * TIMELINE.legendLine;
  const readout = { x: PAD + TIMELINE.pad, y: bottom + 4 };
  const height = readout.y + READOUT_H;
  const lane = (id: string) => REPLICA_LANES.findIndex((l) => l.id === id);
  const laneTop = (i: number) => TOP + i * TIMELINE.lane;
  const lineY = (id: string) => laneTop(lane(id)) + TIMELINE.row.line;
  const x = (ms: number) => PAD + p.x(ms);
  const geometry = {
    lanes: REPLICA_LANES,
    x: p.x,
    laneY: (id: string) => lineY(id) - TOP,
    messages: p.messages,
    width: timeline.width,
    pad: TIMELINE.pad,
    row: TIMELINE.row,
    gutter,
    large,
  };
  const shift = (b: Box): Box => ({ ...b, x: b.x + PAD, y: b.y + TOP });
  const placed = placeEventLabels(p.events, geometry);
  const labels = [
    ...[...placeLaneLabels(geometry).values()].map((l) => shift(l.box)),
    ...placed.map((e) => shift({ x: e.labelX, y: e.labelY - 12, width: e.labelWidth, height: 16 })),
  ];
  const charWidth = large ? 7.6 : 6.8;
  const readoutBox = {
    x: readout.x,
    y: readout.y,
    width: Math.min(width - PAD - readout.x, Math.max(...p.readout.map((t) => t.length * charWidth)) + 8),
    height: 74,
  };
  const taken: Box[] = [
    ...labels,
    ...placed.map((e) => ({ x: PAD + e.x - 12, y: lineY(e.lane) - 12, width: 24, height: 24 })),
    ...p.spans.map((s) => ({ x: x(s.from), y: lineY(s.lane) - 10, width: x(s.to) - x(s.from), height: 20 })),
    { x: PAD, y: axisY - 2, width: width - 2 * PAD, height: bottom - axisY + 2 },
    readoutBox,
  ];
  const left = PAD + 2;
  const right = width - PAD - 2;
  const row = (i: number, from: number, to: number): Box => ({ x: from, y: laneTop(i) + 2, width: to - from, height: TIMELINE.lane - 4 });
  // An outline that would cut a label takes the whole label in.
  const around = (b: Box): Box => {
    const grown = union([
      b,
      ...labels.filter((l) => overlaps(l, b)).map((l) => ({ x: l.x - 3, y: l.y - 2, width: l.width + 6, height: l.height + 4 })),
    ]);
    return grown.width === b.width && grown.height === b.height ? b : around(grown);
  };
  const outlines: [ReplicaRegion, Box][] = [
    ['replica', row(2, left, right)],
    ['read', { x: readoutBox.x - 8, y: readoutBox.y - 4, width: readoutBox.width + 16, height: readoutBox.height + 6 }],
    ['band', around(row(1, left, Math.max(left + gutter + 90, x(p.pin) + 14)))],
    ['window', around(row(0, Math.max(left, x(p.staleFrom) - 14), Math.min(right, Math.max(x(p.staleFrom) + 90, x(p.staleTo) + 14))))],
  ];
  return { width, large, gutter, legendLines: lines, height, timeline, readout, focus: focusBoxes(outlines, taken, width, height) };
}
