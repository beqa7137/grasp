import type { ExperimentSpec, Slot, SlotUnit } from './experiments.js';
import { CACHE_HIT_MS, CACHE_HIT_SNAPS, CACHE_QPS, cacheRefill, cacheSteady } from './widgets/caching.js';

const slot =
  (unit: SlotUnit) =>
  (value: number): Slot => ({ value, unit });
const pct = slot('pct');
const ms = slot('ms');
const qps = slot('qps');
const times = slot('times');
const s = slot('s');
const approx = slot('approx');
const num = slot('num');

const steady = (hitRate: number, originMs: number) => cacheSteady({ hitRate, originMs });

const GOAL_MEAN_MS = 3;

export const CACHE_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'each-nine',
    title: 'One more nine',
    setup: { hitRate: 90, originMs: 100, capacity: 2_000 },
    act: { set: { hitRate: 99 } },
    ask: 'Raise the hit rate from {from} to {to}. How much less traffic reaches the origin?',
    choices: [
      { text: 'About {small} less', value: 'small' },
      { text: 'About {ratio} less', value: 'ratio' },
      { text: 'About {big} less', value: 'big' },
    ],
    truth: 'ratio',
    reveal:
      'Origin load falls from {loadFrom} to {loadTo}, {ratio} less: each extra nine cuts the misses tenfold. The mean drops from {meanFrom} to {meanTo}, and p99 from {p99From} to {p99To}, because now only one request in a hundred misses, and p99 is the 99th of 100, a hit.',
    focus: ['gauge'],
    slots: () => {
      const [a, b] = [steady(90, 100), steady(99, 100)];
      const ratio = a.originQps / b.originQps;
      return {
        from: pct(90),
        to: pct(99),
        small: times(ratio / 5),
        ratio: times(ratio),
        big: times(ratio * 10),
        loadFrom: qps(a.originQps),
        loadTo: qps(b.originQps),
        meanFrom: ms(a.meanMs),
        meanTo: ms(b.meanMs),
        p99From: ms(a.p99Ms),
        p99To: ms(b.p99Ms),
      };
    },
  },
  {
    id: 'p99-miss',
    title: 'Is p99 a miss?',
    setup: { hitRate: 90, originMs: 100, capacity: 2_000 },
    act: { set: { hitRate: 95 } },
    ask: 'Raise the hit rate from {from} to {to}. What happens to p99?',
    choices: [
      { text: 'It halves, to {half}', value: 'half' },
      { text: 'It stays at {p99To}', value: 'p99To' },
      { text: 'It drops to {hitMs}, a cache hit', value: 'hitMs' },
    ],
    truth: 'p99To',
    reveal:
      'Origin load halves, from {loadFrom} to {loadTo}, and the mean drops from {meanFrom} to {meanTo}. But p99 stays at {p99To}: {missesTo} of every 100 requests still miss, and whenever more than one request in a hundred misses, p99 is a miss that waits for the origin.',
    focus: ['waffle'],
    slots: () => {
      const [a, b] = [steady(90, 100), steady(95, 100)];
      return {
        from: pct(90),
        to: pct(95),
        half: ms(a.p99Ms / 2),
        p99To: ms(b.p99Ms),
        hitMs: ms(CACHE_HIT_MS),
        loadFrom: qps(a.originQps),
        loadTo: qps(b.originQps),
        meanFrom: ms(a.meanMs),
        meanTo: ms(b.meanMs),
        missesTo: num((b.originQps / CACHE_QPS) * 100),
      };
    },
  },
  {
    id: 'slow-origin',
    title: 'A slow origin behind a good cache',
    setup: { hitRate: 99.5, originMs: 10, capacity: 2_000 },
    act: { set: { originMs: 200 } },
    ask: 'At {hit} hits, slow the origin from {from} to {to}. What does p99 become?',
    choices: [
      { text: '{p99To}', value: 'p99To' },
      { text: '{half}', value: 'half' },
      { text: '{full}', value: 'full' },
    ],
    truth: 'p99To',
    reveal:
      'p99 stays at {p99To}: only one request in {oneIn} misses, so p99 is still a cache hit, and the mean moves only from {meanFrom} to {meanTo}. With few misses, a slow origin hardly shows. At {lowHit} hits the same change takes p99 from {lowFrom} to {lowTo}.',
    focus: ['waffle', 'readout'],
    slots: () => {
      const [a, b] = [steady(99.5, 10), steady(99.5, 200)];
      const [lowA, lowB] = [steady(95, 10), steady(95, 200)];
      return {
        hit: pct(99.5),
        from: ms(10),
        to: ms(200),
        p99To: ms(b.p99Ms),
        half: ms(CACHE_HIT_MS + 200 / 2),
        full: ms(CACHE_HIT_MS + 200),
        oneIn: num(CACHE_QPS / b.originQps),
        meanFrom: ms(a.meanMs),
        meanTo: ms(b.meanMs),
        lowHit: pct(95),
        lowFrom: ms(lowA.p99Ms),
        lowTo: ms(lowB.p99Ms),
      };
    },
  },
  {
    id: 'miss-storm',
    title: 'The miss storm',
    setup: { hitRate: 99.9, originMs: 100, capacity: 2_000 },
    act: { flush: true },
    ask: 'The origin gets {loadFrom}. Flush the cache: how much more traffic reaches the origin?',
    choices: [
      { text: '{small} more', value: 'small' },
      { text: '{mid} more', value: 'mid' },
      { text: '{ratio} more', value: 'ratio' },
    ],
    truth: 'ratio',
    reveal:
      'Every request misses, so the origin goes from {loadFrom} to {loadTo}: {ratio} more, and {over} what it can answer. It stays over capacity for about {storm}, until the refilling cache passes {threshold} hits, and about {lost} requests time out (more in practice, as clients retry). That miss storm is what an origin must survive after a flush, a cold start or a deploy.',
    focus: ['gauge', 'chart'],
    slots: () => {
      const warm = steady(99.9, 100);
      const run = cacheRefill({ hitRate: 99.9, originMs: 100, capacity: 2_000 });
      const ratio = CACHE_QPS / warm.originQps;
      return {
        loadFrom: qps(warm.originQps),
        loadTo: qps(CACHE_QPS),
        small: times(ratio / 100),
        mid: times(ratio / 10),
        ratio: times(ratio),
        over: times(CACHE_QPS / 2_000),
        storm: s(run.overCapacityS),
        threshold: pct(run.overBelowHitRate),
        lost: approx(run.timedOut),
      };
    },
  },
  {
    id: 'bigger-origin',
    title: 'A bigger origin',
    setup: { hitRate: 99.9, originMs: 100, capacity: 4_000 },
    act: { flush: true },
    ask: 'At {hit} hits and {capBefore} the storm lasted about {before}. The origin can now answer {cap}. Flush again: how long is it over capacity?',
    choices: [
      { text: 'About {before}', value: 'before' },
      { text: 'About {half}', value: 'half' },
      { text: 'About {after}', value: 'after' },
    ],
    truth: 'after',
    reveal:
      'About {after}, under half of {before}, and about {lost} requests time out instead of {lostBefore}. More capacity helps twice: the origin answers more misses a second, so the cache refills faster, and it is over capacity only until the hit rate passes {threshold} instead of {thresholdBefore}. Capacity is the expensive fix: warming the cache before it takes traffic, or coalescing misses for the same key, shrinks the storm without it.',
    focus: ['chart'],
    slots: () => {
      const before = cacheRefill({ hitRate: 99.9, originMs: 100, capacity: 2_000 });
      const after = cacheRefill({ hitRate: 99.9, originMs: 100, capacity: 4_000 });
      return {
        hit: pct(99.9),
        capBefore: qps(2_000),
        cap: qps(4_000),
        before: s(before.overCapacityS),
        half: s(before.overCapacityS / 2),
        after: s(after.overCapacityS),
        lost: approx(after.timedOut),
        lostBefore: approx(before.timedOut),
        threshold: pct(after.overBelowHitRate),
        thresholdBefore: pct(before.overBelowHitRate),
      };
    },
  },
  {
    id: 'mean-goal',
    title: 'Challenge: a mean under {goal}',
    setup: { hitRate: 90, originMs: 200, capacity: 2_000 },
    ask: 'The origin takes {origin}. Drag the hit rate until the mean is under {goal}.',
    goal: { metric: 'meanMs', below: GOAL_MEAN_MS },
    reveal:
      'The mean is under {goal} from {passHit} hits ({passMean}) up. With a {origin} origin every {step} of misses adds {perStep} to the mean, so at {prevHit} it is exactly {prevMean}, not under.',
    focus: ['readout'],
    slots: () => {
      const pass = CACHE_HIT_SNAPS.findIndex((h) => steady(h, 200).meanMs < GOAL_MEAN_MS);
      const [passHit, prevHit] = [CACHE_HIT_SNAPS[pass], CACHE_HIT_SNAPS[pass - 1]];
      return {
        goal: ms(GOAL_MEAN_MS),
        origin: ms(200),
        passHit: pct(passHit),
        passMean: ms(steady(passHit, 200).meanMs),
        prevHit: pct(prevHit),
        prevMean: ms(steady(prevHit, 200).meanMs),
        step: pct(1),
        perStep: ms(200 / 100),
      };
    },
  },
];
