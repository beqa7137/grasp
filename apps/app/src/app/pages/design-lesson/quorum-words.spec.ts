import { QUORUM_SIZES, QUORUM_VERSIONS, REPLICA_STATES, formatMs, quorumScenario, type ReplicaState } from '@grasp/engine';
import { OVERLAP_LONGEST, overlapSentence } from './quorum-sets';
import { wrap } from './quorum-text';
import { NOTHING_HIDDEN, changeNotice, describeRows, summary } from './quorum-words';

const { old: V7, new: V8 } = QUORUM_VERSIONS;

/** Every setting the widget can show. */
function* everySetting() {
  for (const n of QUORUM_SIZES)
    for (let w = 1; w <= n; w++)
      for (let r = 1; r <= n; r++)
        for (let code = 0; code < 4 ** n; code++)
          for (const stall of [false, true])
            for (const sloppy of [false, true]) {
              const states = Array.from({ length: n }, (_, k) => REPLICA_STATES[Math.floor(code / 4 ** k) % 4]) as ReplicaState[];
              yield quorumScenario(n, w, r, states, stall, sloppy);
            }
}

const SWEEP_MS = 60_000;

describe('quorum words over every setting', () => {
  it(
    'keep the strip sentence true to the write and to the read drawn beside it',
    () => {
      const bad = new Map<string, string>();
      const sentences = new Set<string>();
      let count = 0;
      for (const m of everySetting()) {
        count++;
        const t = overlapSentence(m, NOTHING_HIDDEN);
        sentences.add(t);
        const at = `N${m.settings.n} W${m.settings.w} R${m.settings.r} ${m.settings.states.join('/')} ${m.settings.stall} ${m.settings.sloppy}`;
        const misses = !m.read.set.some((id) => m.write.applied.includes(id));
        const flag = (why: string) => bad.set(why, `${at}: ${t}`);
        if (t.includes('applied nowhere') && m.write.applied.length) flag('applied nowhere, yet applied');
        if (t.includes(`every read returns v${V7}`) && m.read.returns === V8) flag('every read v7, yet this one v8');
        if (/that misses (them|it) returns v7/.test(t) && m.read.set.length && misses && m.read.returns === V8) flag('a miss returned v8');
        if (t.includes('unless it asks a stand-in') && m.read.returns === V8 && !m.readStandIns.length) flag('v8 with no stand-in');
        if (/\ball 2\b/.test(t)) flag('all 2');
      }
      expect(count).toBe(104_704);
      expect([...bad.entries()]).toEqual([]);
      // Each width reserves the lines of the longest forms; no sentence may need more.
      for (let width = 220; width <= 700; width += 2) {
        const reserve = Math.max(...OVERLAP_LONGEST.map((x) => wrap(x, 'cap', width).length));
        for (const x of sentences) expect(wrap(x, 'cap', width).length, `${width}px: ${x}`).toBeLessThanOrEqual(reserve);
      }
    },
    SWEEP_MS,
  );

  it(
    'say the outcome in sentences, the count only where something was written, and Describe as the stage draws it',
    () => {
      const bad = new Map<string, string>();
      for (const m of everySetting()) {
        const at = `N${m.settings.n} W${m.settings.w} R${m.settings.r} ${m.settings.states.join('/')} ${m.settings.stall} ${m.settings.sloppy}`;
        const said = summary(m, NOTHING_HIDDEN);
        const flag = (why: string, t: string) => bad.set(why, `${at}: ${t}`);
        if (said.includes('·')) flag('a pill fragment', said);
        if (said.split('. ').some((x) => !/^[A-Z0-9]/.test(x))) flag('a sentence in lower case', said);
        if (m.write.outcome === 'refused' && !said.endsWith('Nothing was written, so there is nothing to miss.'))
          flag('a refused count', said);
        if (/\b1 read sets\b/.test(said)) flag('1 read sets', said);
        const notice = changeNotice('R3 down', m, NOTHING_HIDDEN);
        if (notice.includes('·')) flag('a pill fragment in a notice', notice);
        for (const [row, x] of describeRows(m, false).map((r, i) => [r, m.all[i]] as const)) {
          const sent = m.write.sent.includes(x.id);
          const want = !sent ? 'not sent' : x.state === 'mid' ? 'no ack' : formatMs(x.writeRtt);
          if (row[2] !== want) flag(`round trip ${want}`, row.join(' | '));
          const a = m.read.answers.find((q) => q.id === x.id);
          const v8At = row[3] === '–' ? Infinity : Number(row[3].replace(/,| ms/g, ''));
          if (a?.value === V8 && v8At > a.readAt) flag('answered v8 before it had it', row.join(' | '));
          if (a?.value === V7 && v8At <= a.readAt) flag('answered v7 though it had v8', row.join(' | '));
          if (m.read.repairs.includes(x.id) && !Number.isFinite(v8At)) flag('repaired, yet no v8', row.join(' | '));
        }
      }
      expect([...bad.entries()]).toEqual([]);
    },
    SWEEP_MS,
  );
});
