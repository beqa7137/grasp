import { ID_BASELINE as B, ID_EXPERIMENTS, ID_FIELD_MAX, idGoalParts, idMint, renderExperiment, type IdSettings } from '@grasp/engine';
import { FALSE_CLAIMS, PROSE } from './ids-claims.testing';
import {
  IDS_KEEP,
  NOTHING_HIDDEN,
  askNotice,
  changeSentence,
  conversion,
  hiding,
  madeBy,
  mintWords,
  randomWords,
  summary,
  tableOf,
  type HidFlag,
} from './ids-words';

const show = (s: IdSettings) => JSON.stringify(s);
const SHOWN = ID_EXPERIMENTS.map(renderExperiment);

/** Every layout the steppers, the tick and the epoch reach, and every mint and random setting at three layouts. */
const SETTINGS: IdSettings[] = [];
for (let gen = 0; gen <= ID_FIELD_MAX; gen++)
  for (let seq = 0; seq <= ID_FIELD_MAX; seq++)
    for (const tick of [1, 10]) for (const epoch of [0, 1]) SETTINGS.push({ ...B, gen, seq, tick, epoch });
for (const [gen, seq] of [
  [10, 12],
  [12, 10],
  [1, 0],
  [16, 16],
])
  for (const load of [0, 1])
    for (const fault of [0, 1, 2, 3])
      for (const guard of [0, 1]) for (const tick of [1, 10]) SETTINGS.push({ ...B, gen, seq, load, fault, guard, tick });
for (const bits of [64, 122]) for (let count = 3; count <= 15; count++) SETTINGS.push({ ...B, bits, count });

describe('Unique IDs words', { timeout: 120_000 }, () => {
  it('say every setting in full sentences, with no false claim, every count in its own grammar', () => {
    const out: string[] = [];
    const mints = new Map<string, ReturnType<typeof idMint>>();
    for (const s of SETTINGS) {
      const m = idMint(s);
      mints.set(show(s), m);
      const sentences = [
        summary(m, NOTHING_HIDDEN),
        ...(['gen', 'tick', 'fault', 'count'] as const).map((k) => changeSentence(k, s)),
        mintWords(m, NOTHING_HIDDEN),
        randomWords(s, NOTHING_HIDDEN),
        tableOf(m, 'full').note,
      ];
      const shown = m.byMade.slice(0, 4);
      const words = [
        ...sentences,
        ...idGoalParts(s).map((g) => g.text),
        ...shown.flatMap((x) => [madeBy(s, x), ...conversion(s, x)]),
        JSON.stringify(tableOf(m, 'full').rows),
        JSON.stringify(tableOf(m, 'compact').rows),
      ].join(' | ');
      for (const g of FALSE_CLAIMS) if (g.test(words)) out.push(`${show(s)}: ${g} in "${words.match(g)![0]}"`);
      for (const t of sentences) {
        for (const g of PROSE) if (g.test(t)) out.push(`${show(s)}: ${g} in "${t}"`);
        if (!/^[A-Z][^]*[.]$/.test(t)) out.push(`${show(s)}: not a sentence: "${t}"`);
      }
      // Thousands are grouped everywhere: no run of five digits or more outside a grouped number.
      for (const t of sentences) if (/(^|[^\d,.])\d{5,}/.test(t)) out.push(`${show(s)}: ungrouped in "${t}"`);
    }
    expect([...new Set(out)].slice(0, 20)).toEqual([]);
  });

  it("keep the widget's runs whole in its HTML text: units, needs, numbers, dates, powers of ten and percentages", () => {
    const text = 'It lasts 69.7 years, to 7 September 2095, for 5,000 requests (need 1,000,000), number 1, about 9.4 × 10⁻²⁰ or 2.7%.';
    expect([...text.matchAll(IDS_KEEP)].map((k) => k[0])).toEqual([
      '69.7 years',
      '7 September 2095',
      '5,000 requests',
      '(need 1,000,000)',
      'number 1',
      '9.4 × 10⁻²⁰',
      '2.7%',
    ]);
  });

  it('say the layout change in one sentence, its numbers computed for the layout', () => {
    expect(changeSentence('gen', { ...B, gen: 11 })).toBe(
      'The layout now has 11 generator bits and 12 sequence bits: 2,048 generators, 4,096,000 ids a second each; the timestamp keeps 40 bits and lasts 34.8 years.',
    );
    expect(changeSentence('seq', { ...B, gen: 1, seq: 1 })).toMatch(
      /^The layout now has 1 generator bit and 1 sequence bit: 2 generators, 2,000 ids a second each;/,
    );
    expect(changeSentence('gen', { ...B, gen: 0 })).toMatch(/: 1 generator, /);
  });

  it('hide what a question names, through its play, and nothing at the reveal', () => {
    const flags = (hide: readonly string[], phase: 'asking' | 'playing' | 'revealed') =>
      (Object.entries(hiding(hide, phase)) as [HidFlag, boolean][]).filter(([, v]) => v).map(([k]) => k);
    expect(flags(['lifetime'], 'asking')).toEqual(['ghost', 'locked']);
    expect(flags(['lifetime'], 'playing')).toEqual(['lifeNew', 'ghost', 'locked']);
    expect(flags(['burstAfter'], 'asking')).toEqual(['ghost', 'locked']);
    expect(flags(['burstAfter'], 'playing')).toEqual(['burstAfter', 'ghost', 'locked']);
    expect(flags(['order', 'inspect'], 'asking')).toEqual(['order', 'inspect', 'ghost', 'locked']);
    expect(flags(['repeats'], 'playing')).toEqual(['order', 'inspect', 'repeats', 'ghost', 'locked']);
    expect(flags(['chance'], 'asking')).toEqual(['chance', 'ghost', 'locked']);
    for (const e of SHOWN) expect(flags(e.hide, 'revealed'), e.id).toEqual([]);
    expect(askNotice('A burst in one tick', hiding(['burstAfter'], 'asking'))).toBe('A burst in one tick.');
    expect(askNotice('Which id sorts first', hiding(['order'], 'asking'))).toBe(
      'Which id sorts first: the part it is about is hidden until you answer.',
    );
  });

  it("say no question's answer in the summary or a notice while it is open, at its setup and at its act", () => {
    const banned: Record<string, RegExp> = {
      'one-bit': /34\.8|3 November 2060|halves/,
      burst: /3\.95 ms|\b904\b|full ticks|waits? \d/,
      order: /sorts (first|before|after)|out of time order|0\.7 ms later/,
      'clock-back': /made twice|same id|repeats? an|Two ids/,
      birthday: /2\.7%|0\.027|about 1 in/,
    };
    const out: string[] = [];
    for (const e of SHOWN.filter((x) => !x.goal)) {
      const setup = { ...B, ...e.setup } as IdSettings;
      const act = { ...setup, ...(e.act && 'set' in e.act ? e.act.set : {}) } as IdSettings;
      for (const [phase, s] of [
        ['asking', setup],
        ['playing', act],
      ] as const) {
        const hid = hiding(e.hide, phase);
        const m = idMint(s);
        const said = [
          summary(m, hid),
          mintWords(m, hid),
          randomWords(s, hid),
          ...(['gen', 'fault', 'count'] as const).map((k) => changeSentence(k, s, hid)),
        ];
        for (const t of said) if (banned[e.id].test(t)) out.push(`${e.id} ${phase}: "${t.match(banned[e.id])![0]}" in "${t}"`);
      }
    }
    expect(out).toEqual([]);
  });
});
