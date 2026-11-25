import { CDN_SETTINGS, cdnEvents, cdnSample, cdnScenario, type CdnScenario } from '@grasp/engine';
import { FALSE_CLAIMS, PROSE } from './cdn-claims.testing';
import {
  ALL_HIDDEN,
  NOTHING_HIDDEN,
  describeTable,
  emptyLaneForms,
  goalParts,
  guideText,
  hiding,
  keyForms,
  kneeWords,
  laneWords,
  legendItems,
  noteText,
  settingSentence,
  stepForms,
  stepWords,
  story,
  subOf,
  summary,
  tierWords,
  titleOf,
  windowWords,
} from './cdn-words';

/** Every sentence a setting can print, at rest and with every number a question hides hidden. */
function sentences(sc: CdnScenario): string[] {
  const s = sc.settings;
  const ghost = cdnScenario({ ...s, pops: s.pops === 20 ? 100 : 20 });
  const sample = cdnSample(sc);
  const ev = cdnEvents(sample);
  const out = [
    titleOf(s),
    subOf(s),
    settingSentence(sc),
    noteText(NOTHING_HIDDEN),
    noteText(hiding(['curve'], 'asking')),
    ...stepForms(sc),
    ...emptyLaneForms(windowWords(s)),
    ...[true, false].flatMap((compact) => [describeTable(sc, compact).note, describeTable(sc, compact, false).note]),
  ];
  for (const hid of [NOTHING_HIDDEN, ALL_HIDDEN, hiding(['curve'], 'asking')]) {
    for (const narrow of [false, true]) {
      const t = tierWords(sc, hid, ghost, narrow);
      out.push(t.users.body, t.edge.body, t.shield.body, t.origin.body, t.mean);
    }
    out.push(summary(sc, hid), guideText(s, hid), story(sc, sample, ev, hid), ...keyForms(s, hid));
    out.push(...legendItems(sc, hid).map((i) => i.text));
    const k = kneeWords(sc, hid);
    out.push(k.edge, ...(k.shield ? [k.shield] : []));
    for (let i = 0; i < 3; i++) {
      const w = laneWords(sc, i, hid);
      out.push(`${w.who} ${w.asked} · ${w.hits}`);
    }
  }
  for (let f = 0; f <= 1; f += 0.05) out.push(stepWords(sc, ev, f * sample.window, sample.window));
  out.push(...goalParts(sc).map((p) => p.text));
  return out;
}

describe('CDN words', () => {
  it('prints no false claim and only full, separated sentences at all 192 settings', () => {
    const bad: string[] = [];
    for (const s of CDN_SETTINGS)
      for (const t of sentences(cdnScenario(s))) {
        for (const c of FALSE_CLAIMS) if (c.test(t)) bad.push(`${c}: ${t}`);
        if (/^[A-Z#]/.test(t) || t.endsWith('.')) for (const p of PROSE) if (p.test(t)) bad.push(`${p}: ${t}`);
      }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('says a rank past the ends of the catalog as a fact of every object or of none', () => {
    const shielded = cdnScenario({ rps: 100_000, pops: 1, ttl: 3600, shield: 1, variants: 1 });
    expect(kneeWords(shielded, NOTHING_HIDDEN).edge).toBe('Every object hits at the edge at least half the time');
    expect(kneeWords(shielded, NOTHING_HIDDEN).shield).toBe('With 1 location the shield never hits: its copy expires with the edge’s.');
    const cold = cdnScenario({ rps: 1000, pops: 100, ttl: 5, shield: 0, variants: 10 });
    expect(kneeWords(cold, NOTHING_HIDDEN).edge).toBe('No object hits at the edge half the time');
    expect(summary(cold, NOTHING_HIDDEN)).toContain('No object hits at the edge half the time.');
  });

  it('keeps every hidden share with its unit and never a default in its place', () => {
    const sc = cdnScenario({ rps: 10_000, pops: 20, ttl: 60, shield: 1, variants: 1 });
    const t = tierWords(sc, ALL_HIDDEN, null);
    expect([t.edge.fig, t.shield.fig, t.origin.fig]).toEqual(['?/s', '?/s', '?/s']);
    expect(t.edge.body).toBe('In 10 ms, for ?% of requests. Each of 20 locations, one cell each, takes 500/s and keeps its own copies.');
    expect(t.origin.body).toBe('In 160 ms (the edge, the shield, then a round trip to the origin), for ?% of 10,000/s.');
    expect(t.mean).toBe('Mean response: shows after your answer.');
    expect(legendItems(sc, ALL_HIDDEN).map((i) => i.text)).toEqual(['?% at the edge', '?% by the shield', '?% at the origin']);
    expect(laneWords(sc, 1, ALL_HIDDEN).hits).toBe('edge hit ?% · shield hit ?% of misses');
    expect(tierWords(sc, { ...ALL_HIDDEN, playing: true }, null).mean).toBe('Mean response: shows at the reveal.');
  });

  it('reads the default setting as the brief does', () => {
    const sc = cdnScenario({ rps: 10_000, pops: 20, ttl: 60, shield: 0, variants: 1 });
    const t = tierWords(sc, NOTHING_HIDDEN, cdnScenario({ ...sc.settings, pops: 100 }));
    expect(t.edge.body).toBe('In 10 ms, for 69.2% of requests. Each of 20 locations, one cell each, takes 500/s and keeps its own copies.');
    expect(t.origin.body).toBe('In 130 ms (the edge, then a round trip to the origin), for 30.8% of 10,000/s. It was 4,390/s.');
    expect(t.mean).toBe('Mean response 46.9 ms = 69.2% × 10 ms + 30.8% × 130 ms. It was 57.2 ms.');
    expect(summary(sc, NOTHING_HIDDEN)).toBe(
      'A CDN with 20 locations serves 10,000 requests a second for 100,000 images with Zipf popularity; each location keeps a copy for 1 minute after a miss. By the model, 69.2% are answered at the edge in 10 ms, and 3,080/s reach the origin, in 130 ms: a mean response of 46.9 ms. Popular objects hit and the long tail misses: objects more popular than the 2,481st hit at the edge more than half the time, and the rest less. The timeline is one random sample of the outlined location’s requests.',
    );
    expect(settingSentence(sc)).toBe(
      'With 20 locations, a 1-minute TTL and no shield, 69.2% of 10,000 requests a second hit at the edge, 3,080/s reach the origin, and the mean response is 46.9 ms.',
    );
    expect(laneWords(sc, 1, NOTHING_HIDDEN)).toEqual({
      who: '#2,500',
      asked: 'asked for about once a minute here',
      hits: 'edge hit 49.8%',
    });
    expect(goalParts(sc).map((p) => p.text)).toEqual([
      'the origin takes 3,080/s, under 500/s: not yet',
      'the mean response is 46.9 ms, under 18 ms: not yet',
      'each cache keeps a copy for 1 minute, at most 5 minutes: met',
    ]);
  });
});
