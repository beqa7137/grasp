/** The math behind the system design lesson widgets, kept here so it is tested apart from the drawing. */

export * from './widgets/balancing.js';
export * from './widgets/balancing-settings.js';
export * from './widgets/balancing-sweeps.js';
export * from './widgets/caching.js';
export * from './widgets/capacity.js';
export * from './widgets/cdn.js';
export * from './widgets/cdn-format.js';
export * from './widgets/clocks.js';
export * from './widgets/data-modeling.js';
export * from './widgets/discovery.js';
export * from './widgets/durability.js';
export * from './widgets/gateway.js';
export * from './widgets/latency-sample.js';
export * from './widgets/leases.js';
export * from './widgets/overload.js';
export * from './widgets/quorum.js';
export * from './widgets/queueing.js';
export * from './widgets/recovery.js';
export * from './widgets/reliability.js';
export * from './format-time.js';
export * from './widgets/reliability-sample.js';
export * from './widgets/replication.js';
export * from './widgets/sharding.js';
export * from './widgets/storage.js';
export * from './widgets/storage-format.js';
export * from './widgets/tenancy.js';

export type Limiter = 'token-bucket' | 'fixed-window' | 'sliding-window';

export interface LimiterRun {
  accepted: boolean[];
  /** The most requests accepted in any one-second span, which is what the protected service actually has to take. */
  worstSecond: number;
}

/**
 * Requests arrive at the given times in milliseconds, sorted. Each limiter allows `limit` requests a second:
 * the token bucket holds up to `burst` tokens refilled at `limit` a second; the fixed window counts per calendar second;
 * the sliding window counts the requests accepted in the last 1,000 ms.
 */
export function runLimiter(kind: Limiter, arrivals: readonly number[], limit: number, burst: number): LimiterRun {
  const accepted: boolean[] = [];
  const kept: number[] = [];
  let tokens = burst;
  let last = 0;
  for (const t of arrivals) {
    let ok: boolean;
    if (kind === 'token-bucket') {
      tokens = Math.min(burst, tokens + ((t - last) / 1000) * limit);
      last = t;
      ok = tokens >= 1;
      if (ok) tokens -= 1;
    } else if (kind === 'fixed-window') {
      const windowStart = Math.floor(t / 1000) * 1000;
      ok = kept.filter((k) => k >= windowStart).length < limit;
    } else {
      ok = kept.filter((k) => k > t - 1000).length < limit;
    }
    accepted.push(ok);
    if (ok) kept.push(t);
  }
  let worstSecond = 0;
  for (let i = 0, j = 0; i < kept.length; i++) {
    while (kept[i] - kept[j] >= 1000) j++;
    worstSecond = Math.max(worstSecond, i - j + 1);
  }
  return { accepted, worstSecond };
}

export interface Partition {
  majority: number;
  /** Nodes that can fail while a majority still stands. */
  tolerates: number;
  /** The side holding a majority, which can elect a leader and commit; null when neither side has one. */
  quorumSide: 'left' | 'right' | null;
  /** Whether the old leader keeps leading: only when it sits on the majority side. */
  leaderKept: boolean;
}

/** A consensus cluster of `n` nodes cut in two, with `left` nodes on one side and the old leader on `leaderSide`. */
export function partition(n: number, left: number, leaderSide: 'left' | 'right'): Partition {
  const majority = Math.floor(n / 2) + 1;
  const quorumSide = left >= majority ? 'left' : n - left >= majority ? 'right' : null;
  return { majority, tolerates: n - majority, quorumSide, leaderKept: quorumSide === leaderSide };
}

export interface IdLayout {
  timeBits: number;
  /** Years the timestamp lasts from its epoch before it wraps. */
  years: number;
  generators: number;
  perGeneratorPerSecond: number;
}

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/** A Snowflake-style 64-bit id: a sign bit, then a timestamp in `tickMs` ticks, a generator id and a per-tick sequence. */
export function idLayout(generatorBits: number, sequenceBits: number, tickMs: number): IdLayout {
  const timeBits = 63 - generatorBits - sequenceBits;
  return {
    timeBits,
    years: (2 ** timeBits * tickMs) / YEAR_MS,
    generators: 2 ** generatorBits,
    perGeneratorPerSecond: 2 ** sequenceBits * (1000 / tickMs),
  };
}

/** The birthday bound: the chance that `count` ids drawn uniformly from `2 ** bits` values hold at least one repeat. */
export function collisionChance(bits: number, count: number): number {
  return -Math.expm1(-(count * count) / 2 ** (bits + 1));
}

export interface SearchHit {
  doc: number;
  score: number;
}

/** Lowercase runs of letters and digits: no stemming and no stop words, so every word is searchable. */
export const searchTokens = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** An inverted index: each term maps to the ascending ids of the documents holding it. */
export function invertedIndex(docs: readonly string[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  docs.forEach((doc, id) => {
    for (const term of new Set(searchTokens(doc))) index.set(term, [...(index.get(term) ?? []), id]);
  });
  return index;
}

/**
 * Documents matching every query term (and) or any (or), ranked by TF-IDF: each term counts its occurrences in the
 * document times log(N / documents holding it), so a term in every document adds nothing.
 */
export function searchIndex(docs: readonly string[], query: string, mode: 'and' | 'or'): SearchHit[] {
  const index = invertedIndex(docs);
  const terms = [...new Set(searchTokens(query))];
  if (!terms.length) return [];
  const lists = terms.map((t) => index.get(t) ?? []);
  const candidates =
    mode === 'and' ? lists.reduce((acc, list) => acc.filter((d) => list.includes(d))) : [...new Set(lists.flat())].sort((a, b) => a - b);
  const counts = docs.map((d) => searchTokens(d));
  return candidates
    .map((doc) => ({
      doc,
      score: terms.reduce((s, t, i) => {
        const df = lists[i].length;
        return df ? s + counts[doc].filter((w) => w === t).length * Math.log(docs.length / df) : s;
      }, 0),
    }))
    .sort((a, b) => b.score - a.score || a.doc - b.doc);
}

export type WindowKind = 'tumbling' | 'sliding' | 'session';

export interface StreamEvent {
  /** When it happened, in seconds. */
  at: number;
  /** When the processor received it, in seconds. */
  arrives: number;
}

export interface StreamWindow {
  start: number;
  end: number;
  /** Indexes of the events counted in it. */
  events: number[];
}

export interface WindowRun {
  windows: StreamWindow[];
  /** Events that arrived after the watermark had passed the end of every window they belong to. */
  late: number[];
}

/**
 * Groups events by event time. The watermark trails the largest event time seen so far by `delay` seconds; a window
 * closes once the watermark passes its end, so an event counts only in the windows still open when it arrives.
 */
export function streamWindows(events: readonly StreamEvent[], kind: WindowKind, size: number, delay: number, slide = size): WindowRun {
  const order = events.map((_, i) => i).sort((a, b) => events[a].arrives - events[b].arrives || a - b);
  const watermarkAt: number[] = [];
  let latest = -Infinity;
  for (const i of order) {
    watermarkAt[i] = latest - delay;
    latest = Math.max(latest, events[i].at);
  }
  const byTime = events.map((_, i) => i).sort((a, b) => events[a].at - events[b].at || a - b);
  const windows: StreamWindow[] = [];
  if (kind === 'session') {
    // A session is a run of events less than `size` apart; an event is late once its own gap has closed.
    for (const i of byTime.filter((j) => events[j].at + size > watermarkAt[j])) {
      const last = windows.at(-1);
      if (last && events[i].at < last.end) {
        last.events.push(i);
        last.end = events[i].at + size;
      } else windows.push({ start: events[i].at, end: events[i].at + size, events: [i] });
    }
  } else {
    const step = kind === 'tumbling' ? size : slide;
    const starts = new Set<number>();
    for (const i of byTime) for (let s = Math.floor(events[i].at / step) * step; s > events[i].at - size; s -= step) starts.add(s);
    for (const start of [...starts].sort((a, b) => a - b)) {
      const end = start + size;
      const inside = byTime.filter((i) => events[i].at >= start && events[i].at < end && end > watermarkAt[i]);
      if (inside.length) windows.push({ start, end, events: inside });
    }
  }
  const counted = new Set(windows.flatMap((w) => w.events));
  return { windows, late: events.map((_, i) => i).filter((i) => !counted.has(i)) };
}

export type RegionMode = 'single' | 'replicas' | 'quorum' | 'active-active';

export interface RegionOutcome {
  readMs: number;
  writeMs: number;
  meanMs: number;
  /** Writes acknowledged but lost when the primary region is destroyed. */
  rpoMs: number;
  /** Time until writes are accepted again after the primary region is lost. */
  rtoSec: number;
  conflicts: boolean;
}

/**
 * Users in several regions reach their nearest region in `accessMs`; regions are `rtt[i][j]` apart. `primary` is the
 * region holding the only writable copy (single, replicas) or the consensus leader (quorum). Latencies are means over
 * users weighted by `users`.
 */
export function regionOutcome(
  mode: RegionMode,
  options: {
    users: readonly number[];
    rtt: readonly (readonly number[])[];
    primary: number;
    accessMs: number;
    readShare: number;
    lagMs: number;
  },
): RegionOutcome {
  const { users, rtt, primary, accessMs, readShare, lagMs } = options;
  const toPrimary = users.map((_, r) => accessMs + rtt[r][primary]);
  const nearestPeer = Math.min(...rtt[primary].filter((_, k) => k !== primary));
  const perRegion = users.map((_, r) => {
    if (mode === 'single') return [toPrimary[r], toPrimary[r]];
    if (mode === 'replicas') return [accessMs, toPrimary[r]];
    if (mode === 'quorum') return [toPrimary[r], toPrimary[r] + nearestPeer];
    return [accessMs, accessMs];
  });
  const mean = (i: number) => users.reduce((sum, share, r) => sum + share * perRegion[r][i], 0);
  const readMs = mean(0);
  const writeMs = mean(1);
  const outage = { single: [3_600_000, 14_400], replicas: [lagMs, 60], quorum: [0, 10], 'active-active': [lagMs, 30] }[mode];
  return {
    readMs,
    writeMs,
    meanMs: readShare * readMs + (1 - readShare) * writeMs,
    rpoMs: outage[0],
    rtoSec: outage[1],
    conflicts: mode === 'active-active',
  };
}

export interface BurnAlert {
  label: string;
  longWindowHours: number;
  burnRate: number;
  action: 'page' | 'ticket';
  fires: boolean;
}

export interface ErrorBudget {
  /** Failed requests the SLO allows over the window. */
  allowedFailures: number;
  /** Minutes of total outage the budget covers. */
  budgetMinutes: number;
  burnRate: number;
  /** Days until the budget is spent at the current error rate; Infinity when nothing fails. */
  daysToExhaust: number;
  alerts: BurnAlert[];
}

/** An availability SLO over a rolling window, the error rate right now, and the multiwindow burn-rate alerts of the Google SRE workbook. */
export function errorBudget(options: { slo: number; windowDays: number; rps: number; errorRate: number }): ErrorBudget {
  const { slo, windowDays, rps, errorRate } = options;
  const budget = 1 - slo;
  // Rounded so a rate exactly at a threshold, such as 0.6% against a 99.9% SLO, is not lost to floating point.
  const burnRate = Math.round((errorRate / budget) * 1e9) / 1e9;
  const rules: Omit<BurnAlert, 'fires'>[] = [
    { label: '2% of budget in 1 hour', longWindowHours: 1, burnRate: 14.4, action: 'page' },
    { label: '5% of budget in 6 hours', longWindowHours: 6, burnRate: 6, action: 'page' },
    { label: '10% of budget in 3 days', longWindowHours: 72, burnRate: 1, action: 'ticket' },
  ];
  return {
    allowedFailures: Math.round(rps * windowDays * 86_400 * budget),
    budgetMinutes: Math.round(windowDays * 1440 * budget * 1e6) / 1e6,
    burnRate,
    daysToExhaust: burnRate > 0 ? windowDays / burnRate : Infinity,
    alerts: rules.map((rule) => ({ ...rule, fires: burnRate >= rule.burnRate })),
  };
}

export interface PageCost {
  /** Index entries read to answer the request for this page. */
  rowsRead: number;
  /** Entries read in total to walk from the first page to this one. */
  walkRows: number;
  /** Items shown twice while walking to this page, as new rows push older ones down. */
  repeats: number;
}

/**
 * A client pages through a list sorted newest first while `insertsPerPage` new rows arrive between page requests.
 * Offset paging skips `(page - 1) * size` rows each time and repeats the rows the inserts push across a page boundary;
 * a cursor (the last seen key) seeks straight to the next row and never repeats. The index seek is counted as one read.
 */
export function pageCost(mode: 'offset' | 'cursor', options: { size: number; page: number; insertsPerPage: number }): PageCost {
  const { size, page, insertsPerPage } = options;
  if (mode === 'cursor') return { rowsRead: size + 1, walkRows: page * (size + 1), repeats: 0 };
  return {
    rowsRead: page * size,
    walkRows: (size * page * (page + 1)) / 2,
    repeats: Math.min(insertsPerPage, size) * (page - 1),
  };
}

export type PasswordHash = 'sha256' | 'pbkdf2' | 'bcrypt';

/** Guesses a second on one high-end GPU, rounded from published hashcat benchmarks: fast hashes are billions. */
export const HASH_RATES: Record<PasswordHash, number> = {
  sha256: 20_000_000_000,
  pbkdf2: 15_000,
  bcrypt: 180_000,
};

export interface CrackTime {
  guessesPerSecond: number;
  /** Candidate passwords of this shape. */
  space: number;
  /** Seconds to try every candidate against one salted hash. */
  seconds: number;
}

/**
 * Offline cracking of one stolen, salted hash. `bcryptCost` doubles the work per step above 5, the cost the benchmark
 * rate is quoted at; PBKDF2 is quoted at 600,000 iterations of HMAC-SHA-256.
 */
export function crackTime(hash: PasswordHash, options: { alphabet: number; length: number; gpus: number; bcryptCost: number }): CrackTime {
  const { alphabet, length, gpus, bcryptCost } = options;
  const perGpu = hash === 'bcrypt' ? HASH_RATES.bcrypt / 2 ** (bcryptCost - 5) : HASH_RATES[hash];
  const guessesPerSecond = perGpu * gpus;
  const space = alphabet ** length;
  return { guessesPerSecond, space, seconds: space / guessesPerSecond };
}

export interface TxnOutcome {
  /** Time until the client learns the outcome. */
  latencyMs: number;
  /** How long each participant holds its row locks. */
  lockMs: number;
  /** How long other readers can see some services changed and others not. */
  partialMs: number;
  compensations: number;
  outcome: 'committed' | 'rolled back' | 'blocked';
}

/**
 * One business transaction across `services` services, each doing `stepMs` of local work, one network round trip
 * `rttMs` apart. Two-phase commit prepares every service in parallel, then commits: locks are held from prepare to
 * commit, and a coordinator that dies after prepare leaves participants blocked holding them. A saga runs local
 * transactions one after another and undoes the finished ones in reverse if step `failAt` fails (0 means none fails).
 */
export function txnOutcome(
  mode: '2pc' | 'saga',
  options: { services: number; stepMs: number; rttMs: number; failAt: number; coordinatorCrash: boolean },
): TxnOutcome {
  const { services, stepMs, rttMs, failAt, coordinatorCrash } = options;
  if (mode === '2pc') {
    if (coordinatorCrash) return { latencyMs: Infinity, lockMs: Infinity, partialMs: 0, compensations: 0, outcome: 'blocked' };
    const prepare = rttMs + stepMs;
    if (failAt > 0) return { latencyMs: prepare + rttMs, lockMs: prepare + rttMs, partialMs: 0, compensations: 0, outcome: 'rolled back' };
    return { latencyMs: prepare + rttMs, lockMs: prepare + rttMs, partialMs: 0, compensations: 0, outcome: 'committed' };
  }
  const step = rttMs + stepMs;
  if (failAt > 0) {
    const done = failAt - 1;
    const forward = failAt * step;
    return {
      latencyMs: forward + done * step,
      lockMs: stepMs,
      // Readers see a half-done order from the first commit until the last compensation lands.
      partialMs: done > 0 ? forward + done * step - step : 0,
      compensations: done,
      outcome: 'rolled back',
    };
  }
  return { latencyMs: services * step, lockMs: stepMs, partialMs: (services - 1) * step, compensations: 0, outcome: 'committed' };
}

export interface BatchJob {
  mapSec: number;
  shuffleGB: number;
  shuffleSec: number;
  /** Data the busiest reducer must process. */
  slowestReducerGB: number;
  reduceSec: number;
  totalSec: number;
}

/**
 * A MapReduce-style job on `workers` machines that each read, send or reduce 100 MB/s. Map output is half the input, a
 * combiner shrinks it tenfold, and keys spread evenly over the reducers except one hot key holding `hotKeyShare` of the
 * records, which all go to a single reducer.
 */
export function batchJob(options: {
  inputGB: number;
  workers: number;
  reducers: number;
  hotKeyShare: number;
  combiner: boolean;
}): BatchJob {
  const { inputGB, workers, reducers, hotKeyShare, combiner } = options;
  const rate = 0.1;
  const mapSec = inputGB / (workers * rate);
  const shuffleGB = inputGB * 0.5 * (combiner ? 0.1 : 1);
  const shuffleSec = shuffleGB / (workers * rate);
  const slowestReducerGB = shuffleGB * (hotKeyShare + (1 - hotKeyShare) / reducers);
  // Reducers beyond the worker count run in waves, so each worker reduces at least its share of the shuffle.
  const reduceSec = Math.max(slowestReducerGB, shuffleGB / workers) / rate;
  return { mapSec, shuffleGB, shuffleSec, slowestReducerGB, reduceSec, totalSec: mapSec + shuffleSec + reduceSec };
}

export interface GeoQuery {
  cellWidthKm: number;
  cellHeightKm: number;
  /** Geohash cells the query reads to cover the circle. */
  cells: number;
  /** Places stored in those cells, all read and then filtered by distance. */
  candidates: number;
  /** Places actually within the radius. */
  matches: number;
}

/**
 * A radius search over places spread evenly at `density` per km², indexed by geohash prefix. A geohash of `precision`
 * characters holds 5 bits per character, alternating longitude and latitude, so cells shrink by 4 or 8 per character
 * and get narrower toward the poles. The query reads every cell the circle's bounding square touches.
 */
export function geoQuery(options: { precision: number; radiusKm: number; latitude: number; density: number }): GeoQuery {
  const { precision, radiusKm, latitude, density } = options;
  const bits = 5 * precision;
  const lonBits = Math.ceil(bits / 2);
  const latBits = Math.floor(bits / 2);
  const kmPerDegree = 111.32;
  const cellHeightKm = (180 / 2 ** latBits) * kmPerDegree;
  const cellWidthKm = (360 / 2 ** lonBits) * kmPerDegree * Math.cos((latitude * Math.PI) / 180);
  const across = Math.ceil((2 * radiusKm) / cellWidthKm) + 1;
  const down = Math.ceil((2 * radiusKm) / cellHeightKm) + 1;
  const cells = across * down;
  return {
    cellWidthKm,
    cellHeightKm,
    cells,
    candidates: cells * cellWidthKm * cellHeightKm * density,
    matches: Math.PI * radiusKm ** 2 * density,
  };
}

export type DeliveryMode = 'polling' | 'long-polling' | 'sse' | 'websocket';

export interface Delivery {
  /** HTTP requests the servers answer each second. */
  requestsPerSecond: number;
  /** Average time from an event happening to the client having it. */
  delayMs: number;
  /** Connections held open at once. */
  openConnections: number;
  /** Bytes of HTTP headers each second, the overhead of asking. */
  headerMBps: number;
}

/**
 * `clients` each waiting for events that arrive `eventsPerMinute` times a minute. Polling asks every `pollSec`; long
 * polling holds each request open until an event or a 30 s timeout, then asks again; server-sent events and WebSockets
 * keep one connection open and push. Every HTTP request carries about 800 bytes of headers; a round trip takes 100 ms.
 */
export function delivery(mode: DeliveryMode, options: { clients: number; pollSec: number; eventsPerMinute: number }): Delivery {
  const { clients, pollSec, eventsPerMinute } = options;
  const eventsPerSec = eventsPerMinute / 60;
  const rttMs = 100;
  const headerBytes = 800;
  let requestsPerSecond: number;
  let delayMs: number;
  let openConnections: number;
  if (mode === 'polling') {
    requestsPerSecond = clients / pollSec;
    delayMs = (pollSec * 1000) / 2 + rttMs / 2;
    openConnections = requestsPerSecond * (rttMs / 1000);
  } else if (mode === 'long-polling') {
    requestsPerSecond = clients * (eventsPerSec + 1 / 30);
    delayMs = rttMs / 2;
    openConnections = clients;
  } else {
    requestsPerSecond = 0;
    delayMs = rttMs / 2;
    openConnections = clients;
  }
  return { requestsPerSecond, delayMs, openConnections, headerMBps: (requestsPerSecond * headerBytes) / 1e6 };
}
