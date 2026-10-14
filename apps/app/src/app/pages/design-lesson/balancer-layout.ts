import { LB_LOADS, LB_SERVER_SNAPS, LB_SLOWDOWNS } from '@grasp/engine';
import type { Pt } from '../../viz/kit/particles';
import { COUNT_W } from './fleet-scene';
import { focusBoxes, pad, type Box, type Focus } from './focus-layout';

export type BalancerRegion = 'fleet' | 'slow' | 'share' | 'histogram' | 'chart';

export const WIDE_FROM = 520;
const PAD = 12;
const SERVER_W = 30;
/** The slow server's box grows left by this much per step of slowdown, so a slower server is a bigger box. */
const SLOW_STEP = 20;
/** The slow server keeps a lane this tall whatever the fleet size, so its queue and label always read. */
const SLOW_LANE = 26;
const RACK_GAP = 6;
/**
 * The rack's height for each fleet size: a smaller fleet's lanes spread over most of the room the largest reserves, while
 * its bottom edge, the fleet-size handle, still moves 30px a step.
 */
const RACK_H: Record<number, number> = { 4: 143, 10: 173, 20: 203 };
/** The other lanes' pitch; the slow server's lane is never shorter than they are. */
const pitch = (servers: number) =>
  Math.min((RACK_H[servers] - SLOW_LANE - RACK_GAP) / (servers - 1), (RACK_H[servers] - RACK_GAP) / servers);
const slowLane = (servers: number) => Math.max(SLOW_LANE, pitch(servers));
/** A wide stage's queues stop at this length, so the fan from the balancer gets the room. */
const MAX_LANE = 260;
/** A handle's hit box, centred on its point. */
export const HIT = 44;
/** Room above a chart for its "Look here" tag. */
const TAG_ROOM = 26;
const CHART_H = 250;

export interface Lane {
  y: number;
  height: number;
  /** Where the queue's blocks run, newest at `x0`, the server's door at `x1`. */
  x0: number;
  x1: number;
  serverX: number;
  serverW: number;
}

export interface BalancerLayout {
  width: number;
  height: number;
  wide: boolean;
  clients: { x: number; y: number; scale: number; labelY: number; rateY: number };
  /** The inlet from clients to the balancer, along which the load handle slides, and where its label goes. */
  pipe: { x0: number; x1: number; y: number; loadPositions: number[]; labelY: number };
  lb: { x: number; y: number };
  /** The readout of p99 and the mean: top left on a wide stage, top right on a narrow one. */
  readout: { x: number; y: number; anchor: 'start' | 'end' };
  rackTop: number;
  /** Where the rack's header ("Servers · 10") and the queue's key start. */
  rackX: number;
  right: number;
  serverX: number;
  /** Lanes for each fleet size, slow server first. */
  lanes: (servers: number) => Lane[];
  rackBottoms: number[];
  /** The fleet-size handle's stops, each just under the rack it makes, with the queue's key on the same row. */
  rackHandles: number[];
  rackCross: number;
  /** How the balancer reaches each lane: a fan on a wide stage, a bus down the left edge on a narrow one. */
  links: (servers: number) => Pt[][];
  slowPositions: number[];
  share: { x0: number; x1: number; y: number };
  scrub: { x0: number; x1: number; y: number };
  /** The part of the stage the canvas paints: the lanes and the links the request dots travel. */
  canvas: Box;
  focus: readonly Focus<BalancerRegion>[];
  texts: readonly Box[];
}

export interface BalancerChartsLayout {
  width: number;
  height: number;
  histogram: Box;
  chart: Box;
  focus: readonly Focus<BalancerRegion>[];
}

/** A queue shows at most this many blocks, each at least 4px wide. */
export const blockCap = (lane: Lane) => Math.max(1, Math.min(50, Math.floor((lane.x1 - lane.x0) / 4)));

const BLOCK_SIZES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000];
/** Requests one block stands for: the fewest that fit the run's longest queue in `cap` blocks. */
export const perBlock = (maxQueue: number, cap: number) => BLOCK_SIZES.find((k) => Math.ceil(maxQueue / k) <= cap) ?? BLOCK_SIZES.at(-1)!;

const spread = (x0: number, x1: number, n: number) => Array.from({ length: n }, (_, i) => x0 + ((x1 - x0) * i) / (n - 1));

export function balancerLayout(width: number): BalancerLayout {
  const wide = width >= WIDE_FROM;
  const right = width - PAD;
  const serverX = right - SERVER_W;
  const rackTop = wide ? 56 : 104;
  const lbY = wide ? rackTop + 64 : 40;
  const lbX = wide ? PAD + 184 : Math.round(Math.min(width * 0.5, PAD + 140));
  const x1 = serverX - 4;
  const laneStart = wide ? Math.max(lbX + 64, x1 - MAX_LANE - COUNT_W) : PAD + 10;
  const pipe = { x0: PAD + 50, x1: lbX - 28, y: lbY, labelY: wide ? lbY - 18 : lbY + 30 };
  const clients = { x: PAD + 22, y: lbY, scale: wide ? 1 : 0.8, labelY: lbY - 26, rateY: lbY + 30 };

  const lanes = (servers: number): Lane[] => {
    const step = pitch(servers);
    return Array.from({ length: servers }, (_, i) => {
      const slow = i === 0;
      const top = slow ? rackTop : rackTop + slowLane(servers) + RACK_GAP + (i - 1) * step;
      const height = slow ? slowLane(servers) : step;
      return { y: top + height / 2, height, x0: laneStart + COUNT_W, x1, serverX, serverW: SERVER_W };
    });
  };
  const rackBottom = (servers: number) => rackTop + RACK_H[servers];
  const rackBottoms = LB_SERVER_SNAPS.map(rackBottom);
  const rackHandles = rackBottoms.map((y) => y + 14);
  const bottom = Math.max(...rackBottoms);
  const lowestHandle = Math.max(...rackHandles);
  const busX = PAD + 3;
  const links = (servers: number): Pt[][] =>
    lanes(servers).map((lane) =>
      wide
        ? [
            [lbX + 22, lbY],
            [laneStart, lane.y],
            [lane.x1, lane.y],
          ]
        : [
            [lbX, lbY + 22],
            [lbX, rackTop - 26],
            [busX, rackTop - 26],
            [busX, lane.y],
            [lane.x1, lane.y],
          ],
    );
  const slowPositions = LB_SLOWDOWNS.map((_, i) => serverX - i * SLOW_STEP);

  // Wide, the share bar sits under the clients and the balancer, beside the rack; narrow, under the rack's handle row.
  const share = wide ? { x0: PAD, x1: lbX + 34, y: rackTop + 176 } : { x0: PAD, x1: right, y: lowestHandle + 48 };
  // The time handle's hit box clears the servers handle's lowest one, so neither covers the other at any fleet size.
  const scrub = { x0: PAD + 10, x1: right - 10, y: Math.max(lowestHandle + HIT + 2, share.y + 50) };
  const height = scrub.y + 34;

  const readout = wide ? { x: PAD, y: 22, anchor: 'start' as const } : { x: right, y: lbY - 6, anchor: 'end' as const };
  const texts: Box[] = [
    { x: PAD, y: clients.labelY - 12, width: 60, height: 16 },
    { x: PAD, y: clients.rateY - 12, width: 60, height: 16 },
    { x: pipe.x0, y: pipe.labelY - 12, width: pipe.x1 - pipe.x0, height: 16 },
    { x: lbX - 50, y: lbY + 26, width: 100, height: 16 },
    { x: wide ? PAD : right - 110, y: readout.y - 18, width: 110, height: 58 },
    // The rack's header: "Servers · 10" at its start and the slow server's speed at its end.
    { x: laneStart, y: rackTop - 20, width: right - laneStart, height: 16 },
    { x: share.x0, y: share.y - 20, width: 170, height: 16 },
    { x: share.x0, y: share.y - 4, width: share.x1 - share.x0, height: 18 },
    { x: share.x0, y: share.y + 13, width: 160, height: 14 },
    { x: share.x1 - 34, y: share.y + 13, width: 34, height: 14 },
    { x: scrub.x0 - 22, y: scrub.y - 14, width: scrub.x1 - scrub.x0 + 44, height: 28 },
    { x: scrub.x0 - 12, y: scrub.y + 10, width: 30, height: 16 },
    { x: (scrub.x0 + scrub.x1) / 2 - 70, y: scrub.y + 10, width: 140, height: 16 },
    { x: scrub.x1 - 30, y: scrub.y + 10, width: 44, height: 16 },
    // Each lane's count at its start, and the server names.
    { x: laneStart, y: rackTop, width: COUNT_W, height: bottom - rackTop },
    { x: serverX - 3 * SLOW_STEP, y: rackTop, width: right - serverX + 3 * SLOW_STEP, height: bottom - rackTop },
    // The key and the servers handle's caption, on the handle's row at every fleet size.
    ...rackHandles.map((y) => ({ x: laneStart, y: y - 12, width: right - laneStart, height: 20 })),
  ];
  const rack = { x: laneStart, y: rackTop, width: right - laneStart, height: bottom - rackTop };
  const outlines: [BalancerRegion, Box][] = [
    ['fleet', pad(rack, 6)],
    ['slow', pad({ x: laneStart, y: rackTop, width: right - laneStart, height: SLOW_LANE }, 4)],
    ['share', pad({ x: share.x0, y: share.y - 20, width: share.x1 - share.x0, height: 48 }, 4)],
  ];
  return {
    width,
    height,
    wide,
    clients,
    pipe: { ...pipe, loadPositions: spread(pipe.x0 + 6, pipe.x1 - 6, LB_LOADS.length) },
    lb: { x: lbX, y: lbY },
    readout,
    rackTop,
    rackX: laneStart,
    right,
    serverX,
    lanes,
    rackBottoms,
    rackHandles,
    rackCross: serverX + SERVER_W / 2,
    links,
    slowPositions,
    share,
    scrub,
    canvas: wide
      ? { x: lbX + 18, y: rackTop - 2, width: right - lbX - 18, height: bottom - rackTop + 4 }
      : { x: 0, y: lbY + 18, width, height: bottom - lbY - 16 },
    focus: focusBoxes(outlines, texts, width, height),
    texts,
  };
}

/** The latency histogram and p99 against load: side by side on a wide stage, stacked on a narrow one. */
export function balancerChartsLayout(width: number): BalancerChartsLayout {
  const wide = width >= WIDE_FROM;
  const inner = width - 2 * PAD;
  const half = (inner - 16) / 2;
  const histogram = { x: PAD, y: TAG_ROOM, width: wide ? half : inner, height: CHART_H };
  const chart = wide
    ? { x: PAD + half + 16, y: TAG_ROOM, width: half, height: CHART_H }
    : { x: PAD, y: histogram.y + CHART_H + TAG_ROOM, width: inner, height: CHART_H };
  const height = chart.y + chart.height + 4;
  const outlines: [BalancerRegion, Box][] = [
    ['histogram', pad(histogram, 4)],
    ['chart', pad(chart, 4)],
  ];
  return { width, height, histogram, chart, focus: focusBoxes(outlines, [histogram, chart], width, height) };
}
