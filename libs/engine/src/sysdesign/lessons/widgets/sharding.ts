/**
 * The Sharding widget's model (REDESIGN.md 5.2, R41): 200 fixed keys placed on nodes by a consistent-hash ring or by
 * hash mod N, a change of the node set key by key, and a hot key with its split. Nothing is sampled and nothing is
 * random at run time, so every count the learner reads is exact for this set of keys; an even share is always named as
 * one, never as a count.
 */

/**
 * 32-bit FNV-1a, then MurmurHash3's finalizer: FNV alone leaves near-identical keys such as `user:1` and `user:2` close
 * together on the ring, which would make consistent hashing look unbalanced. The same in every run, so widgets are stable.
 */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export const SHARD_K = 200;
export const SHARD_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type ShardNode = (typeof SHARD_NAMES)[number];
export const SHARD_NODE_COUNTS = [3, 4, 5, 6] as const;
export const SHARD_POINTS = [1, 10, 100] as const;
export const SHARD_TURN = 2 ** 32;
/** One more key beside the 200, so their counts never change with it: 30% of all traffic, 10 salted keys when split. */
export const SHARD_HOT_KEY = 'user:hot';
export const SHARD_HOT_PCT = 30;
export const SHARD_SALTS = 10;
/**
 * Every point name carries this salt (`A#0/10175`), chosen by a search with hard bounds so that at every node count the
 * fullest shard and the largest ring share fall from 1 to 10 to 100 points a node, as the theory says (sharding.spec).
 */
export const SHARD_POINT_SALT = '/10175';
/** The key the rule line and the closer look follow: it moves in E1, moves to E in E2 and is one of A's keys in E4. */
export const SHARD_FOLLOW = 119;
/**
 * A play's clock, as fractions of its length: the points land, a hand sweeps the ring once, each moved key lifts off as
 * the hand passes its hash and flies for `flight`. The length is `baseMs` plus `perKeyMs` a moved key.
 */
export const SHARD_PLAY = { points: 0.12, sweep0: 0.26, sweep1: 0.82, flight: 0.12, baseMs: 2400, perKeyMs: 12, pool: 60 } as const;
export const shardPlayMs = (moved: number) => SHARD_PLAY.baseMs + SHARD_PLAY.perKeyMs * moved;

export const SHARD_KEY_NAMES: readonly string[] = Array.from({ length: SHARD_K }, (_, i) => `user:${i}`);
export const SHARD_SALT_KEYS: readonly string[] = Array.from({ length: SHARD_SALTS }, (_, i) => `${SHARD_HOT_KEY}#${i}`);

interface Positions {
  keys: readonly number[];
  hot: number;
  salts: readonly number[];
}
let positions: Positions | null = null;
/** Each key's position on the ring of 2^32, computed on first use. */
export function shardPositions(): Positions {
  return (positions ??= { keys: SHARD_KEY_NAMES.map(hash32), hot: hash32(SHARD_HOT_KEY), salts: SHARD_SALT_KEYS.map(hash32) });
}
/** When a moved key lifts off its pile, as a fraction of the play's clock: as the sweeping hand passes its hash. */
export const shardTakeoff = (key: number) =>
  SHARD_PLAY.sweep0 + (SHARD_PLAY.sweep1 - SHARD_PLAY.sweep0) * (shardPositions().keys[key] / SHARD_TURN);

export interface RingPoint {
  node: string;
  v: number;
  at: number;
}
export const shardPointAt = (node: string, v: number) => hash32(`${node}#${v}${SHARD_POINT_SALT}`);

/** Each node takes `points` points on the ring, sorted by position. */
export function shardRing(members: readonly string[], points: number): RingPoint[] {
  const ring: RingPoint[] = [];
  for (const node of members) for (let v = 0; v < points; v++) ring.push({ node, v, at: shardPointAt(node, v) });
  return ring.sort((a, b) => a.at - b.at);
}

/** The first point at or clockwise of `at`, wrapping to the first point. */
export function shardPointFor(ring: readonly RingPoint[], at: number): RingPoint {
  let lo = 0;
  let hi = ring.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ring[mid].at < at) lo = mid + 1;
    else hi = mid;
  }
  return ring[lo % ring.length];
}

export type ShardScheme = 'ring' | 'mod';

/** Where every key lives for one set of nodes. */
export interface ShardPlacement {
  scheme: ShardScheme;
  /** 0 under hash mod N. */
  points: number;
  members: readonly string[];
  ring: readonly RingPoint[] | null;
  owners: readonly string[];
  counts: Readonly<Record<string, number>>;
  /** Each node's share of the ring, from 0 to 1: the summed length of the stretches that end at its points. */
  ringShare: Readonly<Record<string, number>>;
  hot: string;
  salts: readonly string[];
}

const placed = new Map<string, ShardPlacement>();
/** One placement, memoized: a change of setting recomputes nothing it has seen. */
export function shardPlace(scheme: ShardScheme, points: number, members: readonly string[]): ShardPlacement {
  const id = `${scheme}|${scheme === 'mod' ? 0 : points}|${members.join('')}`;
  const hit = placed.get(id);
  if (hit) return hit;
  const pos = shardPositions();
  const ring = scheme === 'ring' ? shardRing(members, points) : null;
  const ownerAt = ring ? (at: number) => shardPointFor(ring, at).node : (at: number) => members[at % members.length];
  const owners = pos.keys.map(ownerAt);
  const counts: Record<string, number> = {};
  for (const m of members) counts[m] = 0;
  for (const o of owners) counts[o]++;
  const ringShare: Record<string, number> = {};
  if (ring) {
    for (const m of members) ringShare[m] = 0;
    ring.forEach((p, i) => {
      const prev = ring[(i - 1 + ring.length) % ring.length].at;
      ringShare[p.node] += (p.at - prev + (p.at > prev ? 0 : SHARD_TURN)) / SHARD_TURN;
    });
  }
  const out: ShardPlacement = {
    scheme,
    points: ring ? points : 0,
    members,
    ring,
    owners,
    counts,
    ringShare,
    hot: ownerAt(pos.hot),
    salts: pos.salts.map(ownerAt),
  };
  placed.set(id, out);
  return out;
}

export interface ShardMove {
  key: number;
  from: string;
  to: string;
}

/** What one change of the node set did: every key that changed owner, exactly. */
export interface ShardDiff {
  before: ShardPlacement;
  after: ShardPlacement;
  joined: readonly string[];
  left: readonly string[];
  moves: readonly ShardMove[];
  moved: number;
  into: Readonly<Record<string, number>>;
  out: Readonly<Record<string, number>>;
  toJoined: number;
  fromLeft: number;
  /** Keys that changed places among nodes that stayed. */
  between: number;
  /** What the nodes that left held: exactly what must move. */
  leftHeld: number;
  /** The even share of the nodes that joined, named as the ideal wherever it is read; null for a leave. */
  ideal: number | null;
  hotMoved: { from: string; to: string } | null;
}

export function shardDiff(before: ShardPlacement, after: ShardPlacement): ShardDiff {
  const joined = after.members.filter((m) => !before.members.includes(m));
  const left = before.members.filter((m) => !after.members.includes(m));
  const moves: ShardMove[] = [];
  const into: Record<string, number> = {};
  const out: Record<string, number> = {};
  for (const m of new Set([...before.members, ...after.members])) into[m] = out[m] = 0;
  before.owners.forEach((from, key) => {
    const to = after.owners[key];
    if (from === to) return;
    moves.push({ key, from, to });
    out[from]++;
    into[to]++;
  });
  return {
    before,
    after,
    joined,
    left,
    moves,
    moved: moves.length,
    into,
    out,
    toJoined: moves.filter((m) => joined.includes(m.to)).length,
    fromLeft: moves.filter((m) => left.includes(m.from)).length,
    between: moves.filter((m) => !joined.includes(m.to) && !left.includes(m.from)).length,
    leftHeld: left.reduce((a, m) => a + before.counts[m], 0),
    ideal: joined.length ? (SHARD_K * joined.length) / after.members.length : null,
    hotMoved: before.hot !== after.hot ? { from: before.hot, to: after.hot } : null,
  };
}

/**
 * A node's share of traffic in tenths of a percent, in whole numbers so a half never rounds two ways. Even traffic is
 * count / 200; with the hot key the 200 keys share 70% and the hot key carries 30%, a tenth of it per salted key.
 */
export function shardTrafficTenths(p: ShardPlacement, node: string, hot: number, split: number): number {
  const c = p.counts[node];
  if (!hot) return 5 * c;
  const s = split ? p.salts.filter((o) => o === node).length : p.hot === node ? SHARD_SALTS : 0;
  return Math.floor((7 * c + 60 * s + 1) / 2);
}

/** The node with the most traffic, the first by letter on a tie. */
export function shardBusiest(p: ShardPlacement, hot: number, split: number): string {
  let best = p.members[0];
  for (const m of p.members) if (shardTrafficTenths(p, m, hot, split) > shardTrafficTenths(p, best, hot, split)) best = m;
  return best;
}
export function shardFullest(p: ShardPlacement): string {
  let best = p.members[0];
  for (const m of p.members) if (p.counts[m] > p.counts[best]) best = m;
  return best;
}

/**
 * The settings, as numbers (`ExperimentSettings`): `scheme` 0 ring, 1 hash mod N; `points` 1, 10 or 100; `nodes` 3 to
 * 6 (the first letters); `hot`, `split` and `down` 0 or 1. Down takes out the busiest node.
 */
export type ShardSettings = {
  scheme: number;
  points: number;
  nodes: number;
  hot: number;
  split: number;
  down: number;
};
export const SHARD_SCHEME = { ring: 0, mod: 1 } as const;
export const SHARD_BASELINE: ShardSettings = { scheme: 0, points: 100, nodes: 4, hot: 0, split: 0, down: 0 };
export const shardNames = (nodes: number): string[] => SHARD_NAMES.slice(0, nodes);
/** A split needs the hot key. Hash mod N ignores `points`, which the control keeps for a return to the ring. */
export const shardNormal = (s: Readonly<ShardSettings>): ShardSettings => ({
  scheme: s.scheme,
  points: s.points,
  nodes: s.nodes,
  hot: s.hot,
  split: s.hot ? s.split : 0,
  down: s.down,
});

/** Every setting the controls reach: 96 (hash mod N has no points, so its three stops are one setting). */
export const SHARD_SETTINGS: readonly ShardSettings[] = [0, 1].flatMap((scheme) =>
  (scheme ? [100] : [...SHARD_POINTS]).flatMap((points) =>
    SHARD_NODE_COUNTS.flatMap((nodes) =>
      [0, 1].flatMap((hot) => (hot ? [0, 1] : [0]).flatMap((split) => [0, 1].map((down) => ({ scheme, points, nodes, hot, split, down })))),
    ),
  ),
);

export type ShardChangeKind = 'join' | 'leave' | 'back' | 'down';
export type ShardChange = ShardDiff & { kind: ShardChangeKind };

export interface ShardScenario {
  settings: ShardSettings;
  scheme: ShardScheme;
  /** Every node of the cluster, a down node included. */
  names: readonly string[];
  /** The placement with every node up, and the placement now. */
  up: ShardPlacement;
  now: ShardPlacement;
  downNode: string | null;
  change: ShardChange | null;
  traffic: Readonly<Record<string, number>>;
  busiest: string;
  fullest: string;
  fairKeys: number;
  fairTenths: number;
  /** The nodes the hot key, or its tenths, sit on. */
  hotOn: readonly string[];
  metrics: { busiest: number; fullest: number; moved: number; nodes: number };
}

/**
 * The picture for one setting. `from` is the node set before the learner's last change (null for none), and `back` says
 * that change was a down node coming back, which the node sets alone cannot tell from a join; with a node down the
 * change is always the failure itself, so the picture is a function of the settings.
 */
export function shardScenario(settings: Readonly<ShardSettings>, from: readonly string[] | null = null, back = false): ShardScenario {
  const s = shardNormal(settings);
  const scheme: ShardScheme = s.scheme === SHARD_SCHEME.mod ? 'mod' : 'ring';
  const names = shardNames(s.nodes);
  const up = shardPlace(scheme, s.points, names);
  const downNode = s.down ? shardBusiest(up, s.hot, s.split) : null;
  const now = downNode
    ? shardPlace(
        scheme,
        s.points,
        up.members.filter((m) => m !== downNode),
      )
    : up;
  let change: ShardChange | null = null;
  if (downNode) change = { ...shardDiff(up, now), kind: 'down' };
  else if (from && from.join('') !== now.members.join('')) {
    const d = shardDiff(shardPlace(scheme, s.points, from), now);
    change = { ...d, kind: back && d.joined.length === 1 && !d.left.length ? 'back' : d.joined.length ? 'join' : 'leave' };
  }
  const traffic: Record<string, number> = {};
  for (const m of now.members) traffic[m] = shardTrafficTenths(now, m, s.hot, s.split);
  const busiest = shardBusiest(now, s.hot, s.split);
  const fullest = shardFullest(now);
  return {
    settings: s,
    scheme,
    names,
    up,
    now,
    downNode,
    change,
    traffic,
    busiest,
    fullest,
    fairKeys: SHARD_K / now.members.length,
    fairTenths: 1000 / now.members.length,
    hotOn: s.split ? [...new Set(now.salts)].sort() : s.hot ? [now.hot] : [],
    metrics: { busiest: traffic[busiest] / 10, fullest: now.counts[fullest], moved: change ? change.moved : 0, nodes: s.nodes },
  };
}

/**
 * Every scenario the widget can draw (456): each setting with each last change that can lead to it, a change of the
 * Nodes control (`back` false) or a down node coming back (`back` true).
 */
export function shardScenarios(): { settings: ShardSettings; from: string[] | null; back: boolean }[] {
  const out: { settings: ShardSettings; from: string[] | null; back: boolean }[] = [];
  for (const settings of SHARD_SETTINGS) {
    const names = shardNames(settings.nodes);
    out.push({ settings, from: null, back: false });
    if (settings.down) continue;
    for (const n of SHARD_NODE_COUNTS) if (n !== settings.nodes) out.push({ settings, from: shardNames(n), back: false });
    for (const m of names) out.push({ settings, from: names.filter((x) => x !== m), back: true });
  }
  return out;
}

/** The moved keys' state at a moment of a play's clock: still on its source, in flight (with its progress), or landed. */
export type ShardKeyStage = 'src' | 'fly' | 'dst';
export interface ShardFrame {
  frac: number;
  stage: ReadonlyMap<number, { st: ShardKeyStage; u: number; from: string; to: string }>;
  landed: number;
  flying: number;
  pointsIn: boolean;
  /** The sweeping hand's position round the ring, from 0 to 1, while it sweeps. */
  sweep: number | null;
  done: boolean;
}

export function shardFrame(moves: readonly ShardMove[], frac: number): ShardFrame {
  const stage = new Map<number, { st: ShardKeyStage; u: number; from: string; to: string }>();
  let landed = 0;
  let flying = 0;
  for (const mv of moves) {
    const t0 = shardTakeoff(mv.key);
    const st: ShardKeyStage = frac < t0 ? 'src' : frac < t0 + SHARD_PLAY.flight ? 'fly' : 'dst';
    if (st === 'dst') landed++;
    if (st === 'fly') flying++;
    stage.set(mv.key, { st, u: st === 'fly' ? (frac - t0) / SHARD_PLAY.flight : 0, from: mv.from, to: mv.to });
  }
  const { points, sweep0, sweep1, flight } = SHARD_PLAY;
  return {
    frac,
    stage,
    landed,
    flying,
    pointsIn: frac >= points,
    sweep: frac >= sweep0 && frac <= sweep1 ? (frac - sweep0) / (sweep1 - sweep0) : null,
    done: frac >= sweep1 + flight,
  };
}

const GROUPED = new Intl.NumberFormat('en-US');
export const shardNum = (n: number) => GROUPED.format(Math.round(n));
/** A share from tenths of a percent: "50%", "43.3%". */
export const shardPct = (tenths: number) => `${Number.isInteger(tenths / 10) ? tenths / 10 : (tenths / 10).toFixed(1)}%`;
export const shardPctOf = (x: number) => shardPct(Math.round(x * 10));
/** A share in a table column, always with one decimal so the decimals align: "20.0%". */
export const shardPctCol = (tenths: number) => `${(tenths / 10).toFixed(1)}%`;
export const shardPctColOf = (x: number) => shardPctCol(Math.round(x * 10));
/** How far round the ring a hash sits: "85.88%". */
export const shardRound = (at: number) => `${((at / SHARD_TURN) * 100).toFixed(2)}%`;
/** A count that may be fractional (an even share of 6 nodes): "33.3", "40". */
export const shardShare = (x: number) => (Number.isInteger(x) ? shardNum(x) : (Math.round(x * 10) / 10).toFixed(1));
export const shardList = (items: readonly string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
export const shardOrList = (items: readonly string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
