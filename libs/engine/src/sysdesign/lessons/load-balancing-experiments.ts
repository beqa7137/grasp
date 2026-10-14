import { slotOf, type ExperimentSpec } from './experiments.js';
import { balanceRun, type BalanceRun } from './widgets/balancing.js';
import { LB_SERVICE_MS, type Balancer } from './widgets/balancing-settings.js';

const pct = slotOf('pct');
const dur = slotOf('dur');
const ms = slotOf('ms');
const times = slotOf('times');
const num = slotOf('num');

/** The experiments' fleet: 10 servers at 70% unless an experiment says otherwise. */
const run = (policy: Balancer, slowdown: number, load = 70, servers = 10) => balanceRun(policy, { servers, load: load / 100, slowdown });
const POLICY = { 'round-robin': 0, random: 1, 'least-connections': 2, 'two-choices': 3 } as const;
/** The power of ten nearest a ratio: what "about 1,000×" means. */
const magnitude = (ratio: number) => 10 ** Math.round(Math.log10(ratio));
/** The share of requests (%) the slow server can keep up with at a load: its share of capacity over the load. */
const keepUp = (r: BalanceRun, load: number) => (r.slowCapacityShare / (load / 100)) * 100;
const GOAL_P99_MS = 100;

/** Settings as the widget reads them: the policy by its index in `LB_POLICIES`, load in %. */
export const LB_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'look-at-servers',
    title: 'A policy that looks',
    setup: { policy: POLICY['round-robin'], servers: 10, load: 70, slowdown: 1 },
    act: { set: { policy: POLICY['least-connections'] } },
    ask: 'Round-robin gives every server its turn, and p99 is {rr}. Least connections sends each request to the server with the fewest in flight. What does p99 become?',
    choices: [
      { text: '{lc}', value: 'lc' },
      { text: '{rr}, the same', value: 'rr' },
      { text: '{more}', value: 'more' },
    ],
    truth: 'lc',
    reveal:
      'p99 falls from {rr} to {lc}: at {load} load most requests find a server with nothing in flight, so they wait only for their own {service} of work. Random, which looks at nothing, is the worst at {random}; two random choices gets most of the gain, {two}, by looking at only two servers.',
    focus: ['histogram', 'chart'],
    slots: () => ({
      rr: ms(run('round-robin', 1).p99Ms),
      lc: ms(run('least-connections', 1).p99Ms),
      more: ms(run('round-robin', 1).p99Ms * 1.5),
      load: pct(70),
      service: ms(LB_SERVICE_MS),
      random: ms(run('random', 1).p99Ms),
      two: ms(run('two-choices', 1).p99Ms),
    }),
  },
  {
    id: 'one-slow-server',
    title: 'One slow server',
    setup: { policy: POLICY['round-robin'], servers: 10, load: 70, slowdown: 1 },
    act: { set: { slowdown: 5 } },
    ask: 'Round-robin, and one server becomes {slow} slower. How much does p99 go up?',
    choices: [
      { text: 'About {two}', value: 'two' },
      { text: 'About {ten}', value: 'ten' },
      { text: 'About {about}', value: 'about' },
    ],
    truth: 'about',
    reveal:
      'p99 goes from {from} to {to}, {ratio} worse. Round-robin still sends the slow server {sent} of the requests, but at {load} load it can keep up with only {keep}, so its queue grows all run, to {queue} requests by the end, and each new request sent to it waits behind everything already queued there.',
    focus: ['slow', 'histogram'],
    slots: () => {
      const [before, after] = [run('round-robin', 1), run('round-robin', 5)];
      const ratio = after.p99Ms / before.p99Ms;
      return {
        slow: times(5),
        two: times(2),
        ten: times(10),
        about: times(magnitude(ratio)),
        from: dur(before.p99Ms),
        to: dur(after.p99Ms),
        ratio: times(ratio),
        sent: pct(after.slowShare * 100),
        load: pct(70),
        keep: pct(keepUp(after, 70)),
        queue: num(after.slowQueueAtEnd),
      };
    },
  },
  {
    id: 'backs-off',
    title: 'Least connections backs off',
    setup: { policy: POLICY['round-robin'], servers: 10, load: 70, slowdown: 5 },
    act: { set: { policy: POLICY['least-connections'] } },
    ask: "The same {slow} slow server. Least connections counts each server's requests in flight. What share of the requests does it send the slow server?",
    choices: [
      { text: '{even}, an even share', value: 'even' },
      { text: '{sent}', value: 'sent' },
      { text: '{zero}, it stops sending any', value: 'zero' },
    ],
    truth: 'sent',
    reveal:
      "{sent}, just under the {keep} it can keep up with at {load} load: its slow requests stay in flight longer, so it rarely has the fewest. p99 falls from {rr} to {lc}. Counting work in flight follows a server's speed without being told it.",
    focus: ['share', 'slow'],
    slots: () => {
      const [rr, lc] = [run('round-robin', 5), run('least-connections', 5)];
      return {
        slow: times(5),
        even: pct(rr.slowShare * 100),
        sent: pct(lc.slowShare * 100),
        zero: pct(0),
        keep: pct(keepUp(lc, 70)),
        load: pct(70),
        rr: dur(rr.p99Ms),
        lc: dur(lc.p99Ms),
      };
    },
  },
  {
    id: 'two-choices',
    title: 'Look at only two',
    setup: { policy: POLICY['least-connections'], servers: 10, load: 70, slowdown: 5 },
    act: { set: { policy: POLICY['two-choices'] } },
    ask: 'Least connections scans every server for each request: p99 {lc}. Two random choices looks at two servers and takes the less busy one. What is its p99?',
    choices: [
      { text: '{lc}', value: 'lc' },
      { text: '{two}', value: 'two' },
      { text: '{rr}', value: 'rr' },
    ],
    truth: 'two',
    reveal:
      "{two}: worse than a full scan, but far from round-robin's {rr}. Whenever the slow server is one of the pair, its longer queue usually loses, so it gets {sent} of the requests. Two looks per request instead of a scan also stays good when many balancers share stale counts.",
    focus: ['histogram', 'share'],
    slots: () => {
      const two = run('two-choices', 5);
      return {
        lc: dur(run('least-connections', 5).p99Ms),
        two: dur(two.p99Ms),
        rr: dur(run('round-robin', 5).p99Ms),
        sent: pct(two.slowShare * 100),
      };
    },
  },
  {
    id: 'rising-load',
    title: 'A little slow, a little busier',
    setup: { policy: POLICY['round-robin'], servers: 10, load: 50, slowdown: 2 },
    act: { set: { load: 70 } },
    ask: 'Round-robin with one server {slow} slower: at {from} load p99 is {p99From}. Raise the load to {to}. What does p99 become?',
    choices: [
      { text: '{p99From}, about the same', value: 'p99From' },
      { text: '{triple}', value: 'triple' },
      { text: '{p99To}', value: 'p99To' },
    ],
    truth: 'p99To',
    reveal:
      "{p99To}. At {from} the slow server is sent {fillFrom} of what it can serve, so its queue comes and goes; at {to} it is sent {fillTo} of what it can serve, and a queue fed faster than it drains grows all run. Least connections at {to}: {lc}. The p99 chart shows the cliff: round-robin's line jumps once the slow server is sent more than it can serve.",
    focus: ['chart', 'slow'],
    slots: () => {
      const [a, b] = [run('round-robin', 2, 50), run('round-robin', 2, 70)];
      return {
        slow: times(2),
        from: pct(50),
        to: pct(70),
        p99From: dur(a.p99Ms),
        triple: dur(a.p99Ms * 3),
        p99To: dur(b.p99Ms),
        fillFrom: pct(((a.slowShare * 100) / keepUp(a, 50)) * 100),
        fillTo: pct(((b.slowShare * 100) / keepUp(b, 70)) * 100),
        lc: dur(run('least-connections', 2, 70).p99Ms),
      };
    },
  },
  {
    id: 'p99-goal',
    title: 'Challenge: tame the tail',
    setup: { policy: POLICY['round-robin'], servers: 10, load: 70, slowdown: 5 },
    ask: 'Keep the {slow} slow server, {servers} servers and {load} load. Get p99 under {goal}.',
    goal: { metric: 'p99Ms', below: GOAL_P99_MS, keep: { slowdown: 5, servers: 10, load: 70 } },
    reveal:
      'Least connections meets it at {lc} with {servers} servers and {load} load, sending the slow server {sent}. At those settings two random choices gets {two}, random {random} and round-robin {rr}. Round-robin and random never look at the servers, so the slow server sets their p99 at every fleet size and load; two random choices compares only two servers and gets under the goal only with a bigger fleet.',
    focus: ['chart'],
    slots: () => {
      const lc = run('least-connections', 5);
      return {
        slow: times(5),
        goal: ms(GOAL_P99_MS),
        lc: dur(lc.p99Ms),
        servers: num(10),
        load: pct(70),
        sent: pct(lc.slowShare * 100),
        two: dur(run('two-choices', 5).p99Ms),
        random: dur(run('random', 5).p99Ms),
        rr: dur(run('round-robin', 5).p99Ms),
      };
    },
  },
];
