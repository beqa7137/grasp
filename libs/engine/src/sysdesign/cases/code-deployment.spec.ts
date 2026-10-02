import { describe, expect, it } from 'vitest';
import { CODE_DEPLOYMENT } from './code-deployment.js';
import { distribution, secondsSpan } from './deploy/distribution.js';
import { rollout } from './deploy/rollout.js';
import { CASE_LABS } from './labs.js';

const estimates = CODE_DEPLOYMENT.stages.flatMap((s) => (s.estimate ? [s.estimate] : []));
const text = JSON.stringify(CODE_DEPLOYMENT);

describe('code deployment case', () => {
  it('works its estimates out from the stated assumptions', () => {
    expect(estimates.map((e) => e.answer)).toEqual([1_000, 133, 225]);
    expect(estimates[0].working).toEqual([
      '2,000 services × 4 = 8,000 deploys a day.',
      '8,000 / 24 h ≈ 333 an hour on average.',
      '× 3 in the busiest hour = 1,000 an hour.',
    ]);
    expect(estimates[1].working).toEqual([
      '20,000 × 500 MB = 10 TB.',
      '10 TB × 8 = 80 Tbit; at 10 Gbit/s that is 8,000 s.',
      '8,000 s / 60 ≈ 133 minutes, 2 h 13 min.',
    ]);
    expect(text).toContain('1,000 an hour is 0.28 a second, one every 3.6 s');
    expect(text).toContain('200,000 instances on 50,000 servers, 4 each), so the busiest hour updates 100,000 instances, 28 a second');
    expect(text).toContain('so up to about 3,750 rollouts can be in flight at once at the busiest hour');
    expect(text).toContain('8,000 deploys × 100 servers × 500 MB = 400 TB a day, about 37 Gbit/s on average and 111 Gbit/s');
    expect(text).toContain("a day's 8,000 deploys at 3 h 45 min each would take over 3 years in series");
  });

  it('quotes the rollout model for the example plan, the plan the widget starts from', () => {
    const plan = {
      fleet: 2_000,
      canaryPct: 1,
      waves: 4,
      shape: 'equal',
      bakeMin: 30,
      maxUnavailablePct: 5,
      hostMin: 5,
      detectMin: 20,
    } as const;
    const run = rollout(plan);
    expect(run.totalMin).toBe(estimates[2].answer);
    expect(estimates[2].working).toEqual([
      'The canary: 20 hosts in 1 batch, 5 min.',
      'Each wave: 1,980 / 4 = 495 hosts in 5 batches of 100, 25 min; 4 waves, 100 min.',
      '4 bakes of 30 min (after the canary and the first 3 waves): 120 min.',
      '5 + 100 + 120 = 225 minutes, 3 h 45 min.',
    ]);
    expect(text).toContain(
      `a 30 min bake keeps it on the ${run.exposed} canary hosts, while with no bake it reaches ${rollout({ ...plan, bakeMin: 0 }).exposed}`,
    );
    expect(text).toContain('a failure that takes 20 min to show has reached 500 hosts, 25% of the fleet');
    expect(text).toContain('of the 3 h 45 min, 2 h is baking');
    expect(text).toContain('here 5%, 100 hosts');
  });

  it('quotes the distribution model for the largest service, through each fix in turn', () => {
    const fleet = { sizeMb: 500, hosts: 20_000, originGbps: 10, caches: 0, p2p: false, delta: false };
    expect(secondsSpan(distribution(fleet).seconds)).toBe('2 h 13 min');
    expect(text).toContain(`at 100 Gbit/s it is ${secondsSpan(distribution({ ...fleet, originGbps: 100 }).seconds)}`);
    const cached = distribution({ ...fleet, caches: 5 });
    expect(text).toContain(
      `With 5 caches the origin sends 5 × 500 MB = 2.5 GB, in 2 s; but each cache now sends 4,000 × 500 MB over its 20 Gbit/s: ${secondsSpan(cached.seconds)}.`,
    );
    expect(text).toContain(
      `the time stops growing with the fleet: ${secondsSpan(distribution({ ...fleet, caches: 5, p2p: true }).seconds)} here`,
    );
    expect(text).toContain(
      `every term shrinks tenfold: ${secondsSpan(distribution({ ...fleet, caches: 5, p2p: true, delta: true }).seconds)}.`,
    );
  });

  it('sizes the Design Lab build to the control plane it describes', () => {
    const { workload } = CASE_LABS['code-deployment'];
    expect(text).toContain('1,667 reads a second');
    expect(text).toContain('833 writes a second');
    expect(text).toContain(`about ${workload.rps.toLocaleString('en-US')} requests a second, ${workload.readRatio * 100}% reads`);
  });

  it('runs the distribution and rollout models after the stage asks the learner to commit', () => {
    const widgets = CODE_DEPLOYMENT.stages.filter((s) => s.widget);
    expect(widgets.map((s) => s.widget)).toEqual(['artifact-distribution', 'rollout-plan']);
    for (const s of widgets) expect(Boolean(s.decision), s.title).toBe(true);
  });

  it('scopes the case to build, deploy and rollout, not a CI test runner', () => {
    expect(CODE_DEPLOYMENT.stages[0].prompt).toContain('The scope is build, deploy and rollout');
    expect(CODE_DEPLOYMENT.stages[0].prompt).toContain("running the test suites is the CI system's job");
  });

  it('covers the probes interviewers expect', () => {
    for (const probe of [
      'Stuck rollouts: every state has a deadline',
      'Rolling back a data migration: data moves forward',
      'Secrets never go in the artifact',
      'Stragglers and dead hosts',
      'The control plane down mid-rollout: hosts keep their current release',
      'Error budgets',
      'Deploy freezes',
      'The Feature Flag Service case covers',
      'Expand and contract',
    ])
      expect(text).toContain(probe);
  });

  it('covers surge, dependencies, rolling forward, monorepos and rotating secrets', () => {
    for (const point of [
      'With maxUnavailable 0 and a surge, new hosts start before old ones stop, so capacity never drops, at the cost of spare machines; with the defaults, up to 25% can be down at once.',
      'Dependencies between services: never require two services to deploy together.',
      "gated on the provider's rollout being complete, never on a shared timestamp.",
      'When rollback is unsafe (a contract step already ran, or the new build wrote data the old one cannot read), roll forward instead',
      "In a monorepo, the build graph says which services a commit affects (Bazel's reverse-dependency queries)",
      'Rotate with overlap: issue the new secret, let services pick it up (re-read on a timer or a watch, not only at start-up), confirm nothing uses the old one, then revoke it.',
      'Up to about 3,750 rollouts can be in flight at once at the busiest hour',
      '(hosts that cannot converge are drained and repaired, not left serving an old build)',
    ])
      expect(text).toContain(point);
    expect(text).not.toContain('Surge starts new hosts');
    expect(text).not.toContain('if the busiest rate held that long');
  });

  it('labels tool defaults as defaults and names facts exactly', () => {
    expect(text).toContain('Kubernetes Deployments default to maxUnavailable 25% and maxSurge 25%; those are defaults, not rules');
    for (const fact of [
      "Bazel, from Google's internal Blaze",
      'SLSA 1.0',
      'L1, provenance exists; L2, it is produced and signed by a hosted build platform; L3, that platform is hardened',
      'in-toto attestation',
      "Sigstore's cosign",
      'Mann-Whitney U',
      'Murder',
      "Uber's Kraken",
      'Dragonfly',
      "Chrome's Courgette",
      'gh-ost and pt-online-schema-change',
      '`SOURCE_DATE_EPOCH`',
    ])
      expect(text).toContain(fact);
  });
});
