import {
  DURABILITY_EXPERIMENTS,
  DURABILITY_SETTINGS as ALL,
  durabilityPlan,
  durabilityPlayState,
  durabilityScenario,
  renderExperiment,
  type DurabilityPlayKind,
} from '@grasp/engine';
import { FALSE_CLAIMS, PROSE } from './durability-claims.testing';
import { DURABILITY_KEEP } from './durability-text';
import {
  NOTHING_HIDDEN,
  SPREAD,
  exactWords,
  factsSentence,
  goalChecks,
  hiding,
  noteText,
  raceSentence,
  readoutText,
  settingSentence,
  stepWords,
  summary,
  type StepRow,
} from './durability-words';

const KINDS: DurabilityPlayKind[] = ['repair', 'staged'];
const HIDINGS = [NOTHING_HIDDEN, hiding(['steps', 'after'], 'playing'), hiding(['after', 'reads'], 'playing'), hiding(['steps'], 'asking')];

/** Every sentence a setting can print on the stage, in the notice and in Describe. */
function sentences(i: number): string[] {
  const s = ALL[i];
  const m = durabilityScenario(s);
  const out = [settingSentence(m), noteText(m), exactWords(m), ...goalChecks(m).map((c) => c.text)];
  for (const hid of HIDINGS) {
    out.push(summary(m, hid), readoutText(m, hid), factsSentence(m, hid, durabilityScenario(ALL[(i + 7) % ALL.length])));
    for (const kind of KINDS) {
      const p = durabilityPlan(s, kind);
      for (const tau of [0, p.fail, p.winStart + p.win / 2, ...p.events.map((e) => e.at), null])
        out.push(raceSentence(m, durabilityPlayState(s, kind, tau), kind, hid));
    }
  }
  return out;
}

/** A number with its unit, a chance or a scheme outside every run the keep rule holds together. */
function parted(text: string): string[] {
  const kept = text.replace(DURABILITY_KEEP, (k) => '#'.repeat(k.length));
  return [...kept.matchAll(/\d[\d,.]*%? (?:h|TB|PB|MB|Gb\/s|nines|years|a year)\b|\b1 in \d|\d \+ \d/g)].map((x) => x[0]);
}

describe('durability words', () => {
  it('say every sentence of every setting, play moment and hiding in full, with no false claim', () => {
    const bad: string[] = [];
    ALL.forEach((_, i) => {
      for (const t of sentences(i)) {
        for (const c of [...FALSE_CLAIMS, ...PROSE]) if (c.test(t)) bad.push(`${c}: ${t}`);
        if (!/[.:]$|: (met|not yet)$/.test(t) && !t.startsWith('Stored as')) bad.push(`not a sentence: ${t}`);
        for (const p of parted(t)) bad.push(`"${p}" parted in: ${t}`);
      }
    });
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  });

  it('keep every number of the experiments with its unit', () => {
    const bad = DURABILITY_EXPERIMENTS.map(renderExperiment).flatMap((e) => [e.ask, ...e.choices, e.reveal].flatMap(parted));
    expect(bad).toEqual([]);
  });

  it('keep every check status on one line with its bound, at every setting', () => {
    for (const s of ALL)
      for (const c of goalChecks(durabilityScenario(s))) {
        const runs = [...c.text.matchAll(DURABILITY_KEEP)].map((x) => x[0]);
        expect(runs.at(-1), c.text).toMatch(/\d\S*( \S+)*: (met|not yet)$/);
      }
  });

  it('say a rebuild faster than one disk writes runs in parallel on many other disks, at every setting', () => {
    for (const s of ALL) {
      const m = durabilityScenario(s);
      for (const tau of [null, durabilityPlan(s).winStart + 0.5]) {
        const said = raceSentence(m, durabilityPlayState(s, 'repair', tau), 'repair', NOTHING_HIDDEN);
        expect(said.includes(SPREAD), JSON.stringify(s)).toBe(m.writeGbps > 2);
      }
    }
  });

  it('name each step row once, with no "any 2 of the 2", for the stage and Describe alike', () => {
    for (const s of ALL) {
      const m = durabilityScenario(s);
      const rows: StepRow[] = [...m.steps, ...(s.rack ? [{ kind: 'rack' } as const] : []), { kind: 'final' }];
      const shortest = rows.map((r) => stepWords(m, r).at(-1));
      expect(new Set(shortest).size, JSON.stringify(s)).toBe(shortest.length);
      for (const r of rows) for (const w of stepWords(m, r)) expect(w).not.toMatch(/Any (\d+) of (the )?\1\b/);
    }
  });

  it('say the staged loss is staged, with its own chance from the model', () => {
    const m = durabilityScenario({ scheme: 1, afr: 2, repair: 24, rack: 0 });
    expect(raceSentence(m, durabilityPlayState(m.settings, 'staged', null), 'staged', NOTHING_HIDDEN)).toBe(
      'Staged, not sampled: c3 fails, and before its 24 h repair ends c1 and c2 fail too. No copy is left: the object is lost. A first failure leads here about once in 330 million times.',
    );
    const wide = durabilityScenario({ scheme: 3, afr: 2, repair: 24, rack: 1 });
    expect(raceSentence(wide, durabilityPlayState(wide.settings, 'staged', null), 'staged', NOTHING_HIDDEN)).toMatch(
      /^Staged, not sampled: a rack event destroys the one rack and every piece in it at once/,
    );
  });
});
