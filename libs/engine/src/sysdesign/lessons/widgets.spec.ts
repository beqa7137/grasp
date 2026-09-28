import { describe, expect, it } from 'vitest';
import {
  cacheOutcome,
  collisionChance,
  idLayout,
  chainAvailability,
  hashRing,
  moduloOwner,
  partition,
  movedKeys,
  pipeline,
  place,
  queueBacklog,
  queueLatency,
  quorumRound,
  replicaRead,
  ringOwner,
  runLimiter,
} from './widgets.js';

describe('queue latency', () => {
  it('doubles at half load and grows tenfold at 90%, with p99 about 4.6 times the mean', () => {
    expect(queueLatency(10, 0.5).mean).toBeCloseTo(20);
    expect(queueLatency(10, 0.9).mean).toBeCloseTo(100);
    expect(queueLatency(10, 0.9).p99 / queueLatency(10, 0.9).mean).toBeCloseTo(4.605, 3);
    expect(queueLatency(10, 0.9).p50).toBeCloseTo(69.3, 1);
  });

  it('stays finite at full load', () => {
    expect(Number.isFinite(queueLatency(10, 1).p99)).toBe(true);
  });
});

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

describe('hash ring', () => {
  const keys = Array.from({ length: 2000 }, (_, i) => `user:${i}`);
  const four = ['A', 'B', 'C', 'D'];
  const five = [...four, 'E'];

  it('moves about a fifth of the keys when a fifth node joins, where hash mod N moves most of them', () => {
    const ringBefore = place(keys, four, (k) => ringOwner(hashRing(four, 100), k));
    const ringAfter = place(keys, five, (k) => ringOwner(hashRing(five, 100), k));
    const ringMoved = movedKeys(ringBefore.owners, ringAfter.owners) / keys.length;
    expect(ringMoved).toBeGreaterThan(0.12);
    expect(ringMoved).toBeLessThan(0.3);
    // Every moved key moved to the new node.
    expect(ringAfter.owners.filter((o, i) => o !== ringBefore.owners[i] && o !== 'E')).toEqual([]);

    const modMoved = movedKeys(
      place(keys, four, (k) => moduloOwner(four, k)).owners,
      place(keys, five, (k) => moduloOwner(five, k)).owners,
    );
    expect(modMoved / keys.length).toBeGreaterThan(0.7);
  });

  it('balances load with virtual nodes far better than with one point per node', () => {
    const spread = (virtualNodes: number) => {
      const { load } = place(keys, five, (k) => ringOwner(hashRing(five, virtualNodes), k));
      return Math.max(...load) / (keys.length / five.length);
    };
    expect(spread(100)).toBeLessThan(1.4);
    expect(spread(1)).toBeGreaterThan(spread(100));
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

describe('chain availability', () => {
  it('multiplies series parts and lets replicas cut each part downtime', () => {
    const single = chainAvailability([
      { availability: 0.999, copies: 1 },
      { availability: 0.99, copies: 1 },
    ]);
    expect(single.availability).toBeCloseTo(0.98901, 5);
    expect(single.weakest).toBe(1);
    const replicated = chainAvailability([
      { availability: 0.999, copies: 1 },
      { availability: 0.99, copies: 2 },
    ]);
    expect(replicated.availability).toBeCloseTo(0.9989, 4);
    expect(replicated.weakest).toBe(0);
    expect(chainAvailability([{ availability: 0.999, copies: 1 }]).downtimeMinutesPerYear).toBeCloseTo(525.6, 1);
  });
});

describe('pipeline', () => {
  it('serves what its smallest tier can, and adding to that tier moves the bottleneck', () => {
    const tiers = [
      { instances: 2, perInstance: 5000 },
      { instances: 4, perInstance: 1500 },
      { instances: 1, perInstance: 4000 },
    ];
    const p = pipeline(8000, tiers);
    expect(p.throughput).toBe(4000);
    expect(p.bottleneck).toBe(2);
    expect(pipeline(8000, [tiers[0], tiers[1], { instances: 3, perInstance: 4000 }]).bottleneck).toBe(1);
    // Behind the app tier's cap, the database sees only what the app servers pass on.
    const capped = pipeline(20_000, [
      { instances: 10, perInstance: 5000 },
      { instances: 10, perInstance: 1500 },
      { instances: 10, perInstance: 4000 },
    ]);
    expect(capped.throughput).toBe(15_000);
    expect(capped.bottleneck).toBe(1);
    expect(capped.utilization).toEqual([0.4, 1, 0.375]);
  });
});

describe('quorum round', () => {
  it('guarantees a fresh read exactly when r + w > n', () => {
    expect(quorumRound(3, 2, 2, [])).toMatchObject({ overlap: true, fresh: true, writeSet: [0, 1], readSet: [2, 0] });
    expect(quorumRound(3, 1, 1, [])).toMatchObject({ overlap: false, fresh: false, readSet: [1] });
    expect(quorumRound(5, 3, 2, [])).toMatchObject({ overlap: false, fresh: false });
  });

  it('fails a write or read that cannot gather its quorum', () => {
    expect(quorumRound(3, 2, 2, [0, 1])).toMatchObject({ writeOk: false, readOk: false, fresh: false });
    expect(quorumRound(5, 3, 3, [4, 3])).toMatchObject({ writeOk: true, readOk: true, fresh: true });
    expect(quorumRound(3, 3, 1, [2])).toMatchObject({ writeOk: false, readOk: true });
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

describe('id layout', () => {
  it('matches the classic Snowflake split of 41, 10 and 12 bits', () => {
    const l = idLayout(10, 12, 1);
    expect(l.timeBits).toBe(41);
    expect(l.years).toBeCloseTo(69.7, 1);
    expect(l.generators).toBe(1024);
    expect(l.perGeneratorPerSecond).toBe(4_096_000);
  });

  it('puts the birthday bound near 50% at about 1.18 times the square root of the space', () => {
    expect(collisionChance(64, 1.177 * 2 ** 32)).toBeCloseTo(0.5, 2);
    expect(collisionChance(122, 1e9)).toBeCloseTo(9.4e-20, 21);
  });
});
