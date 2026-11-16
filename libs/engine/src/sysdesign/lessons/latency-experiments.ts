import { slotOf, word, type ExperimentGoal, type ExperimentSpec } from './experiments.js';
import {
  LATENCY_BASELINE,
  LATENCY_LOADS,
  LATENCY_QUEUE,
  LATENCY_SERVICE,
  LATENCY_SERVICE_MS,
  idleBesideShare,
  latencyScenario,
  type LatencySettings,
  type LatencySteady,
} from './widgets/queueing.js';

const ms = slotOf('ms');
const dur = slotOf('dur');
const pct = slotOf('pct');
const qps = slotOf('qps');
const times = slotOf('times');
const num = slotOf('num');

const { shared, split } = LATENCY_QUEUE;
const { steady } = LATENCY_SERVICE;

/** A setting every experiment quotes is stable but E5's act and the challenge's start; this reads the stable ones. */
const stable = (s: Partial<LatencySettings>): LatencySteady => {
  const m = latencyScenario({ ...LATENCY_BASELINE, ...s });
  if (!m.stable) throw new Error(`No steady state at ${m.key}`);
  return m;
};

const SETUP = {
  idle: { ...LATENCY_BASELINE, load: 50 },
  knee: { ...LATENCY_BASELINE, load: 70 },
  pool: { ...LATENCY_BASELINE, servers: 4, queue: split, load: 80 },
  steady: { ...LATENCY_BASELINE, load: 90 },
  fail: { ...LATENCY_BASELINE, servers: 3, load: 80 },
  challenge: { ...LATENCY_BASELINE, servers: 2, queue: split, load: 60, down: 1 },
} as const satisfies Record<string, LatencySettings>;

export const LATENCY_CHALLENGE_BOUNDS = { p99: 100, load: 60 } as const;
export const LATENCY_CHALLENGE_GOAL: ExperimentGoal = {
  all: [
    { metric: 'p99', below: LATENCY_CHALLENGE_BOUNDS.p99 },
    { metric: 'load', atLeast: LATENCY_CHALLENGE_BOUNDS.load },
  ],
  keep: { down: 1, service: LATENCY_SERVICE.random },
};
/** The one setting of the challenge's 98 that meets it. */
export const LATENCY_CHALLENGE_SOLUTION = { servers: 4, queue: shared, load: 60 } as const;

/** Settings as the widget reads them (`LatencySettings`): `queue` and `service` by their index. */
export const LATENCY_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'idle-yet-waiting',
    title: 'One server at half load',
    setup: SETUP.idle,
    act: { run: 'sample' },
    ask: 'One server, {load} busy, so it sits idle {idle} of the time. Requests arrive at random, {rate} on average, and each needs a random amount of work, {service} on average. On average, how long does a request wait before the server starts on it?',
    choices: [
      { text: 'None: it has time to spare', value: 'none' },
      { text: '{quarter}: only the bursts wait', value: 'quarter' },
      { text: '{meanWaitAll}: as long as the work itself', value: 'meanWaitAll' },
    ],
    truth: 'meanWaitAll',
    reveal:
      '{meanWaitAll}, as long as the work itself. A request that arrives at a random moment finds the server busy {chance} of the time, exactly its utilization, so {chance} of requests wait for the work ahead of them, {waitWhenWaiting} on average; averaged over every request, that is {meanWaitAll}, and a request takes {mean} in all. Waiting needs no overload, only collisions.',
    focus: ['split', 'timeline'],
    hide: ['sample', 'numbers'],
    slots: () => {
      const m = stable(SETUP.idle);
      return {
        load: pct(m.settings.load),
        idle: pct(100 - m.settings.load),
        rate: qps(m.ratePerS),
        service: ms(LATENCY_SERVICE_MS),
        chance: pct(m.waitChance * 100),
        meanWaitAll: ms(m.meanWait),
        waitWhenWaiting: ms(m.meanWait / m.waitChance),
        mean: ms(m.mean),
        none: ms(0),
        quarter: ms(LATENCY_SERVICE_MS / 4),
      };
    },
  },
  {
    id: 'knee',
    title: 'From {from} to {to} busy',
    setup: SETUP.knee,
    act: { set: { load: 90 }, run: 'sample' },
    ask: 'One server at {from} busy: a request takes {before} on average, {service} of work and the rest waiting. Traffic grows by {growth}, until the server is {to} busy. What is the average now?',
    choices: [
      { text: '{prop}: in step with the traffic', value: 'prop' },
      { text: '{after}: {three} as long', value: 'after' },
      { text: '{ten}: {tenX} as long', value: 'ten' },
    ],
    truth: 'after',
    reveal:
      '{after}: the mean is S / (1 − utilization), where S is the {service} of work, and going from {from} to {to} busy cuts the idle share from {idleFrom} to {idleTo}, so the time grows {three}. The work stays {service}; the waiting grows from {waitFrom} to {waitTo}, and p99 from {p99From} to {p99To}. Each step of load costs more than the last (this bend is the knee of the curve), which is why a service that looked fine at {from} is {three} slower at {to}.',
    focus: ['chart', 'split'],
    hide: ['ahead', 'after'],
    slots: () => {
      const a = stable(SETUP.knee);
      const b = stable({ ...SETUP.knee, load: 90 });
      return {
        from: pct(a.settings.load),
        to: pct(b.settings.load),
        service: ms(LATENCY_SERVICE_MS),
        before: ms(a.mean),
        growth: pct((b.ratePerS / a.ratePerS - 1) * 100),
        prop: ms(a.mean * (b.ratePerS / a.ratePerS)),
        after: ms(b.mean),
        three: times(b.mean / a.mean),
        ten: ms(a.mean * 10),
        tenX: times(10),
        idleFrom: pct(100 - a.settings.load),
        idleTo: pct(100 - b.settings.load),
        waitFrom: ms(a.meanWait),
        waitTo: ms(b.meanWait),
        p99From: ms(a.p99),
        p99To: ms(b.p99),
      };
    },
  },
  {
    id: 'pool',
    title: 'One queue or a queue each',
    setup: SETUP.pool,
    act: { set: { queue: shared }, run: 'sample' },
    ask: '{servers} servers, each {load} busy, each with its own queue, and every request goes to one of them at random: a request waits {before} on average. Put all {servers} behind one shared queue, at the same load. What is the average wait now?',
    choices: [
      { text: '{afterRound}: about {ratioRound} shorter', value: 'afterRound' },
      { text: '{half}: half as long', value: 'half' },
      { text: '{before}: unchanged, each is as busy', value: 'before' },
    ],
    truth: 'afterRound',
    reveal:
      '{after}, {ratio} shorter: with a queue each, a request can wait behind a long one while another server sits idle; here that happens {idleBeside} of the time. One shared queue hands each request to the first server that frees up, so it waits only when all {servers} are busy, which {chance} of arrivals find, against {chanceSplit} with a queue each. p99 falls from {p99Before} to {p99After}. This is why one line feeding a pool beats a line per checkout, and why least-loaded balancing beats random.',
    focus: ['scene', 'numbers'],
    hide: ['after'],
    slots: () => {
      const a = stable(SETUP.pool);
      const b = stable({ ...SETUP.pool, queue: shared });
      return {
        servers: num(a.settings.servers),
        load: pct(a.settings.load),
        before: ms(a.meanWait),
        after: ms(b.meanWait),
        afterRound: ms(Math.round(b.meanWait * 2) / 2),
        half: ms(a.meanWait / 2),
        ratio: times(a.meanWait / b.meanWait),
        ratioRound: times(Math.round(a.meanWait / b.meanWait)),
        idleBeside: pct(idleBesideShare(a.rho, a.up) * 100),
        chance: pct(b.waitChance * 100),
        chanceSplit: pct(a.waitChance * 100),
        p99Before: ms(a.p99),
        p99After: ms(b.p99),
      };
    },
  },
  {
    id: 'steady',
    title: 'Steadier work',
    setup: SETUP.steady,
    act: { set: { service: steady }, run: 'sample' },
    ask: 'One server, {load} busy. Requests need {service} of work on average but vary at random, and wait {before} on average. Now every request takes exactly {service}. What is the average wait?',
    choices: [
      { text: '{before}: unchanged, the load is the same', value: 'before' },
      { text: '{after}: half as long', value: 'after' },
      { text: '{tenth}: a tenth, no request is slow any more', value: 'tenth' },
    ],
    truth: 'after',
    reveal:
      '{after}, exactly half. The Pollaczek-Khinchine formula ties the wait to how much service times vary as well as to the load: the wait scales with (1 + CV²) / 2, where CV, the coefficient of variation, is the standard deviation of service times over their mean. Random (exponential) times have a CV of {cvRandom} and steady ones {cvSteady}, so steady halves the wait. p99 falls from {p99Before} to {p99After}. More even work cuts the tail without adding a server.',
    focus: ['split', 'chart'],
    hide: ['after'],
    slots: () => {
      const a = stable(SETUP.steady);
      const b = stable({ ...SETUP.steady, service: steady });
      return {
        load: pct(a.settings.load),
        service: ms(LATENCY_SERVICE_MS),
        before: ms(a.meanWait),
        after: ms(b.meanWait),
        tenth: ms(a.meanWait / 10),
        p99Before: ms(a.p99),
        p99After: ms(b.p99),
        cvRandom: num(1),
        cvSteady: num(0),
      };
    },
  },
  {
    id: 'lose-one',
    title: 'Lose one of three',
    setup: SETUP.fail,
    act: { set: { down: 1 }, run: 'sample' },
    ask: '{servers} servers share one queue at {load} busy, and p99 is {before}. One fails, and the others take its traffic. What is p99 now?',
    choices: [
      { text: '{prop}: half as long again, like the load', value: 'prop' },
      { text: 'It settles after a burst, with p99 near {second}', value: 'second' },
      { text: 'It never settles: the queue keeps growing', value: 'unbounded' },
    ],
    truth: 'outcome',
    reveal:
      'It never settles: {load} of {servers} servers is {rate}, and the {left} left can serve only {cap}, so {growth} more arrive than leave, and the queue and its waits keep growing. Losing one of {servers} multiplies the load on the rest by {mult}: {load} becomes {rho}, and from {limit} up the {left} left cannot keep up. From {safe}, the {left} left would run at {safeRho}, with p99 {safeP99}. Size so the fleet minus one still runs below the knee.',
    focus: ['chart', 'scene'],
    hide: ['after', 'utilization', 'stability'],
    slots: () => {
      const a = stable(SETUP.fail);
      const b = latencyScenario({ ...SETUP.fail, down: 1 });
      const safe = stable({ ...SETUP.fail, load: 60, down: 1 });
      return {
        servers: num(a.settings.servers),
        load: pct(a.settings.load),
        before: ms(a.p99),
        prop: ms(a.p99 * 1.5),
        second: dur(1_000),
        rate: qps(b.ratePerS),
        left: num(b.up),
        cap: qps(b.capacityPerS),
        growth: qps(b.stable ? 0 : b.growthPerS),
        mult: times(a.settings.servers / b.up),
        rho: pct(b.rho * 100),
        safe: pct(safe.settings.load),
        limit: pct((b.up / a.settings.servers) * 100),
        safeRho: pct(safe.rho * 100),
        safeP99: ms(safe.p99),
        unbounded: word('never settles'),
        outcome: word(b.stable ? 'settles' : 'never settles'),
      };
    },
  },
  {
    id: 'headroom',
    title: 'Challenge: busy, and safe when one fails',
    setup: SETUP.challenge,
    ask: 'A server has failed, and its traffic moved to the rest. Choose the servers, the queue and the load so that p99 stays under {p99} on the servers left while the fleet runs at least {minLoad} busy with every server up.',
    goal: LATENCY_CHALLENGE_GOAL,
    reveal:
      '{servers} servers sharing one queue at {load}: with one down, the {left} left are {rho} busy and p99 is {p99Now}. {threeN} servers at {load} would leave {twoN} at {rho3}, p99 {p99Three}; {servers} servers with a queue each would need the load down to {splitLoad}. A bigger pool runs hotter and still rides out a failure: plan N+1 servers and run them at a load the N left can absorb.',
    focus: ['chart', 'scene'],
    hide: [],
    slots: () => {
      const solved = { ...SETUP.challenge, ...LATENCY_CHALLENGE_SOLUTION };
      const sol = stable(solved);
      const three = stable({ ...solved, servers: 3 });
      const splitPass = LATENCY_LOADS.filter((load) => {
        const r = latencyScenario({ ...solved, queue: split, load });
        return r.stable && r.p99 < LATENCY_CHALLENGE_BOUNDS.p99;
      });
      return {
        minLoad: pct(LATENCY_CHALLENGE_BOUNDS.load),
        p99: ms(LATENCY_CHALLENGE_BOUNDS.p99),
        servers: num(sol.settings.servers),
        load: pct(sol.settings.load),
        left: num(sol.up),
        rho: pct(sol.rho * 100),
        p99Now: ms(sol.p99),
        threeN: num(three.settings.servers),
        twoN: num(three.up),
        rho3: pct(three.rho * 100),
        p99Three: ms(three.p99),
        splitLoad: pct(splitPass[splitPass.length - 1]),
      };
    },
  },
];
