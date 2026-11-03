import { slotOf, word, type ExperimentGoal, type ExperimentSpec, type Slot } from './experiments.js';
import {
  HINT_WINDOW_HOURS,
  QUORUM_BASELINE,
  QUORUM_STALL_MS,
  QUORUM_VERSIONS,
  REPLICA_DOWN_CHANCE,
  WRITE_TIMEOUT_MS,
  eachQuorum,
  quorumAt,
  stalledIndex,
  type QuorumSettings,
} from './widgets/quorum.js';

const ms = slotOf('ms');
const dur = slotOf('dur');
const num = slotOf('num');
const pct = slotOf('pct');
const nines = slotOf('nines');
const ordinal = slotOf('ordinal');

const STATE = { up: 0, down: 1, mid: 2, back: 3 } as const;
/** A replica's name as a slot: R3 is `R{c}` with c = 3. */
const rn = (id: number): Slot => num(id + 1);
const run = (s: Partial<QuorumSettings>) => quorumAt({ ...QUORUM_BASELINE, ...s });
const { old, new: fresh } = QUORUM_VERSIONS;

export const QUORUM_CHALLENGE_BOUNDS = { canMiss: 1, readMs: 5, writeMs: 50, writeSurvives: 1 } as const;
export const QUORUM_CHALLENGE_GOAL: ExperimentGoal = {
  all: [
    { metric: 'canMiss', below: QUORUM_CHALLENGE_BOUNDS.canMiss },
    { metric: 'readMs', below: QUORUM_CHALLENGE_BOUNDS.readMs },
    { metric: 'writeMs', below: QUORUM_CHALLENGE_BOUNDS.writeMs },
    { metric: 'writeSurvives', atLeast: QUORUM_CHALLENGE_BOUNDS.writeSurvives },
  ],
  keep: { stall: 1, sloppy: 0, s1: STATE.up, s2: STATE.up, s3: STATE.up, s4: STATE.up, s5: STATE.up },
};
/** The one setting of the challenge's 34 that meets it. */
export const QUORUM_CHALLENGE_SOLUTION = { n: 5, w: 4, r: 2 } as const;

const SETUP = {
  plusEqualsN: { ...QUORUM_BASELINE, n: 5, w: 2, r: 3 },
  allOneDown: { ...QUORUM_BASELINE, w: 3, r: 1, s3: STATE.down },
  stall: { ...QUORUM_BASELINE, stall: 1 },
  missed: { ...QUORUM_BASELINE, s3: STATE.back },
  sloppy: { ...QUORUM_BASELINE, s2: STATE.back, s3: STATE.back, sloppy: 1 },
  challenge: { ...QUORUM_BASELINE, stall: 1 },
} as const;

/** Settings as the widget reads them (`QuorumSettings`): each replica's state by its index in `REPLICA_STATES`. */
export const QUORUM_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'r-plus-w-equals-n',
    title: 'Is R + W = N enough?',
    setup: SETUP.plusEqualsN,
    act: { run: 'write-read' },
    ask: 'Writes wait for {w} of {n} acks and a read asks {r}, so {r} + {w} = {n}. Of the {sets} read sets of {r}, how many can miss v{new}?',
    choices: [
      { text: 'None: {r} + {w} covers all {n}', value: 'none' },
      { text: '{three} of {sets}, as a read of {two} would', value: 'asTwo' },
      { text: '{one} of {sets}', value: 'one' },
    ],
    truth: 'miss',
    reveal:
      '{miss} of {sets}: R{a}, R{b} and R{c} share no replica with the {w} that acked, and that is the read drawn here. It got v{new} only because v{new} reached R{lucky} at {land}, before the read did, and it repaired R{p} and R{q} before returning ({ms} in all). Had v{new} reached R{lucky} after the read, it would return v{old}. With R + W = N exactly one read set misses the write; R {r1} makes it {r1} + {w} > {n}, and none can.',
    focus: ['strip', 'reader', 'cards'],
    hide: ['count'],
    slots: () => {
      const m = run(SETUP.plusEqualsN);
      const miss = m.sets.find((s) => s.canMiss)!.members;
      const lucky = m.read.answers.find((a) => a.value === fresh)!.id;
      const two = run({ ...SETUP.plusEqualsN, r: 2 });
      return {
        w: num(m.settings.w),
        n: num(m.settings.n),
        r: num(m.settings.r),
        sets: num(m.readSets),
        new: num(fresh),
        old: num(old),
        none: num(0),
        three: num(two.staleReadSets),
        two: num(two.settings.r),
        asTwo: num(two.staleReadSets),
        one: num(1),
        miss: num(m.staleReadSets),
        a: rn(miss[0]),
        b: rn(miss[1]),
        c: rn(miss[2]),
        lucky: rn(lucky),
        land: ms(m.all[lucky].landAt),
        p: rn(m.read.repairs[0]),
        q: rn(m.read.repairs[1]),
        ms: ms(m.read.ms!),
        r1: num(m.settings.r + 1),
      };
    },
  },
  {
    id: 'all-one-down',
    title: 'One replica down at ALL',
    setup: SETUP.allOneDown,
    act: { run: 'write-read' },
    ask: 'Writes wait for ALL {n} replicas, reads for ONE, and R{d} has been down for a minute, so the cluster knows. What happens?',
    choices: [
      { text: 'Writes are refused at once; reads still work', value: 'refused' },
      { text: 'Writes time out after {timeout}; reads still work', value: 'timedOut' },
      { text: 'Both keep working', value: 'both' },
    ],
    truth: 'outcome',
    reveal:
      "Refused at once: the coordinator knows R{d} is down, so it writes nothing and returns an error (Cassandra's UnavailableException), and the read of R{rr} still works, returning v{old}. Had R{d} stopped mid-write instead, the coordinator could not know: the write would time out after {timeout}, yet R{a} and R{b} would keep v{new}, so a later read can return a write the client saw time out. With each replica down {down} of the time, writes at ALL succeed {wAll} of the time, reads at ONE {rOne}.",
    focus: ['writer', 'handles'],
    hide: ['write', 'verdict', 'availability'],
    slots: () => {
      const m = run(SETUP.allOneDown);
      const d = m.replicas.find((x) => x.state === 'down')!.id;
      const mid = run({ ...SETUP.allOneDown, s3: STATE.mid });
      const outcome = { refused: 'refused', 'timed-out': 'timed out', acked: 'both' }[m.write.outcome];
      return {
        n: num(m.settings.n),
        d: rn(d),
        timeout: dur(WRITE_TIMEOUT_MS),
        refused: word('refused'),
        timedOut: word('timed out'),
        both: word('both'),
        outcome: word(m.read.set.length ? outcome : 'reads fail'),
        rr: rn(m.read.set[0]),
        old: num(old),
        new: num(fresh),
        a: rn(mid.write.applied[0]),
        b: rn(mid.write.applied[1]),
        down: pct(REPLICA_DOWN_CHANCE * 100),
        wAll: nines(m.avail.write),
        rOne: nines(m.avail.read),
      };
    },
  },
  {
    id: 'stall',
    title: 'One replica stalls',
    setup: SETUP.stall,
    act: { run: 'write-read' },
    ask: 'R{s} pauses for {pause} (a GC pause), so its round trip is now {slow}. Writes at QUORUM took {before}. What do they take now?',
    choices: [
      { text: '{before}, unchanged', value: 'before' },
      { text: "{far}, R{f}'s round trip", value: 'far' },
      { text: '{slow}, waiting for R{s}', value: 'slow' },
    ],
    truth: 'writeMs',
    reveal:
      "{writeMs}: a write goes to all {n} and returns at the {wth} ack, which is now R{f}'s, across data centers; ALL would wait {slow} for R{s}. ONE stays {one}. Reads hedge such stalls with speculative retry, asking one more replica; a write already goes to all, so only W and replica placement help.",
    focus: ['latency', 'writer'],
    hide: ['write-time', 'verdict'],
    slots: () => {
      const m = run(SETUP.stall);
      const s = m.replicas.find((x) => x.pause)!.id;
      const far = m.replicas[m.settings.n - 1];
      return {
        s: rn(s),
        pause: ms(QUORUM_STALL_MS),
        slow: ms(m.replicas[s].writeRtt),
        before: ms(run({ ...SETUP.stall, stall: 0 }).write.ms),
        far: ms(far.writeRtt),
        f: rn(far.id),
        writeMs: ms(m.write.ms),
        n: num(m.settings.n),
        wth: ordinal(m.settings.w),
        one: ms(run({ ...SETUP.stall, w: 1 }).write.ms),
      };
    },
  },
  {
    id: 'missed-write',
    title: 'The replica that missed a write',
    setup: SETUP.missed,
    act: { run: 'read' },
    ask: 'R{m} was down for the write and is back. The read asks R{m}, which still has v{old}, and R{o}, which has v{new}. What happens to R{m}?',
    choices: [
      { text: 'The read writes v{new} to it before returning: read repair', value: 'repair' },
      { text: 'Nothing yet: the hint the coordinator kept replays v{new} later', value: 'hint' },
      { text: 'Nothing until a background Merkle-tree repair', value: 'merkle' },
    ],
    truth: 'outcome',
    reveal:
      "Read repair: R{m} answered v{old} and R{o} v{new}, so the read writes v{new} to R{m} and returns only then, {ms} instead of {rth} (Cassandra blocks the read on its repair, so a later QUORUM read cannot go backwards). The hint the coordinator kept for R{m} replays the write shortly after R{m} returns (by default Cassandra writes hints only for a replica's first {hintH} hours down); read repair fixes keys that are read; Merkle-tree repair fixes the rest.",
    focus: ['reader', 'cards'],
    hide: ['repair'],
    slots: () => {
      const m = run(SETUP.missed);
      const missed = m.replicas.find((x) => x.state === 'back')!.id;
      return {
        m: rn(missed),
        o: rn(m.read.set.find((id) => id !== missed)!),
        old: num(old),
        new: num(fresh),
        repair: word('repair'),
        hint: word('hint'),
        merkle: word('merkle'),
        outcome: word(m.read.repairs.includes(missed) ? 'repair' : 'hint'),
        ms: ms(m.read.ms!),
        rth: ms(m.read.rthMs!),
        hintH: num(HINT_WINDOW_HOURS),
      };
    },
  },
  {
    id: 'sloppy',
    title: 'A sloppy quorum',
    setup: SETUP.sloppy,
    act: { run: 'read' },
    ask: 'R{a} and R{b} were down, so a sloppy quorum took the write on R{h} and stand-in H{s1}. Both are back for the read, and {r} + {w} > {n}. Can a read still miss v{new}?',
    choices: [
      { text: 'No: R + W > N still holds', value: 'no' },
      { text: 'Yes: all {sets} read sets can', value: 'all' },
      { text: 'Yes: {miss} of the {sets} read sets can', value: 'yes' },
    ],
    truth: 'outcome',
    reveal:
      'Yes, {miss} of the {sets}: R{a} and R{b} are back, so a read goes to the home replicas again, not to the stand-ins holding the write, and of the home replicas only R{h} has v{new}, so a read of R{a} and R{b}, like this one, returns v{old}. H{s1} and H{s2} replay v{new} to R{a} and R{b} shortly after they return (hinted handoff); until then R + W > N promises nothing. A sloppy quorum trades the overlap for write availability: {strict} to {loose} here.',
    focus: ['standins', 'strip'],
    hide: ['verdict', 'count', 'read'],
    slots: () => {
      const m = run(SETUP.sloppy);
      const [a, b] = m.replicas.filter((x) => x.state === 'back').map((x) => x.id);
      const miss = m.staleReadSets;
      return {
        a: rn(a),
        b: rn(b),
        h: rn(m.ackedHomes[0]),
        s1: num(1),
        s2: num(2),
        r: num(m.settings.r),
        w: num(m.settings.w),
        n: num(m.settings.n),
        new: num(fresh),
        old: num(old),
        sets: num(m.readSets),
        miss: num(miss),
        no: word('no'),
        all: word('all'),
        yes: word('yes'),
        outcome: word(miss === m.readSets ? 'all' : miss > 0 ? 'yes' : 'no'),
        strict: nines(run({ ...SETUP.sloppy, sloppy: 0 }).avail.write),
        loose: nines(m.avail.write),
      };
    },
  },
  {
    id: 'fast-fresh',
    title: 'Challenge: fast reads that stay fresh',
    setup: SETUP.challenge,
    ask: 'The middle replica keeps pausing for {pause}. Choose N, W and R so that no read set can miss v{new}, reads take under {gr}, writes under {gw}, and writes survive at least {k} replica down.',
    goal: QUORUM_CHALLENGE_GOAL,
    reveal:
      "N {n}, W {w}, R {r}: {r} + {w} > {n}, the read hears R{a} and R{b} in {read}, and the {wth} ack, R{c}'s, arrives at {write}, so the paused R{s} is never waited on. The cost is {n} copies of every write, and writes succeed {avail} of the time against QUORUM of {three}'s {q3}. In an interview, also name speculative retry (ask one more replica when one is slow), and say why LOCAL_QUORUM is not the answer here: a LOCAL_QUORUM read in the reader's data center need not overlap a LOCAL_QUORUM write in the writer's, and EACH_QUORUM writes would mean all {each} here, waiting for the paused R{s}.",
    focus: ['reader', 'latency'],
    slots: () => {
      const s = { ...SETUP.challenge, ...QUORUM_CHALLENGE_SOLUTION };
      const m = run(s);
      const [a, b] = [...m.read.answers].sort((x, y) => x.rtt - y.rtt).map((x) => x.id);
      return {
        pause: ms(QUORUM_STALL_MS),
        new: num(fresh),
        gr: ms(QUORUM_CHALLENGE_BOUNDS.readMs),
        gw: ms(QUORUM_CHALLENGE_BOUNDS.writeMs),
        k: num(QUORUM_CHALLENGE_BOUNDS.writeSurvives),
        n: num(s.n),
        w: num(s.w),
        r: num(s.r),
        a: rn(a),
        b: rn(b),
        read: ms(m.read.ms!),
        wth: ordinal(s.w),
        c: rn(m.write.acked[s.w - 1]),
        write: ms(m.write.ms),
        s: rn(stalledIndex(s.n)),
        avail: nines(m.avail.write),
        three: num(QUORUM_BASELINE.n),
        q3: nines(run({}).avail.write),
        each: num(eachQuorum(s.n)),
      };
    },
  },
];
