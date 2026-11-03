/** What a replica is doing when the write is sent: up, known down, stopping mid-write, or down then and back for the read. */
export type ReplicaState = 'up' | 'down' | 'mid' | 'back';
export const REPLICA_STATES = ['up', 'down', 'mid', 'back'] as const satisfies readonly ReplicaState[];
export const REPLICA_STATE_NAMES: Readonly<Record<ReplicaState, string>> = {
  up: 'up',
  down: 'down',
  mid: 'stops mid-write',
  back: 'back, missed the write',
};

export const QUORUM_SIZES = [3, 5] as const;
export type QuorumSize = (typeof QUORUM_SIZES)[number];
/** A GC pause the middle replica adds to everything it handles. */
export const QUORUM_STALL_MS = 100;
/** Cassandra's `write_request_timeout`. */
export const WRITE_TIMEOUT_MS = 2_000;
/** Cassandra's `read_request_timeout`: how long a read short of answers waits before it times out. */
export const READ_TIMEOUT_MS = 5_000;
/** By default Cassandra writes hints only for a replica's first 3 hours down. */
export const HINT_WINDOW_HOURS = 3;
/** Each replica is down this share of the time, independently: high, so the differences show. */
export const REPLICA_DOWN_CHANCE = 0.01;
export const QUORUM_VERSIONS = { old: 7, new: 8, oldValue: 'Apollo', newValue: 'Artemis' } as const;
/**
 * One-way delays from the writer in data center A; the reader in data center C sees them in the other order. DC B sits
 * 2 ms from both, a known simplification no quoted number depends on.
 */
export const QUORUM_ONE_WAY_MS: Readonly<Record<QuorumSize, readonly number[]>> = { 3: [1, 2, 20], 5: [1, 1.5, 2, 20, 20.5] };
export const QUORUM_DATA_CENTERS: Readonly<Record<QuorumSize, readonly string[]>> = { 3: ['A', 'B', 'C'], 5: ['A', 'A', 'B', 'C', 'C'] };
/** Sloppy stand-ins sit beside the writer in DC A, so the reader reaches them across data centers. */
export const STAND_IN_ONE_WAY_MS = [1.5, 2.5] as const;
export const CROSS_DC_ONE_WAY_MS = 20;

export interface QuorumNode {
  id: number;
  name: string;
  /** One of the key's N replicas, or a sloppy quorum's stand-in. */
  home: boolean;
  dc: string;
  state: ReplicaState;
  pause: number;
  writeOneWay: number;
  readOneWay: number;
  writeRtt: number;
  readRtt: number;
  /** When the write reaches it, if it applies it. */
  landAt: number;
  /** Down or back: the coordinator knows it is down when the write is sent. */
  knownDown: boolean;
  /** Whether the read reaches it. */
  reachable: boolean;
  /** A stand-in's home replica. */
  standsFor?: number;
}

export interface QuorumWrite {
  outcome: 'acked' | 'refused' | 'timed-out';
  /** When the client hears back: the W-th ack, 0 when refused, the timeout when it times out. */
  ms: number;
  /** Nodes the coordinator believes live and sends to. */
  live: number;
  needed: number;
  sent: number[];
  /** Nodes that applied the write, in ack order. */
  applied: number[];
  /** The W that acked; for a timed-out write, every node that applied it. */
  acked: number[];
  ackOrder: number[];
}

export interface QuorumAnswer {
  id: number;
  /** The version it answers with; null for a stand-in with no copy of the key. */
  value: number | null;
  /** When the read request reaches it, which decides what it holds. */
  readAt: number;
  rtt: number;
}

export interface QuorumRead {
  outcome: 'v8' | 'v7' | 'no-copy' | 'timed-out' | 'fails';
  sentAt: number;
  reachable: number;
  needed: number;
  /** The R reachable nodes with the fastest answers, by id. */
  set: number[];
  answers: QuorumAnswer[];
  /** Read-set replicas that answered an older version than another answer: written back before the read returns. */
  repairs: number[];
  rthMs: number | null;
  repairMs: number;
  ms: number | null;
  returns: number | null;
}

export type QuorumVerdict = 'fresh' | 'stale' | 'refused' | 'timed-out' | 'old' | 'failed-write' | 'read-fails';

export interface QuorumReadSet {
  members: number[];
  /** Holds no home replica that acked, so a read of it can miss the write. */
  canMiss: boolean;
  isThis: boolean;
}

export interface QuorumScenario {
  settings: { n: QuorumSize; w: number; r: number; states: ReplicaState[]; stall: boolean; sloppy: boolean };
  replicas: QuorumNode[];
  standIns: QuorumNode[];
  /** Replicas, then stand-ins: a node's id is its index. */
  all: QuorumNode[];
  write: QuorumWrite;
  read: QuorumRead;
  verdict: QuorumVerdict;
  /** Home replicas among the W that acked. */
  h: number;
  ackedHomes: number[];
  readSets: number;
  staleReadSets: number;
  sets: QuorumReadSet[];
  readStandIns: number[];
  /** The drawn read set holds no replica that acked: whatever it returned, nothing guaranteed it. */
  thisReadUnsure: boolean;
  /** Nodes in the write set and the read set. */
  both: number[];
  /** What each node holds once the read and its repairs are done; null for no copy. */
  holds: (number | null)[];
  avail: { write: number; read: number };
  survives: { write: number; read: number };
  metrics: { canMiss: number; readMs: number; writeMs: number; writeSurvives: number };
}

export const quorumOf = (n: number) => Math.floor(n / 2) + 1;
/** The replica that stalls: the middle one. */
export const stalledIndex = (n: number) => (n === 3 ? 1 : 2);
/** ONE, QUORUM or ALL for a count of `n` replicas; null for a count with no name. */
export const quorumLevelName = (k: number, n: number) => (k === 1 ? 'ONE' : k === n ? 'ALL' : k === quorumOf(n) ? 'QUORUM' : null);

/** Replicas an EACH_QUORUM write waits for: a quorum of each data center's replicas. */
export function eachQuorum(n: QuorumSize): number {
  const perDc = new Map<string, number>();
  for (const dc of QUORUM_DATA_CENTERS[n]) perDc.set(dc, (perDc.get(dc) ?? 0) + 1);
  return [...perDc.values()].reduce((sum, k) => sum + quorumOf(k), 0);
}

export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return Math.round(c);
}

/** Every set of `r` of `n` ids, in lexicographic order. */
export function readSetsOf(n: number, r: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, picked: number[]) => {
    if (picked.length === r) return void out.push(picked);
    for (let i = start; i < n; i++) walk(i + 1, [...picked, i]);
  };
  walk(0, []);
  return out;
}

/** The chance that at least `k` of `m` independent replicas are up, each down `REPLICA_DOWN_CHANCE` of the time. */
export function atLeastUp(k: number, m: number): number {
  const p = 1 - REPLICA_DOWN_CHANCE;
  let sum = 0;
  for (let j = k; j <= m; j++) sum += choose(m, j) * p ** j * (1 - p) ** (m - j);
  return Math.min(1, sum);
}

function homeReplicas(n: QuorumSize, states: readonly ReplicaState[], stall: boolean): QuorumNode[] {
  const oneWay = QUORUM_ONE_WAY_MS[n];
  const paused = stall ? stalledIndex(n) : -1;
  return oneWay.map((d, i) => {
    const pause = i === paused ? QUORUM_STALL_MS : 0;
    const readOneWay = oneWay[n - 1 - i];
    const state = states[i] ?? 'up';
    return {
      id: i,
      name: `R${i + 1}`,
      home: true,
      dc: QUORUM_DATA_CENTERS[n][i],
      state,
      pause,
      writeOneWay: d,
      readOneWay,
      writeRtt: 2 * d + pause,
      readRtt: 2 * readOneWay + pause,
      landAt: d + pause,
      knownDown: state === 'down' || state === 'back',
      reachable: state === 'up' || state === 'back',
    };
  });
}

/**
 * Stand-ins take the known-down replicas' places, those still down at the read first, so each stand-in's "for R3" stays
 * true for the read it may serve. A sloppy read goes to the first N healthy nodes, so a stand-in answers for a home
 * replica that is still down.
 */
function standInsFor(replicas: readonly QuorumNode[]): QuorumNode[] {
  const n = replicas.length;
  const knownDown = replicas
    .filter((x) => x.knownDown)
    .sort((a, b) => Number(a.state !== 'down') - Number(b.state !== 'down') || a.id - b.id);
  return STAND_IN_ONE_WAY_MS.slice(0, Math.min(2, knownDown.length)).map((d, j) => ({
    id: n + j,
    name: `H${j + 1}`,
    home: false,
    dc: 'A',
    state: 'up',
    pause: 0,
    writeOneWay: d,
    readOneWay: CROSS_DC_ONE_WAY_MS + d,
    writeRtt: 2 * d,
    readRtt: 2 * (CROSS_DC_ONE_WAY_MS + d),
    landAt: d,
    knownDown: false,
    reachable: knownDown[j].state === 'down',
    standsFor: knownDown[j].id,
  }));
}

function writeOf(targets: readonly QuorumNode[], w: number): QuorumWrite {
  if (targets.length < w) return { outcome: 'refused', ms: 0, live: targets.length, needed: w, sent: [], applied: [], acked: [], ackOrder: [] };
  const ackOrder = targets
    .filter((t) => t.state === 'up')
    .sort((a, b) => a.writeRtt - b.writeRtt || a.id - b.id)
    .map((t) => t.id);
  const sent = targets.map((t) => t.id);
  const ms = (id: number) => targets.find((t) => t.id === id)!.writeRtt;
  return ackOrder.length >= w
    ? { outcome: 'acked', ms: ms(ackOrder[w - 1]), live: targets.length, needed: w, sent, applied: ackOrder, acked: ackOrder.slice(0, w), ackOrder }
    : { outcome: 'timed-out', ms: WRITE_TIMEOUT_MS, live: targets.length, needed: w, sent, applied: ackOrder, acked: ackOrder, ackOrder };
}

function readOf(all: readonly QuorumNode[], r: number, write: QuorumWrite): QuorumRead {
  const sentAt = write.ms;
  const reachable = all.filter((x) => x.reachable);
  // Replicas that stopped mid-write still look live, so a read short of them waits out its timeout instead of failing.
  const believedLive = reachable.length + all.filter((x) => x.home && x.state === 'mid').length;
  const empty = { set: [], answers: [], repairs: [], rthMs: null, repairMs: 0, ms: null, returns: null };
  if (reachable.length < r)
    return { outcome: believedLive >= r ? 'timed-out' : 'fails', sentAt, reachable: reachable.length, needed: r, ...empty };
  const set = [...reachable].sort((a, b) => a.readRtt - b.readRtt || a.id - b.id).slice(0, r);
  const answers = set.map((x) => {
    const readAt = sentAt + x.readOneWay + x.pause;
    const has = write.applied.includes(x.id) && x.landAt <= readAt;
    return { id: x.id, value: has ? QUORUM_VERSIONS.new : x.home ? QUORUM_VERSIONS.old : null, readAt, rtt: x.readRtt };
  });
  const rthMs = Math.max(...answers.map((a) => a.rtt));
  const anyNew = answers.some((a) => a.value === QUORUM_VERSIONS.new);
  const anyOld = answers.some((a) => a.value === QUORUM_VERSIONS.old);
  const repairs = anyNew ? answers.filter((a) => a.value === QUORUM_VERSIONS.old).map((a) => a.id).sort((a, b) => a - b) : [];
  // The repair writes go out together, and the read returns once the slowest is back.
  const repairMs = repairs.length ? Math.max(...repairs.map((id) => all[id].readRtt)) : 0;
  return {
    outcome: anyNew ? 'v8' : anyOld ? 'v7' : 'no-copy',
    sentAt,
    reachable: reachable.length,
    needed: r,
    set: set.map((x) => x.id).sort((a, b) => a - b),
    answers,
    repairs,
    rthMs,
    repairMs,
    ms: rthMs + repairMs,
    returns: anyNew ? QUORUM_VERSIONS.new : anyOld ? QUORUM_VERSIONS.old : null,
  };
}

function verdictOf(write: QuorumWrite, read: QuorumRead): QuorumVerdict {
  if (!read.set.length) return 'read-fails';
  if (write.outcome === 'refused') return 'refused';
  if (write.outcome === 'timed-out') return read.returns === QUORUM_VERSIONS.new ? 'timed-out' : write.applied.length ? 'old' : 'failed-write';
  return read.returns === QUORUM_VERSIONS.new ? 'fresh' : 'stale';
}

/**
 * One write of v8 (over v7), then one read sent when the client hears back. A replica holds what reached it by the moment
 * the read request reaches it, never what it holds at the W-th ack; a stalled replica takes its pause on everything it
 * handles. A known-down replica makes the coordinator refuse a write short of W up front; one that stops mid-write makes
 * it time out, though the replicas that applied it keep it.
 */
export function quorumScenario(
  n: QuorumSize,
  w: number,
  r: number,
  states: readonly ReplicaState[],
  stall: boolean,
  sloppy: boolean,
): QuorumScenario {
  const replicas = homeReplicas(n, states, stall);
  const standIns = sloppy ? standInsFor(replicas) : [];
  const all = [...replicas, ...standIns];
  const write = writeOf([...replicas.filter((x) => !x.knownDown), ...standIns], w);
  const read = readOf(all, r, write);
  const readDone = read.set.length > 0;

  // The guarantee counts home read sets against the home replicas that acked; the drawn read is one draw, and a sloppy
  // read that used a stand-in is none of them.
  const ackedHomes = write.acked.filter((id) => all[id].home);
  const h = ackedHomes.length;
  const staleReadSets = choose(n - h, r);
  const sets = readSetsOf(n, r).map((members) => ({
    members,
    canMiss: !members.some((id) => ackedHomes.includes(id)),
    isThis: read.set.length === r && members.every((id, i) => id === read.set[i]),
  }));
  const holds = all.map((x) => {
    if ((x.home && read.repairs.includes(x.id)) || write.applied.includes(x.id)) return QUORUM_VERSIONS.new;
    return !x.home || x.state === 'down' || x.state === 'mid' ? null : QUORUM_VERSIONS.old;
  });
  const m = sloppy ? n + 2 : n;
  const writeSurvives = sloppy ? Math.min(n, n + 2 - w) : n - w;
  const readSurvives = sloppy ? Math.min(n, n + 2 - r) : n - r;
  return {
    settings: { n, w, r, states: Array.from({ length: n }, (_, i) => states[i] ?? 'up'), stall, sloppy },
    replicas,
    standIns,
    all,
    write,
    read,
    verdict: verdictOf(write, read),
    h,
    ackedHomes,
    readSets: choose(n, r),
    staleReadSets,
    sets,
    readStandIns: read.set.filter((id) => !all[id].home),
    thisReadUnsure: readDone && !read.set.some((id) => write.acked.includes(id)),
    both: write.outcome === 'acked' ? read.set.filter((id) => write.acked.includes(id)) : [],
    holds,
    avail: { write: atLeastUp(w, m), read: atLeastUp(r, m) },
    survives: { write: writeSurvives, read: readSurvives },
    metrics: {
      canMiss: staleReadSets,
      readMs: read.ms ?? Infinity,
      writeMs: write.outcome === 'acked' ? write.ms : Infinity,
      writeSurvives,
    },
  };
}

/** The settings by the names the widget and its experiments use: each replica's state as its index in `REPLICA_STATES`. */
export const QUORUM_STATE_KEYS = ['s1', 's2', 's3', 's4', 's5'] as const;
export const QUORUM_BASELINE = { n: 3, w: 2, r: 2, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, stall: 0, sloppy: 0 } as const;
export type QuorumSettings = Readonly<Record<keyof typeof QUORUM_BASELINE, number>>;

/** The scenario at a widget's settings. */
export function quorumAt(s: QuorumSettings): QuorumScenario {
  const n = s.n as QuorumSize;
  const states = QUORUM_STATE_KEYS.slice(0, n).map((k) => REPLICA_STATES[s[k]]);
  return quorumScenario(n, s.w, s.r, states, s.stall === 1, s.sloppy === 1);
}
