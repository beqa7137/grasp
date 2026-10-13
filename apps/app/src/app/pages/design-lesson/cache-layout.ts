import type { Pt } from '../../viz/kit/particles';

type Anchor = 'start' | 'middle' | 'end';
interface Label {
  x: number;
  y: number;
  anchor: Anchor;
}
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The origin's load meter: a rect whose fill grows along `axis` from `start` (low) over `length` px; `cross` is its centre
 * on the other axis, where the capacity handle sits.
 */
export interface MeterLayout extends Box {
  axis: 'x' | 'y';
  start: number;
  length: number;
  cross: number;
  label: Label;
  load: Label;
  cap: Label;
  /** How far off the meter's edge its scale labels sit. */
  tickOffset: number;
}

export type FocusRegion = 'gauge' | 'waffle' | 'readout' | 'chart';

/** A region an experiment points at: an outline inside the stage, and its "Look here" tag on the top or bottom edge. */
export interface FocusBox extends Box {
  id: FocusRegion;
  /** The tag's top left, on the box's top or bottom edge and inside the stage. */
  tag: { x: number; y: number };
}

/** The "Look here" tag's size. */
export const TAG = { width: 60, height: 16 };

/** Where each part of the Caching widget sits for a stage `width` px wide. Every y is fixed, so the height is too. */
export interface CacheLayout {
  width: number;
  height: number;
  wide: boolean;
  clients: { x: number; y: number; scale: number; label: Label; rate: Label };
  bar: { x0: number; x1: number; top: number; height: number; mid: number; labelY: number; labelX: number; tickY: number };
  meter: MeterLayout;
  link: { in: readonly Pt[]; miss: readonly Pt[]; label: Label | null };
  /** Dot paths: a hit goes to the cache and back; a miss rides above the bar, clear of its labels, to the origin. */
  dots: { hit: readonly Pt[]; miss: readonly Pt[] };
  waffle: { x: number; y: number; cell: number; gap: number };
  readout: Box;
  chart: Box;
  legendY: number;
  dotLegend: Label;
  legendWidth: number;
  focus: readonly FocusBox[];
  /** Every text and mark a focus tag must not cover. */
  texts: readonly Box[];
}

export const WIDE_FROM = 520;
const PAD = 12;
const METER_W = 24;
const BAR = { top: 60, height: 28, mid: 74, labelY: 48, tickY: 106 };

export const waffleSide = (w: CacheLayout['waffle']) => 10 * w.cell + 9 * w.gap;

/** Wide: one row, clients → cache bar → a vertical origin meter. */
function wideFlow(width: number) {
  const x = width - PAD - 30 - METER_W;
  const [top, bottom] = [36, 128];
  const bar = { ...BAR, x0: PAD + 108, x1: x - 76, labelX: PAD + 108 };
  const out: Pt = [PAD + 58, bar.mid];
  const above = bar.top - 6;
  const meter: MeterLayout = {
    axis: 'y',
    x,
    y: top,
    width: METER_W,
    height: bottom - top,
    start: bottom,
    length: bottom - top,
    cross: x + METER_W / 2,
    label: { x: x + METER_W / 2, y: 24, anchor: 'middle' },
    load: { x: width - PAD, y: 148, anchor: 'end' },
    cap: { x: width - PAD, y: 163, anchor: 'end' },
    tickOffset: 18,
  };
  const linkLabel = { x: (bar.x1 + x) / 2 + 6, y: bar.mid - 8, anchor: 'middle' as Anchor };
  const parts = {
    meterLabel: { x: meter.label.x - 24, y: meter.label.y - 10, width: 48, height: 12 },
    meter: { x: meter.x, y: meter.y, width: meter.width, height: meter.height },
    ticks: { x: x + METER_W + 4, y: top - 6, width: 26, height: bottom - top + 12 },
    load: { x: width - PAD - 80, y: meter.load.y - 13, width: 80, height: 16 },
    cap: { x: width - PAD - 100, y: meter.cap.y - 10, width: 100, height: 25 },
    linkLabel: { x: linkLabel.x - 30, y: linkLabel.y - 10, width: 60, height: 12 },
    linkCaption: { x: linkLabel.x - 22, y: linkLabel.y + 16, width: 44, height: 12 },
  };
  const dotLegend = { x: PAD, y: bar.tickY + 30, anchor: 'start' as Anchor };
  return {
    height: 186,
    gaugeParts: Object.values(parts),
    texts: [
      { x: PAD, y: bar.labelY - 10, width: 56, height: 12 },
      { x: PAD, y: bar.tickY - 10, width: 64, height: 12 },
      { x: PAD + 10, y: bar.mid - 16, width: 40, height: 30 },
      { x: bar.x0, y: bar.labelY - 14, width: bar.x1 - bar.x0, height: 17 },
      { x: bar.x0, y: bar.top, width: bar.x1 - bar.x0, height: bar.height },
      { x: bar.x0 - 16, y: bar.tickY - 10, width: bar.x1 - bar.x0 + 4, height: 12 },
      { x: PAD, y: dotLegend.y - 10, width: 300, height: 26 },
      ...Object.values(parts),
    ],
    bar,
    meter,
    clients: {
      x: PAD + 30,
      y: bar.mid,
      scale: 1,
      label: { x: PAD, y: bar.labelY, anchor: 'start' as Anchor },
      rate: { x: PAD + 30, y: bar.tickY, anchor: 'middle' as Anchor },
    },
    link: {
      in: [out, [bar.x0, bar.mid]] as Pt[],
      miss: [
        [bar.x1, bar.mid],
        [x, bar.mid],
      ] as Pt[],
      label: linkLabel,
    },
    dots: {
      hit: [
        [out[0], bar.mid - 4],
        [bar.x0 + 4, bar.mid - 4],
        [bar.x0 + 4, bar.mid + 4],
        [out[0], bar.mid + 4],
      ] as Pt[],
      miss: [
        [out[0], bar.mid - 4],
        [bar.x0 - 8, bar.mid - 4],
        [bar.x0 - 8, above],
        [bar.x1 + 6, above],
        [bar.x1 + 6, bar.mid],
        [x - 2, bar.mid],
      ] as Pt[],
    },
    dotLegend,
  };
}

/** Narrow: clients above a bar that spans the stage, and the origin meter lying under it, reached down the right edge. */
function narrowFlow(width: number) {
  const right = width - PAD;
  // Clients sit above the bar here, so the flow starts a little lower.
  const bar = {
    top: BAR.top + 12,
    height: BAR.height,
    mid: BAR.mid + 12,
    labelY: BAR.labelY + 12,
    labelX: PAD + 28,
    tickY: BAR.tickY + 12,
    x0: PAD,
    x1: right - 18,
  };
  const top = 152;
  const mid = top + 10;
  const lane = right - 6;
  const drop = PAD + 12;
  const above = bar.top - 6;
  const meter: MeterLayout = {
    axis: 'x',
    x: PAD,
    y: top,
    width: bar.x1 - PAD,
    height: 20,
    start: PAD,
    length: bar.x1 - PAD,
    cross: mid,
    label: { x: PAD, y: 142, anchor: 'start' },
    load: { x: bar.x1, y: 142, anchor: 'end' },
    cap: { x: bar.x1, y: 208, anchor: 'end' },
    tickOffset: 20,
  };
  const parts = {
    labelRow: { x: PAD, y: meter.label.y - 13, width: bar.x1 - PAD, height: 17 },
    meter: { x: meter.x, y: meter.y, width: meter.width, height: meter.height },
    ticks: { x: meter.x - 10, y: top + 20 + meter.tickOffset - 10, width: meter.width + 20, height: 12 },
    cap: { x: bar.x1 - 100, y: meter.cap.y - 10, width: 100, height: 25 },
  };
  return {
    height: 232,
    gaugeParts: Object.values(parts),
    texts: [
      { x: PAD, y: 8, width: 110, height: 30 },
      { x: right - 120, y: 25, width: 120, height: 12 },
      { x: bar.labelX, y: bar.labelY - 14, width: bar.x1 - bar.labelX, height: 17 },
      { x: bar.x0, y: bar.top, width: bar.x1 - bar.x0, height: bar.height },
      { x: bar.x0, y: bar.tickY - 10, width: bar.x1 - bar.x0 + 4, height: 12 },
      ...Object.values(parts),
    ],
    bar,
    meter,
    clients: {
      x: drop,
      y: 22,
      scale: 0.75,
      label: { x: PAD + 32, y: 20, anchor: 'start' as Anchor },
      rate: { x: PAD + 32, y: 35, anchor: 'start' as Anchor },
    },
    link: {
      in: [
        [drop, 38],
        [drop, bar.top],
      ] as Pt[],
      miss: [
        [bar.x1, bar.mid],
        [lane, bar.mid],
        [lane, mid],
        [bar.x1, mid],
      ] as Pt[],
      label: null,
    },
    dots: {
      hit: [
        [drop - 4, 38],
        [drop - 4, bar.top],
        [drop + 4, bar.top],
        [drop + 4, 38],
      ] as Pt[],
      miss: [
        [drop - 4, 38],
        [drop - 4, above],
        [lane, above],
        [lane, mid],
        [bar.x1 + 2, mid],
      ] as Pt[],
    },
    dotLegend: { x: right, y: 35, anchor: 'end' as Anchor },
  };
}

const pad = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, width: b.width + 2 * by, height: b.height + 2 * by });
const union = (boxes: readonly Box[]): Box => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
};
export const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** A box kept 1px inside the stage, so its outline never clips. */
const inside = (b: Box, width: number, height: number): Box => {
  const x = Math.max(1, b.x);
  const y = Math.max(1, b.y);
  return { x, y, width: Math.min(width - 1, b.x + b.width) - x, height: Math.min(height - 1, b.y + b.height) - y };
};

/**
 * Where a region's "Look here" tag goes: on or just outside a corner of its outline, the first place inside the stage
 * that covers no text or mark, so the tag never hides what it points at.
 */
function placeTag(f: Box, taken: readonly Box[], width: number, height: number) {
  const { width: w, height: h } = TAG;
  const across = Array.from({ length: Math.floor((f.width - w) / 8) + 1 }, (_, i) => f.x + 4 + 8 * i);
  const xs = [f.x + f.width - w - 4, f.x + 4, ...across, f.x - w - 2, f.x + f.width + 2];
  const edges = [f.y - h / 2, f.y + f.height - h / 2, f.y - h - 1, f.y + f.height + 1];
  const rows = Array.from({ length: Math.floor((f.height - h) / 8) + 1 }, (_, i) => f.y + 2 + 8 * i);
  const candidates = [...edges, ...rows].flatMap((y) => xs.map((x) => ({ x, y })));
  const fits = (c: { x: number; y: number }) =>
    c.x >= 1 && c.y >= 1 && c.x + w <= width - 1 && c.y + h <= height - 1 && !taken.some((t) => overlaps({ ...c, width: w, height: h }, t));
  return candidates.find(fits) ?? candidates[0];
}

export function cacheLayout(width: number): CacheLayout {
  const wide = width >= WIDE_FROM;
  const { gaugeParts, texts, ...f } = wide ? wideFlow(width) : narrowFlow(width);
  const row2 = f.height;
  const cell = wide ? 10 : 8;
  const waffle = { x: PAD + 4, y: row2 + 10, cell, gap: 2 };
  const side = waffleSide(waffle);
  // Two lines of waffle legend are reserved, so a long count wraps without reaching the chart.
  const legendY = waffle.y + side + 22;
  const chart = wide
    ? { x: PAD + 292, y: row2, width: width - 2 * PAD - 292, height: 230 }
    : { x: PAD, y: legendY + 30, width: width - 2 * PAD, height: 192 };
  const readoutX = waffle.x + side + (wide ? 42 : 38);
  // A little lower on a phone, so the readout's tag fits between it and the origin's caption.
  const readout = { x: readoutX, y: row2 + (wide ? 10 : 14), width: (wide ? chart.x - 10 : width - 4) - readoutX, height: 100 };
  const legend = { x: waffle.x, y: legendY - 12, width: (wide ? chart.x - 10 : width - PAD) - waffle.x, height: 32 };
  const height = Math.max(chart.y + chart.height, legend.y + legend.height) + PAD;
  const waffleBox = { x: waffle.x, y: waffle.y, width: side + 28, height: side };
  // The readout's lines and the chart's parts, not their whole boxes, so a tag can use the space between them.
  const r = readout;
  const readoutTexts = [
    { x: r.x, y: r.y - 2, width: 44, height: 12 },
    { x: r.x, y: r.y + 14, width: Math.min(104, r.width), height: 20 },
    { x: r.x, y: r.y + 46, width: 44, height: 12 },
    { x: r.x, y: r.y + 62, width: Math.min(104, r.width), height: 20 },
    { x: r.x, y: r.y + 86, width: 60, height: 12 },
  ];
  const chartParts = [
    { x: chart.x, y: chart.y, width: 110, height: 28 },
    { x: chart.x + chart.width - 56, y: chart.y, width: 56, height: 28 },
    { x: chart.x, y: chart.y + 28, width: chart.width, height: chart.height - 28 },
  ];
  const taken = [...texts, waffleBox, legend, ...readoutTexts, ...chartParts];
  const outlines: [FocusRegion, Box][] = [
    ['gauge', pad(union(gaugeParts), 6)],
    ['waffle', pad(waffleBox, 4)],
    ['readout', pad(readout, 4)],
    ['chart', pad(chart, 5)],
  ];
  const focus = outlines.map(([id, b]): FocusBox => {
    const kept = inside(b, width, height);
    return { id, ...kept, tag: placeTag(kept, taken, width, height) };
  });
  return { ...f, width, height, wide, waffle, readout, chart, legendY, legendWidth: legend.width, focus, texts: taken };
}
