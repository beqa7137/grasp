import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../algorithms/random.js';
import {
  PROPAGATION,
  PROPAGATION_LIMITS,
  bytesRate,
  pollKb,
  propagation,
  propagationCheckpoint,
  secondsText,
  type PollPayload,
  type PropagationSettings,
} from './propagation.js';

const fleet: PropagationSettings = { instances: 20_000, delivery: 'poll', intervalS: 30, payload: 'full', cdn: false, changesPerMin: 2 };
const PAYLOADS: PollPayload[] = ['full', 'etag', 'delta'];

function* sweep(): Generator<PropagationSettings> {
  for (const instances of [1_000, 7_000, 20_000, 100_000])
    for (const intervalS of [5, 30, 60, 300])
      for (const changesPerMin of [0, 1, 2, 13, 30])
        for (const cdn of [false, true]) {
          for (const payload of PAYLOADS) yield { instances, delivery: 'poll', intervalS, payload, cdn, changesPerMin };
          yield { instances, delivery: 'stream', intervalS, payload: 'full', cdn, changesPerMin };
        }
}

describe('propagation model', () => {
  it('works out the naive fleet: 20,000 instances polling a 1 MB ruleset every 30 s', () => {
    const run = propagation(fleet);
    expect(run.originRps).toBeCloseTo(666.67, 2);
    expect(run.originBytesS).toBeCloseTo(666.67e6, -4);
    expect(bytesRate(run.originBytesS)).toBe('667 MB/s');
    expect(run.worstS).toBe(30.5);
    expect(run.typicalS).toBe(15.5);
  });

  it('downloads the ruleset only when it changed with an ETag, and only the changes with deltas', () => {
    expect(pollKb('etag', 30, 1 / 30)).toBeCloseTo(0.5 + 1000 * (1 - Math.exp(-1)), 6);
    expect(pollKb('delta', 30, 1 / 30)).toBeCloseTo(2.5);
    expect(pollKb('etag', 30, 0)).toBe(PROPAGATION.headerKb);
    expect(pollKb('delta', 30, 0)).toBe(PROPAGATION.headerKb);
    expect(propagation({ ...fleet, payload: 'delta' }).originBytesS).toBeCloseTo((20_000 / 30) * 2_500, 3);
  });

  it('matches a simulation of polls against changes that arrive at random', () => {
    const rand = mulberry32(88);
    const perS = 1 / 30;
    let t = 0;
    const changes: number[] = [];
    while (t < 200_000) {
      t += -Math.log(1 - rand()) / perS;
      changes.push(t);
    }
    let polls = 0;
    let changed = 0;
    let sinceLast = 0;
    for (let at = 30, i = 0; at < 200_000; at += 30, polls++) {
      let n = 0;
      for (; i < changes.length && changes[i] < at; i++) n++;
      if (n) changed++;
      sinceLast += n;
    }
    expect(changed / polls).toBeCloseTo((pollKb('etag', 30, perS) - PROPAGATION.headerKb) / PROPAGATION.rulesetKb, 1);
    expect(sinceLast / polls).toBeCloseTo((pollKb('delta', 30, perS) - PROPAGATION.headerKb) / PROPAGATION.changeKb, 1);
  });

  it('waits up to one interval for a poll and one more for a CDN copy, half that on average', () => {
    const rand = mulberry32(7);
    const T = 30;
    let worst = 0;
    let sum = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      const wait = rand() * T + rand() * T;
      worst = Math.max(worst, wait);
      sum += wait;
    }
    const cdn = propagation({ ...fleet, cdn: true });
    expect(cdn.worstS - PROPAGATION.publishS).toBe(2 * T);
    expect(worst).toBeLessThanOrEqual(2 * T);
    expect(sum / n).toBeCloseTo(cdn.typicalS - PROPAGATION.publishS, 0);
    expect(cdn.originRps).toBeCloseTo(50 / 30);
    expect(cdn.sdkBytesS).toBe(propagation(fleet).sdkBytesS);
  });

  it('streams each change in under a second, with servers added per 10,000 connections rather than time', () => {
    const stream = propagation({ ...fleet, delivery: 'stream' });
    expect(stream.worstS).toBeCloseTo(0.7);
    expect(stream.streamServers).toBe(2);
    expect(stream.originRps).toBe(0);
    expect(stream.originBytesS).toBeCloseTo((20_000 * 2 * 2_000) / 60);
    expect(propagation({ ...fleet, delivery: 'stream', instances: 100_000 }).worstS).toBeCloseTo(0.7);
    expect(propagation({ ...fleet, delivery: 'stream', instances: 1_000 }).worstS).toBeCloseTo(0.52);
    expect(propagation({ ...fleet, delivery: 'stream', changesPerMin: 0 }).originBytesS).toBe(0);
  });

  it('refuses settings that are not positive, and formats its readouts', () => {
    expect(() => propagation({ ...fleet, instances: 0 })).toThrow();
    expect(() => propagation({ ...fleet, intervalS: 0 })).toThrow();
    expect(() => propagation({ ...fleet, changesPerMin: -1 })).toThrow();
    expect(secondsText(0.7)).toBe('0.7 s');
    expect(secondsText(60.5)).toBe('61 s');
    expect(bytesRate(1_333_333)).toBe('1.3 MB/s');
    expect(bytesRate(0)).toBe('0 bytes/s');
    expect(bytesRate(2.5e9)).toBe('2.5 GB/s');
  });
});

describe('propagation checkpoint', () => {
  it('has exactly one right answer, the readout the model gives, on every setting', () => {
    for (const s of sweep()) {
      const at = JSON.stringify(s);
      const run = propagation(s);
      const c = propagationCheckpoint(s);
      const right = c.choices[c.answer];
      const expected = c.prompt.includes('How long')
        ? secondsText(run.worstS)
        : c.prompt.includes('requests')
          ? `${run.originRps < 10 ? Number(run.originRps.toFixed(1)) : Math.round(run.originRps).toLocaleString('en-US')} requests/s`
          : bytesRate(run.originBytesS);
      expect(right, at).toBe(expected);
      expect(c.choices.length, at).toBeGreaterThanOrEqual(3);
      expect(new Set(c.choices).size, at).toBe(c.choices.length);
    }
  });

  it('varies the question with the settings and keeps within the sliders', () => {
    const asked = new Set([...sweep()].map((s) => propagationCheckpoint(s).prompt.split('. ').at(-1)));
    expect(asked.size).toBe(3);
    expect(PROPAGATION_LIMITS.intervalS.min).toBeGreaterThan(0);
    expect(propagationCheckpoint(fleet).prompt).not.toBe(propagationCheckpoint({ ...fleet, intervalS: 35 }).prompt);
  });
});
