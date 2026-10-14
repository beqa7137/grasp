/** A label's estimated width at the diagram's label type (12px, or 13.5px on a `large` timeline), with room each side. */
export const labelWidth = (text: string, large = false) => Math.ceil(text.length * (large ? 7.5 : 6.6)) + 6;

/** Whether the segment from `a` to `b` passes through the box (Liang-Barsky clipping). */
export function crosses(
  a: { x: number; y: number },
  b: { x: number; y: number },
  box: { x: number; y: number; width: number; height: number },
) {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  let [t0, t1] = [0, 1];
  const edges: [number, number][] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.width - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

export interface TimelineGeometry {
  lanes: readonly { id: string; label: string }[];
  x: (at: number) => number;
  /** A lane's line, in the same frame as `x`. */
  laneY: (lane: string) => number;
  messages: readonly { from: { lane: string; at: number }; to: { lane: string; at: number } }[];
  width: number;
  pad: number;
  /** Where a lane's label, line and event labels sit in its row: their offsets from its top. */
  row: { label: number; line: number; events: number };
  /** A gutter this wide left of the time axis holds the lane labels, beside their lines; 0 puts them over each row. */
  gutter?: number;
  large?: boolean;
}

/** A marker's radius; markers on one lane closer than a diameter are drawn side by side. */
export const MARK_R = 10;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Each lane's label and its box: in the gutter beside the lane's line when there is one, so it never moves; otherwise at
 * the left of its row, or just right of any message that would cross it there.
 */
export function placeLaneLabels(g: TimelineGeometry): Map<string, { x: number; y: number; box: Box }> {
  const segments = messageSegments(g);
  return new Map(
    g.lanes.map((lane) => {
      const w = labelWidth(lane.label, g.large);
      if (g.gutter) {
        const y = g.laneY(lane.id) + 4;
        return [lane.id, { x: 4, y, box: { x: 1, y: y - 11, width: w, height: 14 } }];
      }
      const y = g.laneY(lane.id) - g.row.line + g.row.label;
      let x = g.pad;
      for (let tries = 0; tries < 8; tries++) {
        const box = { x: x - 3, y: y - 11, width: w, height: 14 };
        const hit = segments.find(([a, b]) => crosses(a, b, box));
        if (!hit) break;
        x = Math.max(hit[0].x, hit[1].x) + 8;
      }
      return [lane.id, { x, y, box: { x: x - 3, y: y - 11, width: w, height: 14 } }];
    }),
  );
}

const messageSegments = (g: TimelineGeometry) =>
  g.messages.map((m) => [
    { x: g.x(m.from.at), y: g.laneY(m.from.lane) },
    { x: g.x(m.to.at), y: g.laneY(m.to.lane) },
  ]);

/** Where each event's marker is drawn: at its time, or side by side with the others on its lane at about that time. */
export function markerXs(events: readonly { lane: string; at: number }[], g: TimelineGeometry): number[] {
  const xs = events.map((e) => g.x(e.at));
  const step = 2 * MARK_R + 2;
  for (const lane of g.lanes) {
    const own = events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.lane === lane.id)
      .sort((a, b) => xs[a.i] - xs[b.i]);
    for (let k = 0; k < own.length;) {
      let end = k + 1;
      while (end < own.length && xs[own[end].i] - xs[own[end - 1].i] < step) end++;
      const group = own.slice(k, end);
      const mid = group.reduce((sum, { i }) => sum + xs[i], 0) / group.length;
      group.forEach(({ i }, j) => (xs[i] = mid + (j - (group.length - 1) / 2) * step));
      k = end;
    }
  }
  return xs;
}

/**
 * Every event with its marker and label placed. A label goes under its marker, or over it, or slid along the row a
 * little, nearest first: the first place no message crosses and no other label, lane label or marker covers. Labels sit right by their
 * markers, so no leader line is needed. The timeline draws with it, and an owner drawing over the timeline (a focus tag)
 * keeps clear of the same boxes.
 */
export function placeEventLabels<E extends { lane: string; at: number; label: string }>(events: readonly E[], g: TimelineGeometry) {
  const segments = messageSegments(g);
  const xs = markerXs(events, g);
  const taken: Box[] = [
    ...[...placeLaneLabels(g).values()].map((l) => l.box),
    ...events.map((e, i) => ({ x: xs[i] - MARK_R, y: g.laneY(e.lane) - MARK_R, width: 2 * MARK_R, height: 2 * MARK_R })),
  ];
  const start = g.gutter ? g.gutter + 4 : 0;
  const order = events.map((e, i) => i).sort((a, b) => xs[a] - xs[b]);
  const placed = events.map((e, i) => ({
    ...e,
    x: xs[i],
    y: g.laneY(e.lane),
    labelWidth: labelWidth(e.label, g.large),
    above: false,
    labelX: 0,
    labelY: 0,
  }));
  const shifts = [0, ...Array.from({ length: 10 }, (_, i) => [8 * (i + 1), -8 * (i + 1)]).flat()];
  for (const i of order) {
    const e = placed[i];
    const rowY = (above: boolean) => e.y - g.row.line + (above ? g.row.label : g.row.events);
    // The nearest places first: under, over, then a little further along either way.
    const candidates = shifts.flatMap((dx) =>
      [false, true].map((above) => {
        const left = Math.min(Math.max(start, e.x - e.labelWidth / 2 + dx), g.width - e.labelWidth);
        return { above, left, box: { x: left, y: rowY(above) - 11, width: e.labelWidth, height: 14 } };
      }),
    );
    const clear = (c: (typeof candidates)[number]) =>
      !segments.some(([a, b]) => crosses(a, b, c.box)) && !taken.some((t) => overlaps(t, c.box));
    const pick = candidates.find(clear) ?? candidates.find((c) => !taken.some((t) => overlaps(t, c.box))) ?? candidates[0];
    e.above = pick.above;
    e.labelX = pick.left;
    e.labelY = rowY(pick.above);
    taken.push(pick.box);
  }
  return placed;
}
/** How many lines a legend of these labels wraps to in `width` px: each item is a 16px key, a gap and its label. */
export function legendLines(labels: readonly string[], width: number, large = false): number {
  let lines = 1;
  let used = 0;
  for (const label of labels) {
    const w = 20 + labelWidth(label, large);
    if (used && used + 12 + w > width) {
      lines++;
      used = w;
    } else used += (used ? 12 : 0) + w;
  }
  return lines;
}
