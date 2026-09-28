import { describe, expect, it } from 'vitest';
import { cacheOutcome, hashRing, moduloOwner, movedKeys, place, queueBacklog, queueLatency, ringOwner } from './widgets.js';

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
