import { QUORUM_SIZES, REPLICA_STATES, quorumScenario, type QuorumSize, type ReplicaState } from '@grasp/engine';
import type { Prim } from './quorum-draw';
import { MIN_TRIP_MS, schedule, type Run } from './quorum-motion';
import { buildStage } from './quorum-stage';

const REST = { hide: [] as string[], hint: null, reduced: false };

function* settings(stride: Record<QuorumSize, number>) {
  let i = 0;
  for (const n of QUORUM_SIZES)
    for (let w = 1; w <= n; w++)
      for (let r = 1; r <= n; r++)
        for (let code = 0; code < 4 ** n; code++)
          for (const stall of [false, true])
            for (const sloppy of [false, true]) {
              if (i++ % stride[n]) continue;
              const states = Array.from({ length: n }, (_, k) => REPLICA_STATES[Math.floor(code / 4 ** k) % 4]) as ReplicaState[];
              yield { n, w, r, states, stall, sloppy };
            }
}

/** Plays every N 3 setting and a stride of N 5, at a desktop width, the way the widget plays them. */
function plays(stride: Record<QuorumSize, number>) {
  const out = [];
  for (const s of settings(stride)) {
    const m = quorumScenario(s.n, s.w, s.r, s.states, s.stall, s.sloppy);
    const st = buildStage(620, m, REST);
    const runs: Run[] = m.write.outcome === 'acked' ? ['write-read', 'read'] : ['write-read'];
    for (const run of runs) out.push({ label: `N${s.n} W${s.w} R${s.r} ${s.states.join('/')} ${s.stall} ${s.sloppy} ${run}`, m, st, run });
  }
  return out;
}

const SWEEP_MS = 60_000;

describe('quorum plays', () => {
  it(
    'send nothing for a refused write: no write or ack goes out',
    () => {
      let refused = 0;
      for (const { m, st, run, label } of plays({ 3: 1, 5: 13 })) {
        if (m.write.outcome !== 'refused') continue;
        refused++;
        const tones = schedule(m, st, run).trips.map((t) => t.tone);
        expect(
          tones.filter((t) => t === 'write' || t === 'ack'),
          label,
        ).toEqual([]);
      }
      expect(refused).toBeGreaterThan(1_000);
    },
    SWEEP_MS,
  );

  it(
    'land every mark no earlier than the request it waits on, and keep every arrival in the model order',
    () => {
      const bad: string[] = [];
      for (const { m, st, run, label } of plays({ 3: 1, 5: 7 })) {
        const { T, trips } = schedule(m, st, run);
        const ends = (tone: string, node: number) =>
          trips.filter((t) => t.tone === tone && t.node === node).map((t) => t.start + t.duration);
        const prims = new Map<string, Prim>(st.D.prims().map((p) => [p.id, p]));
        const lands = (id: string) => {
          const p = prims.get(id);
          return p?.at ? T(p.at) : null;
        };
        const after = (id: string, ...arrivals: number[]) => {
          const t = lands(id);
          if (t !== null && arrivals.some((a) => t < a - 0.5))
            bad.push(`${label}: ${id} at ${t.toFixed(0)} before ${Math.max(...arrivals).toFixed(0)}`);
        };
        for (const t of trips) if (t.duration < MIN_TRIP_MS - 0.5) bad.push(`${label}: a ${t.tone} trip of ${t.duration.toFixed(0)} ms`);
        for (const a of m.read.answers) {
          const [readEnd] = ends('read', a.id);
          const [answerEnd] = ends('answer', a.id);
          if (readEnd === undefined || answerEnd === undefined) continue;
          const answerStart = trips.find((t) => t.tone === 'answer' && t.node === a.id)!.start;
          if (answerStart < readEnd - 0.5) bad.push(`${label}: ${m.all[a.id].name} answers before the read reaches it`);
          after(`rchip${a.id}`, readEnd);
          for (const id of [`answer${a.id}`, `both${a.id}`, `both-ring${a.id}`, `dot-latr-${m.all[a.id].name}`]) after(id, answerEnd);
        }
        const readSide = trips.filter((t) => t.tone !== 'write' && t.tone !== 'ack').map((t) => t.start + t.duration);
        after('pill', ...readSide);
        for (const id of m.write.applied) {
          const [ackEnd] = ends('ack', id);
          if (ackEnd === undefined) continue;
          after(`wchip${id}`, ackEnd);
          after(`dot-lat-${m.all[id].name}`, ackEnd);
        }
        const byArrival = [...trips].sort((a, b) => a.arrives[1] - b.arrives[1]);
        for (let i = 1; i < byArrival.length; i++) {
          const [a, b] = [byArrival[i - 1], byArrival[i]];
          if (a.arrives[1] < b.arrives[1] && a.start + a.duration > b.start + b.duration + 0.5)
            bad.push(`${label}: ${a.tone} to ${m.all[a.node].name} arrives after ${b.tone} to ${m.all[b.node].name}`);
        }
      }
      expect(bad.slice(0, 10)).toEqual([]);
    },
    SWEEP_MS,
  );

  it('give the read its own milliseconds after a slow write: each request takes a visible while', () => {
    const m = quorumScenario(3, 2, 2, ['up', 'up', 'up'], true, false);
    const { trips } = schedule(m, buildStage(620, m, REST), 'write-read');
    const reads = trips.filter((t) => t.tone === 'read' || t.tone === 'answer');
    expect(reads.length).toBe(4);
    for (const t of reads) expect(t.duration).toBeGreaterThan(200);
  });
});
