import { fmt, type DesignNode, type NodeStats, type NodeStatus } from '@grasp/engine';
import type { SysGlyph } from './glyphs';

/** 0 under 50% busy, then the heat ramp's three steps (REDESIGN.md 3.6): 50 to 70, 70 to 85, 85 to 100%. */
export type Heat = 0 | 1 | 2 | 3;

export interface SysNodeView {
  id: string;
  /** The name on one line, or split over two when it would not fit beside the glyph. */
  lines: string[];
  glyph: SysGlyph;
  status: NodeStatus;
  heat: Heat;
  /** "62%", the client's "3.0k rps", or "down". */
  stat: string;
  /** The node's time, "16 ms"; empty for the client and a node that is down. */
  ms: string;
  /** "×32", or "6/8" (up of all) while some are down; empty for the client. */
  count: string;
  /** The meter's fill, 0 to 1; null for the client. */
  meter: number | null;
  /** A sharded database's strip, hottest shard first. */
  shards: { heat: Heat; down: boolean; over: boolean }[];
  /** A cache's or CDN's hit rate, drawn as a ring round its glyph. */
  hitRate: number | null;
  /** The client's read share. */
  detail: string;
  /** The client's bot traffic, on a line of its own. */
  extra: string;
}

/** Characters a name fits beside the glyph at its largest (13px grown 1.12×); longer names take two lines. */
const ONE_LINE = 13;

export const heatOf = (utilization: number): Heat => (utilization >= 0.85 ? 3 : utilization >= 0.7 ? 2 : utilization >= 0.5 ? 1 : 0);

/** Splits a long name at the space nearest its middle. */
export function nameLines(name: string): string[] {
  if (name.length <= ONE_LINE || !name.includes(' ')) return [name];
  const mid = name.length / 2;
  let best = -1;
  for (let i = name.indexOf(' '); i !== -1; i = name.indexOf(' ', i + 1))
    if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
  return [name.slice(0, best), name.slice(best + 1)];
}

export function sysNodeView(
  node: DesignNode,
  stats: NodeStats | undefined,
  name: string,
  glyph: SysGlyph,
  client: { rps: number; readRatio: number; botRps: number },
): SysNodeView {
  const status = stats?.status ?? 'idle';
  const util = stats?.utilization ?? 0;
  const base = { id: node.id, lines: nameLines(name), glyph, status, shards: [] as SysNodeView['shards'] };
  if (node.kind === 'client') {
    const bots = client.botRps ? `+${fmt(client.botRps)} bots` : '';
    const reads = `${Number((client.readRatio * 100).toFixed(1))}% reads`;
    const twoLines = base.lines.length > 1;
    return {
      ...base,
      heat: 0,
      stat: `${fmt(client.rps)} rps`,
      ms: '',
      count: '',
      meter: null,
      hitRate: null,
      detail: twoLines && bots ? `${reads} · ${bots}` : reads,
      extra: twoLines ? '' : bots,
    };
  }
  const up = node.instances - (node.failed ?? 0);
  return {
    ...base,
    heat: status === 'down' ? 0 : heatOf(util),
    stat: status === 'down' ? 'down' : `${Math.round(Math.min(9.99, util) * 100)}%`,
    ms: status === 'down' ? '' : `${Math.round(stats?.latencyMs ?? 0).toLocaleString('en-US')} ms`,
    count: node.failed ? `${up}/${node.instances}` : `×${node.instances}`,
    meter: status === 'down' ? 0 : Math.min(1, util),
    shards: (stats?.shards ?? []).map((s) => ({
      heat: s.down ? 0 : heatOf(s.utilization),
      down: s.down,
      over: !s.down && s.utilization > 1,
    })),
    hitRate: node.kind === 'cache' || node.kind === 'cdn' ? (node.hitRate ?? 0) : null,
    detail: '',
    extra: '',
  };
}
