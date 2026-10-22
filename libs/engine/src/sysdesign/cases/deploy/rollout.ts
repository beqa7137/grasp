import { durationText } from '../email/smtp-retry.js';
import { num, spacedChoices, type WidgetCheckpoint } from '../widget-checkpoint.js';

/** The stops each slider moves through. Times are in minutes, shares in percent of the fleet. */
export const FLEET_STOPS = [100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000] as const;
export const CANARY_STOPS = [0.5, 1, 2, 5, 10] as const;
export const WAVE_STOPS = [1, 2, 3, 4, 5, 6] as const;
export const BAKE_STOPS = [0, 5, 10, 15, 30, 60, 120] as const;
export const UNAVAILABLE_STOPS = [1, 2, 5, 10, 20, 25] as const;
export const HOST_TIME_STOPS = [1, 2, 3, 5, 10, 15] as const;
export const DETECT_STOPS = [5, 10, 15, 20, 30, 45, 60, 90, 120] as const;

/** How the hosts after the canary are split into waves: equal waves, or each wave twice the one before. */
export type WaveShape = 'equal' | 'doubling';
export const WAVE_SHAPES: readonly WaveShape[] = ['equal', 'doubling'];

export interface RolloutSettings {
  fleet: number;
  canaryPct: number;
  /** Waves after the canary. */
  waves: number;
  shape: WaveShape;
  /** How long each wave but the last bakes before the next one starts. */
  bakeMin: number;
  /** The most hosts out of service at once, as a percent of the fleet: one batch. */
  maxUnavailablePct: number;
  /** Draining, stopping, swapping the build, starting and passing readiness, for one batch of hosts in parallel. */
  hostMin: number;
  /** How long after the first canary hosts serve the new build automated analysis flags it as bad. */
  detectMin: number;
}

export interface RolloutWave {
  /** 0 is the canary. */
  index: number;
  hosts: number;
  startMin: number;
  endMin: number;
  /** Hosts in this wave whose batch started before detection. */
  exposed: number;
}

export interface RolloutRun {
  waves: RolloutWave[];
  canary: number;
  /** Hosts updated at once. */
  batch: number;
  totalMin: number;
  /** The most hosts out of service at any moment. */
  peakDown: number;
  detectAtMin: number;
  /** Hosts that received the build before it was flagged: the blast radius of a bad build. */
  exposed: number;
}

/** Integer sizes in proportion to `weights` that add up to `total`, rounding the running sum so nothing is lost. */
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  let before = 0;
  let acc = 0;
  return weights.map((w) => {
    acc += w;
    const upTo = Math.round((total * acc) / sum);
    const size = upTo - before;
    before = upTo;
    return size;
  });
}

export const canaryHosts = (s: Pick<RolloutSettings, 'fleet' | 'canaryPct'>) => Math.max(1, Math.round((s.fleet * s.canaryPct) / 100));
export const batchHosts = (s: Pick<RolloutSettings, 'fleet' | 'maxUnavailablePct'>) =>
  Math.max(1, Math.floor((s.fleet * s.maxUnavailablePct) / 100));

/** The canary, then the rest of the fleet split into waves; a wave rounded down to no hosts is left out. */
export function waveSizes(s: Pick<RolloutSettings, 'fleet' | 'canaryPct' | 'waves' | 'shape'>): number[] {
  const canary = canaryHosts(s);
  const weights = Array.from({ length: s.waves }, (_, i) => (s.shape === 'equal' ? 1 : 2 ** i));
  return [canary, ...split(s.fleet - canary, weights)].filter((h) => h > 0);
}

export function rollout(s: RolloutSettings): RolloutRun {
  if (!(s.fleet >= 2 && s.canaryPct > 0 && s.canaryPct < 100 && s.waves >= 1 && s.bakeMin >= 0 && s.hostMin > 0 && s.detectMin >= 0))
    throw new Error('Settings out of range');
  const batch = batchHosts(s);
  const detectAtMin = s.hostMin + s.detectMin;
  const sizes = waveSizes(s);
  const waves: RolloutWave[] = [];
  let t = 0;
  sizes.forEach((hosts, index) => {
    const batches = Math.ceil(hosts / batch);
    const started = Math.max(0, Math.min(batches, Math.ceil((detectAtMin - t) / s.hostMin)));
    const exposed = Math.min(hosts, started * batch);
    waves.push({ index, hosts, startMin: t, endMin: t + batches * s.hostMin, exposed });
    t += batches * s.hostMin + (index < sizes.length - 1 ? s.bakeMin : 0);
  });
  return {
    waves,
    canary: sizes[0],
    batch,
    totalMin: waves.at(-1)!.endMin,
    peakDown: Math.min(batch, Math.max(...sizes)),
    detectAtMin,
    exposed: waves.reduce((a, w) => a + w.exposed, 0),
  };
}

const plural = (v: number, unit: string) => `${num(v)} ${unit}${v === 1 ? '' : 's'}`;
export const hostsText = (v: number) => plural(v, 'host');
const batchesText = (v: number) => (v === 1 ? '1 batch' : `${num(v)} batches`);
export const shareText = (part: number, whole: number) => {
  const pct = (part / whole) * 100;
  return `${pct < 10 && pct !== Math.round(pct) ? Number(pct.toFixed(1)) : Math.round(pct)}%`;
};

/** The waves after the canary, in words: `4 equal waves`, `3 waves that each double the one before`. */
export const wavesText = (waves: number, shape: WaveShape) =>
  waves === 1 ? '1 wave' : shape === 'equal' ? `${waves} equal waves` : `${waves} waves that each double the one before`;

/** The bake between waves, in words: `baking 30 min after every wave but the last`, or none. */
export const bakeText = (bakeMin: number) =>
  bakeMin === 0 ? 'with no bake between waves' : `baking ${durationText(bakeMin)} after every wave but the last`;

const describe = (s: RolloutSettings, run: RolloutRun) =>
  `${num(s.fleet)} hosts; a ${num(s.canaryPct)}% canary (${hostsText(run.canary)}), then ${wavesText(s.waves, s.shape)}, ${bakeText(s.bakeMin)}; at most ${num(s.maxUnavailablePct)}% (${hostsText(run.batch)}) out at once, ${durationText(s.hostMin)} a batch`;

type RolloutQuestion = 'duration' | 'blast';

/** Picked from the settings, never the outcome, so it varies as the learner moves them. */
function questionFor(s: RolloutSettings): RolloutQuestion {
  const at = (stops: readonly number[], v: number) => stops.indexOf(v);
  const pick =
    at(FLEET_STOPS, s.fleet) +
    at(CANARY_STOPS, s.canaryPct) +
    s.waves +
    at(BAKE_STOPS, s.bakeMin) +
    at(UNAVAILABLE_STOPS, s.maxUnavailablePct) +
    at(HOST_TIME_STOPS, s.hostMin) +
    at(DETECT_STOPS, s.detectMin) +
    (s.shape === 'doubling' ? 1 : 0);
  return (((pick % 2) + 2) % 2 === 0 ? 'duration' : 'blast') as RolloutQuestion;
}

const waveName = (w: RolloutWave) => (w.index === 0 ? 'the canary' : `wave ${w.index}`);

/**
 * A prediction about the current settings, read from the run: how long the whole rollout takes, or how many hosts run a
 * bad build by the time analysis flags it. Distractors are what the same question gives when a step of the plan is
 * forgotten, or under neighboring settings.
 */
export function rolloutCheckpoint(s: RolloutSettings, run = rollout(s)): WidgetCheckpoint {
  const situation = describe(s, run);
  const bakes = run.waves.length - 1;
  if (questionFor(s) === 'duration') {
    const working = run.waves.map((w) => `${waveName(w)} ${hostsText(w.hosts)} in ${batchesText(Math.ceil(w.hosts / run.batch))}`);
    const baking = bakes * s.bakeMin;
    const updating = run.totalMin - baking;
    const unbatched = run.waves.length * s.hostMin + baking;
    const neighbors = [
      { ...s, maxUnavailablePct: s.maxUnavailablePct * 2 },
      { ...s, maxUnavailablePct: s.maxUnavailablePct / 2 },
    ].map((n) => rollout(n).totalMin);
    return {
      prompt: `Predict: ${situation}. How long does the whole rollout take, if nothing goes wrong?`,
      ...spacedChoices(run.totalMin, [updating, unbatched, run.totalMin + s.bakeMin, ...neighbors], durationText, 1),
      explain: `Hosts update ${num(run.batch)} at a time, ${durationText(s.hostMin)} a batch: ${working.join('; ')}. That is ${durationText(updating)} of updating${baking ? `, plus ${plural(bakes, 'bake')} of ${durationText(s.bakeMin)} between waves` : ' and no baking'}: ${durationText(run.totalMin)}. ${baking > updating ? 'Baking is most of it: the price of catching a bad build while it is small.' : 'Updating is most of it: the cap on hosts out at once sets the pace.'}`,
    };
  }
  const noBake = rollout({ ...s, bakeMin: 0 }).exposed;
  const later = rollout({ ...s, detectMin: s.detectMin * 2 }).exposed;
  const firstWave = run.waves.length > 1 ? run.canary + run.waves[1].hosts : run.canary;
  const reached = run.waves.filter((w) => w.exposed > 0);
  const last = reached.at(-1)!;
  const where =
    run.exposed === s.fleet
      ? `the rollout finished at ${durationText(run.totalMin)}, before detection, so every host has it`
      : last.exposed < last.hosts
        ? `${waveName(last)} has started ${hostsText(last.exposed)} of its ${num(last.hosts)}`
        : `${waveName(last)} is done and ${waveName(run.waves[last.index + 1])} has not started`;
  return {
    prompt: `Predict: ${situation}. The build is bad, and automated analysis flags it ${durationText(s.detectMin)} after the first canary hosts serve it. How many hosts have received it by then?`,
    ...spacedChoices(run.exposed, [run.canary, firstWave, s.fleet, noBake, later], hostsText, 1),
    explain: `The first canary batch serves the build at ${durationText(s.hostMin)}, so the alarm fires at ${durationText(run.detectAtMin)}. By then ${where}: ${reached.map((w) => `${num(w.exposed)} in ${waveName(w)}`).join(', ')}, ${hostsText(run.exposed)} (${shareText(run.exposed, s.fleet)} of the fleet). ${s.bakeMin >= s.detectMin ? `A bake of ${durationText(s.bakeMin)}, at least the ${durationText(s.detectMin)} detection takes, keeps a bad build in the canary.` : `A bake shorter than the ${durationText(s.detectMin)} detection takes lets the next wave start before the alarm.`}`,
  };
}
