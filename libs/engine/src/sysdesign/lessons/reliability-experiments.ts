import { slotOf, type ExperimentGoal, type ExperimentSpec } from './experiments.js';
import {
  COPY_FAILS_PER_YEAR,
  COPY_MTTR_H,
  COPY_UNAVAILABILITY,
  FAILOVER_H,
  RELIABILITY_PARTS,
  RELIABILITY_SETUPS,
  SHARED_SHARE,
  RELIABILITY_YEAR_H,
  hoursAYear,
  ninesOf,
  reliabilityScenario,
  type ReliabilityPart,
  type ReliabilityPartId,
  type ReliabilityScenario,
  type ReliabilitySettings,
} from './widgets/reliability.js';
import type { AnswerHoldMode } from './widgets/reliability-sample.js';

const down = slotOf('down');
const avail = slotOf('avail');
const pct = slotOf('pct');
const num = slotOf('num');
const times = slotOf('times');
const hours = slotOf('hours');
const oneIn = slotOf('oneIn');

const E = RELIABILITY_SETUPS;
const run = (s: ReliabilitySettings) => reliabilityScenario(s);
const partOf = (m: ReliabilityScenario, id: ReliabilityPartId): ReliabilityPart => m.parts.find((p) => p.id === id)!;

export const RELIABILITY_CHALLENGE_BOUNDS = { down: COPY_UNAVAILABILITY * RELIABILITY_YEAR_H, copies: 8 } as const;
export const RELIABILITY_CHALLENGE_GOAL: ExperimentGoal = {
  all: [
    { metric: 'down', below: RELIABILITY_CHALLENGE_BOUNDS.down },
    { metric: 'copies', below: RELIABILITY_CHALLENGE_BOUNDS.copies },
  ],
  keep: { shared: 1, failover: 1 },
};
/** The one setting of the challenge's 162 that meets it. */
export const RELIABILITY_CHALLENGE_SOLUTION = { lb: 2, app: 2, db: 2, recs: 1, optional: 1 } as const;

/**
 * How each question's answer plays on the year: where its play holds (`reliabilityAnswerHold`) and the sentence the
 * year's line says while it plays, which points at the rows that answer it rather than counting them.
 */
export const RELIABILITY_ANSWER_PLAYS: Readonly<Record<string, { hold: AnswerHoldMode; watch: string }>> = {
  series: { hold: 'request', watch: 'Watch the request’s row: it collects every failure that reaches it.' },
  parallel: { hold: 'part', watch: 'Watch the database’s two rows and the strip under them.' },
  weakest: { hold: 'request', watch: 'Watch the app servers’ rows and the request’s row.' },
  shared: { hold: 'part', watch: 'Watch the request’s row.' },
  failover: { hold: 'part', watch: 'Watch the request’s row.' },
};

export const RELIABILITY_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'series',
    title: 'Four parts in a row',
    setup: E.series,
    act: { run: 'year' },
    ask: 'A page request needs {parts} parts in turn: a load balancer, an app server, a database and a recommendations service. There is one copy of each, and each is {each} available: down {eachDown} a year, in outages of {mttr}. How long is the request down a year?',
    choices: [
      { text: '{eachDown}: a chain is as good as its weakest part', value: 'eachDown' },
      { text: '{half}: about twice that, as outages often coincide', value: 'half' },
      { text: '{down}: every part’s outages count in full', value: 'down' },
    ],
    truth: 'down',
    reveal:
      '{down}: the request needs every part, so it fails whenever any one of them is down. Outages of {mttr} that strike independently almost never coincide, so the downtime of {parts} parts adds up: {parts} × {eachHours} is about {down}, and the availabilities multiply to {avail}. A chain is always worse than its weakest part, and every hard dependency you add costs its whole downtime.',
    focus: ['timeline', 'ruler'],
    hide: ['sample', 'request'],
    slots: () => {
      const m = run(E.series);
      return {
        parts: num(RELIABILITY_PARTS.length),
        each: avail(COPY_UNAVAILABILITY),
        eachDown: down(hoursAYear(COPY_UNAVAILABILITY)),
        eachHours: hours(hoursAYear(COPY_UNAVAILABILITY)),
        mttr: hours(COPY_MTTR_H),
        half: down(2 * hoursAYear(COPY_UNAVAILABILITY)),
        down: down(m.downH),
        avail: avail(m.u),
      };
    },
  },
  {
    id: 'parallel',
    title: 'A second database',
    setup: E.parallelBefore,
    act: { set: { db: 2 }, run: 'year' },
    ask: 'A load balancer, an app server and a database, one copy of each, and each down {dbDown} a year; recommendations are optional now. Give the database a second copy that fails independently of the first, and say traffic moves to it at once. How long is the database part down a year now?',
    choices: [
      { text: '{pair}: only while both are down at once', value: 'pair' },
      { text: '{tenth}: a tenth, a copy buys one more nine', value: 'tenth' },
      { text: '{halved}: half, two copies share the failures', value: 'halved' },
    ],
    truth: 'pair',
    reveal:
      '{pair}: the part is down only while both copies are down at once. Each is down {u} of the time, so both are down {u} of {u}: {pairAvail} available, {pair} a year against {dbDown}. Unavailabilities multiply, so each independent copy adds {nines} nines. The request is still down {reqAfter} a year, because the two parts left with one copy now set it. And {pair} is the ceiling of the arithmetic, not a forecast: it holds only if the copies never fail together and traffic moves instantly.',
    focus: ['timeline', 'ruler'],
    hide: ['after'],
    slots: () => {
      const a = run(E.parallelBefore);
      const b = run(E.parallelAfter);
      return {
        dbDown: down(partOf(a, 'db').downH),
        halved: down(partOf(a, 'db').downH / 2),
        tenth: down(partOf(a, 'db').downH / 10),
        pair: down(partOf(b, 'db').downH),
        u: pct(COPY_UNAVAILABILITY * 100),
        pairAvail: avail(partOf(b, 'db').u),
        nines: num(Math.round(ninesOf(COPY_UNAVAILABILITY))),
        reqAfter: down(b.downH),
      };
    },
  },
  {
    id: 'weakest',
    title: 'One more app server',
    setup: E.weakestBefore,
    act: { set: { app: 3 }, run: 'year' },
    ask: 'The request passes {lb} load balancers, {app} app servers and {db} database, every copy {each} available; recommendations are optional. It is down {before} a year. Add a third app server. How long is the request down a year now?',
    choices: [
      { text: '{halved}: half, as three app servers never fail together', value: 'halved' },
      { text: '{third}: a third less, as each server now carries a third of the traffic', value: 'third' },
      { text: '{after}: unchanged, the app servers were never the limit', value: 'after' },
    ],
    truth: 'after',
    reveal:
      '{after}, unchanged: the request is down because of the database, a single copy down {dbDown} a year. The app servers were down together only {appBefore} a year as a pair, and {appAfter} as three. Polishing a strong part buys nothing you can measure: the weakest link caps the chain, so find the single point of failure before adding copies anywhere else.',
    focus: ['ruler', 'chain'],
    // `sample` too: the year's request row is the database's strip, which names the weakest link.
    hide: ['sample', 'weakest', 'after'],
    slots: () => {
      const a = run(E.weakestBefore);
      const b = run(E.weakestAfter);
      return {
        lb: num(a.settings.lb),
        app: num(a.settings.app),
        db: num(a.settings.db),
        each: avail(COPY_UNAVAILABILITY),
        before: down(a.downH),
        after: down(b.downH),
        third: down((a.downH * 2) / 3),
        halved: down(a.downH / 2),
        dbDown: down(partOf(b, 'db').downH),
        appBefore: down(partOf(a, 'app').downH),
        appAfter: down(partOf(b, 'app').downH),
      };
    },
  },
  {
    id: 'shared',
    title: 'Failures the copies share',
    setup: E.pairs,
    act: { set: { shared: 1 }, run: 'year' },
    ask: 'Two copies of every part the request needs: on paper it is down only {paper} a year. Now say {share} of a copy’s outages come from something its twin shares, such as the zone both run in or a bad deploy that reaches both. How long is the request down a year now?',
    choices: [
      { text: '{tenthMore}: a tenth more than on paper', value: 'tenthMore' },
      { text: '{real}: about {ratio} what the paper says', value: 'real' },
      { text: '{singles}: as much as with one copy of each', value: 'singles' },
    ],
    truth: 'real',
    reveal:
      '{real}, about {ratio} the paper’s {paper}. A second copy removes only the outages that are a copy’s own. A shared one takes both copies down together, so it passes straight through: {sharedDown} a year for each part, however many copies it has. With {share} outages shared, copies buy at most one more nine, {capAvail} a part and not {pairAvail}. So spread copies across zones, roll changes out in stages and split users into cells: the fix is fewer shared causes, not more copies.',
    focus: ['timeline', 'ruler'],
    hide: ['after'],
    slots: () => {
      const a = run(E.pairs);
      const b = run(E.sharedAfter);
      const singles = run({ ...E.pairs, lb: 1, app: 1, db: 1 });
      return {
        paper: down(a.downH),
        share: oneIn(SHARED_SHARE),
        tenthMore: down(a.downH * (1 + SHARED_SHARE)),
        real: down(b.downH),
        ratio: times(Math.round(b.u / a.u / 10) * 10),
        singles: down(singles.downH),
        sharedDown: down(hoursAYear(partOf(b, 'db').causes.shared)),
        capAvail: avail(partOf(b, 'db').causes.shared),
        pairAvail: avail(partOf(a, 'db').u),
      };
    },
  },
  {
    id: 'failover',
    title: 'Failover takes time',
    setup: E.pairs,
    act: { set: { failover: 1 }, run: 'year' },
    ask: 'Two copies of every part the request needs, failing independently: each part sends all its traffic to one copy and keeps the other as a standby. On paper the request fails only when both copies of a part are down at once, about once in {paperYears} years. But moving traffic off a dead copy takes {fo}: health checks must notice, then the switch happens. About how many times a year does the request fail now?',
    choices: [
      { text: 'About {real} times: at every failure of a copy in use', value: 'real' },
      { text: 'About {either} times: at every failure of either copy', value: 'either' },
      { text: 'Still about once in {paperYears} years: the standby was ready', value: 'never' },
    ],
    truth: 'real',
    reveal:
      'About {real} times a year, {fo} each: {foDown} a year instead of {paper}. Redundancy does not remove a copy’s failures, it shortens them: each of the {perCopy} outages a year of the copy in use now ends when traffic has moved, after {fo}, not when the repair is done, after {mttr}. Availability is MTBF / (MTBF + MTTR), and a standby turns the time to recover from the repair time into the failover time. Four nines a part is {fourNines} a year; with {perCopy} failures that leaves about {perFail} for each, so detection and the switch must be automatic, and rehearsed.',
    focus: ['timeline', 'chain'],
    hide: ['after'],
    slots: () => {
      const a = run(E.pairs);
      const b = run(E.failoverAfter);
      return {
        paperYears: num(Math.round(1 / a.failsPerYear)),
        fo: down(FAILOVER_H),
        real: num(Math.round(b.failsPerYear)),
        either: num(Math.round(2 * RELIABILITY_PARTS.filter((p) => !partOf(b, p.id).optional).length * COPY_FAILS_PER_YEAR)),
        never: num(Number(a.failsPerYear.toFixed(2))),
        foDown: down(b.downH),
        paper: down(a.downH),
        perCopy: num(Number(partOf(b, 'db').ownPerYear.toFixed(2))),
        mttr: hours(COPY_MTTR_H),
        fourNines: down(hoursAYear(1e-4)),
        perFail: down(hoursAYear(1e-4) / partOf(b, 'db').ownPerYear),
      };
    },
  },
  {
    id: 'add-a-nine',
    title: 'Three nines from seven copies',
    setup: E.challenge,
    ask: 'This design has shared failures and a {fo} failover, as real ones do, and the request is down {start} a year. Promise three nines: bring it under {target} a year, {targetAvail}, with no more than the {copies} copies it runs now.',
    goal: RELIABILITY_CHALLENGE_GOAL,
    reveal:
      'Run {lb} load balancers, {app} app servers and {db} databases, with recommendations optional: down {down} a year, {avail}. Moving one app server to the database removes the single point of failure, and making recommendations optional takes a whole part out of the chain; the third app server was buying nothing. The {down} left are shared outages and failovers, which no further copy removes: the next nine comes from fewer shared causes and a faster switch. That leaves {budget} of the {target} error budget for a bad year and risky deploys: promise below what you expect.',
    focus: ['ruler', 'chain'],
    hide: [],
    slots: () => {
      const a = run(E.challenge);
      const b = run({ ...E.challenge, ...RELIABILITY_CHALLENGE_SOLUTION });
      return {
        fo: down(FAILOVER_H),
        start: down(a.downH),
        target: hours(RELIABILITY_CHALLENGE_BOUNDS.down),
        targetAvail: avail(COPY_UNAVAILABILITY),
        copies: num(a.copies),
        lb: num(b.settings.lb),
        app: num(b.settings.app),
        db: num(b.settings.db),
        down: down(b.downH),
        avail: avail(b.u),
        budget: down(RELIABILITY_CHALLENGE_BOUNDS.down - b.downH),
      };
    },
  },
];
