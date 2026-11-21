import { describe, expect, it } from 'vitest';
import { goalMet, renderExperiment } from './experiments.js';
import { SD_LESSONS } from './index.js';
import {
  RELIABILITY_ANSWER_PLAYS,
  RELIABILITY_CHALLENGE_GOAL,
  RELIABILITY_CHALLENGE_SOLUTION,
  RELIABILITY_EXPERIMENTS,
} from './reliability-experiments.js';
import { RELIABILITY_SETTINGS, reliabilityScenario } from './widgets/reliability.js';

const shown = RELIABILITY_EXPERIMENTS.map(renderExperiment);
const byId = (id: string) => shown.find((e) => e.id === id)!;

describe('the Reliability experiments', () => {
  it('are the lesson’s, with no try-this list left', () => {
    expect(SD_LESSONS['sd-reliability'].widget.experiments).toBe(RELIABILITY_EXPERIMENTS);
    expect(SD_LESSONS['sd-reliability'].widget.tryThis).toBeUndefined();
    expect(shown.map((e) => e.title)).toEqual([
      'Four parts in a row',
      'A second database',
      'One more app server',
      'Failures the copies share',
      'Failover takes time',
      'Three nines from seven copies',
    ]);
    expect(shown.filter((e) => !e.goal).map((e) => e.answer + 1)).toEqual([3, 1, 3, 2, 1]);
    for (const e of shown.filter((x) => !x.goal)) expect(RELIABILITY_ANSWER_PLAYS[e.id], e.id).toBeDefined();
  });

  it('quote what the model gives', () => {
    expect(byId('series').ask).toBe(
      'A page request needs 4 parts in turn: a load balancer, an app server, a database and a recommendations service. There is one copy of each, and each is 99.9% available: down 8.8 h a year, in outages of 1 h. How long is the request down a year?',
    );
    expect(byId('series').choices).toEqual([
      '8.8 h: a chain is as good as its weakest part',
      '17.5 h: about twice that, as outages often coincide',
      '35 h: every part’s outages count in full',
    ]);
    expect(byId('series').reveal).toContain('4 × 8.76 h is about 35 h, and the availabilities multiply to 99.6%.');
    expect(byId('parallel').choices).toEqual([
      '32 s: only while both are down at once',
      '53 min: a tenth, a copy buys one more nine',
      '4.4 h: half, two copies share the failures',
    ]);
    expect(byId('parallel').reveal).toContain(
      'both are down 0.1% of 0.1%: 99.9999% available, 32 s a year against 8.8 h. Unavailabilities multiply, so each independent copy adds 3 nines. The request is still down 17.5 h a year',
    );
    expect(byId('weakest').ask).toContain('The request passes 2 load balancers, 2 app servers and 1 database, every copy 99.9% available');
    expect(byId('weakest').choices).toEqual([
      '4.4 h: half, as three app servers never fail together',
      '5.9 h: a third less, as each server now carries a third of the traffic',
      '8.8 h: unchanged, the app servers were never the limit',
    ]);
    expect(byId('weakest').reveal).toContain('only 32 s a year as a pair, and 0.03 s as three.');
    expect(byId('shared').ask).toContain('on paper it is down only 95 s a year. Now say 1 in 10 of a copy’s outages');
    expect(byId('shared').choices).toEqual([
      '104 s: a tenth more than on paper',
      '2.6 h: about 100× what the paper says',
      '26.3 h: as much as with one copy of each',
    ]);
    expect(byId('shared').reveal).toContain('53 min a year for each part, however many copies it has. With 1 in 10 outages shared');
    expect(byId('shared').reveal).toContain('99.99% a part and not 99.9999%');
    expect(byId('failover').ask).toContain('about once in 19 years. But moving traffic off a dead copy takes 5 min');
    expect(byId('failover').choices).toEqual([
      'About 26 times: at every failure of a copy in use',
      'About 53 times: at every failure of either copy',
      'Still about once in 19 years: the standby was ready',
    ]);
    expect(byId('failover').reveal).toContain('About 26 times a year, 5 min each: 2.2 h a year instead of 95 s.');
    expect(byId('failover').reveal).toContain('Four nines a part is 53 min a year; with 8.76 failures that leaves about 6 min for each');
    expect(byId('add-a-nine').ask).toBe(
      'This design has shared failures and a 5 min failover, as real ones do, and the request is down 20.6 h a year. Promise three nines: bring it under 8.76 h a year, 99.9%, with no more than the 7 copies it runs now.',
    );
    expect(byId('add-a-nine').reveal).toContain('down 4.6 h a year, 99.947%.');
    expect(byId('add-a-nine').reveal).toContain('That leaves 4.1 h of the 8.76 h error budget');
  });

  it('check their word claims against the model', () => {
    const pair = reliabilityScenario({ lb: 1, app: 1, db: 2, recs: 1, optional: 1 });
    expect(pair.parts[2].u).toBeCloseTo(1e-6, 12);
    const pairs = reliabilityScenario({ lb: 2, app: 2, db: 2, recs: 1, optional: 1 });
    const shared = reliabilityScenario({ lb: 2, app: 2, db: 2, recs: 1, optional: 1, shared: 1 });
    expect(shared.u / pairs.u).toBeGreaterThan(95);
    expect(shared.u / pairs.u).toBeLessThan(105);
    const failover = reliabilityScenario({ lb: 2, app: 2, db: 2, recs: 1, optional: 1, failover: 1 });
    expect(failover.parts[2].u).toBeLessThan(1e-4);
    expect(Math.round(1 / pairs.failsPerYear)).toBe(19);
    const before = reliabilityScenario({ lb: 2, app: 2, db: 1, recs: 1, optional: 1 });
    const after = reliabilityScenario({ lb: 2, app: 3, db: 1, recs: 1, optional: 1 });
    expect(after.downH).toBeLessThan(before.downH);
    expect(before.downH - after.downH).toBeLessThan(1 / 60);
  });

  it('play each answer from a complete setup, hiding what would give it away', () => {
    for (const spec of RELIABILITY_EXPERIMENTS) {
      expect(Object.keys(spec.setup).sort(), spec.id).toEqual(['app', 'db', 'failover', 'lb', 'optional', 'recs', 'shared']);
      if (!spec.goal) expect(spec.act && 'run' in spec.act && spec.act.run, spec.id).toBe('year');
    }
    expect(shown.map((e) => e.hide)).toEqual([['sample', 'request'], ['after'], ['sample', 'weakest', 'after'], ['after'], ['after'], []]);
  });

  it('set a challenge that exactly one of its 162 settings meets', () => {
    const kept = RELIABILITY_SETTINGS.filter((s) => s.shared === 1 && s.failover === 1);
    expect(kept).toHaveLength(162);
    const met = kept.filter((s) => goalMet(RELIABILITY_CHALLENGE_GOAL, reliabilityScenario(s).metrics, s));
    expect(met).toEqual([{ ...RELIABILITY_CHALLENGE_SOLUTION, shared: 1, failover: 1 }]);
    const near = kept
      .filter((s) => s.lb + s.app + s.db + s.recs <= 7 && !met.includes(s))
      .reduce((a, s) => Math.min(a, reliabilityScenario(s).downH), Infinity);
    expect(near).toBeCloseTo(11.8, 1);
    expect(
      RELIABILITY_SETTINGS.filter((s) => !(s.shared === 1 && s.failover === 1)).some((s) =>
        goalMet(RELIABILITY_CHALLENGE_GOAL, reliabilityScenario(s).metrics, s),
      ),
    ).toBe(false);
  });
});
