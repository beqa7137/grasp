import { flickerChance } from '../sysdesign/cases/flags/bucketing.js';
import { PROPAGATION, bytesRate, propagation, secondsText } from '../sysdesign/cases/flags/propagation.js';
import { blendedRate, percentText } from '../sysdesign/cases/flags/rollout.js';
import { num } from '../sysdesign/cases/widget-checkpoint.js';
import { concept, item, type DesignItemDefinition } from './design-item-kit.js';
import { pick, withChoices } from './random.js';
import type { DesignItemId } from './summaries.js';

const users = (v: number) => `about ${num(v)} users`;

const rolloutOverlap = item('Users in two salted rollouts', (rand) => {
  const total = pick(rand, [10_000, 100_000, 1_000_000]);
  const a = pick(rand, [5, 10, 20]);
  const b = pick(rand, [25, 50]);
  const both = total * (a / 100) * (b / 100);
  return {
    prompt: `${num(total)} users. Flag A rolls out to ${a}% and flag B to ${b}%, and each flag hashes its own salt with the user id. How many users are in both?`,
    ...withChoices(rand, users(both), [users(total * (a / 100)), users(total * (b / 100)), 'None: each flag picks different users']),
    explain: `A salt per flag makes the two buckets unrelated, so being in A says nothing about B: ${num(total)} × ${a}% × ${b}% ≈ ${num(both)}. Without the salts both flags would compare the same bucket, and all ${num(total * (a / 100))} of A's users would be in B too.`,
  };
});

const rolloutStickiness = item('Users kept when a rollout grows', (rand) => {
  const from = pick(rand, [1, 5, 10]);
  const to = pick(rand, [25, 50]);
  return {
    prompt: `A flag at ${from}% assigns users by a hash of its salt and the user id, in when the bucket is below the percentage. It is raised to ${to}%. What share of the users who were in at ${from}% are still in?`,
    ...withChoices(rand, 'All of them', [`About ${to}% of them`, `About ${Math.round((from / to) * 100)}% of them`, 'None of them']),
    explain: `A user's bucket never changes, and raising the percentage only moves the line up, so every bucket below ${from}% is still below ${to}%. Only a new salt, or a random number per request, would reshuffle them: then about ${to}% would stay.`,
  };
});

const randomFlicker = item('Users who flicker under a random rollout', (rand) => {
  const p = pick(rand, [10, 20, 50]);
  const requests = pick(rand, [3, 5]);
  const share = flickerChance(p / 100, requests);
  const pctOf = (v: number) => `About ${num(v * 100)}%`;
  return {
    prompt: `A rollout at ${p}% rolls a new random number on every request. Each user makes ${requests} requests. What share of users see both versions?`,
    ...withChoices(rand, pctOf(share), [pctOf(p / 100), 'None', 'All of them']),
    explain: `A user sees one version only if all ${requests} rolls agree: ${p / 100}^${requests} + ${Number((1 - p / 100).toFixed(2))}^${requests}. So 1 - that ≈ ${num(share * 100)}% flip between versions, which breaks the user's experience and any experiment. A hash of the salt and the user id gives every request the same answer.`,
  };
});

const rulesetBandwidth = item('Bandwidth of polling for a whole ruleset', (rand) => {
  const instances = pick(rand, [5_000, 20_000, 50_000]);
  const intervalS = pick(rand, [10, 30, 60]);
  const run = propagation({ instances, delivery: 'poll', intervalS, payload: 'full', cdn: false, changesPerMin: 2 });
  const mb = PROPAGATION.rulesetKb / 1000;
  return {
    prompt: `${num(instances)} SDK instances each download the whole ${mb} MB flag ruleset every ${intervalS} s, whether or not it changed. How many bytes a second does the flag service send?`,
    ...withChoices(rand, bytesRate(run.originBytesS), [
      bytesRate(run.originBytesS / intervalS),
      bytesRate(instances * mb * 1e6),
      bytesRate(run.originBytesS / 1000),
    ]),
    explain: `${num(instances)} / ${intervalS} s ≈ ${num(run.originRps)} downloads a second × ${mb} MB = ${bytesRate(run.originBytesS)}, nearly all of it unchanged. Sending only the changes since the SDK's version, or streaming them, cuts it to kilobytes or a few megabytes a second.`,
  };
});

const cdnStaleness = item('Staleness of polling through a CDN', (rand) => {
  const intervalS = pick(rand, [30, 60, 300]);
  const run = propagation({ instances: 20_000, delivery: 'poll', intervalS, payload: 'full', cdn: true, changesPerMin: 2 });
  const wait = run.worstS - PROPAGATION.publishS;
  return {
    prompt: `SDKs poll for flags every ${intervalS} s, through a CDN that caches the ruleset for ${intervalS} s. After a kill switch is flipped (and published), how long can an instance keep the old value at worst?`,
    ...withChoices(rand, secondsText(wait), [secondsText(intervalS), secondsText(intervalS / 2), secondsText(intervalS * 3)]),
    explain: `The CDN may have fetched its copy just before the change and keep it for ${intervalS} s, and an instance may have polled just before the CDN refreshed and wait another ${intervalS} s: ${secondsText(wait)} in all. Caching cuts the origin's load at the price of up to one more TTL of staleness, so a kill switch needs a stream or a short TTL.`,
  };
});

const flagOutage = concept(
  'The flag service is down. A running service evaluates a flag it received an hour ago. What should the SDK return?',
  'The value from the last ruleset it received',
  ['The default written at the call site', "The flag's off variation", 'An error, after a short timeout'],
  "The last ruleset is what was live, so nothing changes for users while the service is down; only new flag changes wait. The call-site default is for flags the SDK never received, the off variation would switch off features that launched long ago, and errors or timeouts would make the flag service's outage everyone's.",
);

const guardrailCohort = item('A bad path at a small rollout', (rand) => {
  const base = pick(rand, [0.002, 0.005, 0.01]);
  const factor = pick(rand, [2, 3]);
  const exposure = pick(rand, [0.01, 0.05]);
  const treated = base * factor;
  const overall = blendedRate(base, treated, exposure);
  return {
    prompt: `A service fails ${percentText(base)} of requests. A new path behind a flag fails ${percentText(treated)}, and it is rolled out to ${percentText(exposure)} of users. What does the whole service's error rate become?`,
    ...withChoices(rand, percentText(overall), [percentText(treated), percentText(base + treated), percentText(base * exposure)]),
    explain: `${percentText(1 - exposure)} of requests still fail at ${percentText(base)} and ${percentText(exposure)} at ${percentText(treated)}: ${percentText(overall)}, a change easy to miss in normal variation. Comparing the users in the flag with those out of it shows ${percentText(treated)} against ${percentText(base)}, which is why guardrails compare the two groups.`,
  };
});

export const FLAG_ITEMS = {
  'rollout-overlap': rolloutOverlap,
  'rollout-stickiness': rolloutStickiness,
  'random-flicker': randomFlicker,
  'ruleset-bandwidth': rulesetBandwidth,
  'cdn-staleness': cdnStaleness,
  'flag-outage': flagOutage,
  'guardrail-cohort': guardrailCohort,
} satisfies Partial<Record<DesignItemId, DesignItemDefinition>>;
