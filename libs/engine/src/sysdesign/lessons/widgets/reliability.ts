import { formatDown } from '../format-time.js';

/**
 * The Reliability widget's exact model (REDESIGN.md 5.2, R41): a request crosses parts in series, each a set of identical
 * copies in parallel, with two ways redundancy underdelivers, failures a part's copies share and a failover that takes
 * time. Every number the learner reads comes from these closed forms; the simulated year (`reliability-sample.ts`) is
 * drawn and labeled as one year.
 */

export const RELIABILITY_YEAR_H = 8_760;
/** The SLO window the lesson uses: 30 days, 43,200 minutes. */
export const RELIABILITY_MONTH_H = 720;
export const RELIABILITY_WEEKS = 52;
/** Every copy of every part: down 1 h for every 999 h up. */
export const COPY_UNAVAILABILITY = 0.001;
export const COPY_MTTR_H = 1;
export const COPY_CYCLE_H = COPY_MTTR_H / COPY_UNAVAILABILITY;
export const COPY_MTBF_H = COPY_CYCLE_H - COPY_MTTR_H;
export const COPY_FAILS_PER_YEAR = RELIABILITY_YEAR_H / COPY_CYCLE_H;
/** With shared failures on, this share of a copy's downtime has a cause every copy of its part shares. */
export const SHARED_SHARE = 0.1;
/** With failover on, traffic takes this long to move off the copy in use when it dies. */
export const FAILOVER_MIN = 5;
export const FAILOVER_H = FAILOVER_MIN / 60;
export const RELIABILITY_COPIES = [1, 2, 3] as const;

export type ReliabilityPartId = 'lb' | 'app' | 'db' | 'recs';
export interface ReliabilityPartInfo {
  id: ReliabilityPartId;
  name: string;
  short: string;
  many: string;
  one: string;
}
export const RELIABILITY_PARTS: readonly ReliabilityPartInfo[] = [
  { id: 'lb', name: 'Load balancer', short: 'LB', many: 'load balancers', one: 'load balancer' },
  { id: 'app', name: 'App servers', short: 'App', many: 'app servers', one: 'app server' },
  { id: 'db', name: 'Database', short: 'DB', many: 'databases', one: 'database' },
  {
    id: 'recs',
    name: 'Recommendations',
    short: 'Recs',

    many: 'recommendations services',
    one: 'recommendations service',
  },
];

/** Copies of each part (1 to 3); `optional`, `shared` and `failover` are 0 or 1, as `ExperimentSettings` requires. */
export type ReliabilitySettings = {
  lb: number;
  app: number;
  db: number;
  recs: number;
  /** Recommendations are optional: the page renders without them. */
  optional: number;
  /** 1 in 10 of a copy's outages has a cause every copy of its part shares. */
  shared: number;
  /** Traffic takes 5 min to move off the copy in use when it dies. */
  failover: number;
};
export const RELIABILITY_BASELINE: ReliabilitySettings = { lb: 2, app: 3, db: 1, recs: 1, optional: 0, shared: 0, failover: 0 };

/** Every setting, in a fixed order: 648 of them. */
export const RELIABILITY_SETTINGS: readonly ReliabilitySettings[] = RELIABILITY_COPIES.flatMap((lb) =>
  RELIABILITY_COPIES.flatMap((app) =>
    RELIABILITY_COPIES.flatMap((db) =>
      RELIABILITY_COPIES.flatMap((recs) =>
        [0, 1].flatMap((optional) =>
          [0, 1].flatMap((shared) => [0, 1].map((failover) => ({ lb, app, db, recs, optional, shared, failover }))),
        ),
      ),
    ),
  ),
);

/** The settings the experiments and the year's seed bounds quote. */
export const RELIABILITY_SETUPS = {
  series: { lb: 1, app: 1, db: 1, recs: 1, optional: 0, shared: 0, failover: 0 },
  parallelBefore: { lb: 1, app: 1, db: 1, recs: 1, optional: 1, shared: 0, failover: 0 },
  parallelAfter: { lb: 1, app: 1, db: 2, recs: 1, optional: 1, shared: 0, failover: 0 },
  weakestBefore: { lb: 2, app: 2, db: 1, recs: 1, optional: 1, shared: 0, failover: 0 },
  weakestAfter: { lb: 2, app: 3, db: 1, recs: 1, optional: 1, shared: 0, failover: 0 },
  pairs: { lb: 2, app: 2, db: 2, recs: 1, optional: 1, shared: 0, failover: 0 },
  sharedAfter: { lb: 2, app: 2, db: 2, recs: 1, optional: 1, shared: 1, failover: 0 },
  failoverAfter: { lb: 2, app: 2, db: 2, recs: 1, optional: 1, shared: 0, failover: 1 },
  challenge: { lb: 2, app: 3, db: 1, recs: 1, optional: 0, shared: 1, failover: 1 },
  solution: { lb: 2, app: 2, db: 2, recs: 1, optional: 1, shared: 1, failover: 1 },
  base: RELIABILITY_BASELINE,
} as const satisfies Record<string, ReliabilitySettings>;

export const reliabilitySettings = (s: Partial<ReliabilitySettings>): ReliabilitySettings => ({ ...RELIABILITY_BASELINE, ...s });
export const reliabilityKey = (s: ReliabilitySettings) => `${s.lb}${s.app}${s.db}${s.recs}${s.optional}${s.shared}${s.failover}`;

/** Where a part's downtime comes from, each as a share of the time. */
export interface PartCauses {
  single: number;
  shared: number;
  failover: number;
  overlap: number;
}
export interface PartAvailability {
  n: number;
  /** The share of the time the part cannot carry the request. */
  u: number;
  /** What the arithmetic promises: independent failures, instant failover. */
  paper: number;
  causes: PartCauses;
  /** Failures of the request a year the part causes, on average. */
  failsPerYear: number;
  failovers: number;
  sharedPerYear: number;
  overlapsPerYear: number;
  /** Outages a year of one copy's own cause. */
  ownPerYear: number;
}

/**
 * One part of `n` identical copies, any one of which can serve.
 * - One copy: down whenever it is, COPY_UNAVAILABILITY of the time.
 * - Shared failures: a cause that takes every copy at once is down SHARED_SHARE of that; a copy's own cause makes up the
 *   rest, so each copy is still exactly 99.9%: (1 − own)(1 − shared) = 1 − u.
 * - All copies down on their own causes at once: own^n (independent copies: unavailabilities multiply).
 * - Failover: each time the copy in use (the first that is up) dies on its own while another is up, the part is down
 *   FAILOVER_H. For 2 copies this is exact for the process the spec simulates; for 3 it leaves out a backup dying while
 *   it serves (2 s a year).
 */
export function partAvailability(n: number, shared: boolean, failover: boolean): PartAvailability {
  const u = COPY_UNAVAILABILITY;
  const paper = u ** n;
  if (n === 1)
    return {
      n,
      u,
      paper,
      causes: { single: u, shared: 0, failover: 0, overlap: 0 },
      failsPerYear: COPY_FAILS_PER_YEAR,
      failovers: 0,
      sharedPerYear: 0,
      overlapsPerYear: 0,
      ownPerYear: COPY_FAILS_PER_YEAR,
    };
  const uShared = shared ? SHARED_SHARE * u : 0;
  const uOwn = 1 - (1 - u) / (1 - uShared);
  const ownPerYear = (RELIABILITY_YEAR_H * uOwn) / COPY_MTTR_H;
  const all = uOwn ** n;
  const fo = failover ? ((FAILOVER_H * uOwn) / COPY_MTTR_H) * (1 - uOwn ** (n - 1)) : 0;
  const causes = { single: 0, shared: uShared, failover: (1 - uShared) * fo, overlap: (1 - uShared) * all };
  const sharedPerYear = (RELIABILITY_YEAR_H * uShared) / COPY_MTTR_H;
  const failovers = failover ? ownPerYear * (1 - uOwn ** (n - 1)) : 0;
  const overlapsPerYear = n * ownPerYear * uOwn ** (n - 1);
  return {
    n,
    u: causes.shared + causes.failover + causes.overlap,
    paper,
    causes,
    failsPerYear: sharedPerYear + failovers + overlapsPerYear,
    failovers,
    sharedPerYear,
    overlapsPerYear,
    ownPerYear,
  };
}

export const hoursAYear = (u: number) => u * RELIABILITY_YEAR_H;
export const ninesOf = (u: number) => -Math.log10(u);
/** 1 − the product of (1 − u), without losing the small ones. */
export const seriesUnavailability = (us: readonly number[]) => -Math.expm1(us.reduce((s, u) => s + Math.log1p(-u), 0));

export interface ReliabilityPart extends ReliabilityPartInfo, PartAvailability {
  copies: number;
  optional: boolean;
  downH: number;
  paperDownH: number;
  nines: number;
  paperNines: number;
}

export interface ReliabilityScenario {
  settings: ReliabilitySettings;
  key: string;
  parts: readonly ReliabilityPart[];
  u: number;
  availability: number;
  nines: number;
  downH: number;
  monthH: number;
  paperU: number;
  paperDownH: number;
  /** The needed parts that print the worst downtime: a learner reads ties off the printed values and the bars. */
  weakest: readonly ReliabilityPartId[];
  /** The part the cap line starts from: the one with the most downtime. */
  capPart: ReliabilityPartId;
  /** The part the band rests on: the weakest, and of several tied the last in the chain. */
  focusPart: ReliabilityPartId;
  failsPerYear: number;
  copies: number;
  /** What a challenge's goal reads: the request's hours down a year and the copies in all. */
  metrics: Readonly<Record<string, number>>;
}

const scenarios = new Map<string, ReliabilityScenario>();

/** The whole request: every part that is not optional must be up, and parts fail independently of each other. */
export function reliabilityScenario(settings: Partial<ReliabilitySettings>): ReliabilityScenario {
  const s = reliabilitySettings(settings);
  const key = reliabilityKey(s);
  const known = scenarios.get(key);
  if (known) return known;
  const parts = RELIABILITY_PARTS.map((p): ReliabilityPart => {
    const copies = s[p.id];
    const m = partAvailability(copies, !!s.shared, !!s.failover);
    return {
      ...p,
      ...m,
      copies,
      optional: p.id === 'recs' && !!s.optional,
      downH: hoursAYear(m.u),
      paperDownH: hoursAYear(m.paper),
      nines: ninesOf(m.u),
      paperNines: ninesOf(m.paper),
    };
  });
  const hard = parts.filter((p) => !p.optional);
  const u = seriesUnavailability(hard.map((p) => p.u));
  const paperU = seriesUnavailability(hard.map((p) => p.paper));
  const worst = hard.reduce((a, b) => (b.u > a.u ? b : a));
  const worstPrinted = formatDown(worst.downH);
  const weakest = hard.filter((p) => formatDown(p.downH) === worstPrinted).map((p) => p.id);
  const downH = hoursAYear(u);
  const copies = parts.reduce((t, p) => t + p.copies, 0);
  const scenario: ReliabilityScenario = {
    settings: s,
    key,
    parts,
    u,
    availability: 1 - u,
    nines: ninesOf(u),
    downH,
    monthH: u * RELIABILITY_MONTH_H,
    paperU,
    paperDownH: hoursAYear(paperU),
    weakest,
    capPart: worst.id,
    focusPart: weakest[weakest.length - 1],
    failsPerYear: hard.reduce((t, p) => t + p.failsPerYear, 0),
    copies,
    metrics: { down: downH, copies },
  };
  scenarios.set(key, scenario);
  return scenario;
}
