import { RELIABILITY_SETTINGS, formatDown, reliabilityScenario, reliabilityStepMoments, reliabilityYear } from '@grasp/engine';
import { BAD_GRAMMAR, FALSE_CLAIMS } from './reliability-claims.testing';
import {
  NOTHING_HIDDEN,
  allMomentWords,
  causesWords,
  describe as describeWords,
  allHourWords,
  goalChecks,
  hiding,
  hourWords,
  leastSet,
  readoutWords,
  settingWords,
  standingWords,
  summary,
  weakestWords,
  yearWords,
} from './reliability-words';

/** A sweep over every setting: longer than a unit test's default on a loaded machine. */
const SWEEP_MS = 60_000;

/** Every sentence a setting can say, on any surface. */
function sentences(i: number): string[] {
  const s = RELIABILITY_SETTINGS[i];
  const m = reliabilityScenario(s);
  const y = reliabilityYear(s);
  const d = describeWords(m, y, (['wide', 'mid', 'compact'] as const)[i % 3]);
  return [
    summary(m, NOTHING_HIDDEN),
    settingWords(m),
    causesWords(m),
    weakestWords(m, true),
    readoutWords(m, NOTHING_HIDDEN),
    standingWords(s),
    yearWords(y.fails),
    yearWords(y.fails.slice(0, 1), true),
    ...d.said,
    ...d.rows.flat(),
    ...goalChecks(m).map((c) => c.text),
  ];
}

describe('the Reliability words', () => {
  it(
    'say every setting in full sentences, with no false claim, no wrong plural and no sentence opening on a numeral',
    () => {
      for (let i = 0; i < RELIABILITY_SETTINGS.length; i++) {
        const all = sentences(i);
        for (const t of all) {
          for (const c of [...FALSE_CLAIMS, ...BAD_GRAMMAR]) expect(t, t).not.toMatch(c);
          expect(t).not.toMatch(/\u2014/);
        }
        for (const t of all.slice(0, 8)) {
          expect(t, t).toMatch(/[.:]$|year$/);
          for (const sentence of t.split(/(?<=\.) /)) expect(sentence, t).not.toMatch(/^\d/);
        }
      }
      for (const t of allMomentWords()) {
        expect(t).toMatch(/\.$/);
        for (const c of FALSE_CLAIMS) expect(t).not.toMatch(c);
      }
    },
    SWEEP_MS,
  );

  it('title “that hour” with the state it draws and give the overlap only as what would happen', () => {
    for (const h of allHourWords()) {
      expect(h.title).toMatch(/^That hour: \w+ \d down, \w+ \d( and \w+ \d)? up\.$/);
      expect(h.ifTitle).toBe(h.n === 2 ? 'If both were down at once:' : 'If all 3 were down at once:');
      expect(h.body).toMatch(/^their overlap, magnified, is .* a year\.$|^\([\d.]+ shared outages × 1 h\) \+ .* by chance = .* a year\.$/);
      expect(h.title).not.toMatch(/\b(both|all \d) down\b/i);
      for (const c of [...FALSE_CLAIMS, ...BAD_GRAMMAR]) expect(h.body).not.toMatch(c);
    }
    for (const t of ['0.88 shared outages × 1 h + 26 s both down by chance', '26 s a year by chance, plus 0.88 shared outages × 1 h.'])
      expect(
        BAD_GRAMMAR.slice(-2).some((c) => c.test(t)),
        t,
      ).toBe(true);
  });

  it(
    'break a part’s downtime down in the “if” frame as the facts line does, ending in the total',
    () => {
      let checked = 0;
      for (const s of RELIABILITY_SETTINGS.filter((x) => x.shared)) {
        const m = reliabilityScenario(s);
        const p = leastSet(m);
        if (!p) continue;
        const facts = causesWords(m).match(/is down ([\d.]+ \w+) a year, .* on paper: (.*)\.$/)!;
        const body = hourWords(p.id, p.copies, 0, true).body.match(/^(.*) = ([\d.]+ \w+) a year\.$/)!;
        const key = `${m.key} ${body[0]}`;
        expect(body[1], key).toBe(facts[2].replace(/\(\S+ failovers × \d+ min\) \+ /, ''));
        if (!s.failover) expect(body[2], key).toBe(facts[1]);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    },
    SWEEP_MS,
  );

  it('add a set’s causes up to its downtime as printed, each product to its minute', () => {
    for (const s of RELIABILITY_SETTINGS.filter((x) => x.shared || x.failover)) {
      const m = reliabilityScenario(s);
      const t = causesWords(m);
      const hit = t.match(/is down ([\d.]+ \w+) a year.*?: (.*)\.$/);
      if (!hit) continue;
      const minutes = (v: string) => {
        const [n, u] = v.split(' ');
        return Number(n) * ({ s: 1 / 60, min: 1, h: 60, d: 1440 } as Record<string, number>)[u];
      };
      let sum = 0;
      for (const [, n, d] of hit[2].matchAll(/([\d.]+) (?:shared outages|failovers) × ([\d.]+ \w+)/g)) sum += Number(n) * minutes(d);
      const chance = hit[2].match(/([\d.]+ \w+) (both|all 3) down by chance/)!;
      sum += minutes(chance[1]);
      expect(Math.abs(sum - minutes(hit[1])), t).toBeLessThan(1);
    }
  });

  it(
    'print the simulated year’s hours the same in its sentence and in Describe’s request row, at every setting',
    () => {
      for (const s of RELIABILITY_SETTINGS) {
        const m = reliabilityScenario(s);
        const y = reliabilityYear(s);
        const said = yearWords(y.fails).match(/, ([\d.]+ \w+) in all/)?.[1];
        for (const form of ['wide', 'compact'] as const) {
          const d = describeWords(m, y, form);
          const cell = d.rows[d.active][d.rows[d.active].length - 1];
          if (said) expect(cell, `${m.key} ${form}`).toMatch(new RegExp(`, ${said.replace('.', '\\.')}$`));
          else expect(cell).toBe('none');
        }
      }
    },
    SWEEP_MS,
  );

  it('say the moments a learner steps through, and what an open question hides', () => {
    const s = RELIABILITY_SETTINGS[0];
    expect(reliabilityStepMoments(s).length).toBeGreaterThan(0);
    expect(summary(reliabilityScenario(s), hiding(['sample', 'request'], 'asking', []))).toBe(
      'A request crosses 1 load balancer, 1 app server, 1 database and 1 recommendations service, every copy 99.9% available; copies fail independently, and traffic moves off a dead copy at once. The model’s numbers for the request show after your answer. The simulated year plays after your answer.',
    );
    expect(hiding(['after'], 'revealed', ['db'])).toBe(NOTHING_HIDDEN);
    expect(hiding(['weakest'], 'playing', []).weakest).toBe(true);
    expect([...hiding(['after'], 'playing', ['db']).parts]).toEqual(['db']);
    expect(hiding(['after'], 'asking', ['db']).request).toBe(false);
    expect(formatDown(0)).toBe('under 0.01 s');
  });
});
