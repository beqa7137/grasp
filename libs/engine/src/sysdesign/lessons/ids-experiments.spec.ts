import { describe, expect, it } from 'vitest';
import { goalMet, renderExperiment } from './experiments.js';
import { IDS_LESSON } from './ids.js';
import { ID_CHALLENGE_SOLUTION, ID_EXPERIMENTS, ID_ORDER_PAIR, ID_SETUP } from './ids-experiments.js';
import { SD_LESSONS } from './index.js';
import { ID_BASELINE, ID_LAYOUTS, idMetrics, idMint, type IdSettings } from './widgets/ids.js';

const shown = Object.fromEntries(ID_EXPERIMENTS.map((e) => [e.id, renderExperiment(e)]));
const actOf = (id: string): IdSettings => {
  const e = shown[id];
  return { ...ID_BASELINE, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) } as IdSettings;
};

/** The brief's wording (and enum.cjs's print), every number filled from the model. */
const EXPECTED: Record<string, { ask: string; choices: string[]; reveal: string }> = {
  'one-bit': {
    ask: "Snowflake's timestamp has 41 bits of 1 ms ticks and lasts 69.7 years. Move one bit from it to the generators, for 2,048 generators. How long does the timestamp last now?",
    choices: ['About 139.4 years', 'About 68.7 years: one year less', 'About 34.8 years'],
    reveal:
      'The timestamp now holds 2⁴⁰ ticks, and 2⁴⁰ × 1 ms is 34.8 years, ending on 3 November 2060 instead of 7 September 2095. A bit is a doubling, so every bit moved out of the timestamp halves its lifetime, and every bit moved in doubles it: on the ruler the marker steps one bit left of its ghost.',
  },
  burst: {
    ask: 'With 10 sequence bits a generator has 1,024 sequence numbers a tick. G0 gets 5,000 requests at 0.05 ms. How long does the last of them wait for its id?',
    choices: ['About 4 ms, four ticks later', 'None: they all fit in that tick', 'About 1 ms, until the next tick'],
    reveal:
      'Each tick gives G0 only 1,024 ids, so the 5,000 requests take 5 ticks: four full gauges, then 904 ids in the last, and the last request waits 3.95 ms. The generator never repeats a sequence number; it waits for the clock. The other generators are not slowed at all.',
  },
  order: {
    ask: "G2's clock runs 2 ms ahead. G2 makes an id at 3.7 ms and G1 makes one at 4.4 ms, by true time. Which id is smaller, so it sorts first?",
    choices: ["G2's: it was made first", "G1's: its timestamp is lower", 'Whichever has the lower sequence number'],
    reveal:
      "G2's clock read 5.7 ms when it made its id, so its timestamp is the tick at 5 ms; G1's id carries the tick at 4 ms. The timestamp is the high bits, so G1's id sorts first although it was made 0.7 ms later. Each generator stamps ids with its own clock, so across machines ids are only as time-ordered as their clocks agree.",
  },
  'clock-back': {
    ask: 'G1 trusts its clock: it does not keep its last timestamp. At 5.5 ms its clock steps back 2 ms. What happens to the ids it makes after that?',
    choices: [
      'Some repeat ids it already made',
      'They sort before its earlier ids, but none repeats',
      'Nothing goes wrong: the sequence keeps them apart',
    ],
    reveal:
      'Two ids are made twice: after the step G1\'s clock reads ticks it has used, and its sequence starts again at 0, so it makes the same timestamp, number and sequence as before. Turn on "Keep the last timestamp" and G1 waits 0.7 ms for its clock to pass the last timestamp it used, and none repeats.',
  },
  birthday: {
    ask: 'A billion ids, each 64 random bits: 2⁶⁴ values, about 18 billion billion. What is the chance that any two are equal?',
    choices: ['About 1 in 18.4 billion', 'About 50%', 'About 2.7%'],
    reveal:
      "By the birthday bound the chance is about 2.7%: every pair of ids is a chance to collide, and a billion ids make about 5.0 × 10¹⁷ pairs. One new id against the rest is the 1 in 18.4 billion. At 122 bits, a UUIDv4's, the same billion gives about 9.4 × 10⁻²⁰.",
  },
  'size-layout': {
    ask: 'Design the layout for up to 1,000 generators, each able to make 1,000,000 ids a second on its own, lasting at least 200 years from today.',
    choices: [],
    reveal:
      '10 generator bits and 10 sequence bits at a 1 ms tick: 1,024 generators, 1,024,000 ids a second each, and 43 timestamp bits that last 278.7 years, 277.8 years of them from today. One generator bit fewer leaves 512 generators, one sequence bit fewer 512,000 ids a second, and one more bit for either halves the timestamp to 139.4 years, short of 200 years.',
  },
};

describe('the Unique IDs experiments', () => {
  it('replace the lesson tryThis', () => {
    expect(SD_LESSONS['sd-ids'].widget.experiments).toBe(ID_EXPERIMENTS);
    expect(SD_LESSONS['sd-ids'].widget.tryThis).toBeUndefined();
    expect(ID_EXPERIMENTS.map((e) => e.act)).toEqual([
      { set: { gen: 11 } },
      { set: { load: 1 }, run: 'mint' },
      { run: 'mint' },
      { set: { fault: 2 }, run: 'mint' },
      { set: { bits: 64 } },
      undefined,
    ]);
  });

  it('say what the brief says, with every number from the model', () => {
    for (const e of Object.values(shown)) expect({ ask: e.ask, choices: e.choices, reveal: e.reveal }, e.id).toEqual(EXPECTED[e.id]);
  });

  it('put the answers at 3, 1, 2, 1 and 3, with choices within 2.6 times of each other in length', () => {
    const qs = ID_EXPERIMENTS.filter((e) => !e.goal).map(renderExperiment);
    expect(qs.map((e) => e.answer + 1)).toEqual([3, 1, 2, 1, 3]);
    for (const e of qs) {
      const lens = e.choices.map((c) => c.length);
      expect(Math.max(...lens) / Math.min(...lens), e.id).toBeLessThanOrEqual(2.6);
    }
  });

  it('name what they hide and where their reveal points', () => {
    expect(ID_EXPERIMENTS.map((e) => e.hide ?? [])).toEqual([
      ['lifetime'],
      ['burstAfter'],
      ['order', 'inspect'],
      ['repeats'],
      ['chance'],
      [],
    ]);
    expect(ID_EXPERIMENTS.map((e) => e.focus)).toEqual([['ledgerTime'], ['laneG0'], ['sorted'], ['laneG1', 'sorted'], ['chart'], []]);
  });

  it("order E3's two ids the other way at rest, so the rest view does not settle it", () => {
    const pair = (s: IdSettings) => {
      const m = idMint(s);
      const g2 = m.lanes[2].ids.find((x) => x.issued === ID_ORDER_PAIR.g2At)!;
      const g1 = m.lanes[1].ids.find((x) => x.issued === ID_ORDER_PAIR.g1At)!;
      return g1.rank < g2.rank;
    };
    expect(pair(ID_SETUP.order)).toBe(true);
    expect(pair(ID_BASELINE)).toBe(false);
  });

  it('set a challenge exactly one layout of the 578 passes, on either epoch, which no setup or act passes', () => {
    const goal = shown['size-layout'].goal!;
    for (const epoch of [0, 1]) {
      const pass = ID_LAYOUTS.map((s) => ({ ...s, epoch })).filter((s) => goalMet(goal, idMetrics(s), s));
      expect(ID_LAYOUTS).toHaveLength(578);
      expect(pass.map((s) => [s.gen, s.seq, s.tick])).toEqual([
        [ID_CHALLENGE_SOLUTION.gen, ID_CHALLENGE_SOLUTION.seq, ID_CHALLENGE_SOLUTION.tick],
      ]);
    }
    for (const e of Object.values(shown)) {
      const s = { ...ID_BASELINE, ...e.setup } as IdSettings;
      expect(goalMet(goal, idMetrics(s), s), `${e.id} setup`).toBe(false);
      if (e.act) expect(goalMet(goal, idMetrics(actOf(e.id)), actOf(e.id)), `${e.id} act`).toBe(false);
    }
  });

  it("leave every answer off the rest of the lesson page, which sits below the widget's questions", () => {
    const l = IDS_LESSON;
    const page = [
      l.why,
      ...l.concepts.flatMap((c) => [c.title, c.body]),
      ...l.examples.flatMap((x) => [x.title, x.problem, x.insight, ...x.steps]),
      ...l.pitfalls,
      ...l.followUps.flatMap((f) => [f.question, f.answer]),
    ].join(' ');
    for (const banned of [
      '34.8',
      '3.95 ms',
      '2.7%',
      '278.7',
      'sort by generator',
      'then by generator',
      'reissue',
      'same timestamp and sequence',
    ])
      expect(page, banned).not.toContain(banned);
    expect(page).toContain('2^41 ms is about 69.7 years');
  });
});
