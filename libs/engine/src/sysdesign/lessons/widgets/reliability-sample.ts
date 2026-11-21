import {
  COPY_FAILS_PER_YEAR,
  COPY_MTTR_H,
  FAILOVER_H,
  FAILOVER_MIN,
  RELIABILITY_PARTS,
  RELIABILITY_SETUPS,
  RELIABILITY_WEEKS,
  SHARED_SHARE,
  reliabilityKey,
  reliabilityScenario,
  reliabilitySettings,
  type ReliabilityPartId,
  type ReliabilitySettings,
} from './reliability.js';
import { seededRandom } from './seeded-random.js';

/** The year's seed: the first that meets every bound in `reliabilitySeedBounds` (the design's enum.cjs searched it). */
export const RELIABILITY_SAMPLE_SEED = 3_282_478;
/** Screen time: a play sweeps the year in this long, and holds this long on each moment the band acts out. */
export const RELIABILITY_SWEEP_MS = 5_200;
export const RELIABILITY_HOLD_MS = 1_100;
/** Holds stand this many weeks apart at least (300 ms of sweep), so the band never flashes between two of them. */
export const RELIABILITY_HOLD_GAP = 3;
/** A failover's hold shows requests still going to the dead copy for this share of it, then the next copy carrying. */
export const FAILOVER_STOP_SHARE = 0.55;

/** A copy's outage in the year: its week, and whether it is the part's shared outage. */
export interface YearTick {
  week: number;
  shared: boolean;
}
export type YearEventKind = 'outage' | 'shared' | 'failover';
/** What reached the request from a part: a single copy down, every copy down at once, or a failover's first minutes. */
export interface YearEvent {
  week: number;
  kind: YearEventKind;
  hours: number;
  part: ReliabilityPartId;
  /** An optional part's outage: down, but the request skipped it. */
  bypassed: boolean;
}
export interface YearPart {
  id: ReliabilityPartId;
  n: number;
  optional: boolean;
  /** Each copy's outages, by week. */
  rows: readonly (readonly YearTick[])[];
  events: readonly YearEvent[];
  /** Outages another copy carried the request through. */
  absorbed: readonly { week: number; copy: number }[];
}
export interface ReliabilityYear {
  parts: readonly YearPart[];
  /** The request's failures: the union of what the parts it needs let through. */
  fails: readonly YearEvent[];
  count: number;
  hours: number;
}
export type MomentKind = YearEventKind | 'absorbed' | 'bypassed';
/** A moment of the year the band acts out. */
export interface YearMoment {
  week: number;
  part: ReliabilityPartId;
  kind: MomentKind;
  copy: number;
  fails: boolean;
  hours: number;
  /** For a bypassed optional part, what took it down. */
  cause?: YearEventKind;
}

type Draws = readonly (readonly { own: readonly number[]; extra: readonly number[] }[])[];

function poisson(rand: () => number, mean: number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rand();
  while (p > limit) {
    k++;
    p *= rand();
  }
  return k;
}
function shuffled(rand: () => number, n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The draws behind every setting's year (common random numbers: a setting only chooses which of them show). Each copy
 * slot gets `own` outages (the 90% that are its own) and `extra` ones (the 10% that shared failures turn into the part's
 * shared outages). The first copies' outages take different weeks across the whole chain, and a part's copies never share
 * a week, so two ticks stand in one column only in a shared outage. Null when the weeks run out.
 */
function draw(seed: number): Draws | null {
  const rand = seededRandom(seed);
  const counts = RELIABILITY_PARTS.map(() =>
    [0, 1, 2].map(() => ({
      own: poisson(rand, COPY_FAILS_PER_YEAR * (1 - SHARED_SHARE)),
      extra: poisson(rand, COPY_FAILS_PER_YEAR * SHARED_SHARE),
    })),
  );
  const firsts = shuffled(rand, RELIABILITY_WEEKS);
  let next = 0;
  const out: { own: number[]; extra: number[] }[][] = [];
  for (let p = 0; p < RELIABILITY_PARTS.length; p++) {
    const used = new Set<number>();
    const copies: { own: number[]; extra: number[] }[] = [];
    for (let i = 0; i < 3; i++) {
      const c = counts[p][i];
      let weeks: number[];
      if (i === 0) {
        weeks = firsts.slice(next, next + c.own + c.extra);
        next += c.own + c.extra;
        if (next > RELIABILITY_WEEKS) return null;
      } else {
        weeks = shuffled(rand, RELIABILITY_WEEKS)
          .filter((w) => !used.has(w))
          .slice(0, c.own + c.extra);
        if (weeks.length < c.own + c.extra) return null;
      }
      for (const w of weeks) used.add(w);
      copies.push({ own: weeks.slice(0, c.own).sort((a, b) => a - b), extra: weeks.slice(c.own).sort((a, b) => a - b) });
    }
    out.push(copies);
  }
  return out;
}
/** The hours a set of the year's events lasts, summed in whole minutes so every surface prints the same total. */
export const yearHours = (events: readonly YearEvent[]) =>
  events.reduce((t, e) => t + (e.kind === 'failover' ? FAILOVER_MIN : COPY_MTTR_H * 60), 0) / 60;

const draws = new Map<number, Draws | null>();
const drawsOf = (seed: number) => {
  if (!draws.has(seed)) draws.set(seed, draw(seed));
  return draws.get(seed) ?? null;
};
const years = new Map<string, ReliabilityYear>();

/** One simulated year at a setting: each copy's outages, what reached the request from each part, and their union. */
export function reliabilityYear(settings: Partial<ReliabilitySettings>, seed = RELIABILITY_SAMPLE_SEED): ReliabilityYear {
  const s = reliabilitySettings(settings);
  const cacheKey = `${seed}|${reliabilityKey(s)}`;
  const known = years.get(cacheKey);
  if (known) return known;
  const d = drawsOf(seed);
  if (!d) throw new Error(`Seed ${seed} runs out of weeks`);
  const parts = RELIABILITY_PARTS.map((p, pi): YearPart => {
    const n = s[p.id];
    const optional = p.id === 'recs' && !!s.optional;
    const sharedOn = !!s.shared && n >= 2;
    const rows: YearTick[][] = [];
    for (let i = 0; i < n; i++) {
      const c = d[pi][i];
      const ticks: YearTick[] = c.own.map((week) => ({ week, shared: false }));
      for (const week of sharedOn ? d[pi][0].extra : c.extra) ticks.push({ week, shared: sharedOn });
      rows.push(ticks.sort((a, b) => a.week - b.week));
    }
    const events: YearEvent[] = [];
    for (const t of rows[0]) {
      const kind: YearEventKind | null = n === 1 ? 'outage' : t.shared ? 'shared' : s.failover ? 'failover' : null;
      if (kind) events.push({ week: t.week, kind, hours: kind === 'failover' ? FAILOVER_H : COPY_MTTR_H, part: p.id, bypassed: optional });
    }
    const hit = new Set(events.map((e) => e.week));
    const absorbed = rows
      .flatMap((r, copy) => r.filter((t) => !hit.has(t.week)).map((t) => ({ week: t.week, copy })))
      .sort((a, b) => a.week - b.week);
    return { id: p.id, n, optional, rows, events, absorbed };
  });
  const fails = parts
    .filter((p) => !p.optional)
    .flatMap((p) => p.events)
    .sort((a, b) => a.week - b.week);
  const year = { parts, fails, count: fails.length, hours: yearHours(fails) };
  years.set(cacheKey, year);
  return year;
}

const failWeeks = (y: ReliabilityYear) => new Set(y.fails.map((e) => e.week));
const momentOf = (e: YearEvent): YearMoment => ({ week: e.week, part: e.part, kind: e.kind, copy: 0, fails: true, hours: e.hours });

/**
 * Copies' outages another copy absorbed, in weeks the request does not fail. With failover off they are the first
 * copy's, so the path visibly moves to the next copy; with failover on the first copy's are failovers, so they are a
 * spare's.
 */
export function absorbedMoments(y: ReliabilityYear, s: ReliabilitySettings, ids: readonly ReliabilityPartId[] | null = null): YearMoment[] {
  const bad = failWeeks(y);
  return y.parts
    .filter((p) => !p.optional && (!ids || ids.includes(p.id)))
    .flatMap((p) =>
      p.absorbed
        .filter((a) => !bad.has(a.week) && (!!s.failover || a.copy === 0))
        .map((a): YearMoment => ({ week: a.week, part: p.id, kind: 'absorbed', copy: a.copy, fails: false, hours: COPY_MTTR_H })),
    )
    .sort((a, b) => a.week - b.week);
}

/** An optional part down, the page rendered without it, in a week the request does not fail. */
export function bypassMoments(y: ReliabilityYear): YearMoment[] {
  const bad = failWeeks(y);
  return y.parts
    .filter((p) => p.optional)
    .flatMap((p) =>
      p.events
        .filter((e) => !bad.has(e.week))
        .map((e): YearMoment => ({ week: e.week, part: p.id, kind: 'bypassed', cause: e.kind, copy: 0, fails: false, hours: e.hours })),
    )
    .sort((a, b) => a.week - b.week);
}

/**
 * The moment the band rests on: the first failure of the request that the focus part causes, a single copy's outage
 * before a shared one before a failover; with none, the first outage of its first copy, which another copy absorbed.
 */
export function reliabilityRestMoment(settings: Partial<ReliabilitySettings>, seed = RELIABILITY_SAMPLE_SEED): YearMoment | null {
  const m = reliabilityScenario(settings);
  const y = reliabilityYear(settings, seed);
  const part = y.parts.find((p) => p.id === m.focusPart)!;
  for (const kind of ['outage', 'shared', 'failover'] as const) {
    const e = part.events.find((x) => x.kind === kind);
    if (e) return momentOf(e);
  }
  const bad = failWeeks(y);
  const ok = part.absorbed.filter((x) => !bad.has(x.week));
  const a = ok.find((x) => x.copy === 0) ?? ok[0];
  return a ? { week: a.week, part: part.id, kind: 'absorbed', copy: a.copy, fails: false, hours: COPY_MTTR_H } : null;
}

/** Where an answer's play holds: the request's failure, or an event in a part its act changed. */
export type AnswerHoldMode = 'request' | 'part';
/** An answer's hold falls in these weeks (from 0), so it plays mid-sweep: clear of the tap that starts it and of the reveal. */
export const ANSWER_HOLD_WEEKS = [9, 44] as const;
const [HOLD_FROM, HOLD_TO] = ANSWER_HOLD_WEEKS;
const HOLD_MID = (HOLD_FROM + HOLD_TO) / 2;
const inHoldWeeks = (m: YearMoment) => m.week >= HOLD_FROM && m.week <= HOLD_TO;
/** How far a moment stands from the middle of the answer's weeks; any inside them before any outside. */
const offMid = (m: YearMoment) => (inHoldWeeks(m) ? 0 : RELIABILITY_WEEKS) + Math.abs(m.week - HOLD_MID);
/** The moment nearest the middle of the answer's weeks, the earlier of two as near. */
const midYear = (ms: readonly YearMoment[]): YearMoment | undefined => [...ms].sort((a, b) => offMid(a) - offMid(b) || a.week - b.week)[0];

/**
 * An answer's play holds once, on its climax, and the band keeps that moment after the reveal. `'request'` is a
 * failure of the request, of a part other than the rest moment's when one falls in ANSWER_HOLD_WEEKS, so the answer
 * shows a part the learner has not yet seen fail; `'part'` an event in a part the act changed, a shared outage before a
 * failover before a single outage, else an absorbed outage of a changed part's first copy. Of each kind the hold takes
 * the one nearest the middle of ANSWER_HOLD_WEEKS. Either falls back to the rest moment.
 */
export function reliabilityAnswerHold(
  settings: Partial<ReliabilitySettings>,
  changed: readonly ReliabilityPartId[],
  mode: AnswerHoldMode = 'part',
  seed = RELIABILITY_SAMPLE_SEED,
): YearMoment | null {
  const y = reliabilityYear(settings, seed);
  if (mode === 'request') {
    const rest = reliabilityRestMoment(settings, seed);
    const all = y.fails.map(momentOf);
    const unseen = all.filter((m) => m.part !== rest?.part);
    return midYear(unseen.some(inHoldWeeks) ? unseen : all) ?? rest;
  }
  const parts = y.parts.filter((p) => changed.includes(p.id) && !p.optional);
  for (const kind of ['shared', 'failover', 'outage'] as const) {
    const e = midYear(parts.flatMap((p) => p.events.filter((x) => x.kind === kind)).map(momentOf));
    if (e) return e;
  }
  return midYear(absorbedMoments(y, reliabilitySettings(settings), changed)) ?? reliabilityRestMoment(settings, seed);
}

/** The clock at a screen time: weeks swept (0 to 52), the hold the band acts out then, and how far into it. */
export interface YearClock {
  weeks: number;
  hold: YearMoment | null;
  into: number;
}
export interface YearPlayPlan {
  holds: readonly YearMoment[];
  total: number;
  at(ms: number): YearClock;
  /** The screen time a fraction `into` through hold `i`. */
  holdAt(i: number, into?: number): number;
}

/**
 * A play of the year. An answer's holds once (`reliabilityAnswerHold`); a free play holds on the first event of each
 * kind the year has (a single outage, a shared outage, a failover, an absorbed outage, an optional part bypassed), in
 * that priority, each the first of its kind that stands HOLD_GAP weeks or more from the holds already taken. The clock
 * is monotone; at a hold it stands at the held column's leading edge, so the playhead stands clear of the marks it holds
 * on.
 */
export function reliabilityPlayPlan(
  settings: Partial<ReliabilitySettings>,
  answer: { changed: readonly ReliabilityPartId[]; mode: AnswerHoldMode } | null = null,
  seed = RELIABILITY_SAMPLE_SEED,
): YearPlayPlan {
  const s = reliabilitySettings(settings);
  const y = reliabilityYear(s, seed);
  let holds: YearMoment[] = [];
  if (answer) {
    const h = reliabilityAnswerHold(s, answer.changed, answer.mode, seed);
    holds = h ? [h] : [];
  } else {
    const kinds = (k: YearEventKind) => y.fails.filter((e) => e.kind === k).map(momentOf);
    const cands: Record<MomentKind, YearMoment[]> = {
      outage: kinds('outage'),
      shared: kinds('shared'),
      failover: kinds('failover'),
      absorbed: absorbedMoments(y, s),
      bypassed: bypassMoments(y),
    };
    for (const kind of ['outage', 'shared', 'failover', 'absorbed', 'bypassed'] as const) {
      const c = cands[kind].find((e) => holds.every((h) => Math.abs(h.week - e.week) >= RELIABILITY_HOLD_GAP));
      if (c) holds.push(c);
    }
    holds.sort((a, b) => a.week - b.week);
  }
  const total = RELIABILITY_SWEEP_MS + holds.length * RELIABILITY_HOLD_MS;
  const reach = (i: number) => ((holds[i].week + 1) / RELIABILITY_WEEKS) * RELIABILITY_SWEEP_MS + i * RELIABILITY_HOLD_MS;
  return {
    holds,
    total,
    at(ms) {
      const t = Math.max(0, Math.min(total, ms));
      for (let i = 0; i < holds.length; i++) {
        if (t < reach(i)) return { weeks: ((t - i * RELIABILITY_HOLD_MS) / RELIABILITY_SWEEP_MS) * RELIABILITY_WEEKS, hold: null, into: 0 };
        if (t < reach(i) + RELIABILITY_HOLD_MS)
          return { weeks: holds[i].week + 1, hold: holds[i], into: (t - reach(i)) / RELIABILITY_HOLD_MS };
      }
      return { weeks: ((t - holds.length * RELIABILITY_HOLD_MS) / RELIABILITY_SWEEP_MS) * RELIABILITY_WEEKS, hold: null, into: 0 };
    },
    holdAt: (i, into = 0.5) => reach(i) + into * RELIABILITY_HOLD_MS,
  };
}

export const sameMoment = (a: YearMoment, b: YearMoment) =>
  a.week === b.week && a.part === b.part && a.kind === b.kind && a.copy === b.copy;

/**
 * The moments a learner can step through, in the year's order and each once: the free play's holds and the rest
 * moment, then a failure of each part that fails the request and none of them shows yet, so stepping shows every part
 * the chain needs taking the request down before any part repeats. With fewer than two, the year's next failure or
 * absorbed outage joins them. A moment stands HOLD_GAP weeks from the others where the year allows, so every step changes
 * the picture.
 */
export function reliabilityStepMoments(settings: Partial<ReliabilitySettings>, seed = RELIABILITY_SAMPLE_SEED): YearMoment[] {
  const s = reliabilitySettings(settings);
  const y = reliabilityYear(s, seed);
  const out = [...reliabilityPlayPlan(s, null, seed).holds];
  const add = (m: YearMoment | null | undefined) => {
    if (m && !out.some((o) => sameMoment(o, m))) out.push(m);
  };
  const apart = (c: YearMoment) => out.every((o) => Math.abs(o.week - c.week) >= RELIABILITY_HOLD_GAP);
  add(reliabilityRestMoment(s, seed));
  for (const p of y.parts.filter((x) => !x.optional && x.events.length)) {
    if (out.some((o) => o.fails && o.part === p.id)) continue;
    const own = p.events.map(momentOf);
    add(own.find(apart) ?? own.find((c) => out.every((o) => o.week !== c.week)));
  }
  for (const c of [...y.fails.map(momentOf), ...absorbedMoments(y, s), ...bypassMoments(y)]) if (out.length < 2 && apart(c)) add(c);
  return out.sort((a, b) => a.week - b.week);
}

/**
 * The hard bounds the year's seed meets, each with its value. They keep the one drawn year typical where a learner
 * compares it with the model: counts beside the averages they stand next to, one shared outage a part (the average is
 * 0.88), and each experiment's climax away from the year's ends.
 */
export function reliabilitySeedBounds(seed: number): { name: string; value: string; ok: boolean }[] {
  const d = drawsOf(seed);
  if (!d) return [{ name: 'the weeks do not run out', ok: false, value: 'ran out' }];
  const firstCount = d.map((part) => part[0].own.length + part[0].extra.length);
  const others = d.flatMap((part) => part.slice(1).map((c) => c.own.length + c.extra.length));
  const out: { name: string; value: string; ok: boolean }[] = [];
  const add = (name: string, value: string | number, ok: boolean) => out.push({ name, value: String(value), ok });
  add(
    'every first copy has 8 to 10 outages',
    firstCount.join(', '),
    firstCount.every((c) => c >= 8 && c <= 10),
  );
  add(
    'every other copy has 5 to 12 outages',
    others.join(', '),
    others.every((c) => c >= 5 && c <= 12),
  );
  add(
    'every part has exactly one shared outage',
    d.map((p) => p[0].extra.length).join(', '),
    d.every((p) => p[0].extra.length === 1),
  );
  const count = (s: ReliabilitySettings) => reliabilityYear(s, seed).count;
  const within = (name: string, s: ReliabilitySettings, lo: number, hi: number) => add(name, count(s), count(s) >= lo && count(s) <= hi);
  const E = RELIABILITY_SETUPS;
  within('four single parts fail the request 35 times', E.series, 35, 35);
  within('the default fails it 17 or 18 times', E.base, 17, 18);
  within('pairs with failover fail it 26 or 27 times', E.failoverAfter, 26, 27);
  within('pairs with shared failures fail it 3 times', E.sharedAfter, 3, 3);
  add('pairs on paper never fail in the year', count(E.pairs), count(E.pairs) === 0);
  for (const [name, s] of Object.entries(E)) {
    const r = reliabilityRestMoment(s, seed);
    add(`${name}: the rest moment falls in weeks 3 to 48`, r ? r.week + 1 : 'none', !!r && r.week >= 2 && r.week <= 47);
  }
  const answers: [string, ReliabilitySettings, ReliabilityPartId[], AnswerHoldMode][] = [
    ['series', E.series, [], 'request'],
    ['parallel', E.parallelAfter, ['db'], 'part'],
    ['weakest', E.weakestAfter, ['app'], 'request'],
    ['shared', E.sharedAfter, ['lb', 'app', 'db'], 'part'],
    ['failover', E.failoverAfter, ['lb', 'app', 'db'], 'part'],
  ];
  for (const [name, s, changed, mode] of answers) {
    const h = reliabilityAnswerHold(s, changed, mode, seed);
    add(`${name}: the answer's hold falls in weeks 10 to 45`, h ? h.week + 1 : 'none', !!h && h.week >= HOLD_FROM && h.week <= HOLD_TO);
  }
  for (const [name, s] of Object.entries(E)) {
    const h = reliabilityPlayPlan(s, null, seed).holds.map((x) => x.week);
    const gaps = h.slice(1).map((w, i) => w - h[i]);
    add(
      `${name}: a free play's holds stand apart`,
      h.map((w) => w + 1).join(', '),
      gaps.every((g) => g >= RELIABILITY_HOLD_GAP),
    );
  }
  return out;
}
