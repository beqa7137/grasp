import { describe, expect, it } from 'vitest';
import { formatNines } from '../experiments.js';
import {
  CROSS_DC_ONE_WAY_MS,
  QUORUM_BASELINE,
  QUORUM_DATA_CENTERS,
  QUORUM_ONE_WAY_MS,
  QUORUM_SIZES,
  QUORUM_STALL_MS,
  QUORUM_VERSIONS,
  REPLICA_STATES,
  STAND_IN_ONE_WAY_MS,
  WRITE_TIMEOUT_MS,
  atLeastUp,
  choose,
  eachQuorum,
  quorumAt,
  quorumLevelName,
  quorumScenario,
  readSetsOf,
  stalledIndex,
  type QuorumSize,
  type ReplicaState,
} from './quorum.js';

const UP = (n: number): ReplicaState[] => Array(n).fill('up');
const run = (n: QuorumSize, w: number, r: number, states: ReplicaState[] = UP(n), stall = false, sloppy = false) =>
  quorumScenario(n, w, r, states, stall, sloppy);
const { old: V7, new: V8 } = QUORUM_VERSIONS;

function stateLists(n: number): ReplicaState[][] {
  const out: ReplicaState[][] = [];
  const walk = (acc: ReplicaState[]) => {
    if (acc.length === n) return void out.push(acc);
    for (const s of REPLICA_STATES) walk([...acc, s]);
  };
  walk([]);
  return out;
}

/** Every setting the widget can show: N, W, R, each replica's state, the stall and the sloppy quorum. */
function* everySetting() {
  for (const n of QUORUM_SIZES)
    for (let w = 1; w <= n; w++)
      for (let r = 1; r <= n; r++)
        for (const states of stateLists(n))
          for (const stall of [false, true]) for (const sloppy of [false, true]) yield { n, w, r, states, stall, sloppy };
}

describe('quorum geometry', () => {
  it('puts the writer in DC A and the reader in DC C, a round trip twice the one-way delay', () => {
    expect(QUORUM_ONE_WAY_MS).toEqual({ 3: [1, 2, 20], 5: [1, 1.5, 2, 20, 20.5] });
    expect(QUORUM_DATA_CENTERS).toEqual({ 3: ['A', 'B', 'C'], 5: ['A', 'A', 'B', 'C', 'C'] });
    const m = run(3, 2, 2);
    expect(m.replicas.map((x) => [x.writeRtt, x.readRtt, x.dc])).toEqual([
      [2, 40, 'A'],
      [4, 4, 'B'],
      [40, 2, 'C'],
    ]);
    expect(run(5, 3, 3).replicas.map((x) => x.readOneWay)).toEqual([20.5, 20, 2, 1.5, 1]);
    expect(run(3, 3, 3).write.ms).toBe(2 * CROSS_DC_ONE_WAY_MS);
  });

  it('pauses the middle replica on everything it handles', () => {
    expect([stalledIndex(3), stalledIndex(5)]).toEqual([1, 2]);
    const r2 = run(3, 2, 2, UP(3), true).replicas[1];
    expect(r2).toMatchObject({
      pause: QUORUM_STALL_MS,
      writeRtt: 4 + QUORUM_STALL_MS,
      readRtt: 4 + QUORUM_STALL_MS,
      landAt: 2 + QUORUM_STALL_MS,
    });
    expect([1, 2, 3].map((w) => run(3, w, 2, UP(3), true).write.ms)).toEqual([2, 40, 104]);
    expect([1, 2, 3].map((r) => run(3, 2, r, UP(3), true).read.ms)).toEqual([2, 40, 104]);
  });

  it('names ONE, QUORUM and ALL, and leaves other counts unnamed', () => {
    expect([1, 2, 3].map((k) => quorumLevelName(k, 3))).toEqual(['ONE', 'QUORUM', 'ALL']);
    expect([1, 2, 3, 4, 5].map((k) => quorumLevelName(k, 5))).toEqual(['ONE', null, 'QUORUM', null, 'ALL']);
  });

  it('counts EACH_QUORUM as a quorum of each data center, which is every replica here', () => {
    expect([eachQuorum(3), eachQuorum(5)]).toEqual([3, 5]);
  });
});

describe('quorum scenario', () => {
  it('acks the default write in 4 ms and returns v8 fresh in 6 ms, repairing R3 on the way', () => {
    const m = run(3, 2, 2);
    expect(m.write).toMatchObject({ outcome: 'acked', ms: 4, acked: [0, 1], applied: [0, 1, 2] });
    expect(m.read).toMatchObject({ sentAt: 4, set: [1, 2], repairs: [2], rthMs: 4, repairMs: 2, ms: 6, returns: V8 });
    expect(m.read.answers.map((a) => [a.id, a.value, a.readAt])).toEqual([
      [2, V7, 5],
      [1, V8, 6],
    ]);
    expect(m).toMatchObject({ verdict: 'fresh', both: [1], h: 2, readSets: 3, staleReadSets: 0, holds: [V8, V8, V8] });
  });

  it('decides what a replica holds when the read reaches it, never at the W-th ack', () => {
    const stale = run(3, 1, 1);
    expect(stale.verdict).toBe('stale');
    expect(stale.read.answers).toEqual([{ id: 2, value: V7, readAt: 3, rtt: 2 }]);
    expect(stale.replicas[2].landAt - stale.read.answers[0].readAt).toBe(17);
    const lucky = run(5, 2, 3);
    expect(lucky.write.acked).toEqual([0, 1]);
    expect(lucky.read.answers.find((a) => a.id === 2)).toMatchObject({ value: V8, readAt: 5 });
    expect(lucky).toMatchObject({ thisReadUnsure: true, verdict: 'fresh', staleReadSets: 1 });
  });

  it('applies the arrival rule at every N, W, R and stall', () => {
    let checked = 0;
    for (const { n, w, r, states, stall, sloppy } of everySetting()) {
      const m = run(n, w, r, states, stall, sloppy);
      for (const a of m.read.answers) {
        const x = m.all[a.id];
        expect(a.readAt).toBe(m.read.sentAt + x.readOneWay + x.pause);
        const reached = m.write.applied.includes(a.id) && x.landAt <= a.readAt;
        expect(a.value).toBe(reached ? V8 : x.home ? V7 : null);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100_000);
  });

  it('reads the R fastest reachable answers and blocks the read on its slowest repair', () => {
    for (const { n, w, r, states, stall, sloppy } of everySetting()) {
      const m = run(n, w, r, states, stall, sloppy);
      if (!m.read.set.length) continue;
      const fastest = m.all
        .filter((x) => x.reachable)
        .sort((a, b) => a.readRtt - b.readRtt || a.id - b.id)
        .slice(0, r)
        .map((x) => x.id)
        .sort((a, b) => a - b);
      expect(m.read.set).toEqual(fastest);
      const repairMs = Math.max(0, ...m.read.repairs.map((id) => m.all[id].readRtt));
      expect(m.read.ms).toBe(Math.max(...m.read.answers.map((a) => a.rtt)) + repairMs);
    }
  });

  it('refuses a write short of W known-live replicas, and times out one a stopped replica leaves short', () => {
    expect(run(3, 3, 1, ['up', 'up', 'down']).write).toMatchObject({ outcome: 'refused', ms: 0, live: 2, needed: 3, applied: [] });
    const timedOut = run(3, 3, 2, ['up', 'up', 'mid']);
    expect(timedOut.write).toMatchObject({ outcome: 'timed-out', ms: WRITE_TIMEOUT_MS, applied: [0, 1] });
    expect(timedOut.verdict).toBe('timed-out');
    expect(run(3, 2, 1, ['up', 'mid', 'back']).verdict).toBe('old');
    expect(run(3, 2, 1, ['mid', 'mid', 'back'])).toMatchObject({ verdict: 'failed-write', write: { applied: [] } });
  });

  it('times out a read waiting on a stopped replica, and fails one short of known-down replicas at once', () => {
    expect(run(3, 2, 2, ['up', 'mid', 'mid']).read).toMatchObject({ outcome: 'timed-out', reachable: 1, needed: 2, set: [] });
    expect(run(3, 2, 2, ['up', 'down', 'down']).read).toMatchObject({ outcome: 'fails', reachable: 1, needed: 2 });
    expect(run(3, 2, 2, ['up', 'down', 'down']).verdict).toBe('read-fails');
  });

  it('acks a sloppy write on stand-ins, and reads them only for a home replica still down', () => {
    const e5 = run(3, 2, 2, ['up', 'back', 'back'], false, true);
    expect(e5.standIns.map((s) => [s.name, s.standsFor, s.reachable])).toEqual([
      ['H1', 1, false],
      ['H2', 2, false],
    ]);
    expect(e5.write.acked).toEqual([0, 3]);
    expect(e5).toMatchObject({ h: 1, ackedHomes: [0], staleReadSets: 1, verdict: 'stale' });
    expect(e5.read.set).toEqual([1, 2]);
    const viaH1 = run(3, 2, 3, ['up', 'up', 'down'], false, true);
    expect(viaH1.read.set).toEqual([0, 1, 3]);
    expect(viaH1.readStandIns).toEqual([3]);
    expect(viaH1.all[3]).toMatchObject({ writeRtt: 2 * STAND_IN_ONE_WAY_MS[0], readRtt: 43 });
    expect(run(3, 2, 2, ['up', 'down', 'down'], false, true).verdict).toBe('fresh');
    const noCopy = run(3, 3, 1, ['down', 'down', 'down'], false, true);
    expect(noCopy.read).toMatchObject({ outcome: 'no-copy', returns: null });
    expect(noCopy.verdict).toBe('refused');
  });

  it('counts the read sets of R that hold no home replica that acked', () => {
    expect(readSetsOf(3, 2)).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
    for (const [n, w, r, miss, sets] of [
      [3, 2, 2, 0, 3],
      [3, 1, 1, 2, 3],
      [5, 2, 3, 1, 10],
      [5, 2, 2, 3, 10],
      [5, 4, 2, 0, 10],
    ] as const) {
      const m = run(n, w, r);
      expect([m.staleReadSets, m.readSets], `N${n} W${w} R${r}`).toEqual([miss, sets]);
      expect(m.staleReadSets).toBe(choose(n - m.h, r));
      expect(m.sets.filter((s) => s.canMiss).length).toBe(m.staleReadSets);
      expect(m.sets.filter((s) => s.isThis).map((s) => s.members)).toEqual([m.read.set]);
    }
  });

  it('gives availability as at least W (or R) of m up, each down 1% of the time', () => {
    expect(formatNines(run(3, 3, 1).avail.write)).toBe('97.03%');
    expect(formatNines(run(3, 3, 1).avail.read)).toBe('99.9999%');
    expect(formatNines(run(3, 2, 2).avail.write)).toBe('99.97%');
    expect(formatNines(run(3, 2, 2, UP(3), false, true).avail.write)).toBe('99.99999%');
    expect(formatNines(run(5, 4, 2).avail.write)).toBe('99.90%');
    expect(atLeastUp(3, 3)).toBeCloseTo(0.99 ** 3, 12);
    expect(run(3, 2, 2, UP(3), false, true).survives).toEqual({ write: 3, read: 3 });
    expect(run(5, 4, 2).survives).toEqual({ write: 1, read: 3 });
  });

  it('reads the widget settings by name, each state an index', () => {
    const m = quorumAt({ ...QUORUM_BASELINE, s3: REPLICA_STATES.indexOf('back') });
    expect(m.settings).toEqual({ n: 3, w: 2, r: 2, states: ['up', 'up', 'back'], stall: false, sloppy: false });
    expect(m.read.repairs).toEqual([2]);
  });
});

describe('every quorum setting', () => {
  const verdicts: Record<string, number> = {};
  const failedReads: Record<string, number> = {};
  let settings = 0;
  let strictFresh = 0;
  let writeClaims = 0;
  let readClaims = 0;
  let standInReads = 0;
  let noCopy = 0;
  for (const s of everySetting()) {
    const m = run(s.n, s.w, s.r, s.states, s.stall, s.sloppy);
    settings++;
    verdicts[m.verdict] = (verdicts[m.verdict] ?? 0) + 1;
    if (!m.read.set.length) failedReads[m.read.outcome] = (failedReads[m.read.outcome] ?? 0) + 1;
    if (!s.sloppy && s.r + s.w > s.n && m.write.outcome === 'acked' && m.read.set.length) {
      strictFresh++;
      if (m.verdict !== 'fresh' || m.staleReadSets) throw new Error(`strict R + W > N not fresh: ${JSON.stringify(s)}`);
    }
    const known = s.states.filter((x) => x === 'down' || x === 'back').length;
    if (!s.states.includes('mid') && known <= m.survives.write) {
      writeClaims++;
      if (m.write.outcome !== 'acked') throw new Error(`writes survive ${m.survives.write} down: ${JSON.stringify(s)}`);
    }
    const stillDown = s.states.filter((x) => x === 'down').length;
    if (!s.states.includes('mid') && stillDown <= m.survives.read) {
      readClaims++;
      if (!m.read.set.length) throw new Error(`reads survive ${m.survives.read} down: ${JSON.stringify(s)}`);
    }
    if (m.readStandIns.length) {
      standInReads++;
      const written = m.write.outcome !== 'refused';
      if (written !== (m.read.returns === V8)) throw new Error(`a stand-in answers with what it holds: ${JSON.stringify(s)}`);
    }
    if (m.read.outcome === 'no-copy') {
      noCopy++;
      if (m.verdict !== 'refused') throw new Error(`no copy after a write that was not refused: ${JSON.stringify(s)}`);
    }
    for (const p of [m.avail.write, m.avail.read]) if (formatNines(p).startsWith('100')) throw new Error(`nines read 100%: ${p}`);
  }

  it('covers all 104,704 settings, each of the seven verdicts', () => {
    expect(settings).toBe(104_704);
    expect(verdicts).toEqual({
      fresh: 22_592,
      stale: 9_636,
      refused: 19_076,
      'timed-out': 9_394,
      old: 2_390,
      'failed-write': 1_116,
      'read-fails': 40_500,
    });
    expect(failedReads).toEqual({ fails: 14_324, 'timed-out': 26_176 });
  });

  it('keeps every claim the widget makes: fresh above N, and the survives counts of both handles', () => {
    expect([strictFresh, writeClaims, readClaims]).toEqual([928, 13_440, 20_424]);
    expect([standInReads, noCopy]).toEqual([13_644, 144]);
  });
});
