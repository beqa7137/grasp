import { durationText } from '../email/smtp-retry.js';
import { storageText } from '../email/storage.js';
import { num, spacedChoices, type WidgetCheckpoint } from '../widget-checkpoint.js';

/** Stated assumptions of the distribution model. Links in Gbit/s. */
export const DISTRIBUTION = {
  /** What a host's deploy agent may use, down and up, so serving traffic keeps the rest of the link. */
  hostDownGbps: 1,
  hostUpGbps: 1,
  /** Each regional cache's link, both ways. */
  cacheGbps: 20,
  /** The share of an artifact that changes between releases, so a delta against the release a host holds is this much. */
  deltaShare: 0.1,
} as const;

export const SIZE_STOPS = [50, 100, 200, 500, 1_000, 2_000, 5_000] as const;
export const HOSTS_STOPS = [100, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000] as const;
export const ORIGIN_STOPS = [1, 2, 5, 10, 20, 40, 100] as const;
export const CACHE_STOPS = [0, 1, 2, 5, 10, 20] as const;

export interface DistributionSettings {
  sizeMb: number;
  hosts: number;
  originGbps: number;
  /** Regional caches, each serving an equal share of the hosts; with none, hosts fetch from the origin. */
  caches: number;
  p2p: boolean;
  delta: boolean;
}

/** Where the time goes: the origin's uplink, the caches' links, or the hosts' own links. */
export type Tier = 'origin' | 'caches' | 'hosts';
export const TIERS: readonly Tier[] = ['origin', 'caches', 'hosts'];

export interface DistributionRun {
  /** Bytes each host downloads: the artifact, or the delta against the release it holds. */
  bytesPerHost: number;
  /** The longest any tier needs, in seconds, for each tier present. */
  tierSeconds: Partial<Record<Tier, number>>;
  seconds: number;
  bottleneck: Tier;
  /** Bytes leaving the origin for one release. */
  originBytes: number;
}

const GBIT = 1e9;

/**
 * The time for every host to hold the artifact, from the fluid model of file distribution (Kumar and Ross; Kurose and
 * Ross, Computer Networking, section 2.5): from a server, N copies need N × F / server upload; in a swarm, every piece
 * must leave the seed once (F / seed upload) and the swarm's whole upload carries N × F / (seed + N × peer upload); and
 * each host needs F / its download. Data streams through every tier at once, so the slowest term sets the time; this is
 * the ideal, ignoring piece hops, verification and stragglers.
 */
export function distribution(s: DistributionSettings): DistributionRun {
  if (!(s.sizeMb > 0 && s.hosts >= 1 && s.originGbps > 0 && s.caches >= 0 && s.caches <= s.hosts)) throw new Error('Settings out of range');
  const { hostDownGbps, hostUpGbps, cacheGbps, deltaShare } = DISTRIBUTION;
  const bytesPerHost = s.sizeMb * 1e6 * (s.delta ? deltaShare : 1);
  const bits = bytesPerHost * 8;
  const terms: [Tier, number][] = [['hosts', bits / (hostDownGbps * GBIT)]];
  const fanOut = (source: Tier, sourceGbps: number, receivers: number) => {
    if (s.p2p) {
      terms.push([source, bits / (sourceGbps * GBIT)]);
      terms.push(['hosts', (receivers * bits) / ((sourceGbps + receivers * hostUpGbps) * GBIT)]);
    } else terms.push([source, (receivers * bits) / (sourceGbps * GBIT)]);
  };
  if (s.caches === 0) fanOut('origin', s.originGbps, s.hosts);
  else {
    terms.push(['origin', (s.caches * bits) / (s.originGbps * GBIT)]);
    terms.push(['caches', bits / (cacheGbps * GBIT)]);
    fanOut('caches', cacheGbps, s.hosts / s.caches);
  }
  const tierSeconds: Partial<Record<Tier, number>> = {};
  for (const [tier, t] of terms) tierSeconds[tier] = Math.max(tierSeconds[tier] ?? 0, t);
  const [bottleneck, seconds] = terms.reduce((a, b) => (b[1] > a[1] ? b : a));
  const copies = s.caches > 0 ? s.caches : s.p2p ? 1 : s.hosts;
  return { bytesPerHost, tierSeconds, seconds, bottleneck, originBytes: copies * bytesPerHost };
}

/** Seconds as they read best: `0.4 s`, `13 s`, `13 min 20 s`, `2 h 13 min`. */
export function secondsSpan(v: number): string {
  if (v < 10) return `${Number(v.toFixed(v < 1 ? 2 : 1))} s`;
  if (v < 60) return `${Math.round(v)} s`;
  if (v < 3_600) {
    const whole = Math.round(v);
    const m = Math.floor(whole / 60);
    const sec = whole % 60;
    return sec ? `${m} min ${sec} s` : `${m} min`;
  }
  return durationText(v / 60);
}

export const TIER_TEXT: Record<Tier, string> = {
  origin: "The origin's uplink",
  caches: "The regional caches' links",
  hosts: "The hosts' own links",
};

const describe = (s: DistributionSettings) =>
  `a ${num(s.sizeMb)} MB artifact${s.delta ? ` shipped as a ${DISTRIBUTION.deltaShare * 100}% delta` : ''} goes to ${num(s.hosts)} hosts from an origin with ${num(s.originGbps)} Gbit/s, ${s.caches === 0 ? 'with no regional caches' : `through ${num(s.caches)} regional cache${s.caches === 1 ? '' : 's'}`}, ${s.p2p ? 'hosts sharing pieces peer to peer' : 'each host downloading on its own'}`;

type DistributionQuestion = 'time' | 'bottleneck' | 'egress';

/** The bottleneck is asked only when it clearly wins: the runner-up tier needs at most 80% of its time. */
export function clearBottleneck(run: DistributionRun): boolean {
  const others = TIERS.filter((t) => t !== run.bottleneck).map((t) => run.tierSeconds[t] ?? 0);
  return Math.max(...others) <= 0.8 * run.seconds;
}

function questionFor(s: DistributionSettings, run: DistributionRun): DistributionQuestion {
  const at = (stops: readonly number[], v: number) => stops.indexOf(v);
  const pick =
    at(SIZE_STOPS, s.sizeMb) + at(HOSTS_STOPS, s.hosts) + at(ORIGIN_STOPS, s.originGbps) + at(CACHE_STOPS, s.caches) + (s.p2p ? 1 : 0);
  const question = (['time', 'bottleneck', 'egress'] as const)[((pick % 3) + 3) % 3];
  return question === 'bottleneck' && !clearBottleneck(run) ? 'time' : question;
}

/**
 * A prediction about the current settings, read from the run: how long until every host holds the artifact, which tier
 * limits that, or how many bytes leave the origin. Distractors are what the same question gives without the caches, the
 * peers or the delta, or the bytes the hosts receive in all.
 */
export function distributionCheckpoint(s: DistributionSettings, run = distribution(s)): WidgetCheckpoint {
  const situation = describe(s);
  const question = questionFor(s, run);
  const terms = TIERS.filter((t) => run.tierSeconds[t] !== undefined)
    .map((t) => `${TIER_TEXT[t].toLowerCase()} ${secondsSpan(run.tierSeconds[t]!)}`)
    .join(', ');
  if (question === 'bottleneck')
    return {
      prompt: `Predict: ${situation}. Which links limit how fast every host gets it?`,
      choices: TIERS.map((t) => TIER_TEXT[t]),
      answer: TIERS.indexOf(run.bottleneck),
      explain: `The slowest tier sets the pace: ${terms}. ${
        run.bottleneck === 'origin'
          ? 'Every copy leaves one place, so adding hosts adds time; caches or peers take the copies off the origin.'
          : run.bottleneck === 'caches'
            ? 'Each cache sends a full copy to every host in its region; more caches, or peers sharing pieces, spread that load.'
            : `Each host can only download so fast; ${s.delta ? 'only a smaller artifact or more of the link for deploys' : 'a delta, not more servers,'} makes it faster from here.`
      }`,
    };
  const variants = [
    { ...s, p2p: !s.p2p },
    { ...s, caches: 0, p2p: false },
    { ...s, delta: !s.delta },
    { ...s, caches: s.caches === 0 ? 5 : 0 },
  ]
    .filter((v) => v.caches <= v.hosts)
    .map(distribution);
  if (question === 'time')
    return {
      prompt: `Predict: ${situation}. In the ideal fluid model, how long until every host holds it?`,
      ...spacedChoices(
        run.seconds,
        variants.map((v) => v.seconds),
        secondsSpan,
        0.01,
      ),
      explain: `${storageText(run.bytesPerHost)} a host. Each tier needs at least: ${terms}. The slowest, ${TIER_TEXT[run.bottleneck].toLowerCase()}, sets the time at ${secondsSpan(run.seconds)}. Real systems take longer: ${s.p2p ? 'pieces hop between peers, ' : ''}every piece is checked against its digest, and a few slow hosts trail.`,
    };
  const copies = s.caches > 0 ? s.caches : s.p2p ? 1 : s.hosts;
  return {
    prompt: `Predict: ${situation}. How many bytes leave the origin for this release?`,
    ...spacedChoices(run.originBytes, [s.hosts * run.bytesPerHost, ...variants.map((v) => v.originBytes)], storageText, 1),
    explain: `${
      s.caches > 0
        ? `The origin fills each of the ${num(s.caches)} caches once, and the hosts fetch from their cache${s.p2p ? ' and from each other' : ''}`
        : s.p2p
          ? 'The origin seeds the swarm: each piece leaves it about once, and the hosts trade the rest among themselves'
          : 'Every host downloads its own copy from the origin'
    }: ${num(copies)} × ${storageText(run.bytesPerHost)} = ${storageText(run.originBytes)}, against ${storageText(s.hosts * run.bytesPerHost)} that reach the hosts in all.`,
  };
}
