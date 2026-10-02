import { distribution, secondsSpan } from '../sysdesign/cases/deploy/distribution.js';
import { bakeText, hostsText, rollout, type RolloutSettings } from '../sysdesign/cases/deploy/rollout.js';
import { durationText } from '../sysdesign/cases/email/smtp-retry.js';
import { storageText } from '../sysdesign/cases/email/storage.js';
import { num } from '../sysdesign/cases/widget-checkpoint.js';
import { concept, item, type DesignItemDefinition } from './design-item-kit.js';
import { pick, withChoices, type Rand } from './random.js';
import type { DesignItemId } from './summaries.js';

/** The first `count` labels that differ from the correct one and from each other. */
const others = (correct: string, labels: string[], count = 3) =>
  labels.filter((l, i) => l !== correct && labels.indexOf(l) === i).slice(0, count);

const plan = (rand: Rand): RolloutSettings => ({
  fleet: pick(rand, [1_000, 2_000, 5_000]),
  canaryPct: pick(rand, [1, 2]),
  waves: pick(rand, [3, 4]),
  shape: 'equal',
  bakeMin: pick(rand, [0, 10, 30]),
  maxUnavailablePct: pick(rand, [5, 10]),
  hostMin: 5,
  detectMin: pick(rand, [15, 20, 45]),
});

const planText = (s: RolloutSettings, canary: number, batch: number) =>
  `${num(s.fleet)} hosts: a ${s.canaryPct}% canary (${num(canary)} hosts), then ${s.waves} equal waves, ${bakeText(s.bakeMin)}; ${num(batch)} hosts at a time, ${durationText(s.hostMin)} a batch.`;

const blastRadius = item('Hosts a bad build reaches before detection', (rand) => {
  const s = plan(rand);
  const run = rollout(s);
  const right = hostsText(run.exposed);
  const wrong = [run.canary, s.fleet, rollout({ ...s, bakeMin: 0 }).exposed, run.canary + run.waves[1].hosts, run.batch].map(hostsText);
  return {
    prompt: `A rollout of ${planText(s, run.canary, run.batch)} The build is bad, and automated analysis flags it ${durationText(s.detectMin)} after the first canary hosts serve it. How many hosts have received it by then?`,
    ...withChoices(rand, right, others(right, wrong)),
    explain: `The canary serves at ${durationText(s.hostMin)}, so the alarm fires at ${durationText(run.detectAtMin)}. Every batch started before then has the build: ${run.waves
      .filter((w) => w.exposed > 0)
      .map((w) => `${num(w.exposed)} in ${w.index === 0 ? 'the canary' : `wave ${w.index}`}`)
      .join(
        ', ',
      )}, ${right}. ${s.bakeMin >= s.detectMin ? 'The bake outlasts detection, so the next wave never starts.' : 'The bake is shorter than detection, so the next wave starts before the alarm.'}`,
  };
});

const rolloutDuration = item('How long a staged rollout takes', (rand) => {
  const s = { ...plan(rand), bakeMin: pick(rand, [15, 30, 60]) };
  const run = rollout(s);
  const bakes = run.waves.length - 1;
  const right = durationText(run.totalMin);
  const wrong = [
    run.totalMin - bakes * s.bakeMin,
    run.waves.length * s.hostMin + bakes * s.bakeMin,
    run.totalMin + s.bakeMin,
    run.totalMin * 2,
  ].map(durationText);
  return {
    prompt: `A rollout of ${planText(s, run.canary, run.batch)} How long does it take if nothing goes wrong?`,
    ...withChoices(rand, right, others(right, wrong)),
    explain: `Batches: ${run.waves.map((w) => `${num(Math.ceil(w.hosts / run.batch))} for ${num(w.hosts)} hosts`).join(', ')}, ${durationText(run.totalMin - bakes * s.bakeMin)} of updating; plus ${bakes} bakes of ${durationText(s.bakeMin)}: ${right}. ${bakes * s.bakeMin > run.totalMin - bakes * s.bakeMin ? 'Bake time is most of it, and it is what buys a small blast radius.' : 'Updating is most of it: the cap on hosts out at once sets the pace.'}`,
  };
});

const fanOut = item('An artifact from one origin to every host', (rand) => {
  const s = {
    sizeMb: pick(rand, [200, 500, 1_000]),
    hosts: pick(rand, [5_000, 10_000, 20_000]),
    originGbps: pick(rand, [10, 40]),
    caches: 0,
    p2p: false,
    delta: false,
  };
  const run = distribution(s);
  const right = secondsSpan(run.seconds);
  const wrong = [run.seconds / 8, run.tierSeconds.hosts!, run.seconds * 8, distribution({ ...s, caches: 5 }).seconds].map(secondsSpan);
  return {
    prompt: `${num(s.hosts)} servers each download a ${num(s.sizeMb)} MB artifact from one origin with ${s.originGbps} Gbit/s of egress. At least how long until every server has it?`,
    ...withChoices(rand, right, others(right, wrong)),
    explain: `${num(s.hosts)} × ${num(s.sizeMb)} MB = ${storageText(run.originBytes)}, × 8 = ${num((run.originBytes * 8) / 1e9)} Gbit, over ${s.originGbps} Gbit/s: ${right}. One server alone needs only ${secondsSpan(run.tierSeconds.hosts!)}; the origin's link is the bottleneck, which regional caches and peer-to-peer sharing remove.`,
  };
});

const peerToPeer = concept(
  'Why does peer-to-peer distribution keep the time for a release to reach every host nearly flat as the fleet grows?',
  'Every host that downloads also uploads, so upload capacity grows with the number of hosts',
  [
    'Peers compress the artifact better than the origin does',
    'Each host downloads only a fraction of the artifact',
    'Peers skip verifying the pieces they receive',
  ],
  'From one server, N copies need N × size / its upload. In a swarm, the total upload is the seed plus every peer, so N × size / (seed + N × peer upload) stays near size / one peer upload however large N gets. Every host still gets the whole artifact, and every piece is checked against the hash in the signed release.',
);

const expandContract = concept(
  'A service renames a database column while old and new code run side by side during a rollout, and either may be rolled back. What is the safe sequence?',
  'Add the new column, deploy code that writes both and reads the new one, backfill, stop using the old one, and drop it last',
  [
    'Rename the column in the same release as the code that uses the new name',
    'Rename the column first, then deploy the code that uses the new name',
    'Deploy the code first, then rename the column',
  ],
  'Expand and contract: every step works with the code on both sides of it, so a rollout and a rollback are safe at every point. Renaming in place always leaves some hosts querying a column that does not exist, and dropping the old column comes only after the rollback window.',
);

const desiredState = concept(
  'Halfway through a rollout, the deploy control plane goes down for 20 minutes. What should the agents on the hosts do?',
  'Keep running the release each has and change nothing until the control plane is back to resume the rollout',
  [
    'Roll every updated host back to the previous release',
    'Carry on with the remaining waves from the plan they cached',
    'Stop serving until the control plane returns, to avoid a mixed fleet',
  ],
  'The outage says nothing about the build, so no move is the safe move: both releases are built to run side by side. The control plane records desired state, so it resumes from where it was, and no wave proceeds without health analysis watching it.',
);

const canaryBaseline = concept(
  'A canary runs a new build on 20 hosts. What should its metrics be compared with?',
  'A baseline of the same size on the old build, started at the same time with the same share of traffic',
  [
    'The rest of the production fleet, which runs the old build',
    "The same hosts' metrics from a week ago",
    'A fixed error-rate threshold set last quarter',
  ],
  'Same size, same age and same traffic leave the build as the only difference. The fleet has warm caches and days of uptime, last week had different traffic, and a fixed threshold ignores what normal looks like today. A statistical test such as Mann-Whitney U, over a minimum number of requests, then decides.',
);

const artifactDigest = concept(
  'Hosts fetch release artifacts from regional caches and from each other. How do they make sure a corrupted or tampered copy never runs?',
  'Check every artifact and piece against the digest in the signed release, refusing any mismatch',
  [
    'Trust the caches, since they are inside the network',
    'Check a checksum the cache sends with the file',
    'Expire cached artifacts after an hour',
  ],
  'The digest comes from the signed release, not from whoever serves the bytes, so a cache or peer can only serve the exact bytes or be caught. A checksum from the cache proves nothing about the cache, and expiry only limits how long a bad copy spreads.',
);

export const DEPLOY_ITEMS = {
  'rollout-blast-radius': blastRadius,
  'rollout-duration': rolloutDuration,
  'artifact-fan-out': fanOut,
  'peer-to-peer-fan-out': peerToPeer,
  'expand-contract': expandContract,
  'desired-state': desiredState,
  'canary-baseline': canaryBaseline,
  'artifact-digest': artifactDigest,
} satisfies Partial<Record<DesignItemId, DesignItemDefinition>>;
