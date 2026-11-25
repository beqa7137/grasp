import { describe, expect, it } from 'vitest';
import {
  batchJob,
  cacheOutcome,
  cdnOutcome,
  errorBudget,
  invertedIndex,
  crackTime,
  delivery,
  geoQuery,
  partition,
  pageCost,
  queueBacklog,
  regionOutcome,
  replicaRead,
  runLimiter,
  searchIndex,
  streamWindows,
  txnOutcome,
} from './widgets.js';

describe('cache outcome', () => {
  it('sends only the misses to the origin and lets misses set p99 above 1%', () => {
    const outcome = cacheOutcome(10_000, 0.9, 1, 50);
    expect(outcome.originQps).toBeCloseTo(1000);
    expect(outcome.meanMs).toBeCloseTo(6);
    expect(outcome.p99Ms).toBe(51);
    expect(cacheOutcome(10_000, 0.995, 1, 50).p99Ms).toBe(1);
    expect(cacheOutcome(10_000, 0.99, 1, 50).p99Ms).toBe(1);
  });
});

describe('queue backlog', () => {
  const spike = { seconds: 120, baseRate: 800, spikeRate: 3000, spikeStart: 10, spikeEnd: 40 };

  it('grows during a spike the consumers cannot keep up with, then drains at the spare capacity', () => {
    const b = queueBacklog({ ...spike, consumers: 2, perConsumer: 1000 });
    expect(Math.max(...b.depth)).toBe(30_000);
    expect(b.drainSeconds).toBe(25);
  });

  it('never drains when the base rate alone exceeds capacity', () => {
    expect(queueBacklog({ ...spike, consumers: 1, perConsumer: 700 }).drainSeconds).toBeNull();
  });

  it('never queues when capacity covers the spike', () => {
    const b = queueBacklog({ ...spike, consumers: 3, perConsumer: 1000 });
    expect(Math.max(...b.depth)).toBe(0);
    expect(b.drainSeconds).toBe(1);
  });
});

describe('replica reads', () => {
  it('are stale inside the lag unless read-your-writes pins the user to the primary', () => {
    expect(replicaRead(500, 200, false, 1000)).toEqual({ stale: true, servedBy: 'replica' });
    expect(replicaRead(500, 800, false, 1000)).toEqual({ stale: false, servedBy: 'replica' });
    expect(replicaRead(500, 200, true, 1000)).toEqual({ stale: false, servedBy: 'primary' });
    expect(replicaRead(3000, 1500, true, 1000)).toEqual({ stale: true, servedBy: 'replica' });
  });
});

describe('rate limiters', () => {
  // 10 requests a second allowed; a burst of 20 at 900 to 1,100 ms straddles a window edge.
  const burst = Array.from({ length: 20 }, (_, i) => 900 + i * 10);

  it('let a fixed window pass twice the limit across a window edge', () => {
    const run = runLimiter('fixed-window', burst, 10, 10);
    expect(run.accepted.filter(Boolean)).toHaveLength(20);
    expect(run.worstSecond).toBe(20);
  });

  it('hold a sliding window to the limit in every second', () => {
    const run = runLimiter('sliding-window', burst, 10, 10);
    expect(run.accepted.filter(Boolean)).toHaveLength(10);
    expect(run.worstSecond).toBe(10);
  });

  it('let a token bucket spend its saved burst, then refill at the rate', () => {
    const run = runLimiter('token-bucket', burst, 10, 10);
    // 10 saved tokens, plus about 1.9 refilled over the 190 ms of the burst.
    expect(run.accepted.filter(Boolean)).toHaveLength(11);
    expect(runLimiter('token-bucket', [0, 100, 200], 10, 1).accepted).toEqual([true, true, true]);
  });
});

describe('partition', () => {
  it('lets only a majority side elect, and neither side of an even split', () => {
    expect(partition(5, 2, 'left')).toEqual({ majority: 3, tolerates: 2, quorumSide: 'right', leaderKept: false });
    expect(partition(5, 3, 'left')).toMatchObject({ quorumSide: 'left', leaderKept: true });
    expect(partition(4, 2, 'left')).toMatchObject({ majority: 3, tolerates: 1, quorumSide: null, leaderKept: false });
    expect(partition(3, 0, 'right')).toMatchObject({ quorumSide: 'right', leaderKept: true });
  });
});

describe('search index', () => {
  const docs = ['the cat sat', 'the cat ran fast', 'a dog ran'];

  it('lists each term with the ascending documents that hold it', () => {
    expect(invertedIndex(docs).get('ran')).toEqual([1, 2]);
    expect(invertedIndex(['Cat cat', 'CAT']).get('cat')).toEqual([0, 1]);
  });

  it('intersects for and, unions for or, and ranks by TF-IDF', () => {
    expect(searchIndex(docs, 'cat ran', 'and').map((h) => h.doc)).toEqual([1]);
    const or = searchIndex(docs, 'cat ran', 'or');
    expect(or.map((h) => h.doc)).toEqual([1, 0, 2]);
    expect(or[0].score).toBeCloseTo(2 * Math.log(3 / 2));
    expect(searchIndex(['a cat', 'the cat'], 'cat', 'or').map((h) => h.score)).toEqual([0, 0]);
    expect(searchIndex(docs, 'zebra', 'or')).toEqual([]);
  });
});

describe('stream windows', () => {
  const events = [
    { at: 1, arrives: 1 },
    { at: 12, arrives: 13 },
    { at: 5, arrives: 14 },
  ];

  it('drops an event whose tumbling window closed before it arrived, unless the watermark allows for it', () => {
    expect(streamWindows(events, 'tumbling', 10, 0)).toEqual({
      windows: [
        { start: 0, end: 10, events: [0] },
        { start: 10, end: 20, events: [1] },
      ],
      late: [2],
    });
    expect(streamWindows(events, 'tumbling', 10, 5).late).toEqual([]);
  });

  it('counts a late event only in the sliding windows still open', () => {
    const run = streamWindows(events, 'sliding', 10, 0, 5);
    expect(run.windows.find((w) => w.start === 0)?.events).toEqual([0]);
    expect(run.windows.find((w) => w.start === 5)?.events).toEqual([2, 1]);
    expect(run.late).toEqual([]);
  });

  it('merges events closer than the gap into one session', () => {
    const run = streamWindows(
      [
        { at: 1, arrives: 1 },
        { at: 3, arrives: 3 },
        { at: 12, arrives: 12 },
      ],
      'session',
      4,
      100,
    );
    expect(run.windows).toEqual([
      { start: 1, end: 7, events: [0, 1] },
      { start: 12, end: 16, events: [2] },
    ]);
  });
});

describe('cdn outcome', () => {
  const options = { rps: 10000, objects: 100000, zipf: 1, pops: 20, ttlSec: 60, shield: false, edgeMs: 10, shieldMs: 30, originMs: 120 };

  it('hits less at each edge as traffic spreads over more locations', () => {
    expect(cdnOutcome(options).edgeHitRate).toBeCloseTo(0.692, 3);
    expect(cdnOutcome(options).originRps).toBeCloseTo(3077, 0);
    expect(cdnOutcome({ ...options, pops: 100 }).edgeHitRate).toBeCloseTo(0.561, 3);
    expect(cdnOutcome({ ...options, pops: 1 }).edgeHitRate).toBeCloseTo(0.909, 3);
  });

  it('lets a shield absorb the misses of every location', () => {
    const shielded = cdnOutcome({ ...options, shield: true });
    expect(shielded.edgeHitRate).toBeCloseTo(0.692, 3);
    expect(shielded.originShare).toBeCloseTo(0.089, 3);
    expect(shielded.meanMs).toBeCloseTo(29.9, 1);
    expect(cdnOutcome({ ...options, pops: 100, shield: true }).originShare).toBeCloseTo(0.091, 3);
  });
});

describe('region outcome', () => {
  const options = {
    users: [0.5, 0.3, 0.2],
    rtt: [
      [0, 80, 220],
      [80, 0, 160],
      [220, 160, 0],
    ],
    primary: 0,
    accessMs: 20,
    readShare: 0.9,
    lagMs: 500,
  };

  it('pays the trip to the primary for every request from one region, and only for writes with read replicas', () => {
    expect(regionOutcome('single', options)).toMatchObject({ readMs: 88, writeMs: 88, rpoMs: 3_600_000 });
    expect(regionOutcome('replicas', options)).toMatchObject({ readMs: 20, writeMs: 88, rpoMs: 500, rtoSec: 60 });
    expect(regionOutcome('replicas', options).meanMs).toBeCloseTo(26.8);
    expect(regionOutcome('single', { ...options, primary: 1 }).readMs).toBeCloseTo(92);
  });

  it('adds the nearest peer to every quorum write, and makes active-active local but open to conflicts', () => {
    expect(regionOutcome('quorum', options)).toMatchObject({ writeMs: 168, rpoMs: 0, rtoSec: 10 });
    expect(regionOutcome('active-active', options)).toMatchObject({ readMs: 20, writeMs: 20, conflicts: true });
  });
});

describe('error budget', () => {
  it('turns a 99.9% SLO into 43.2 minutes a month and burns it at the error rate over the budget', () => {
    const run = errorBudget({ slo: 0.999, windowDays: 30, rps: 1000, errorRate: 0.001 });
    expect(run).toMatchObject({ allowedFailures: 2_592_000, budgetMinutes: 43.2, burnRate: 1, daysToExhaust: 30 });
    expect(run.alerts.map((a) => a.fires)).toEqual([false, false, true]);
  });

  it('fires each alert exactly at its burn rate', () => {
    expect(errorBudget({ slo: 0.999, windowDays: 30, rps: 1000, errorRate: 0.006 }).alerts.map((a) => a.fires)).toEqual([
      false,
      true,
      true,
    ]);
    expect(errorBudget({ slo: 0.999, windowDays: 30, rps: 1000, errorRate: 0.0144 }).alerts.map((a) => a.fires)).toEqual([
      true,
      true,
      true,
    ]);
    expect(errorBudget({ slo: 0.999, windowDays: 30, rps: 1000, errorRate: 0 }).daysToExhaust).toBe(Infinity);
  });
});

describe('page cost', () => {
  it('reads every skipped row with an offset and only the page with a cursor', () => {
    expect(pageCost('offset', { size: 50, page: 10, insertsPerPage: 3 })).toEqual({ rowsRead: 500, walkRows: 2750, repeats: 27 });
    expect(pageCost('cursor', { size: 50, page: 10, insertsPerPage: 3 })).toEqual({ rowsRead: 51, walkRows: 510, repeats: 0 });
    expect(pageCost('offset', { size: 50, page: 1000, insertsPerPage: 0 }).walkRows).toBe(25_025_000);
  });

  it('repeats at most a page of items per request', () => {
    expect(pageCost('offset', { size: 20, page: 5, insertsPerPage: 50 }).repeats).toBe(80);
  });
});

describe('crack time', () => {
  const options = { alphabet: 62, length: 8, gpus: 8, bcryptCost: 12 };

  it('exhausts an 8-character password in minutes against SHA-256 and centuries against bcrypt', () => {
    expect(crackTime('sha256', options).seconds).toBeCloseTo(1364.4, 0);
    expect(crackTime('bcrypt', options).guessesPerSecond).toBeCloseTo(11_250);
    expect(crackTime('bcrypt', options).seconds / (365.25 * 86_400)).toBeCloseTo(615.4, 0);
  });

  it('doubles bcrypt work per cost step and scales with the attacker GPUs', () => {
    expect(crackTime('bcrypt', { ...options, bcryptCost: 13 }).seconds).toBeCloseTo(crackTime('bcrypt', options).seconds * 2);
    expect(crackTime('pbkdf2', { ...options, gpus: 800 }).guessesPerSecond).toBe(12_000_000);
  });
});

describe('transaction outcome', () => {
  const options = { services: 4, stepMs: 20, rttMs: 5, failAt: 0, coordinatorCrash: false };

  it('holds locks through both phases of two-phase commit, and blocks when the coordinator dies after prepare', () => {
    expect(txnOutcome('2pc', options)).toEqual({ latencyMs: 30, lockMs: 30, partialMs: 0, compensations: 0, outcome: 'committed' });
    expect(txnOutcome('2pc', { ...options, coordinatorCrash: true })).toMatchObject({ lockMs: Infinity, outcome: 'blocked' });
  });

  it('commits saga steps one by one and undoes the finished ones when a later step fails', () => {
    expect(txnOutcome('saga', options)).toEqual({ latencyMs: 100, lockMs: 20, partialMs: 75, compensations: 0, outcome: 'committed' });
    expect(txnOutcome('saga', { ...options, failAt: 1 }).partialMs).toBe(0);
    expect(txnOutcome('saga', { ...options, failAt: 3 })).toEqual({
      latencyMs: 125,
      lockMs: 20,
      partialMs: 100,
      compensations: 2,
      outcome: 'rolled back',
    });
  });
});

describe('batch job', () => {
  const options = { inputGB: 1000, workers: 50, reducers: 50, hotKeyShare: 0, combiner: false };

  it('splits the work evenly without skew, and a combiner shrinks the shuffle tenfold', () => {
    expect(batchJob(options)).toMatchObject({ mapSec: 200, shuffleGB: 500, shuffleSec: 100, reduceSec: 100, totalSec: 400 });
    expect(batchJob({ ...options, combiner: true }).totalSec).toBeCloseTo(220);
    expect(batchJob({ ...options, reducers: 200 }).reduceSec).toBeCloseTo(100);
  });

  it('leaves one reducer with the hot key, which more reducers cannot fix', () => {
    expect(batchJob({ ...options, hotKeyShare: 0.2 }).slowestReducerGB).toBeCloseTo(108);
    expect(batchJob({ ...options, hotKeyShare: 0.2, reducers: 200 }).totalSec).toBeCloseTo(1320);
  });
});

describe('geo query', () => {
  const options = { precision: 6, radiusKm: 2, latitude: 45, density: 50 };

  it('reads the cells covering the circle and wastes what falls outside it', () => {
    const run = geoQuery(options);
    expect(run.cellHeightKm).toBeCloseTo(0.611, 3);
    expect(run.cellWidthKm).toBeCloseTo(0.865, 3);
    expect(run.cells).toBe(48);
    expect(run.matches).toBeCloseTo(628.3, 1);
    expect(run.candidates).toBeCloseTo(1269, 0);
  });

  it('trades cells read against places read as the precision changes', () => {
    expect(geoQuery({ ...options, precision: 5 })).toMatchObject({ cells: 6 });
    expect(geoQuery({ ...options, precision: 7 }).cells).toBe(1092);
    expect(geoQuery({ ...options, latitude: 0 }).cellWidthKm).toBeCloseTo(1.223, 3);
  });
});

describe('delivery', () => {
  const options = { clients: 1_000_000, pollSec: 5, eventsPerMinute: 1 };

  it('costs polling a request per client per interval and half an interval of delay', () => {
    expect(delivery('polling', options)).toMatchObject({ requestsPerSecond: 200_000, delayMs: 2550, headerMBps: 160 });
  });

  it('answers long polls once per event or timeout, and pushes over one open connection', () => {
    expect(delivery('long-polling', options)).toMatchObject({ requestsPerSecond: 50_000, delayMs: 50, openConnections: 1_000_000 });
    expect(delivery('websocket', options)).toMatchObject({ requestsPerSecond: 0, delayMs: 50, openConnections: 1_000_000 });
  });
});
