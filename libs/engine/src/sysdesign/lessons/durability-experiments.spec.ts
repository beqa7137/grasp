import { describe, expect, it } from 'vitest';
import { DURABILITY_LESSON } from './durability.js';
import {
  DURABILITY_CHALLENGE_GOAL,
  DURABILITY_CHALLENGE_SOLUTION,
  DURABILITY_EXPERIMENTS,
  DURABILITY_SETUP,
} from './durability-experiments.js';
import { goalBounds, goalMet, renderExperiment } from './experiments.js';
import { SD_LESSONS } from './index.js';
import { formatNinesCount } from './widgets/durability-format.js';
import { DURABILITY_BASELINE, DURABILITY_SETTINGS, durabilityScenario, type DurabilitySettings } from './widgets/durability.js';

const shown = Object.fromEntries(DURABILITY_EXPERIMENTS.map((e) => [e.id, renderExperiment(e)]));
const run = (s: DurabilitySettings) => durabilityScenario(s);

/** The brief's wording, every number filled from the model (model.js renders the same strings). */
const EXPECTED: Record<string, { ask: string; choices: string[]; reveal: string }> = {
  half: {
    ask: 'Three copies on separate disks store 3× and survive any 2 lost copies; with disks failing at 2% a year and 24 h repairs the model gives 9.7 nines. Switch to 6 + 3 erasure coding: 6 data pieces and 3 parity pieces, any 6 of which rebuild the object, stored at 1.5×, half as much. How likely is a loss in a year now?',
    choices: [
      'About 18,000× less likely: one more failure must land inside the window',
      'About 110× less likely: a loss now needs 3 more failures inside one repair, not 2',
      'About as likely: 6 more disks to fail cancel the one extra failure it survives',
      'About 3× likelier: 9 disks see 3× as many first failures as 3',
    ],
    reveal:
      'About 110× less likely: 11.8 nines against 9.7. Nine disks do see 3× as many first failures, 0.18 a year against 0.06 a year, and any 3 of the 8 others can finish the job, 56 ways. But a loss now needs 3 more failures inside one 24 h repair instead of 2, and each is a 1 in 18,000 chance: one more such factor outweighs 3× and 56. Half the storage buys two more nines; the price moves to the repair, which now reads 6 pieces instead of 1.',
  },
  window: {
    ask: 'Three copies at 2% a year, each lost copy rebuilt in 24 h: 9.7 nines. A busy cluster throttles its repairs, and each now takes a week, 168 h, 7× longer. How much likelier is a loss in a year?',
    choices: [
      '7× likelier: the danger lasts 7× as long',
      '49× likelier: both other copies must fail inside the longer window',
      '340× likelier: all three copies spend 7× as long in the window',
    ],
    reveal:
      '49× likelier: 8.1 nines against 9.7. A loss needs both other copies to fail before the repair ends, and each one’s chance of failing inside the window grows with the window, from 1 in 18,000 to 1 in 2,600. Two such chances multiply: 7 × 7 is 49. The window enters the loss once for every failure the scheme tolerates, which is why systems rebuild from many disks in parallel, repair the objects with the fewest pieces left first, and keep throttled repairs within a bound. The window runs from the failure to full redundancy: a slow failure detector lengthens it just as a slow rebuild does.',
  },
  reads: {
    ask: 'A 20 TB disk fails. Under three copies its rebuild reads 20 TB: each lost copy is copied from a surviving one. Switch to 10 + 4 erasure coding, which stores 1.4×: any 10 of its 14 pieces rebuild the object. How much does rebuilding the same 20 TB disk read now?',
    choices: [
      '20 TB: one piece rebuilds one piece',
      '28 TB: 1.4× the disk, like its storage',
      '200 TB: 10 pieces for every lost one',
      '260 TB: every one of the 13 survivors is read',
    ],
    reveal:
      '200 TB: a lost piece is decoded, not copied, and decoding takes any 10 of the 13 pieces left. So a 10 + 4 rebuild reads 10× the lost data, and finishing it in 24 h takes 19 Gb/s of reads against 1.9 Gb/s for copies. That is the price of 1.4× storage: repair traffic, and slower reads of a missing piece. Locally repairable codes cut it: Azure’s code splits 12 data pieces into two groups of 6, each with a local parity, and rebuilds a lost data piece from the 6 of its group.',
  },
  batch: {
    ask: '10 + 4 erasure coding at 2% a year with 24 h repairs: 14.7 nines. Then a bad batch of disks starts failing at 10% a year, 5× more, and the strained cluster takes a week, 168 h, to rebuild each one, 7× longer. How many nines are left?',
    choices: [
      '13.2: a loss is 35× likelier, 5× the failures in a 7× longer window',
      '11.7: about 1,200× likelier, as if two failures had to line up',
      '7.9: the rate and the window count once for every failure a loss needs',
      '7.0: the rate and the window each count once for all 5 failures',
    ],
    reveal:
      '7.9 nines: a loss is about 7.4 million times likelier. The failure rate enters 5 times, once for the first failure and once for each of the 4 more a loss needs, and the window enters 4 times, once for each of those: about 3,100 from the rate and 2,400 from the window. The more failures a scheme tolerates, the harder a worse failure rate and a slower repair hit it, though it still keeps the most nines: two copies at these settings keep 3.4. Measure failure rates and repair times in production, and re-run the numbers when they move.',
  },
  rack: {
    ask: 'Three copies at 2% and 24 h: 9.7 nines, each copy in its own rack. Now put all three in one rack, and say a rack-wide event (a fire, a power fault, a bad firmware push) strikes a rack once in 1,000 years. How many nines are left?',
    choices: [
      '3.0: one event takes every copy at once',
      '7.3: the event must still race a repair',
      '9.7: three disks still have to fail',
      '2.5: the event can strike through any of the three copies, so it counts three times',
    ],
    reveal:
      '3.0 nines: a loss once in 1,000 years, about 5.6 million times likelier than at 9.7 nines. A rack event needs no repair window to lose the object: it takes all three copies at once, so no small chance multiplies it down. This is why correlated failures, not independent disks, set real losses. Place pieces so no rack or zone holds more than the scheme can lose: if only two copies shared a rack, an event would leave the third racing its repair, 7.3 nines; 6 + 3 across 3 zones, 3 pieces each, survives a zone, with no spare until it returns.',
  },
  billion: {
    ask: 'Your disks fail at 5% a year. Store a billion objects of 1 MB, 1 PB in all, and lose fewer than 1 in 10 years: a 10× margin on 1 a year for what the simple model leaves out. Rack failures are met by placement, not by margin, so keep pieces in separate racks. Store at most 1.5×, and keep any one disk’s rebuild under 10 Gb/s of reads.',
    choices: [],
    reveal:
      '10 + 4 in separate racks, rebuilt in 72 h: 10.8 nines, 1 every 70 years among a billion, at 1.4× storage, 1.4 PB on 70 disks. That is an average: the billion objects share 70 disks, so a loss, when it comes, takes about 170,000 objects at once, about once in 12 million years; limiting which disks share objects trades how often for how many. A rebuild reads 200 TB, 6.2 Gb/s spread over 72 h. Three copies would store 3 PB; 6 + 3 needs 24 h repairs for the margin, and reading 120 TB that fast is 11 Gb/s; 10 + 4 rebuilt in a week falls to 9.4 nines, 1 every 2 years among a billion. The design: a wide erasure code, repairs throttled but bounded, pieces in separate racks, and nines quoted only as the model’s, since correlated failures, bugs and deletes are not in them.',
  },
};

describe('the Durability experiments', () => {
  it('replace the lesson tryThis, in the order of the interview arc', () => {
    expect(SD_LESSONS['sd-durability'].widget.experiments).toBe(DURABILITY_EXPERIMENTS);
    expect(SD_LESSONS['sd-durability'].widget.tryThis).toBeUndefined();
    expect(DURABILITY_EXPERIMENTS.map((e) => e.id)).toEqual(['half', 'window', 'reads', 'batch', 'rack', 'billion']);
    expect(DURABILITY_EXPERIMENTS.map((e) => e.act)).toEqual([
      { set: { scheme: 2 }, run: 'repair' },
      { set: { repair: 168 }, run: 'repair' },
      { set: { scheme: 3 }, run: 'repair' },
      { set: { afr: 10, repair: 168 }, run: 'repair' },
      { set: { rack: 1 }, run: 'staged' },
      undefined,
    ]);
  });

  it('say what the brief says, with every number from the model', () => {
    for (const e of Object.values(shown)) expect({ ask: e.ask, choices: e.choices, reveal: e.reveal }, e.id).toEqual(EXPECTED[e.id]);
  });

  it('never make the answer the most extreme number offered', () => {
    for (const e of DURABILITY_EXPERIMENTS.filter((x) => !x.goal)) {
      const r = renderExperiment(e);
      const vals = r.choices.map((c) => Number(c.match(/\d[\d.,]*/)![0].replace(/,/g, '')));
      const truth = vals[r.answer];
      expect(Math.min(...vals) < truth && truth < Math.max(...vals), `${e.id}: ${vals.join(' ')}`).toBe(true);
    }
  });

  it('put the answers at 2, 2, 3, 3 and 1', () => {
    expect(DURABILITY_EXPERIMENTS.filter((e) => !e.goal).map((e) => renderExperiment(e).answer + 1)).toEqual([2, 2, 3, 3, 1]);
  });

  it('name every region they hide, and point the reveal at the regions it is about', () => {
    expect(DURABILITY_EXPERIMENTS.map((e) => e.hide ?? [])).toEqual([
      ['after'],
      ['steps', 'after'],
      ['after', 'reads'],
      ['steps', 'after'],
      ['after'],
      [],
    ]);
    expect(DURABILITY_EXPERIMENTS.map((e) => e.focus)).toEqual([
      ['steps', 'pieces'],
      ['steps', 'race'],
      ['pieces', 'race'],
      ['steps', 'headline'],
      ['pieces', 'steps'],
      ['headline', 'steps'],
    ]);
  });

  it('hold the word claims of the reveals to the model', () => {
    const c = DURABILITY_SETUP.copies;
    expect(run({ ...c, repair: 168 }).loss / run(c).loss).toBeCloseTo(49, 0);
    const twoMore = run({ ...c, scheme: 2 }).nines - run(c).nines;
    expect(twoMore).toBeGreaterThan(1.95);
    expect(twoMore).toBeLessThan(2.1);
    const w = DURABILITY_SETUP.wide;
    const e4 = run({ ...w, afr: 10, repair: 168 }).loss / run(w).loss;
    expect(Math.abs(e4 / (5 ** 5 * 7 ** 4) - 1)).toBeLessThan(0.03);
    expect(e4).toBeGreaterThan(1e6);
    expect(run({ ...c, rack: 1 }).loss).toBeCloseTo(0.001, 6);
    expect([run({ ...c, scheme: 3 }).rebuildTB, run(c).rebuildTB]).toEqual([200, 20]);
  });

  it('start every question and the challenge where its own answer is not on the stage', () => {
    for (const e of Object.values(shown)) {
      if (e.goal) continue;
      const setup = run({ ...DURABILITY_BASELINE, ...e.setup } as DurabilitySettings);
      const act = run({ ...DURABILITY_BASELINE, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) } as DurabilitySettings);
      expect(formatNinesCount(setup.nines), e.id).not.toBe(formatNinesCount(act.nines));
    }
  });

  it('meet the challenge at exactly one of the 160 settings, and start it unmet', () => {
    const passing = DURABILITY_SETTINGS.filter((s) => goalMet(DURABILITY_CHALLENGE_GOAL, run(s).metrics, s));
    expect(passing).toEqual([DURABILITY_CHALLENGE_SOLUTION]);
    expect(goalMet(DURABILITY_CHALLENGE_GOAL, run(DURABILITY_SETUP.challenge).metrics, DURABILITY_SETUP.challenge)).toBe(false);
    expect(goalBounds(DURABILITY_CHALLENGE_GOAL).map((b) => b.metric)).toEqual(['perBillion', 'overhead', 'rebuildGbps']);
    // The nearest misses each fail one bound clearly.
    const failing = (s: DurabilitySettings) =>
      goalBounds(DURABILITY_CHALLENGE_GOAL)
        .filter((b) => !goalMet({ ...b }, run(s).metrics, s))
        .map((b) => b.metric);
    expect(failing({ scheme: 2, afr: 5, repair: 24, rack: 0 })).toEqual(['rebuildGbps']);
    expect(failing({ scheme: 3, afr: 5, repair: 168, rack: 0 })).toEqual(['perBillion']);
    expect(failing({ scheme: 3, afr: 5, repair: 24, rack: 0 })).toEqual(['rebuildGbps']);
  });

  it('quote the nines the model gives in the lesson text', () => {
    const text = JSON.stringify(DURABILITY_LESSON);
    const c = DURABILITY_SETUP.copies;
    const w = DURABILITY_SETUP.wide;
    const quoted: [DurabilitySettings, string][] = [
      [c, '9.7'],
      [{ ...c, scheme: 2 }, '11.8'],
      [w, '14.7'],
      [{ ...c, repair: 168 }, '8.1'],
      [{ ...c, repair: 6 }, '10.9'],
      [{ ...c, rack: 1 }, '3'],
    ];
    for (const [s, said] of quoted) {
      expect(Number(formatNinesCount(run(s).nines)), JSON.stringify(s)).toBe(Number(said));
      expect(text).toContain(said);
    }
    expect(text).toContain('three copies in one rack keep 3 nines instead of 9.7');
    expect(text).toContain('a week instead of a day costs three copies about 49 times');
  });
});
