import { mulberry32 } from '../../../algorithms/random.js';
import { num, spacedChoices, type WidgetCheckpoint } from '../widget-checkpoint.js';
import { murmur3 } from './murmur.js';

/** A rollout percentage resolves to 0.01%: a user is in when their bucket is below percent × 100. */
export const BUCKETS = 10_000;
export const ROLLOUT_STAGES = [1, 5, 10, 25, 50, 100] as const;
export const POPULATION = 1_000;
/** Requests each user makes in the flicker count. */
export const REQUESTS = 5;
export const FLAG_A = 'new-checkout';
/** A second flag already running, so its users can be compared with the first's. */
export const FLAG_B = { key: 'search-ranking', percent: 50 } as const;

/** How a flag picks its users: hash its salt with the user id, hash the user id alone for every flag, or roll a die per evaluation. */
export type Assignment = 'flag-salt' | 'user-only' | 'random';

export const rolloutUsers = (count = POPULATION) => Array.from({ length: count }, (_, i) => `user-${i + 1}`);

/** A flag's salt: its key, as Unleash uses by default, and a version suffix once someone changes it. */
export const saltOf = (key: string, version: number) => (version === 1 ? key : `${key}/${version}`);

/** The user's bucket for a flag: murmur3 of the salt and the user id, or of the id alone when there is no salt. */
export const flagBucket = (userId: string, salt: string | null) => murmur3(salt === null ? userId : `${salt}:${userId}`) % BUCKETS;

export const inRollout = (b: number, percent: number) => b < percent * (BUCKETS / 100);

/** A die rolled for one evaluation: the same user, request and flag always roll the same, so a run can be replayed. */
const roll = (userId: string, request: number, flag: string) => mulberry32(murmur3(`${flag}#${request}#${userId}`))();

export interface RolloutState {
  percent: number;
  saltVersion: number;
}

export interface BucketingSettings extends RolloutState {
  scheme: Assignment;
}

export interface UserCell {
  id: string;
  inA: boolean;
  inB: boolean;
  /** In flag A before the last change, or null when nothing changed yet. */
  wasIn: boolean | null;
  /** Saw both versions of flag A over `REQUESTS` requests. */
  flips: boolean;
}

export interface BucketingRun {
  users: UserCell[];
  inA: number;
  inB: number;
  both: number;
  /** Against the state before the last change: users still in, users dropped and users added. Null with no change. */
  stayed: number | null;
  left: number | null;
  joined: number | null;
  flipped: number;
}

function inFlag(scheme: Assignment, userId: string, key: string, state: RolloutState, request: number): boolean {
  if (scheme === 'random') return roll(userId, request, key) < state.percent / 100;
  return inRollout(flagBucket(userId, scheme === 'user-only' ? null : saltOf(key, state.saltVersion)), state.percent);
}

/**
 * Flag A for every user under the scheme, flag B at 50% beside it, and what the last change did. A random scheme rolls
 * again on every request: request 1 is shown, request 0 came before the change, and requests 1 to 5 are counted for flicker.
 */
export function bucketingRun(s: BucketingSettings, previous: RolloutState | null, population = POPULATION): BucketingRun {
  const b: RolloutState = { percent: FLAG_B.percent, saltVersion: 1 };
  const users = rolloutUsers(population).map((id): UserCell => {
    const inA = inFlag(s.scheme, id, FLAG_A, s, 1);
    let flips = false;
    for (let r = 2; r <= REQUESTS && !flips && s.scheme === 'random'; r++) flips = inFlag(s.scheme, id, FLAG_A, s, r) !== inA;
    return {
      id,
      inA,
      inB: inFlag(s.scheme, id, FLAG_B.key, b, 1),
      wasIn: previous ? inFlag(s.scheme, id, FLAG_A, previous, 0) : null,
      flips,
    };
  });
  const count = (test: (u: UserCell) => boolean) => users.filter(test).length;
  return {
    users,
    inA: count((u) => u.inA),
    inB: count((u) => u.inB),
    both: count((u) => u.inA && u.inB),
    stayed: previous ? count((u) => u.wasIn === true && u.inA) : null,
    left: previous ? count((u) => u.wasIn === true && !u.inA) : null,
    joined: previous ? count((u) => u.wasIn === false && u.inA) : null,
    flipped: count((u) => u.flips),
  };
}

/** The chance a user sees both versions over `requests` requests when each rolls a die that comes up in with chance `p`. */
export const flickerChance = (p: number, requests = REQUESTS) => 1 - p ** requests - (1 - p) ** requests;

const users = (v: number) => `${num(v)} user${v === 1 ? '' : 's'}`;
const pct = (v: number) => `${v}%`;

function describeChange(previous: RolloutState, s: RolloutState): string {
  const parts: string[] = [];
  if (previous.percent !== s.percent) parts.push(`moves from ${pct(previous.percent)} to ${pct(s.percent)}`);
  if (previous.saltVersion !== s.saltVersion) parts.push(`gets a new salt`);
  return parts.join(' and ') || 'is saved again unchanged';
}

/**
 * A prediction about the current settings, read from the run: how many users flicker under a random scheme, how many
 * stay in after the last change, or else how many of flag A's users are also in flag B.
 */
export function bucketingCheckpoint(
  s: BucketingSettings,
  previous: RolloutState | null,
  run = bucketingRun(s, previous),
): WidgetCheckpoint {
  const p = s.percent / 100;
  if (previous && run.stayed !== null) {
    const before = run.stayed + run.left!;
    const sticky = s.scheme !== 'random' && previous.saltVersion === s.saltVersion;
    const why = sticky
      ? previous.percent <= s.percent
        ? `Each user's bucket depends only on the salt and their id, so raising the percentage only adds buckets: all ${num(before)} stay in, and ${num(run.joined!)} join.`
        : `Each user's bucket stays put, so lowering the percentage drops only the users whose buckets are above the new line: ${num(run.stayed)} stay, ${num(run.left!)} leave.`
      : s.scheme === 'random'
        ? `A die rolled per request ignores who was in before: each of the ${num(before)} stays in with chance ${pct(s.percent)}, about ${num(before * p)}; this run kept ${num(run.stayed)}. They flip back and forth on every request too.`
        : `A new salt gives every user a new bucket, unrelated to the old one: each of the ${num(before)} stays in with chance ${pct(s.percent)}, about ${num(before * p)}; this run kept ${num(run.stayed)}. Change a salt only to start a fresh sample on purpose.`;
    return {
      prompt: `Predict: ${FLAG_A} ${describeChange(previous, s)}. Of the ${users(before)} who were in before, how many are still in?`,
      ...spacedChoices(run.stayed, [before, 0, Math.round(before / 2), run.inA, POPULATION], users),
      explain: why,
    };
  }
  if (s.scheme === 'random') {
    const expected = POPULATION * flickerChance(p);
    return {
      prompt: `Predict: every user makes ${REQUESTS} requests while ${FLAG_A} is at ${pct(s.percent)}. How many of the ${num(POPULATION)} see both versions?`,
      ...spacedChoices(run.flipped, [0, run.inA, POPULATION, Math.round(POPULATION / 2)], users),
      explain: `Each request rolls its own die, so a user sees one version only if all ${REQUESTS} rolls agree, which happens with probability ${p}^${REQUESTS} + ${Number((1 - p).toFixed(2))}^${REQUESTS}. Expect about ${num(expected)} of ${num(POPULATION)} to see both; this run has ${num(run.flipped)}. A hash gives every request the same answer, so none would.`,
    };
  }
  const shared = s.scheme === 'user-only';
  return {
    prompt: `Predict: ${FLAG_B.key} already serves ${pct(FLAG_B.percent)} of users. Of the ${users(run.inA)} in ${FLAG_A} at ${pct(s.percent)}, how many are also in ${FLAG_B.key}?`,
    ...spacedChoices(run.both, [run.inA, 0, Math.round(run.inA / 2), run.inB, POPULATION], users),
    explain: shared
      ? `Without a salt both flags compare the same bucket, so the lower percentage picks a subset of the higher: ${s.percent <= FLAG_B.percent ? `every one of the ${users(run.inA)} is in ${FLAG_B.key}` : `all ${users(run.inB)} in ${FLAG_B.key} are in ${FLAG_A}`}. The same users get every experiment, and their results mix.`
      : `Each flag hashes its own salt, so its buckets are unrelated to the other's: about ${pct(FLAG_B.percent)} of ${FLAG_A}'s users land in ${FLAG_B.key}, ${num(run.inA * (FLAG_B.percent / 100))} expected; this run has ${num(run.both)}.`,
  };
}
