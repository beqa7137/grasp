import { describe, expect, it } from 'vitest';
import { QUORUM_CHALLENGE_GOAL, QUORUM_CHALLENGE_SOLUTION, QUORUM_EXPERIMENTS } from './consistency-experiments.js';
import { goalMet, renderExperiment } from './experiments.js';
import { SD_LESSONS } from './index.js';
import { QUORUM_BASELINE, QUORUM_SIZES, quorumAt, type QuorumSettings } from './widgets/quorum.js';

const shown = Object.fromEntries(QUORUM_EXPERIMENTS.map((e) => [e.id, renderExperiment(e)]));
const metricsAt = (s: QuorumSettings) => quorumAt(s).metrics;

describe('the Consistency & Quorums experiments', () => {
  it('replace the lesson tryThis, in the order of the interview arc', () => {
    expect(SD_LESSONS['sd-consistency'].widget.experiments).toBe(QUORUM_EXPERIMENTS);
    expect(SD_LESSONS['sd-consistency'].widget.tryThis).toBeUndefined();
    expect(QUORUM_EXPERIMENTS.map((e) => e.id)).toEqual([
      'r-plus-w-equals-n',
      'all-one-down',
      'stall',
      'missed-write',
      'sloppy',
      'fast-fresh',
    ]);
    expect(QUORUM_EXPERIMENTS.map((e) => e.act)).toEqual([
      { run: 'write-read' },
      { run: 'write-read' },
      { run: 'write-read' },
      { run: 'read' },
      { run: 'read' },
      undefined,
    ]);
  });

  it('put the answers at 3, 1, 2, 1 and 3', () => {
    expect(QUORUM_EXPERIMENTS.filter((e) => !e.goal).map((e) => renderExperiment(e).answer + 1)).toEqual([3, 1, 2, 1, 3]);
  });

  it('hide what would answer them while asking, and point the reveal at the regions it is about', () => {
    expect(QUORUM_EXPERIMENTS.map((e) => e.hide ?? [])).toEqual([
      ['count'],
      ['write', 'verdict', 'availability'],
      ['write-time', 'verdict'],
      ['repair'],
      ['verdict', 'count', 'read'],
      [],
    ]);
    expect(QUORUM_EXPERIMENTS.map((e) => e.focus)).toEqual([
      ['strip', 'reader', 'cards'],
      ['writer', 'handles'],
      ['latency', 'writer'],
      ['reader', 'cards'],
      ['standins', 'strip'],
      ['reader', 'latency'],
    ]);
  });

  it('ask whether R + W = N is enough, and answer from the read-set count', () => {
    const e = shown['r-plus-w-equals-n'];
    expect(e.ask).toBe('Writes wait for 2 of 5 acks and a read asks 3, so 3 + 2 = 5. Of the 10 read sets of 3, how many can miss v8?');
    expect(e.choices).toEqual(['None: 3 + 2 covers all 5', '3 of 10, as a read of 2 would', '1 of 10']);
    expect(e.reveal).toBe(
      '1 of 10: R3, R4 and R5 share no replica with the 2 that acked, and that is the read drawn here. It got v8 only because v8 reached R3 at 2 ms, before the read did, and it repaired R4 and R5 before returning (7 ms in all). Had v8 reached R3 after the read, it would return v7. With R + W = N exactly one read set misses the write; R 4 makes it 4 + 2 > 5, and none can.',
    );
  });

  it('refuse a write at ALL with a replica known down, and quote both availabilities', () => {
    const e = shown['all-one-down'];
    expect(e.ask).toBe(
      'Writes wait for ALL 3 replicas, reads for ONE, and R3 has been down for a minute, so the cluster knows. What happens?',
    );
    expect(e.choices).toEqual([
      'Writes are refused at once; reads still work',
      'Writes time out after 2 s; reads still work',
      'Both keep working',
    ]);
    expect(e.reveal).toMatch(/^Refused at once: the coordinator knows R3 is down, so it writes nothing/);
    expect(e.reveal).toContain('and the read of R2 still works, returning v7.');
    expect(e.reveal).toContain('the write would time out after 2 s, yet R1 and R2 would keep v8');
    expect(e.reveal).toContain('With each replica down 1% of the time, writes at ALL succeed 97.03% of the time, reads at ONE 99.9999%.');
  });

  it('move the QUORUM write to the cross-data-center ack when the middle replica stalls', () => {
    const e = shown['stall'];
    expect(e.ask).toBe(
      'R2 pauses for 100 ms (a GC pause), so its round trip is now 104 ms. Writes at QUORUM took 4 ms. What do they take now?',
    );
    expect(e.choices).toEqual(['4 ms, unchanged', "40 ms, R3's round trip", '104 ms, waiting for R2']);
    expect(e.reveal).toBe(
      "40 ms: a write goes to all 3 and returns at the 2nd ack, which is now R3's, across data centers; ALL would wait 104 ms for R2. ONE stays 2 ms. Reads hedge such stalls with speculative retry, asking one more replica; a write already goes to all, so only W and replica placement help.",
    );
  });

  it('repair the replica that missed the write inside the read', () => {
    const e = shown['missed-write'];
    expect(e.ask).toBe(
      'R3 was down for the write and is back. The read asks R3, which still has v7, and R2, which has v8. What happens to R3?',
    );
    expect(e.choices[0]).toBe('The read writes v8 to it before returning: read repair');
    expect(e.reveal).toContain('so the read writes v8 to R3 and returns only then, 6 ms instead of 4 ms');
    expect(e.reveal).toContain("by default Cassandra writes hints only for a replica's first 3 hours down");
  });

  it('show a sloppy quorum missing a write once the home replicas are back', () => {
    const e = shown['sloppy'];
    expect(e.ask).toBe(
      'R2 and R3 were down, so a sloppy quorum took the write on R1 and stand-in H1. Both are back for the read, and 2 + 2 > 3. Can a read still miss v8?',
    );
    expect(e.choices).toEqual(['No: R + W > N still holds', 'Yes: all 3 read sets can', 'Yes: 1 of the 3 read sets can']);
    expect(e.reveal).toMatch(/^Yes, 1 of the 3: R2 and R3 are back, so a read goes to the home replicas again/);
    expect(e.reveal).toContain('only R1 has v8, so a read of R2 and R3, like this one, returns v7. H1 and H2 replay v8 to R2 and R3');
    expect(e.reveal).toContain('write availability: 99.97% to 99.99999% here.');
  });

  it('set a challenge exactly one of its 34 settings passes, N 5, W 4, R 2', () => {
    const e = QUORUM_EXPERIMENTS.find((x) => x.goal)!;
    expect(e.goal).toBe(QUORUM_CHALLENGE_GOAL);
    const passing: string[] = [];
    let count = 0;
    for (const n of QUORUM_SIZES)
      for (let w = 1; w <= n; w++)
        for (let r = 1; r <= n; r++) {
          count++;
          const s = { ...QUORUM_BASELINE, ...e.setup, n, w, r } as QuorumSettings;
          if (goalMet(QUORUM_CHALLENGE_GOAL, metricsAt(s), s)) passing.push(`N${n} W${w} R${r}`);
        }
    expect(count).toBe(34);
    expect(passing).toEqual(['N5 W4 R2']);
    const solved = { ...QUORUM_BASELINE, ...e.setup, ...QUORUM_CHALLENGE_SOLUTION } as QuorumSettings;
    expect(metricsAt(solved)).toEqual({ canMiss: 0, readMs: 3, writeMs: 41, writeSurvives: 1 });
    expect(goalMet(QUORUM_CHALLENGE_GOAL, metricsAt(solved), { ...solved, stall: 0 })).toBe(false);
    expect(goalMet(QUORUM_CHALLENGE_GOAL, metricsAt(solved), { ...solved, s1: 1 })).toBe(false);
    expect(shown['fast-fresh'].ask).toBe(
      'The middle replica keeps pausing for 100 ms. Choose N, W and R so that no read set can miss v8, reads take under 5 ms, writes under 50 ms, and writes survive at least 1 replica down.',
    );
    expect(shown['fast-fresh'].reveal).toMatch(
      /^N 5, W 4, R 2: 2 \+ 4 > 5, the read hears R5 and R4 in 3 ms, and the 4th ack, R5's, arrives at 41 ms, so the paused R3 is never waited on\./,
    );
    expect(shown['fast-fresh'].reveal).toContain("writes succeed 99.90% of the time against QUORUM of 3's 99.97%");
    expect(shown['fast-fresh'].reveal).toContain('EACH_QUORUM writes would mean all 5 here, waiting for the paused R3.');
  });
});
