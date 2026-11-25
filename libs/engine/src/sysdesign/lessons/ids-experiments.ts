import { slotOf, word, type ExperimentGoal, type ExperimentSpec } from './experiments.js';
import { NUMBER_WORDS, opening } from './widgets/ids-format.js';
import {
  ID_BASELINE,
  ID_BURST,
  ID_BURST_AT_US,
  ID_FAULT,
  ID_LOAD,
  ID_SKEW_US,
  ID_STEP_AT_US,
  ID_STEP_US,
  birthdayChance,
  idLayout,
  idMint,
  type IdSettings,
} from './widgets/ids.js';

const num = slotOf('num');
const ms = slotOf('ms');
const pct = slotOf('pct');
const years = slotOf('years');
const date = slotOf('date');
const pow2 = slotOf('pow2');
const chance = slotOf('chance');
const sci = slotOf('sci');
const big = slotOf('idCountWords');
const us = (v: number) => ms(v / 1000);

/**
 * E2's setup is the lesson's worked-example layout, not the challenge's answer; E3 asks under clock skew, which the
 * rest view does not settle; no setup or act passes the challenge.
 */
export const ID_SETUP = {
  lifetime: { ...ID_BASELINE },
  burst: { ...ID_BASELINE, gen: 12, seq: 10 },
  order: { ...ID_BASELINE, fault: ID_FAULT.skew },
  clock: { ...ID_BASELINE, guard: 0 },
  random: { ...ID_BASELINE, bits: 122, count: 9 },
  challenge: { ...ID_BASELINE },
} as const satisfies Record<string, IdSettings>;

export const ID_CHALLENGE_BOUNDS = { generators: 1000, perSecond: 1_000_000, yearsLeft: 200 } as const;
export const ID_CHALLENGE_GOAL: ExperimentGoal = {
  all: [
    { metric: 'generators', atLeast: ID_CHALLENGE_BOUNDS.generators },
    { metric: 'perSecond', atLeast: ID_CHALLENGE_BOUNDS.perSecond },
    { metric: 'yearsLeft', atLeast: ID_CHALLENGE_BOUNDS.yearsLeft },
  ],
};
/** The one layout of the 578 the steppers and the tick reach that meets the challenge, on either epoch. */
export const ID_CHALLENGE_SOLUTION = { gen: 10, seq: 10, tick: 1 } as const;
/** The two ids E3 asks about: G2's made at 3.7 ms and G1's at 4.4 ms. */
export const ID_ORDER_PAIR = { g2At: 3700, g1At: 4400 } as const;

export const ID_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'one-bit',
    title: 'One bit for the generators',
    setup: ID_SETUP.lifetime,
    act: { set: { gen: 11 } },
    ask: "Snowflake's timestamp has {timeBits} bits of {tick} ticks and lasts {before}. Move one bit from it to the generators, for {gens} generators. How long does the timestamp last now?",
    choices: [
      { text: 'About {double}', value: 'double' },
      { text: 'About {lessOne}: one year less', value: 'lessOne' },
      { text: 'About {after}', value: 'after' },
    ],
    truth: 'after',
    reveal:
      'The timestamp now holds {pow} ticks, and {pow} × {tick} is {after}, ending on {endAfter} instead of {endBefore}. A bit is a doubling, so every bit moved out of the timestamp halves its lifetime, and every bit moved in doubles it: on the ruler the marker steps one bit left of its ghost.',
    focus: ['ledgerTime'],
    hide: ['lifetime'],
    slots: () => {
      const a = idLayout(ID_SETUP.lifetime);
      const b = idLayout({ ...ID_SETUP.lifetime, gen: 11 });
      return {
        timeBits: num(a.timeBits),
        tick: ms(a.tick),
        before: years(a.years),
        gens: num(b.generators),
        double: years(a.years * 2),
        lessOne: years(a.years - 1),
        after: years(b.years),
        pow: pow2(b.timeBits),
        endAfter: date(b.endMs),
        endBefore: date(a.endMs),
      };
    },
  },
  {
    id: 'burst',
    title: 'A burst in one tick',
    setup: ID_SETUP.burst,
    act: { set: { load: ID_LOAD.burst }, run: 'mint' },
    ask: 'With {seqBits} sequence bits a generator has {perTick} sequence numbers a tick. G0 gets {burst} requests at {at}. How long does the last of them wait for its id?',
    choices: [
      { text: 'About {waitRound}, {fullWord} ticks later', value: 'waitRound' },
      { text: 'None: they all fit in that tick', value: 'none' },
      { text: 'About {oneTick}, until the next tick', value: 'oneTick' },
    ],
    truth: 'waitRound',
    reveal:
      'Each tick gives G0 only {perTick} ids, so the {burst} requests take {ticks} ticks: {fullWord} full gauges, then {lastCount} ids in the last, and the last request waits {wait}. The generator never repeats a sequence number; it waits for the clock. The other generators are not slowed at all.',
    focus: ['laneG0'],
    hide: ['burstAfter'],
    slots: () => {
      const m = idMint({ ...ID_SETUP.burst, load: ID_LOAD.burst });
      const L = m.layout;
      const last = m.lastBurst!;
      return {
        seqBits: num(L.seqBits),
        perTick: num(L.perTick),
        burst: num(ID_BURST),
        at: us(ID_BURST_AT_US),
        waitRound: ms(Math.round(last.wait / 1000)),
        fullWord: word(NUMBER_WORDS[Math.floor(ID_BURST / L.perTick)].toLowerCase()),
        none: ms(0),
        oneTick: ms(L.tick),
        ticks: num(Math.ceil(ID_BURST / L.perTick)),
        lastCount: num(ID_BURST % L.perTick),
        wait: us(last.wait),
      };
    },
  },
  {
    id: 'order',
    title: 'Which id sorts first',
    setup: ID_SETUP.order,
    act: { run: 'mint' },
    ask: "G2's clock runs {skew} ahead. G2 makes an id at {g2At} and G1 makes one at {g1At}, by true time. Which id is smaller, so it sorts first?",
    choices: [
      { text: "G2's: it was made first", value: 'g2' },
      { text: "G1's: its timestamp is lower", value: 'g1' },
      { text: 'Whichever has the lower sequence number', value: 'seq' },
    ],
    truth: 'first',
    reveal:
      "G2's clock read {g2Clock} when it made its id, so its timestamp is the tick at {g2Tick}; G1's id carries the tick at {g1Tick}. The timestamp is the high bits, so G1's id sorts first although it was made {later} later. Each generator stamps ids with its own clock, so across machines ids are only as time-ordered as their clocks agree.",
    focus: ['sorted'],
    hide: ['order', 'inspect'],
    slots: () => {
      const m = idMint(ID_SETUP.order);
      const g2 = m.lanes[2].ids.find((x) => x.issued === ID_ORDER_PAIR.g2At)!;
      const g1 = m.lanes[1].ids.find((x) => x.issued === ID_ORDER_PAIR.g1At)!;
      const first = g1.rank < g2.rank ? g1 : g2;
      return {
        skew: us(ID_SKEW_US),
        g2At: us(g2.issued),
        g1At: us(g1.issued),
        g2: num(2),
        g1: num(1),
        seq: num(-1),
        first: num(first.lane),
        g2Clock: us(g2.clock),
        g2Tick: ms(g2.tick * m.layout.tick),
        g1Tick: ms(g1.tick * m.layout.tick),
        later: us(g1.issued - g2.issued),
      };
    },
  },
  {
    id: 'clock-back',
    title: 'The clock steps back',
    setup: ID_SETUP.clock,
    act: { set: { fault: ID_FAULT.stepBack }, run: 'mint' },
    ask: 'G1 trusts its clock: it does not keep its last timestamp. At {stepAt} its clock steps back {step}. What happens to the ids it makes after that?',
    choices: [
      { text: 'Some repeat ids it already made', value: 'repeat' },
      { text: 'They sort before its earlier ids, but none repeats', value: 'early' },
      { text: 'Nothing goes wrong: the sequence keeps them apart', value: 'none' },
    ],
    truth: 'outcome',
    reveal:
      '{twice} made twice: after the step G1\'s clock reads ticks it has used, and its sequence starts again at {zero}, so it makes the same timestamp, number and sequence as before. Turn on "Keep the last timestamp" and G1 waits {gWait} for its clock to pass the last timestamp it used, and none repeats.',
    focus: ['laneG1', 'sorted'],
    hide: ['repeats'],
    slots: () => {
      const m = idMint({ ...ID_SETUP.clock, fault: ID_FAULT.stepBack });
      const guarded = idMint({ ...ID_SETUP.clock, fault: ID_FAULT.stepBack, guard: 1 });
      const w = guarded.lanes[1].ids.find((x) => x.wait > 0 && x.issued > ID_STEP_AT_US)!;
      return {
        stepAt: us(ID_STEP_AT_US),
        step: us(ID_STEP_US),
        repeat: word('repeat'),
        early: word('early'),
        none: word('none'),
        outcome: word(m.repeats.length ? 'repeat' : 'early'),
        twice: word(opening(m.repeats.length, 'id is', 'ids are')),
        gWait: us(w.wait),
        zero: num(0),
      };
    },
  },
  {
    id: 'birthday',
    title: 'A billion random ids',
    setup: ID_SETUP.random,
    act: { set: { bits: 64 } },
    ask: 'A billion ids, each {bits} random bits: {space} values, about {spaceWords} billion billion. What is the chance that any two are equal?',
    choices: [
      { text: 'About 1 in {oneIn}', value: 'perId' },
      { text: 'About {half}', value: 'half' },
      { text: 'About {p64pct}', value: 'p64pct' },
    ],
    truth: 'p64pct',
    reveal:
      "By the birthday bound the chance is {p64}: every pair of ids is a chance to collide, and a billion ids make about {pairs} pairs. One new id against the rest is the 1 in {oneIn}. At {uuid} bits, a UUIDv4's, the same billion gives {p122}.",
    focus: ['chart'],
    hide: ['chance'],
    slots: () => {
      const n = 1e9;
      const p64 = birthdayChance(64, n);
      return {
        bits: num(64),
        space: pow2(64),
        spaceWords: num(Math.round(2 ** 64 / 1e18)),
        oneIn: big(2 ** 64 / n),
        perId: pct((n / 2 ** 64) * 100),
        half: pct(50),
        p64pct: pct(p64 * 100),
        p64: chance(p64),
        pairs: sci((n * n) / 2),
        uuid: num(122),
        p122: chance(birthdayChance(122, n)),
      };
    },
  },
  {
    id: 'size-layout',
    title: 'Challenge: size the layout',
    setup: ID_SETUP.challenge,
    goal: ID_CHALLENGE_GOAL,
    ask: 'Design the layout for up to {gens} generators, each able to make {rate} ids a second on its own, lasting at least {need} years from today.',
    reveal:
      '{gBits} generator bits and {sBits} sequence bits at a {tick} tick: {gensGot} generators, {perSec} ids a second each, and {tBits} timestamp bits that last {life}, {left} of them from today. One generator bit fewer leaves {fewer} generators, one sequence bit fewer {slower} ids a second, and one more bit for either halves the timestamp to {half}, short of {need} years.',
    focus: [],
    hide: [],
    slots: () => {
      const s = { ...ID_SETUP.challenge, ...ID_CHALLENGE_SOLUTION };
      const L = idLayout(s);
      return {
        gens: num(ID_CHALLENGE_BOUNDS.generators),
        rate: num(ID_CHALLENGE_BOUNDS.perSecond),
        need: num(ID_CHALLENGE_BOUNDS.yearsLeft),
        gBits: num(L.genBits),
        sBits: num(L.seqBits),
        tick: ms(L.tick),
        gensGot: num(L.generators),
        perSec: num(L.perSecond),
        tBits: num(L.timeBits),
        life: years(L.years),
        left: years(L.yearsLeft),
        fewer: num(L.generators / 2),
        slower: num(L.perSecond / 2),
        half: years(L.years / 2),
      };
    },
  },
];
