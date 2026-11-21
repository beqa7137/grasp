import { slotOf, word, type ExperimentGoal, type ExperimentSpec, type Slot } from './experiments.js';
import {
  CAPACITY_APP_RPS,
  CAPACITY_HIT,
  CAPACITY_LB_RPS,
  CAPACITY_READS,
  CAPACITY_REPLICAS_MAX,
  CAPACITY_REQUEST_MS,
  CAPACITY_SLOW_MS,
  CAPACITY_WORKERS,
  CAPACITY_WRITES,
  CAPACITY_ZONES,
  capacityRamp,
  capacityRun,
  capacityZoneLoss,
  type CapacityRun,
  type CapacitySettings,
} from './widgets/capacity.js';

const ms = slotOf('ms');
const pct = slotOf('pct');
const qps = slotOf('qps');
const times = slotOf('times');
const num = slotOf('num');
/** A count the model computes in floating point: a whole number, or the template is lying. */
const count = (v: number): Slot => {
  if (Math.abs(v - Math.round(v)) > 1e-6) throw new Error(`${v} is not a whole count`);
  return num(Math.round(v));
};
/** A share as the whole percent a choice states, and a rate as its whole thousand. */
const roundPct = (u: number) => Math.round(u * 100);
const roundK = (v: number) => Math.round(v / 1000) * 1000;

const SETUP = {
  tenfold: { traffic: 1000, lb: 2, app: 4, size: 8000, replicas: 0, cache: 0, zone: 0, slow: 0 },
  cache: { traffic: 10000, lb: 3, app: 8, size: 8000, replicas: 0, cache: 0, zone: 0, slow: 0 },
  replay: { traffic: 20000, lb: 6, app: 20, size: 8000, replicas: 2, cache: 1, zone: 0, slow: 0 },
  zone: { traffic: 10000, lb: 3, app: 9, size: 8000, replicas: 3, cache: 1, zone: 0, slow: 0 },
  slow: { traffic: 6000, lb: 2, app: 6, size: 8000, replicas: 2, cache: 1, zone: 0, slow: 0 },
  challenge: { traffic: 16000, lb: 2, app: 8, size: 4000, replicas: 0, cache: 0, zone: 0, slow: 0 },
} as const satisfies Record<string, CapacitySettings>;

const ACT = {
  tenfold: { traffic: 10000 },
  cache: { cache: 1 },
  replay: { replicas: 4 },
  zone: { zone: 1 },
  slow: { slow: 1 },
} as const satisfies Record<string, Partial<CapacitySettings>>;

/** The tiers as E1's choices name them; the database is one choice, whichever of its lanes fills. */
const TIER = { lb: 'The load balancers', app: 'The app servers', db: 'The database' } as const;

/** The fewest replicas that lift the database past `limit` at run `r`'s setting, the advice a reveal can stand by. */
function minReplicas(r: CapacityRun, limit: number): number {
  for (let n = 1; n <= CAPACITY_REPLICAS_MAX; n++) if (capacityRun({ ...r.settings, replicas: n }).dbCeiling > limit + 1e-9) return n;
  throw new Error(`no number of replicas lifts the database past ${limit}`);
}

const pair = (id: keyof typeof ACT): [CapacityRun, CapacityRun] => [capacityRun(SETUP[id]), capacityRun({ ...SETUP[id], ...ACT[id] })];

export const CAPACITY_CHALLENGE_BOUNDS = { headroom: 30, machines: 29 } as const;
export const CAPACITY_CHALLENGE_GOAL: ExperimentGoal = {
  all: [
    { metric: 'shed', below: 1 },
    { metric: 'headroom', atLeast: CAPACITY_CHALLENGE_BOUNDS.headroom },
    { metric: 'zoneShed', below: 1 },
    { metric: 'machines', below: CAPACITY_CHALLENGE_BOUNDS.machines + 1 },
  ],
  keep: { traffic: SETUP.challenge.traffic, zone: 0, slow: 0 },
};
/** The one setting of the challenge's 3,528 that meets it. */
export const CAPACITY_CHALLENGE_SOLUTION = { lb: 6, app: 17, size: 8000, replicas: 2, cache: 1 } as const;

/** The setting an experiment's act leaves: its setup with the act's change, as the model reads it. */
export const capacityActOf = (e: Pick<ExperimentSpec, 'setup' | 'act'>): CapacitySettings =>
  capacityRun({ ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }).settings;

/** Settings as the widget reads them (`CapacitySettings`). */
export const CAPACITY_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'tenfold',
    title: 'Ten times the traffic',
    setup: SETUP.tenfold,
    act: { set: ACT.tenfold, run: 'ramp' },
    ask: 'Today {today} requests a second arrive, and every tier has room to spare. Each request passes a load balancer and an app server, then makes {queries} queries to the database. Traffic grows {growth}, to {target}. Which tier runs out first?',
    choices: [
      { text: '{lb}: {lbN} of {lbEach} each', value: 'lb' },
      { text: '{app}: {appN} of {appEach} each', value: 'app' },
      { text: '{db}: one primary of {size} queries/s', value: 'db' },
    ],
    truth: 'first',
    reveal:
      "The database, at {dbLimit}: each request costs it {queries} queries, so its {size} queries a second carry only {dbLimitN} requests a second, fewer than the app servers' {appLimit} or the load balancers' {lbLimit}. Compare tiers by their limit in requests a second, never by their raw size. At {target} only {served} are served: the app servers, full at {appLimit}, shed {appShed}, and the database sheds {dbShed} more. Cache the reads or add {repMin} or more replicas first; the app servers come next, and the load balancers end exactly {lbBusy} busy.",
    focus: ['primary', 'sink'],
    hide: ['db'],
    slots: () => {
      const [a, b] = pair('tenfold');
      const first = capacityRamp(SETUP.tenfold, a.offered, b.offered).full;
      return {
        today: num(a.offered),
        queries: num(CAPACITY_READS + CAPACITY_WRITES),
        growth: times(b.offered / a.offered),
        target: qps(b.offered),
        lbN: num(a.lb.n),
        lbEach: qps(CAPACITY_LB_RPS),
        appN: num(a.app.n),
        appEach: qps(CAPACITY_APP_RPS),
        size: num(a.settings.size),
        lb: word(TIER.lb),
        app: word(TIER.app),
        db: word(TIER.db),
        first: word(TIER[first === 'lb' || first === 'app' ? first : 'db']),
        dbLimit: qps(a.dbCeiling),
        dbLimitN: count(a.dbCeiling),
        appLimit: qps(a.app.ceiling),
        lbLimit: qps(a.lb.ceiling),
        served: qps(b.served),
        appShed: qps(b.app.shed),
        dbShed: qps(b.primary.shed + b.replicas.shed),
        lbBusy: pct(b.lb.util * 100),
        repMin: num(minReplicas(b, a.dbCeiling)),
      };
    },
  },
  {
    id: 'cache',
    title: 'Cache the reads',
    setup: SETUP.cache,
    act: { set: ACT.cache, run: 'flow' },
    ask: 'The database tops out at {before}. Each request makes {reads} reads and {writes} writes, {queries} queries in all, against its {size} queries a second. Put a cache in front of the reads, and {hit} of them hit it. How many requests a second can the database take now?',
    choices: [
      { text: 'About {two}: twice as many, the cache takes half the work', value: 'two' },
      { text: 'About {afterRound}: {ratioRound} as many, the writes still reach it', value: 'afterRound' },
      { text: '{ten}: {tenX} as many, like the hit rate', value: 'ten' },
    ],
    truth: 'afterRound',
    reveal:
      "{after}, {ratio} as many: the cache answers {hits} of each request's {reads} reads, so only {misses} reads and the {writes} writes reach the database, {cost} queries a request instead of {queries}. Its {size} queries a second now serve {after}, not the {ten} a {hit} hit rate suggests: writes always reach the database. All {traffic} are served now, and the app servers, {appBusy} busy, are the busiest tier.",
    focus: ['primary'],
    hide: ['after'],
    slots: () => {
      const [a, b] = pair('cache');
      return {
        before: qps(a.dbCeiling),
        reads: num(CAPACITY_READS),
        writes: num(CAPACITY_WRITES),
        queries: num(CAPACITY_READS + CAPACITY_WRITES),
        size: num(a.settings.size),
        hit: pct(CAPACITY_HIT * 100),
        two: qps(a.dbCeiling * 2),
        afterRound: qps(roundK(b.dbCeiling)),
        ratioRound: times(Math.round(b.dbCeiling / a.dbCeiling)),
        ten: qps(a.dbCeiling * 10),
        tenX: times(10),
        after: qps(b.dbCeiling),
        ratio: times(b.dbCeiling / a.dbCeiling),
        hits: num(b.hits),
        misses: num(b.misses),
        cost: num(b.primary.cost),
        traffic: qps(b.offered),
        appBusy: pct(b.app.util * 100),
      };
    },
  },
  {
    id: 'replay',
    title: 'Two more replicas',
    setup: SETUP.replay,
    act: { set: ACT.replay, run: 'flow' },
    ask: 'At {traffic}, the database takes {writesN} writes a second and, after the cache, {readsN} reads. The {repBefore} read replicas share the reads, each {before} busy. Add {added} more. How busy is each replica now?',
    choices: [
      { text: 'About {half}: half as busy, the work splits {repAfter} ways', value: 'half' },
      { text: 'About {afterRound}: a little less, part of the work does not split', value: 'afterRound' },
      { text: 'About {readsOnly}: a replica only serves reads, now split {repAfter} ways', value: 'readsOnly' },
    ],
    truth: 'afterRound',
    reveal:
      '{after}: every replica replays every write, {writesN} a second, which takes {replay} of its {size} queries a second however many replicas share the reads. Only the {readsN} reads a second split: {readsBeforeN} each with {repBefore} replicas, {readsAfterN} with {repAfter}. Twice the replicas raise their limit from {limitBefore} to {limitAfter}, {gain} more, and no number of them passes {writeCeiling}, where replaying the writes alone fills a replica. Replicas scale reads, not writes.',
    focus: ['replicas'],
    hide: ['after', 'replay'],
    slots: () => {
      const [a, b] = pair('replay');
      return {
        traffic: qps(a.offered),
        writesN: count(a.served * CAPACITY_WRITES),
        readsN: count(a.served * a.misses),
        repBefore: num(a.replicas.up),
        repAfter: num(b.replicas.up),
        added: num(b.replicas.up - a.replicas.up),
        before: pct(a.replicas.util * 100),
        after: pct(b.replicas.util * 100),
        afterRound: pct(roundPct(b.replicas.util)),
        half: pct(roundPct(a.replicas.util / 2)),
        readsOnly: pct(roundPct(b.replicas.util - b.replicas.replayUtil)),
        replay: pct(b.replicas.replayUtil * 100),
        size: num(a.settings.size),
        readsBeforeN: count(a.replicas.readsEach),
        readsAfterN: count(b.replicas.readsEach),
        limitBefore: qps(a.replicas.ceiling),
        limitAfter: qps(b.replicas.ceiling),
        gain: pct((b.replicas.ceiling / a.replicas.ceiling - 1) * 100),
        writeCeiling: qps(a.settings.size / CAPACITY_WRITES),
      };
    },
  },
  {
    id: 'zone',
    title: 'Lose a zone',
    setup: SETUP.zone,
    act: { set: ACT.zone, run: 'flow' },
    ask: 'The load balancers and app servers are spread evenly over zones A, B and C, and no tier runs above {maxBusy}; all {traffic} are served. Zone A fails with every instance in it, and a replica takes over from the primary. How many requests a second are shed?',
    choices: [
      { text: 'None: every tier has room, at least {spare} to spare', value: 'none' },
      { text: "About {third}: a third, the zone's share", value: 'third' },
      { text: '{shed}: a tenth, more than the busiest tier left can take', value: 'shed' },
    ],
    truth: 'shed',
    reveal:
      '{shed}, a tenth: the {appLeft} app servers left can take {appLimit}, so the {appBusy} they ran at becomes {appOver} of what they can serve. Losing one zone of three multiplies the load on what is left by {factor} when a tier is spread evenly, so size every tier so that what survives the largest zone still carries the peak. The load balancers end exactly {lbAfter} busy, with nothing to spare. The database loses its primary and a replica yet keeps room: a replica became the primary (writes fail until that finishes, seconds to minutes), and the one left runs at {repAfter}.',
    focus: ['app', 'lb'],
    hide: ['after', 'zones'],
    slots: () => {
      const [a, b] = pair('zone');
      return {
        maxBusy: pct(a.maxUtil * 100),
        spare: pct((1 - a.maxUtil) * 100),
        traffic: qps(a.offered),
        none: qps(0),
        third: qps(Math.round(a.offered / CAPACITY_ZONES / 100) * 100),
        shed: qps(b.shed),
        appLeft: num(b.app.up),
        appLimit: qps(b.app.ceiling),
        appBusy: pct(a.app.util * 100),
        appOver: pct((b.app.arriving / b.app.ceiling) * 100),
        factor: times(CAPACITY_ZONES / (CAPACITY_ZONES - 1)),
        lbAfter: pct(b.lb.util * 100),
        repAfter: pct(b.replicas.util * 100),
      };
    },
  },
  {
    id: 'slow',
    title: 'A slow database',
    setup: SETUP.slow,
    act: { set: ACT.slow, run: 'flow' },
    ask: "Each app server has {workers} workers, and a request holds one for its whole {fast}: at {traffic}, {inFlight} of each server's {workers} are busy. A network fault between the app servers and the database adds {added} to every request, so each takes {slow}, though the database does no more work. How many requests a second are served?",
    choices: [
      { text: '{served}: a fifth, the workers cap it', value: 'served' },
      { text: '{traffic}: all of them, each one slower', value: 'traffic' },
      { text: '{half}: half, as the {idle} idle workers fill up', value: 'half' },
    ],
    truth: 'served',
    reveal:
      "{served}, a fifth: requests in flight equal throughput times latency (Little's law). Each server's {workers} workers hold at most {workers} requests at once, and at {slow} each that is {perServer}; {appN} servers serve {served}. The other {shed} are shed at the app servers while their CPUs sit {cpu} busy: waiting on the database used up the workers in front of it. An autoscaler watching CPU sees {cpu} and adds nothing, or even scales in: scale and load-test on pool saturation and latency. Serving {traffic} at {slow} needs {need} requests in flight. Set timeouts, fix the slow network path, and shed load early rather than only growing the pool.",
    focus: ['app'],
    hide: ['after'],
    slots: () => {
      const [a, b] = pair('slow');
      return {
        workers: num(CAPACITY_WORKERS),
        fast: ms(CAPACITY_REQUEST_MS),
        slow: ms(CAPACITY_SLOW_MS),
        traffic: qps(a.offered),
        inFlight: count(a.app.inFlight),
        served: qps(b.served),
        added: ms(CAPACITY_SLOW_MS - CAPACITY_REQUEST_MS),
        half: qps(a.offered / 2),
        idle: count(CAPACITY_WORKERS - a.app.inFlight),
        perServer: qps(b.app.each),
        appN: num(b.app.up),
        shed: qps(b.shed),
        cpu: pct(b.app.cpuUtil * 100),
        need: count((b.offered * CAPACITY_SLOW_MS) / 1000),
      };
    },
  },
  {
    id: 'challenge',
    title: 'Challenge: {target} with a zone to spare',
    setup: SETUP.challenge,
    ask: 'Serve {target} with every tier keeping at least {headroom} headroom, nothing shed when zone A fails, and at most {machines} machines in all; a cache keeps a full copy in each of the {zones} zones.',
    goal: CAPACITY_CHALLENGE_GOAL,
    reveal:
      "The fleet that fits: {lbN} load balancers, {appN} app servers, a primary of {size} queries/s, {repN} replicas and the cache's {zones} nodes, {fleet} machines; the busiest tier runs at {maxBusy}. Zone A holds {lbA} of the load balancers and {appA} of the app servers, so losing it leaves {lbLeft} load balancers {lbZone} busy and {appLeft} app servers {appZone} busy, while one replica takes over as primary and the other carries every read at {repZone}. With {appFewer} app servers zone A would hold {appFewerA}, and the {appFewerLeft} left would shed {appFewerShed}; with no replica the primary would fall with its zone and every write with it.",
    focus: ['lb', 'app', 'db'],
    hide: [],
    slots: () => {
      const solved = { ...SETUP.challenge, ...CAPACITY_CHALLENGE_SOLUTION };
      const sol = capacityRun(solved);
      const z = capacityZoneLoss(sol);
      const fewer = capacityZoneLoss(capacityRun({ ...solved, app: solved.app - 1 }));
      return {
        target: qps(SETUP.challenge.traffic),
        headroom: pct(CAPACITY_CHALLENGE_BOUNDS.headroom),
        machines: num(CAPACITY_CHALLENGE_BOUNDS.machines),
        fleet: num(sol.machines),
        zones: num(CAPACITY_ZONES),
        maxBusy: pct(sol.maxUtil * 100),
        lbA: num(z.lb.lost),
        appA: num(z.app.lost),
        appFewerA: num(fewer.app.lost),
        appFewerLeft: num(fewer.app.up),
        lbN: num(sol.lb.n),
        appN: num(sol.app.n),
        size: num(sol.settings.size),
        repN: num(sol.replicas.n),
        lbLeft: num(z.lb.up),
        lbZone: pct(z.lb.util * 100),
        appLeft: num(z.app.up),
        appZone: pct(z.app.util * 100),
        repZone: pct(z.replicas.util * 100),
        appFewer: num(solved.app - 1),
        appFewerShed: qps(fewer.shed),
      };
    },
  },
];
