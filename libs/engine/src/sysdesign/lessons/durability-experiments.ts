import { slotOf, word, type ExperimentGoal, type ExperimentSpec } from './experiments.js';
import {
  DURABILITY_BASELINE,
  DURABILITY_DATA_TB,
  DURABILITY_DISK_TB,
  DURABILITY_RACK_EVENT,
  durabilityScenario,
  durabilityTwoInOneRack,
  type DurabilitySettings,
} from './widgets/durability.js';

const pct = slotOf('pct');
const hours = slotOf('hours');
const num = slotOf('num');
const nines = slotOf('ninesCount');
const chance = slotOf('chance');
const ratio = slotOf('ratio');
const overhead = slotOf('overhead');
const perYear = slotOf('perYear');
const tb = slotOf('tb');
const gbps = slotOf('gbps');
const billion = slotOf('billion');
const big = slotOf('big');

/** Every question starts from three copies at 2% and 24 h but E4, which starts from 10 + 4; the challenge at 5%. */
export const DURABILITY_SETUP = {
  copies: { ...DURABILITY_BASELINE },
  wide: { ...DURABILITY_BASELINE, scheme: 3 },
  challenge: { ...DURABILITY_BASELINE, afr: 5 },
} as const satisfies Record<string, DurabilitySettings>;

export const DURABILITY_CHALLENGE_BOUNDS = { perBillion: 0.1, overhead: 1.6, rebuildGbps: 10 } as const;
export const DURABILITY_CHALLENGE_GOAL: ExperimentGoal = {
  all: [
    { metric: 'perBillion', below: DURABILITY_CHALLENGE_BOUNDS.perBillion },
    { metric: 'overhead', below: DURABILITY_CHALLENGE_BOUNDS.overhead },
    { metric: 'rebuildGbps', below: DURABILITY_CHALLENGE_BOUNDS.rebuildGbps },
  ],
  keep: { afr: 5 },
};
/** The one setting of the 160 that meets the challenge (the spec enumerates them). */
export const DURABILITY_CHALLENGE_SOLUTION: Readonly<DurabilitySettings> = { scheme: 3, afr: 5, repair: 72, rack: 0 };
/** The storage bound as the ask says it: at most 1.5×, which the goal holds as under 1.6×. */
export const DURABILITY_CHALLENGE_STORED = 1.5;

const run = (s: DurabilitySettings) => durabilityScenario(s);
const ninesOf = (loss: number) => -Math.log10(loss);
const WEEK = 168;

export const DURABILITY_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'half',
    title: 'Half the storage',
    setup: DURABILITY_SETUP.copies,
    act: { set: { scheme: 2 }, run: 'repair' },
    ask: 'Three copies on separate disks store {ohBefore} and survive any {tBefore} lost copies; with disks failing at {afr} a year and {win} repairs the model gives {ninesBefore} nines. Switch to 6 + 3 erasure coding: {k} data pieces and {m} parity pieces, any 6 of which rebuild the object, stored at {ohAfter}, half as much. How likely is a loss in a year now?',
    choices: [
      { text: 'About {pInv} less likely: one more failure must land inside the window', value: 'pInv' },
      { text: 'About {ratio} less likely: a loss now needs {tAfter} more failures inside one repair, not {tBefore}', value: 'ratio' },
      { text: 'About as likely: {extra} more disks to fail cancel the one extra failure it survives', value: 'same' },
      { text: 'About {more} likelier: {nAfter} disks see {more} as many first failures as {nBefore}', value: 'more' },
    ],
    truth: 'ratio',
    reveal:
      'About {ratio} less likely: {ninesAfter} nines against {ninesBefore}. Nine disks do see {more} as many first failures, {firstAfter} against {firstBefore}, and any {tAfter} of the 8 others can finish the job, {ways} ways. But a loss now needs {tAfter} more failures inside one {win} repair instead of {tBefore}, and each is a {p} chance: one more such factor outweighs {more} and {ways}. Half the storage buys two more nines; the price moves to the repair, which now reads {readAfter} pieces instead of {readBefore}.',
    focus: ['steps', 'pieces'],
    hide: ['after'],
    slots: () => {
      const a = run(DURABILITY_SETUP.copies);
      const b = run({ ...DURABILITY_SETUP.copies, scheme: 2 });
      return {
        ohBefore: overhead(a.overhead),
        ohAfter: overhead(b.overhead),
        tBefore: num(a.t),
        tAfter: num(b.t),
        k: num(b.need),
        m: num(b.t),
        nBefore: num(a.n),
        nAfter: num(b.n),
        afr: pct(DURABILITY_SETUP.copies.afr),
        win: hours(DURABILITY_SETUP.copies.repair),
        ninesBefore: nines(a.nines),
        ninesAfter: nines(b.nines),
        ratio: ratio(a.loss / b.loss),
        pInv: ratio(1 / b.p),
        extra: num(b.n - a.n),
        same: word('same'),
        more: ratio(b.first / a.first),
        firstBefore: perYear(a.first),
        firstAfter: perYear(b.first),
        ways: num(b.ways),
        p: chance(b.p),
        readAfter: num(b.repairRead),
        readBefore: num(a.repairRead),
      };
    },
  },
  {
    id: 'window',
    title: 'A week to repair',
    setup: DURABILITY_SETUP.copies,
    act: { set: { repair: WEEK }, run: 'repair' },
    ask: 'Three copies at {afr} a year, each lost copy rebuilt in {before}: {ninesBefore} nines. A busy cluster throttles its repairs, and each now takes a week, {after}, {k} longer. How much likelier is a loss in a year?',
    choices: [
      { text: '{k} likelier: the danger lasts {k} as long', value: 'k' },
      { text: '{k2} likelier: both other copies must fail inside the longer window', value: 'k2' },
      { text: '{k3} likelier: all three copies spend {k} as long in the window', value: 'k3' },
    ],
    truth: 'ratio',
    reveal:
      '{ratio} likelier: {ninesAfter} nines against {ninesBefore}. A loss needs both other copies to fail before the repair ends, and each one’s chance of failing inside the window grows with the window, from {pBefore} to {pAfter}. Two such chances multiply: {kn} × {kn} is {k2n}. The window enters the loss once for every failure the scheme tolerates, which is why systems rebuild from many disks in parallel, repair the objects with the fewest pieces left first, and keep throttled repairs within a bound. The window runs from the failure to full redundancy: a slow failure detector lengthens it just as a slow rebuild does.',
    focus: ['steps', 'race'],
    hide: ['steps', 'after'],
    slots: () => {
      const a = run(DURABILITY_SETUP.copies);
      const b = run({ ...DURABILITY_SETUP.copies, repair: WEEK });
      const k = WEEK / DURABILITY_SETUP.copies.repair;
      return {
        afr: pct(DURABILITY_SETUP.copies.afr),
        before: hours(DURABILITY_SETUP.copies.repair),
        after: hours(WEEK),
        ninesBefore: nines(a.nines),
        ninesAfter: nines(b.nines),
        k: ratio(k),
        k2: ratio(k * k),
        k3: ratio(k ** 3),
        kn: num(k),
        k2n: num(k * k),
        ratio: ratio(b.loss / a.loss),
        pBefore: chance(a.p),
        pAfter: chance(b.p),
      };
    },
  },
  {
    id: 'reads',
    title: 'The repair bill',
    setup: DURABILITY_SETUP.copies,
    act: { set: { scheme: 3 }, run: 'repair' },
    ask: 'A {disk} disk fails. Under three copies its rebuild reads {readBefore}: each lost copy is copied from a surviving one. Switch to 10 + 4 erasure coding, which stores {ohAfter}: any 10 of its 14 pieces rebuild the object. How much does rebuilding the same {disk} disk read now?',
    choices: [
      { text: '{readBefore}: one piece rebuilds one piece', value: 'readBefore' },
      { text: '{asStored}: {ohAfter} the disk, like its storage', value: 'asStored' },
      { text: '{readAfter}: {k} pieces for every lost one', value: 'readAfter' },
      { text: '{readAll}: every one of the {left} survivors is read', value: 'readAll' },
    ],
    truth: 'readAfter',
    reveal:
      '{readAfter}: a lost piece is decoded, not copied, and decoding takes any 10 of the 13 pieces left. So a 10 + 4 rebuild reads {kAfter} the lost data, and finishing it in {win} takes {gbpsAfter} of reads against {gbpsBefore} for copies. That is the price of {ohAfter} storage: repair traffic, and slower reads of a missing piece. Locally repairable codes cut it: Azure’s code splits 12 data pieces into two groups of 6, each with a local parity, and rebuilds a lost data piece from the 6 of its group.',
    focus: ['pieces', 'race'],
    hide: ['after', 'reads'],
    slots: () => {
      const a = run(DURABILITY_SETUP.copies);
      const b = run({ ...DURABILITY_SETUP.copies, scheme: 3 });
      return {
        disk: tb(DURABILITY_DISK_TB),
        readBefore: tb(a.rebuildTB),
        readAfter: tb(b.rebuildTB),
        asStored: tb(DURABILITY_DISK_TB * b.overhead),
        readAll: tb(DURABILITY_DISK_TB * (b.n - 1)),
        left: num(b.n - 1),
        ohAfter: overhead(b.overhead),
        k: num(b.repairRead),
        kAfter: ratio(b.repairRead),
        win: hours(DURABILITY_SETUP.copies.repair),
        gbpsAfter: gbps(b.rebuildGbps),
        gbpsBefore: gbps(a.rebuildGbps),
      };
    },
  },
  {
    id: 'batch',
    title: 'A bad batch',
    setup: DURABILITY_SETUP.wide,
    act: { set: { afr: 10, repair: WEEK }, run: 'repair' },
    ask: '10 + 4 erasure coding at {afrBefore} a year with {winBefore} repairs: {ninesBefore} nines. Then a bad batch of disks starts failing at {afrAfter} a year, {fa} more, and the strained cluster takes a week, {winAfter}, to rebuild each one, {fw} longer. How many nines are left?',
    choices: [
      { text: '{linear}: a loss is {linRatio} likelier, {fa} the failures in a {fw} longer window', value: 'linear' },
      { text: '{squared}: about {sqRatio} likelier, as if two failures had to line up', value: 'squared' },
      { text: '{after}: the rate and the window count once for every failure a loss needs', value: 'after' },
      { text: '{over}: the rate and the window each count once for all {fails} failures', value: 'over' },
    ],
    truth: 'after',
    reveal:
      '{after} nines: a loss is about {ratio} likelier. The failure rate enters 5 times, once for the first failure and once for each of the {t} more a loss needs, and the window enters {t} times, once for each of those: about {pa} from the rate and {pw} from the window. The more failures a scheme tolerates, the harder a worse failure rate and a slower repair hit it, though it still keeps the most nines: two copies at these settings keep {twoAfter}. Measure failure rates and repair times in production, and re-run the numbers when they move.',
    focus: ['steps', 'headline'],
    hide: ['steps', 'after'],
    slots: () => {
      const a = run(DURABILITY_SETUP.wide);
      const after = { ...DURABILITY_SETUP.wide, afr: 10, repair: WEEK };
      const b = run(after);
      const fa = after.afr / DURABILITY_SETUP.wide.afr;
      const fw = WEEK / DURABILITY_SETUP.wide.repair;
      const lin = fa * fw;
      return {
        afrBefore: pct(DURABILITY_SETUP.wide.afr),
        afrAfter: pct(after.afr),
        winBefore: hours(DURABILITY_SETUP.wide.repair),
        winAfter: hours(WEEK),
        ninesBefore: nines(a.nines),
        fa: ratio(fa),
        fw: ratio(fw),
        linear: nines(ninesOf(a.loss * lin)),
        linRatio: ratio(lin),
        squared: nines(ninesOf(a.loss * lin * lin)),
        sqRatio: ratio(lin * lin),
        after: nines(b.nines),
        over: nines(ninesOf(a.loss * (fa * fw) ** (b.t + 1))),
        fails: num(b.t + 1),
        ratio: ratio(b.loss / a.loss),
        t: num(b.t),
        pa: num(Math.round(fa ** (b.t + 1) / 100) * 100),
        pw: num(Math.round(fw ** b.t / 100) * 100),
        twoAfter: nines(run({ ...after, scheme: 0 }).nines),
      };
    },
  },
  {
    id: 'rack',
    title: 'One rack',
    setup: DURABILITY_SETUP.copies,
    act: { set: { rack: 1 }, run: 'staged' },
    ask: 'Three copies at {afr} and {win}: {ninesBefore} nines, each copy in its own rack. Now put all three in one rack, and say a rack-wide event (a fire, a power fault, a bad firmware push) strikes a rack once in {rackYears} years. How many nines are left?',
    choices: [
      { text: '{after}: one event takes every copy at once', value: 'after' },
      { text: '{two}: the event must still race a repair', value: 'two' },
      { text: '{ninesBefore}: three disks still have to fail', value: 'ninesBefore' },
      { text: '{thrice}: the event can strike through any of the three copies, so it counts three times', value: 'thrice' },
    ],
    truth: 'after',
    reveal:
      '{after} nines: a loss once in {rackYears} years, about {ratio} likelier than at {ninesBefore} nines. A rack event needs no repair window to lose the object: it takes all three copies at once, so no small chance multiplies it down. This is why correlated failures, not independent disks, set real losses. Place pieces so no rack or zone holds more than the scheme can lose: if only two copies shared a rack, an event would leave the third racing its repair, {two} nines; 6 + 3 across 3 zones, 3 pieces each, survives a zone, with no spare until it returns.',
    focus: ['pieces', 'steps'],
    hide: ['after'],
    slots: () => {
      const a = run(DURABILITY_SETUP.copies);
      const b = run({ ...DURABILITY_SETUP.copies, rack: 1 });
      return {
        afr: pct(DURABILITY_SETUP.copies.afr),
        win: hours(DURABILITY_SETUP.copies.repair),
        ninesBefore: nines(a.nines),
        rackYears: num(1 / DURABILITY_RACK_EVENT),
        after: nines(b.nines),
        thrice: nines(ninesOf(3 * DURABILITY_RACK_EVENT)),
        two: nines(ninesOf(durabilityTwoInOneRack(DURABILITY_SETUP.copies))),
        ratio: ratio(b.loss / a.loss),
      };
    },
  },
  {
    id: 'billion',
    title: 'Challenge: a billion objects',
    setup: DURABILITY_SETUP.challenge,
    goal: DURABILITY_CHALLENGE_GOAL,
    ask: 'Your disks fail at {afr} a year. Store a billion objects of 1 MB, {data} in all, and lose fewer than {one} in {margin} years: a {marginX} margin on {one} a year for what the simple model leaves out. Rack failures are met by placement, not by margin, so keep pieces in separate racks. Store at most {oh}, and keep any one disk’s rebuild under {gbps} of reads.',
    reveal:
      '10 + 4 in separate racks, rebuilt in {win}: {nines} nines, {billion} among a billion, at {oh2} storage, {raw} on {disks} disks. That is an average: the billion objects share {disks} disks, so a loss, when it comes, takes about {perLoss} objects at once, about once in {eventYears} years; limiting which disks share objects trades how often for how many. A rebuild reads {read}, {gbps2} spread over {win}. Three copies would store {raw3}; 6 + 3 needs {win63} repairs for the margin, and reading {read63} that fast is {gbps63}; 10 + 4 rebuilt in a week falls to {ninesWeek} nines, {billionWeek} among a billion. The design: a wide erasure code, repairs throttled but bounded, pieces in separate racks, and nines quoted only as the model’s, since correlated failures, bugs and deletes are not in them.',
    focus: ['headline', 'steps'],
    hide: [],
    slots: () => {
      const sol = DURABILITY_CHALLENGE_SOLUTION;
      const m = run(sol);
      const r3 = run({ ...sol, scheme: 1 });
      const e63 = run({ ...sol, scheme: 2, repair: 24 });
      const week = run({ ...sol, repair: WEEK });
      return {
        afr: pct(DURABILITY_SETUP.challenge.afr),
        data: tb(DURABILITY_DATA_TB),
        one: num(1),
        margin: num(1 / DURABILITY_CHALLENGE_BOUNDS.perBillion),
        marginX: ratio(1 / DURABILITY_CHALLENGE_BOUNDS.perBillion),
        oh: overhead(DURABILITY_CHALLENGE_STORED),
        gbps: gbps(DURABILITY_CHALLENGE_BOUNDS.rebuildGbps),
        win: hours(sol.repair),
        nines: nines(m.nines),
        billion: billion(m.perBillion),
        oh2: overhead(m.overhead),
        raw: tb(m.rawTB),
        disks: num(m.disks),
        perLoss: big(m.objectsPerLoss),
        eventYears: big(1 / m.lossEventsYear),
        read: tb(m.rebuildTB),
        gbps2: gbps(m.rebuildGbps),
        raw3: tb(r3.rawTB),
        win63: hours(e63.settings.repair),
        read63: tb(e63.rebuildTB),
        gbps63: gbps(e63.rebuildGbps),
        ninesWeek: nines(week.nines),
        billionWeek: billion(week.perBillion),
      };
    },
  },
];
