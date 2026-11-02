// The Consistency & Quorums widget's model, as known.md states it, for the mockup (browser) and enum.cjs (Node).
// The engine port is libs/engine/src/sysdesign/lessons/widgets/quorum.ts; numbers here are the reviewed ones.
(function (root) {
  'use strict';

  const STALL_MS = 100;
  const TIMEOUT_MS = 2000;
  const HINT_WINDOW_HOURS = 3;
  const DOWN_CHANCE = 0.01;
  const VERSIONS = { old: 7, new: 8, oldValue: 'Apollo', newValue: 'Artemis' };
  // One-way delays from the writer (zone A); the reader (zone C) sees them in the other order.
  const ONE_WAY = { 3: [1, 2, 20], 5: [1, 1.5, 2, 20, 20.5] };
  const ZONES = { 3: ['A', 'B', 'C'], 5: ['A', 'A', 'B', 'C', 'C'] };
  // Sloppy stand-ins sit beside the writer; the read never asks them.
  const STAND_IN_ONE_WAY = [1.5, 2.5];
  const STATES = ['up', 'down', 'mid', 'back'];
  const STATE_NAMES = { up: 'up', down: 'down', mid: 'stops mid-write', back: 'back, missed the write' };
  const SIZES = [3, 5];

  const stalledIndex = (n) => (n === 3 ? 1 : 2);
  const quorumOf = (n) => Math.floor(n / 2) + 1;
  const levelName = (k, n) => (k === 1 ? 'ONE' : k === n ? 'ALL' : k === quorumOf(n) ? 'QUORUM' : null);

  function choose(n, k) {
    if (k < 0 || k > n) return 0;
    let c = 1;
    for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
    return Math.round(c);
  }

  /** The chance that at least `k` of `m` independent replicas are up, each down `DOWN_CHANCE` of the time. */
  function atLeastUp(k, m) {
    const p = 1 - DOWN_CHANCE;
    let sum = 0;
    for (let j = k; j <= m; j++) sum += choose(m, j) * p ** j * (1 - p) ** (m - j);
    return Math.min(1, sum);
  }

  function combos(n, r) {
    const out = [];
    const walk = (start, picked) => {
      if (picked.length === r) return void out.push(picked.slice());
      for (let i = start; i < n; i++) walk(i + 1, [...picked, i]);
    };
    walk(0, []);
    return out;
  }

  /**
   * One write of v8 (over v7), then one read sent when the client hears back. A replica holds what reached it by the
   * moment the read request reaches it; a stalled replica takes its pause on everything it handles.
   */
  function quorumScenario(n, w, r, states, stall, sloppy) {
    const oneWay = ONE_WAY[n];
    const paused = stall ? stalledIndex(n) : -1;
    const replicas = oneWay.map((d, i) => {
      const pause = i === paused ? STALL_MS : 0;
      const readOneWay = oneWay[n - 1 - i];
      const state = states[i] ?? 'up';
      return {
        id: i,
        name: `R${i + 1}`,
        home: true,
        zone: ZONES[n][i],
        state,
        pause,
        writeOneWay: d,
        readOneWay,
        writeRtt: 2 * d + pause,
        readRtt: 2 * readOneWay + pause,
        landAt: d + pause,
        knownDown: state === 'down' || state === 'back',
        reachable: state === 'up' || state === 'back',
      };
    });
    const knownDown = replicas.filter((x) => x.knownDown);
    const live = replicas.filter((x) => !x.knownDown);
    const standIns = sloppy
      ? STAND_IN_ONE_WAY.slice(0, Math.min(2, knownDown.length)).map((d, j) => ({
          id: n + j,
          name: `H${j + 1}`,
          home: false,
          zone: 'A',
          state: 'up',
          pause: 0,
          writeOneWay: d,
          writeRtt: 2 * d,
          landAt: d,
          standsFor: knownDown[j].id,
        }))
      : [];
    const all = [...replicas, ...standIns];
    const byId = (id) => all[id];

    const targets = [...live, ...standIns];
    let write;
    if (targets.length < w) {
      write = { outcome: 'refused', ms: 0, live: targets.length, needed: w, sent: [], applied: [], acked: [], ackOrder: [] };
    } else {
      const ackOrder = targets.filter((t) => t.state === 'up').sort((a, b) => a.writeRtt - b.writeRtt || a.id - b.id);
      const applied = ackOrder.map((t) => t.id);
      const sent = targets.map((t) => t.id);
      write =
        ackOrder.length >= w
          ? { outcome: 'acked', ms: ackOrder[w - 1].writeRtt, live: targets.length, needed: w, sent, applied, acked: ackOrder.slice(0, w).map((t) => t.id), ackOrder: applied }
          : { outcome: 'timed-out', ms: TIMEOUT_MS, live: targets.length, needed: w, sent, applied, acked: applied, ackOrder: applied };
    }

    const sentAt = write.ms;
    const reachable = replicas.filter((x) => x.reachable);
    let read;
    if (reachable.length < r) {
      read = { outcome: 'fails', sentAt, reachable: reachable.length, needed: r, set: [], answers: [], repairs: [], rthMs: null, repairMs: 0, ms: null, returns: null };
    } else {
      const set = [...reachable].sort((a, b) => a.readRtt - b.readRtt || a.id - b.id).slice(0, r);
      const answers = set.map((x) => {
        const readAt = sentAt + x.readOneWay + x.pause;
        const has = write.applied.includes(x.id) && x.landAt <= readAt;
        return { id: x.id, value: has ? VERSIONS.new : VERSIONS.old, readAt, rtt: x.readRtt };
      });
      const rthMs = Math.max(...answers.map((a) => a.rtt));
      const anyNew = answers.some((a) => a.value === VERSIONS.new);
      const stale = answers.filter((a) => a.value === VERSIONS.old);
      const repairs = anyNew ? stale.map((a) => a.id).sort((a, b) => a - b) : [];
      const repairMs = repairs.length ? Math.max(...repairs.map((id) => byId(id).readRtt)) : 0;
      read = {
        outcome: anyNew ? 'v8' : 'v7',
        sentAt,
        reachable: reachable.length,
        needed: r,
        set: set.map((x) => x.id).sort((a, b) => a - b),
        answers,
        repairs,
        rthMs,
        repairMs,
        ms: rthMs + repairMs,
        returns: anyNew ? VERSIONS.new : VERSIONS.old,
      };
    }

    let verdict;
    if (read.outcome === 'fails') verdict = 'read-fails';
    else if (write.outcome === 'refused') verdict = 'refused';
    else if (write.outcome === 'timed-out') verdict = read.returns === VERSIONS.new ? 'timed-out' : write.applied.length ? 'old' : 'failed-write';
    else verdict = read.returns === VERSIONS.new ? 'fresh' : 'stale';

    // The guarantee counts home replicas that acked; the drawn read is one draw from those sets.
    const ackedHomes = write.acked.filter((id) => byId(id).home);
    const h = ackedHomes.length;
    const readSets = choose(n, r);
    const staleSets = choose(n - h, r);
    const sets = combos(n, r).map((members) => ({
      members,
      canMiss: !members.some((id) => ackedHomes.includes(id)),
      isThis: read.set.length === r && members.every((id, i) => id === read.set[i]),
    }));
    const thisReadUnsure = read.outcome !== 'fails' && !read.set.some((id) => ackedHomes.includes(id));
    const both = write.outcome === 'acked' ? read.set.filter((id) => ackedHomes.includes(id)) : [];

    const holds = all.map((x) => {
      if (x.home && read.repairs.includes(x.id)) return VERSIONS.new;
      return write.applied.includes(x.id) ? VERSIONS.new : x.state === 'down' || x.state === 'mid' ? null : VERSIONS.old;
    });

    const writeAvail = atLeastUp(w, sloppy ? n + 2 : n);
    const readAvail = atLeastUp(r, n);
    const writeSurvives = sloppy ? Math.min(n, n + 2 - w) : n - w;
    const readSurvives = n - r;

    return {
      settings: { n, w, r, states: states.slice(0, n), stall: !!stall, sloppy: !!sloppy },
      replicas,
      standIns,
      all,
      write,
      read,
      verdict,
      h,
      ackedHomes,
      readSets,
      staleSets,
      sets,
      thisReadUnsure,
      both,
      holds,
      avail: { write: writeAvail, read: readAvail },
      survives: { write: writeSurvives, read: readSurvives },
      metrics: {
        canMiss: staleSets,
        readMs: read.ms ?? Infinity,
        writeMs: write.outcome === 'acked' ? write.ms : Infinity,
        writeSurvives,
      },
    };
  }

  // ---- Slots and formatting, as libs/engine experiments.ts formats them, plus the two new units.
  const trim = (v, d) => String(Number(v.toFixed(d)));
  const GROUPED = new Intl.NumberFormat('en-US');
  const group = (v) => GROUPED.format(Math.round(v));
  const formatMs = (v) => `${v < 10 ? trim(v, 2) : group(v)} ms`;
  const formatPct = (v) => `${trim(v, 1)}%`;
  const formatSeconds = (v) => `${trim(v, 1)} s`;
  const formatDuration = (ms) => (ms < 1000 ? formatMs(ms) : ms < 100000 ? formatSeconds(ms / 1000) : `${group(ms / 1000)} s`);
  /** A chance as nines: two decimals, more only to show every leading nine, and never 100%. */
  function formatNines(p) {
    const u = 1 - p;
    const nines = u > 0 ? Math.floor(-Math.log10(u) + 1e-9) : 12;
    const d = Math.max(2, nines - 2);
    const pct = Math.min(Number((p * 100).toFixed(d)), 100 - 10 ** -d);
    return `${pct.toFixed(d)}%`;
  }
  const formatOrdinal = (v) => {
    const s = v % 100 >= 11 && v % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][v % 10] ?? 'th';
    return `${v}${s}`;
  };
  const FORMAT = {
    pct: formatPct,
    ms: formatMs,
    dur: formatDuration,
    s: formatSeconds,
    num: (v) => (Number.isInteger(v) ? group(v) : trim(v, 2)),
    nines: formatNines,
    ordinal: formatOrdinal,
  };
  const slot = (unit) => (value) => ({ value, unit });
  const [ms, dur, num, pct, nines, ordinal] = ['ms', 'dur', 'num', 'pct', 'nines', 'ordinal'].map(slot);
  const word = (value) => ({ value, unit: 'word' });
  const formatSlot = (s) => (s.unit === 'word' ? s.value : FORMAT[s.unit](s.value));
  function fillTemplate(t, slots) {
    return t.replace(/\{(\w+)\}/g, (_, name) => {
      if (!slots[name]) throw new Error(`No slot "${name}" for "${t}"`);
      return formatSlot(slots[name]);
    });
  }
  const TEMPLATE_DIGITS_ALLOWED = ['p99', '100 requests', 'the 99th of 100', 'N+1'];
  function strayDigits(t) {
    let rest = t.replace(/\{\w+\}/g, '');
    for (const phrase of TEMPLATE_DIGITS_ALLOWED) rest = rest.split(phrase).join('');
    return rest.match(/\d+/g) ?? [];
  }

  // ---- Experiments: every number a slot from quorumScenario.
  const UP = (n) => Array(n).fill('up');
  const BASE = { n: 3, w: 2, r: 2, states: UP(3), stall: 0, sloppy: 0 };
  const run = (s) => quorumScenario(s.n, s.w, s.r, s.states, s.stall, s.sloppy);
  const rn = (id) => num(id + 1);

  const CHALLENGE_BOUNDS = { canMiss: 1, readMs: 5, writeMs: 50, writeSurvives: 1 };
  const CHALLENGE_GOAL = {
    all: [
      { metric: 'canMiss', below: CHALLENGE_BOUNDS.canMiss },
      { metric: 'readMs', below: CHALLENGE_BOUNDS.readMs },
      { metric: 'writeMs', below: CHALLENGE_BOUNDS.writeMs },
      { metric: 'writeSurvives', atLeast: CHALLENGE_BOUNDS.writeSurvives },
    ],
    keep: { stall: 1, sloppy: 0, down: 0 },
  };
  const boundMet = (b, v) => ('below' in b ? v < b.below : v >= b.atLeast);
  const goalMet = (goal, s, m) =>
    s.stall === goal.keep.stall && s.sloppy === goal.keep.sloppy && s.states.every((x) => x === 'up') && goal.all.every((b) => boundMet(b, m[b.metric]));

  const EXPERIMENTS = [
    {
      id: 'r-plus-w-equals-n',
      title: 'Is R + W = N enough?',
      setup: { n: 5, w: 2, r: 3, states: UP(5), stall: 0, sloppy: 0 },
      act: { run: 'write-read' },
      ask: 'Writes wait for {w} of {n} acks and a read asks {r}, so {r} + {w} = {n}. Of the {sets} read sets of {r}, how many can miss v{new}?',
      choices: [
        { text: 'None: {r} + {w} covers all {n}', value: 'none' },
        { text: '{three} of {sets}, as with {two}', value: 'asTwo' },
        { text: '{one} of {sets}', value: 'one' },
      ],
      truth: 'miss',
      reveal:
        '{miss} of {sets}: R{a}, R{b} and R{c} share no replica with the {w} that acked, and that is the read drawn here. It got v{new} only because v{new} reached R{lucky} at {land}, before the read did, and it repaired R{p} and R{q} before returning ({ms} in all). Had v{new} reached R{lucky} after the read, it would return v{old}. With R + W = N exactly one read set misses the write; R {r1} makes it {r1} + {w} > {n}, and none can.',
      focus: ['strip', 'reader'],
      hide: ['count'],
      slots() {
        const m = run(this.setup);
        const miss = m.sets.find((s) => s.canMiss).members;
        const lucky = m.read.answers.find((a) => a.value === VERSIONS.new).id;
        const two = run({ ...this.setup, r: 2 });
        return {
          w: num(m.settings.w),
          n: num(m.settings.n),
          r: num(m.settings.r),
          sets: num(m.readSets),
          new: num(VERSIONS.new),
          old: num(VERSIONS.old),
          none: num(0),
          three: num(two.staleSets),
          two: num(2),
          asTwo: num(two.staleSets),
          one: num(1),
          miss: num(m.staleSets),
          a: rn(miss[0]),
          b: rn(miss[1]),
          c: rn(miss[2]),
          lucky: rn(lucky),
          land: ms(m.all[lucky].landAt),
          p: rn(m.read.repairs[0]),
          q: rn(m.read.repairs[1]),
          ms: ms(m.read.ms),
          r1: num(m.settings.r + 1),
        };
      },
    },
    {
      id: 'all-one-down',
      title: 'One replica down at ALL',
      setup: { n: 3, w: 3, r: 1, states: ['up', 'up', 'down'], stall: 0, sloppy: 0 },
      act: { run: 'write-read' },
      ask: 'Writes wait for ALL {n} replicas, reads for ONE, and R{d} is down. What happens?',
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
      slots() {
        const m = run(this.setup);
        const d = m.replicas.find((x) => x.state === 'down').id;
        const mid = run({ ...this.setup, states: this.setup.states.map((s) => (s === 'down' ? 'mid' : s)) });
        const outcome = { refused: 'refused', 'timed-out': 'timed out', acked: 'both' }[m.write.outcome];
        return {
          n: num(m.settings.n),
          d: rn(d),
          timeout: dur(TIMEOUT_MS),
          refused: word('refused'),
          timedOut: word('timed out'),
          both: word('both'),
          outcome: word(m.read.outcome === 'fails' ? 'reads fail' : outcome),
          rr: rn(m.read.set[0]),
          old: num(VERSIONS.old),
          new: num(VERSIONS.new),
          a: rn(mid.write.applied[0]),
          b: rn(mid.write.applied[1]),
          down: pct(DOWN_CHANCE * 100),
          wAll: nines(m.avail.write),
          rOne: nines(m.avail.read),
        };
      },
    },
    {
      id: 'stall',
      title: 'One replica stalls',
      setup: { n: 3, w: 2, r: 2, states: UP(3), stall: 1, sloppy: 0 },
      act: { run: 'write-read' },
      ask: 'R{s} pauses for {pause} (a GC pause), so its round trip is now {slow}. Writes at QUORUM took {before}. What do they take now?',
      choices: [
        { text: '{before}, unchanged', value: 'before' },
        { text: "{far}, R{f}'s round trip", value: 'far' },
        { text: '{slow}, waiting for R{s}', value: 'slow' },
      ],
      truth: 'writeMs',
      reveal:
        "{writeMs}: a write goes to all {n} and returns at the {wth} ack, which is now R{f}'s, across zones; ALL would wait {slow} for R{s}. ONE stays {one}. Reads hedge such stalls with speculative retry, asking one more replica; a write already goes to all, so only W and replica placement help.",
      focus: ['latency', 'writer'],
      hide: ['write-time', 'verdict'],
      slots() {
        const m = run(this.setup);
        const s = m.replicas.find((x) => x.pause).id;
        const far = m.replicas[m.settings.n - 1];
        return {
          s: rn(s),
          pause: ms(STALL_MS),
          slow: ms(m.replicas[s].writeRtt),
          before: ms(run({ ...this.setup, stall: 0 }).write.ms),
          far: ms(far.writeRtt),
          f: rn(far.id),
          writeMs: ms(m.write.ms),
          n: num(m.settings.n),
          wth: ordinal(m.settings.w),
          one: ms(run({ ...this.setup, w: 1 }).write.ms),
        };
      },
    },
    {
      id: 'missed-write',
      title: 'The replica that missed a write',
      setup: { n: 3, w: 2, r: 2, states: ['up', 'up', 'back'], stall: 0, sloppy: 0 },
      act: { run: 'write-read' },
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
      slots() {
        const m = run(this.setup);
        const missed = m.replicas.find((x) => x.state === 'back').id;
        const other = m.read.set.find((id) => id !== missed);
        return {
          m: rn(missed),
          o: rn(other),
          old: num(VERSIONS.old),
          new: num(VERSIONS.new),
          repair: word('repair'),
          hint: word('hint'),
          merkle: word('merkle'),
          outcome: word(m.read.repairs.includes(missed) ? 'repair' : 'hint'),
          ms: ms(m.read.ms),
          rth: ms(m.read.rthMs),
          hintH: num(HINT_WINDOW_HOURS),
        };
      },
    },
    {
      id: 'sloppy',
      title: 'A sloppy quorum',
      setup: { n: 3, w: 2, r: 2, states: ['up', 'back', 'back'], stall: 0, sloppy: 1 },
      act: { run: 'write-read' },
      ask: 'R{a} and R{b} were down, so a sloppy quorum took the write on R{h} and stand-in H{s1}. Both are back for the read, and {r} + {w} > {n}. Can a read still miss v{new}?',
      choices: [
        { text: 'No: R + W > N still holds', value: 'no' },
        { text: 'Yes: all {sets} read sets can', value: 'all' },
        { text: 'Yes: {miss} of the {sets} read sets can', value: 'yes' },
      ],
      truth: 'outcome',
      reveal:
        'Yes, {miss} of the {sets}: a read never asks the stand-ins, and of the home replicas only R{h} has v{new}, so a read of R{a} and R{b}, like this one, returns v{old}. H{s1} and H{s2} replay v{new} to R{a} and R{b} shortly after they return (hinted handoff); until then R + W > N promises nothing. A sloppy quorum trades the overlap for write availability: {strict} to {loose} here.',
      focus: ['standins', 'strip'],
      hide: ['verdict', 'count'],
      slots() {
        const m = run(this.setup);
        const [a, b] = m.replicas.filter((x) => x.state === 'back').map((x) => x.id);
        const miss = m.staleSets;
        return {
          a: rn(a),
          b: rn(b),
          h: rn(m.ackedHomes[0]),
          s1: num(1),
          s2: num(2),
          r: num(m.settings.r),
          w: num(m.settings.w),
          n: num(m.settings.n),
          new: num(VERSIONS.new),
          old: num(VERSIONS.old),
          sets: num(m.readSets),
          miss: num(miss),
          no: word('no'),
          all: word('all'),
          yes: word('yes'),
          outcome: word(miss === m.readSets ? 'all' : miss > 0 ? 'yes' : 'no'),
          strict: nines(run({ ...this.setup, sloppy: 0 }).avail.write),
          loose: nines(m.avail.write),
        };
      },
    },
    {
      id: 'fast-fresh',
      title: 'Challenge: fast reads that stay fresh',
      setup: { n: 3, w: 2, r: 2, states: UP(3), stall: 1, sloppy: 0 },
      ask: 'The middle replica keeps pausing for {pause}. Choose N, W and R so that no read set can miss v{new}, reads take under {gr}, writes under {gw}, and writes survive at least {k} replica down.',
      goal: CHALLENGE_GOAL,
      reveal:
        "N {n}, W {w}, R {r}: {r} + {w} > {n}, the read hears R{a} and R{b} in {read}, and the {wth} ack, R{c}'s, arrives at {write}, so the paused R{s} is never waited on. The cost is {n} copies of every write, and writes succeed {avail} of the time against QUORUM of {three}'s {q3}. In an interview, also name speculative retry (ask one more replica when one is slow), and say why LOCAL_QUORUM is not the answer here: a quorum inside the reader's data center need not overlap a write acknowledged in the writer's.",
      focus: ['reader', 'latency'],
      hide: [],
      solution: { n: 5, w: 4, r: 2 },
      slots() {
        const s = { ...this.setup, ...this.solution, states: UP(this.solution.n) };
        const m = run(s);
        const [a, b] = [...m.read.answers].sort((x, y) => x.rtt - y.rtt).map((x) => x.id);
        return {
          pause: ms(STALL_MS),
          new: num(VERSIONS.new),
          gr: ms(CHALLENGE_BOUNDS.readMs),
          gw: ms(CHALLENGE_BOUNDS.writeMs),
          k: num(CHALLENGE_BOUNDS.writeSurvives),
          n: num(s.n),
          w: num(s.w),
          r: num(s.r),
          a: rn(a),
          b: rn(b),
          read: ms(m.read.ms),
          wth: ordinal(s.w),
          c: rn(m.write.acked[s.w - 1]),
          write: ms(m.write.ms),
          s: rn(stalledIndex(s.n)),
          avail: nines(m.avail.write),
          three: num(3),
          q3: nines(run({ ...BASE, w: 2 }).avail.write),
        };
      },
    },
  ];

  function renderExperiment(spec) {
    const slots = spec.slots();
    const fill = (t) => fillTemplate(t, slots);
    const choices = (spec.choices ?? []).map((c) => fill(c.text));
    let answer = -1;
    if (spec.choices && spec.truth) {
      const truth = fill(`{${spec.truth}}`);
      const matches = spec.choices.flatMap((c, i) => (fill(`{${c.value}}`) === truth ? [i] : []));
      if (matches.length !== 1) throw new Error(`${spec.id}: ${matches.length} choices equal the model's ${truth}`);
      answer = matches[0];
    }
    return { id: spec.id, title: fill(spec.title), setup: spec.setup, ask: fill(spec.ask), choices, answer, reveal: fill(spec.reveal), focus: spec.focus, hide: spec.hide, goal: spec.goal, slots };
  }

  /** The challenge's status line, in the ask's own terms. */
  function goalStatus(m) {
    const ok = (b) => (b ? 'met' : 'not yet');
    const parts = [
      `No read set can miss v${VERSIONS.new}: ${m.staleSets} of ${m.readSets} can, ${ok(m.metrics.canMiss < 1)}`,
      `reads ${Number.isFinite(m.metrics.readMs) ? formatMs(m.metrics.readMs) : 'fail'}, under ${formatMs(CHALLENGE_BOUNDS.readMs)}: ${ok(m.metrics.readMs < CHALLENGE_BOUNDS.readMs)}`,
      `writes ${Number.isFinite(m.metrics.writeMs) ? formatMs(m.metrics.writeMs) : 'fail'}, under ${formatMs(CHALLENGE_BOUNDS.writeMs)}: ${ok(m.metrics.writeMs < CHALLENGE_BOUNDS.writeMs)}`,
      `writes survive ${m.survives.write} down, at least ${CHALLENGE_BOUNDS.writeSurvives}: ${ok(m.survives.write >= CHALLENGE_BOUNDS.writeSurvives)}`,
    ];
    return parts;
  }

  const api = {
    STALL_MS,
    TIMEOUT_MS,
    HINT_WINDOW_HOURS,
    DOWN_CHANCE,
    VERSIONS,
    ONE_WAY,
    ZONES,
    STAND_IN_ONE_WAY,
    STATES,
    STATE_NAMES,
    SIZES,
    stalledIndex,
    quorumOf,
    levelName,
    choose,
    combos,
    atLeastUp,
    quorumScenario,
    formatMs,
    formatPct,
    formatDuration,
    formatNines,
    formatOrdinal,
    fillTemplate,
    strayDigits,
    EXPERIMENTS,
    CHALLENGE_GOAL,
    CHALLENGE_BOUNDS,
    goalMet,
    goalStatus,
    renderExperiment,
    run,
    BASE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QuorumModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
