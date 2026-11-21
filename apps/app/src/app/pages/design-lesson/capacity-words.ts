import {
  CAPACITY_CACHE_NODES,
  CAPACITY_CHALLENGE_BOUNDS,
  CAPACITY_HIT,
  CAPACITY_READS,
  CAPACITY_SIZES,
  CAPACITY_SLOW_MS,
  CAPACITY_TRAFFIC,
  CAPACITY_WRITES,
  capacityMetrics,
  capacityRamp,
  capacityZoneLoss,
  formatMs,
  formatPct,
  formatQps,
  formatSlot,
  type CapacityRun,
  type CapacitySettings,
  type CapacityTier,
  type CapacityTierId,
} from '@grasp/engine';
import { formatNumber } from './number-format';
import type { Part } from './stage-text';

/** The stage's type roles, as `capacity-stage.scss` sets them. */
export type Role = 'label' | 'cap' | 'capB' | 'small' | 'smallB' | 'head';
export type Words = Part<Role>[];

/**
 * What the widget's HTML text keeps on one line, provided to every `g-code-text` in it: a number and its unit or the
 * first word of what it counts ("8,000 queries/s", "1,000 requests", "29 machines", "2 read" of "2 read replicas"), a
 * percentile with its value ("p99 69 ms"), and a number, an operator and the next number ("4,000 / 0.38"). The rest of
 * a counted noun, and a rate's "a second" after its noun, may start the next line, so a narrow column keeps no long gap.
 */
export const CAPACITY_KEEP =
  /(?:\bp\d{2,3} )?\d[\d,.]*(?: [/×÷=+] \d[\d,.]*)*(?: (?:ns|µs|ms|s|min|KB|MB|GB|TB|queries\/s|requests\/s|a second|requests|queries|writes|reads|read|replicas|app|load|machines|workers|nodes)\b|\/s\b)|\d[\d,.]*(?: [/×÷=+] \d[\d,.]*)+/g;

export const TIERS: readonly CapacityTierId[] = ['lb', 'app', 'primary', 'replicas'];
export type Phase = 'rest' | 'asking' | 'playing' | 'revealed' | 'challenge';
/** A lane a question can hide: a tier's, or the app servers' worker pool. */
export type HideLane = CapacityTierId | 'workers';

/**
 * What an open question hides, on every surface: one map. Each region is named in the question's own `hide` list. `db`
 * (asking and its play) hides the database's lanes, statuses and conversions; `after` (a play) hides the lanes its act
 * changes; while lanes hide, no tier is named the bottleneck. The totals hide in a play only when its act changes what
 * is served or shed; the served bar stays, since it is the stream's end and the stream is the mechanism the play shows.
 * `replay` (asking) hides what a replica does beyond its reads; `zones` (asking) the zone groups. The "if zone A fails"
 * ticks show only at rest and in a challenge, and no ghost of an earlier setting shows while a question asks.
 */
export interface Hid {
  lanes: ReadonlySet<HideLane>;
  totals: boolean;
  replay: boolean;
  zones: boolean;
  ghost: boolean;
  zoneTicks: boolean;
  any: boolean;
}
/** What a question's act changes: the lanes, and whether what is served or shed moves. */
export interface ActChange {
  lanes: readonly HideLane[];
  totals: boolean;
}

export function hiding(hide: readonly string[], phase: Phase, act: ActChange | null = null): Hid {
  const h = new Set(hide);
  const asking = phase === 'asking';
  const playing = phase === 'playing';
  const lanes = new Set<HideLane>();
  if (h.has('db') && (asking || playing)) for (const id of ['primary', 'replicas'] as const) lanes.add(id);
  if (h.has('after') && playing) for (const id of act?.lanes ?? []) lanes.add(id);
  const totals = playing && !!act?.totals && (h.has('db') || h.has('after'));
  return {
    lanes,
    totals,
    replay: h.has('replay') && asking,
    zones: h.has('zones') && asking,
    ghost: asking,
    zoneTicks: phase === 'rest' || phase === 'challenge',
    any: lanes.size > 0 || totals,
  };
}
export const NOTHING_HIDDEN = hiding([], 'rest');
/** Every region hidden at once: the tallest a question can make the stage's words. */
export const ALL_HIDDEN: Hid = {
  lanes: new Set<HideLane>(['lb', 'app', 'primary', 'replicas', 'workers']),
  totals: true,
  replay: true,
  zones: true,
  ghost: true,
  zoneTicks: false,
  any: true,
};

/** The lanes an act changes: their limit, load, instances or shed differ between the setup and the act. */
export function actChange(a: CapacityRun, b: CapacityRun): ActChange {
  const lanes: HideLane[] = TIERS.filter((id) => {
    const [x, y] = [a[id], b[id]];
    return Math.abs(x.ceiling - y.ceiling) > 1e-6 || Math.abs(x.util - y.util) > 1e-9 || x.up !== y.up || x.shed !== y.shed;
  });
  if (Math.abs(a.app.inFlight - b.app.inFlight) > 1e-9 || a.app.need !== b.app.need) lanes.push('workers');
  return { lanes, totals: Math.abs(a.served - b.served) > 1e-9 || Math.abs(a.shed - b.shed) > 1e-9 };
}

export const SHED = 1e-9;
export const fq = formatQps;
export const fp = (share: number) => formatPct(share * 100);
/** A whole count with its thousands separator. */
export const fn = (v: number) => formatNumber(Math.round(v), 0);
const num = (v: number) => formatSlot({ value: v, unit: 'num' });
/** A share of a request's queries: up to three decimals, so 0.18 split four ways reads 0.045. */
const f3 = (v: number) => String(Number(v.toFixed(3)));
const f1 = (v: number) => formatNumber(v, 1);

const NOUN = { lb: ['load balancer', 'load balancers'], app: ['app server', 'app servers'] } as const;
const TIER_WORD: Record<CapacityTierId, string> = {
  lb: 'the load balancers',
  app: 'the app servers',
  primary: 'the database primary',
  replicas: 'the read replicas',
};
export const tierWord = (r: CapacityRun, id: CapacityTierId) =>
  id === 'replicas' && r.replicas.up === 1 ? 'the read replica' : TIER_WORD[id];
const single = (r: CapacityRun, id: CapacityTierId) => id === 'primary' || (id === 'replicas' && r.replicas.up === 1);
const verb = (r: CapacityRun, id: CapacityTierId, forms: readonly [string, string] = ['is', 'are']) => forms[single(r, id) ? 0 : 1];
const eachOf = (r: CapacityRun, id: CapacityTierId) => (id === 'replicas' && r.replicas.up >= 2 ? ' each' : '');
const cap1 = (t: string) => t[0].toUpperCase() + t.slice(1);
const joinAnd = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** What reaches a tier: the load balancers and app servers count what arrives; the database what it admitted. */
export const loadOf = (r: CapacityRun, id: CapacityTierId) => (id === 'primary' || id === 'replicas' ? r.served : r[id].arriving);
const up = (t: CapacityTier) => t.up;
const largest = (r: CapacityRun) => r.settings.size >= CAPACITY_SIZES[CAPACITY_SIZES.length - 1];
const sizeText = (r: CapacityRun) => `${fn(r.settings.size)} queries/s`;

/** A block's name, longest first. */
export const NAMES: Record<CapacityTierId, readonly string[]> = {
  lb: ['Load balancers'],
  app: ['App servers'],
  primary: ['Database primary', 'Primary'],
  replicas: ['Read replicas'],
};
export const POOL_LABEL = ['Workers on one server', "One server's workers"] as const;
export const TITLES = ['Requests through the tiers', 'Through the tiers'] as const;
export const FOOTNOTE =
  'Simplified: every request costs a tier the same, its instances are alike, and past its limit a tier sheds rather than queues. With replicas, every read goes to a replica, and replaying a write costs a replica what the write costs the primary. The cache keeps a full copy in every zone, so losing one keeps its hit rate.';
export const WAIT_NOTICE = 'Play and the settings this question is about wait for your answer.';
export const STAGE_LABEL = 'Capacity: requests flowing through load balancers, app servers and a database';

/** Where a lane's words went when its row and strip had no room: into its block's status or conversion. */
export interface LaneWords {
  limitInStatus?: boolean;
  wasInStatus?: number | null;
  zoneInStatus?: number | null;
}

/**
 * The limits a lane's row had no room for, each a clause that names itself: the limit before the last change, then the
 * limit if zone A fails. Where the two are one figure (the change added what zone A would take), it is said once.
 */
function limitTail(lane: LaneWords): string {
  const was = lane.wasInStatus != null ? fq(lane.wasInStatus) : null;
  const zone = lane.zoneInStatus != null ? fq(lane.zoneInStatus) : null;
  if (was !== null && was === zone) return ` · if zone A fails, back to ${zone}`;
  return `${was !== null ? ` · limit was ${was}` : ''}${zone !== null ? ` · if zone A fails, limit ${zone}` : ''}`;
}

/** A block's fleet: instances times what each takes. A hidden tier shows its count alone: its per-instance figure may be the answer. */
export function fleetText(r: CapacityRun, id: CapacityTierId, hid: Hid): string {
  if (id === 'lb' || id === 'app') {
    const t = r[id];
    if (hid.lanes.has(id)) return t.lost ? `${t.up} of ${t.n} up` : `${t.n} up`;
    return t.lost ? `${t.up} of ${t.n} up × ${fq(t.each)}` : `${t.n} × ${fq(t.each)}`;
  }
  const size = sizeText(r);
  if (id === 'primary') {
    const t = r.primary;
    if (t.outage) return `${size}, lost with zone A`;
    if (t.promoted) return `${size}, a promoted replica`;
    return `${size}${largest(r) ? ', the largest machine' : ''}, in zone A`;
  }
  const t = r.replicas;
  if (!t.n) return 'none';
  if (t.lost) return t.up ? `${t.up} of ${t.n} left × ${size}` : `none of ${t.n} left`;
  return `${t.n} × ${size}`;
}

/**
 * A block's status: how busy it is (bold), then what it spares or sheds; its limit when no room is free at the lane's
 * end, the limit before the last change when no room is free beside its ghost, and its limit if zone A fails where that
 * tick would sit in a cut lane's break or past it. A database lane says these in its conversion instead.
 */
export function statusParts(r: CapacityRun, id: CapacityTierId, hid: Hid, lane: LaneWords = {}): Words {
  const t = r[id];
  if (id === 'replicas' && !r.replicas.n)
    return [
      ['None: ', 'capB'],
      [r.primary.outage ? 'reads fail with the primary.' : 'the primary takes every read.', 'cap'],
    ];
  if (id === 'replicas' && !t.up)
    return [
      ['None left: ', 'capB', 'crit-ink'],
      ['the one replica became the primary, which takes every read.', 'cap'],
    ];
  if (id === 'primary' && r.primary.outage)
    return [
      ['Lost with zone A: ', 'capB', 'crit-ink'],
      [r.dbArriving > 0 ? 'no replica can take over, so every request fails here.' : 'no replica can take over.', 'cap'],
    ];
  if ((id === 'lb' || id === 'app') && !t.up)
    return [
      ['None left: ', 'capB', 'crit-ink'],
      [r[id].n === 1 ? 'zone A held the only one.' : 'zone A held them all.', 'cap'],
    ];
  const each = eachOf(r, id);
  if (hid.lanes.has(id))
    return [
      [`?% busy${each}`, 'capB'],
      [' · after your answer', 'cap'],
    ];
  const db = id === 'primary' || id === 'replicas';
  const tail = db ? '' : `${lane.limitInStatus ? ` · limit ${fq(t.ceiling)}` : ''}${limitTail(lane)}`;
  const load = loadOf(r, id);
  if (t.shed > SHED)
    return [
      ['Full', 'capB', 'crit-ink'],
      [` · ${fq(t.shed)} shed${r.bottleneck === id ? ', the bottleneck' : ''}${tail}`, 'cap'],
    ];
  if (t.util > 1 - 1e-9)
    return [
      [`100% busy${each}`, 'capB'],
      [` · nothing spare${tail}`, 'cap'],
    ];
  if (load <= 0)
    return [
      ['Idle', 'capB'],
      [` · nothing reaches it${tail}`, 'cap'],
    ];
  return [
    [`${fp(t.util)} busy${each}`, 'capB'],
    [` · ${fq(t.ceiling - load)} spare${tail}`, 'cap'],
  ];
}

/**
 * A database block's conversion: its machine's queries a second over what one request costs it, which is its limit in
 * requests a second, with the limit before the last change when its ghost has no room, and its limit if zone A fails
 * when its tick has none.
 */
export function convParts(r: CapacityRun, id: 'primary' | 'replicas', hid: Hid, lane: LaneWords = {}): Words {
  const size = sizeText(r);
  const w = num(CAPACITY_WRITES);
  const tail = limitTail(lane);
  const was: Words = tail ? [[tail, 'cap']] : [];
  if (id === 'primary') {
    const t = r.primary;
    if (t.outage) return [['With no primary, writes have nowhere to go.', 'cap']];
    if (hid.lanes.has('primary')) return [[`${size}; what that carries in requests shows after your answer.`, 'cap']];
    const cost = r.replicas.up ? `÷ ${w} writes a request` : `÷ ${num(CAPACITY_WRITES + r.misses)} queries a request`;
    return [[`${size} ${cost} = `, 'cap'], [`${fn(t.ceiling)} requests/s`, 'capB'], ...was];
  }
  const t = r.replicas;
  if (!t.up) return [];
  const each = t.up >= 2 ? ' each' : '';
  if (hid.replay) return [[`Each takes ${f3(r.misses / t.up)} reads a request; what else each does shows after your answer.`, 'cap']];
  if (hid.lanes.has('replicas')) return [[`${size}${each}; what that carries in requests shows after your answer.`, 'cap']];
  return [[`${size} ÷ (${w} replayed writes + ${f3(r.misses / t.up)} reads) = `, 'cap'], [`${fn(t.ceiling)} requests/s`, 'capB'], ...was];
}

/** The cache line at the database's foot: what it answers of each request's reads. */
export function cacheParts(r: CapacityRun): Words {
  const reads = num(CAPACITY_READS);
  if (!r.settings.cache)
    return [
      ['Cache off: ', 'capB'],
      [`all ${reads} reads a request reach the database.`, 'cap'],
    ];
  return [
    ['Cache on: ', 'capB'],
    [`${num(r.hits)} of ${reads} reads a request hit it; ${num(r.misses)} reach the database.`, 'cap'],
  ];
}

/** The pool binds (critical, "would need") only when the workers are the app servers' limit and they shed. */
export const poolBinds = (r: CapacityRun) => r.app.up > 0 && r.app.bound === 'workers' && r.app.shed > SHED;
export const poolHidden = (hid: Hid) => hid.lanes.has('workers');

/** The worker pool on one app server, by Little's law: in flight = rate × time. */
export function workerParts(r: CapacityRun, hid: Hid): Words {
  const a = r.app;
  if (!a.up) return [['No app server left.', 'cap']];
  if (poolHidden(hid))
    return [
      [`? of ${a.workers} busy`, 'capB'],
      [' after your answer.', 'cap'],
    ];
  if (a.passed <= 0)
    return [
      [`0 of ${a.workers} busy`, 'capB'],
      [': nothing reaches the app servers.', 'cap'],
    ];
  const rate = fq(a.passed / a.up);
  const ms = formatMs(a.ms);
  const busy = `${f1(a.inFlight)} of ${a.workers} busy`;
  if (poolBinds(r))
    return [
      [busy, 'capB', 'crit-ink'],
      [
        `: ${rate} × ${ms}. The ${fq(a.arriving / a.up)} sent to each would need ${fn(Math.ceil(a.need - 1e-9))} workers; its CPU sits ${fp(a.cpuUtil)} busy.`,
        'cap',
      ],
    ];
  if (a.shed > SHED)
    return [
      [busy, 'capB'],
      [`: ${rate} × ${ms} in flight; the CPU, not the pool, is full.`, 'cap'],
    ];
  return [
    [busy, 'capB'],
    [`: ${rate} × ${ms} in flight (Little's law).`, 'cap'],
  ];
}

export function sinkParts(r: CapacityRun, hid: Hid): Words {
  const head: Words = [
    ['Served ', 'label'],
    [hid.totals ? '?' : fq(r.served), 'head'],
    [' of ', 'cap'],
    [fq(r.offered), 'capB'],
  ];
  if (hid.totals) return [...head, [' · shed after your answer', 'cap']];
  return [...head, r.shed > SHED ? [` · ${fq(r.shed)} shed, ${fp(r.shed / r.offered)}`, 'capB', 'crit-ink'] : [' · nothing shed', 'cap']];
}

/** The lanes at the top load, every tie named. */
export const busiestOf = (r: CapacityRun) =>
  r.lanes.filter((t) => Math.abs(t.util - r.maxUtil) < 1e-9 && !(t.id === 'primary' && r.primary.outage));

/** The setting's sentences: what is served, where it stops, and how busy the rest run. */
export function summary(r: CapacityRun, hid: Hid = NOTHING_HIDDEN): string {
  if (hid.totals || hid.lanes.size) return `Of ${fn(r.offered)} requests a second offered, what each tier takes shows after your answer.`;
  const parts: string[] = [];
  let named: CapacityTierId[];
  if (r.shed > SHED) {
    parts.push(
      r.served > SHED
        ? `Of ${fn(r.offered)} requests a second, ${fn(r.served)} are served and ${fn(r.shed)} shed.`
        : `Of ${fn(r.offered)} requests a second, none are served.`,
    );
    const b = r.bottleneck;
    named = [b];
    if (b === 'primary' && r.primary.outage)
      parts.push('The primary fell with zone A and no replica could take over, so every request fails at the database.');
    else if ((b === 'lb' || b === 'app') && !r[b].up)
      parts.push(
        `Zone A held every ${NOUN[b][0]}${b === 'lb' && !r.app.up ? ' and app server' : ''}, so nothing gets past ${tierWord(r, b)}.`,
      );
    else parts.push(`${cap1(tierWord(r, b))} ${verb(r, b)} the bottleneck, full at ${fn(r[b].ceiling)} a second.`);
  } else {
    const top = busiestOf(r);
    named = top.map((t) => t.id);
    const each = top.length === 1 ? eachOf(r, top[0].id) : '';
    parts.push(`All ${fn(r.offered)} requests a second are served.`);
    parts.push(
      `${cap1(joinAnd(top.map((t) => tierWord(r, t.id))))} ${top.length > 1 ? 'are' : verb(r, top[0].id)} the busiest, at ${fp(r.maxUtil)}${each}.`,
    );
  }
  const others = r.lanes.filter((t) => !named.includes(t.id) && !(t.id === 'primary' && r.primary.outage) && up(t) !== 0);
  if (others.length)
    parts.push(
      `${others
        .map((t, i) => {
          const name = i ? tierWord(r, t.id) : cap1(tierWord(r, t.id));
          if (t.shed > SHED) return `${name} ${verb(r, t.id)} full, shedding ${fn(t.shed)} a second`;
          if (loadOf(r, t.id) <= 0) return `${name} ${verb(r, t.id, ['receives', 'receive'])} nothing`;
          return `${name} ${verb(r, t.id)} at ${fp(t.util)}${eachOf(r, t.id)}`;
        })
        .join('; ')}.`,
    );
  if (!r.replicas.n && !r.primary.outage) parts.push('There are no read replicas: the primary takes every read.');
  if (r.settings.zone) parts.push(ZONE_DOWN);
  if (r.settings.slow) parts.push(SLOW_ON);
  return parts.join(' ');
}
const ZONE_DOWN = 'Zone A is down.';
const SLOW_ON = `Each request takes ${formatMs(CAPACITY_SLOW_MS)}.`;

/** The notice while Play ramps: what plays, and no number of a stop the stage has yet to reach. */
export function rampNotice(s: CapacitySettings, from: number = CAPACITY_TRAFFIC[0]): string {
  return s.traffic <= from
    ? `Play runs ${fn(s.traffic)} requests a second through the tiers.`
    : `Play ramps the traffic from ${fn(from)} to ${fn(s.traffic)} requests a second.`;
}

/** A tier zone A took whole, so every request fails there from the first step: the first such in flow order. */
function lostTier(r: CapacityRun): 'lb' | 'app' | 'primary' | null {
  if (!r.lb.up) return 'lb';
  if (!r.app.up) return 'app';
  return r.primary.outage ? 'primary' : null;
}
const COUNT = ['', 'one', 'two', 'three', 'four'];

/**
 * What a ramp did, in order, for Reduced motion's caption and its notice. Where several tiers begin to shed at the
 * same stop, it names each in flow order with its amount and says which is the bottleneck; "first" only when one does.
 * A tier zone A took is not said to shed: every request fails there from the first step.
 */
export function rampStory(s: CapacitySettings, from: number = CAPACITY_TRAFFIC[0]): string {
  const plan = capacityRamp(s, from, s.traffic);
  const end = plan.runs[plan.runs.length - 1];
  const one = plan.stops.length === 1;
  const first = one
    ? `Play ran ${fn(s.traffic)} requests a second through the tiers.`
    : `Play stepped the traffic from ${fn(plan.stops[0])} to ${fn(s.traffic)} requests a second.`;
  const served = end.served > SHED ? `${fn(end.served)} a second are served and ${fn(end.shed)} shed` : 'none are served';
  if (plan.climax < 0) {
    const top = busiestOf(end);
    const names = joinAnd(top.map((t) => tierWord(end, t.id)));
    if (end.maxUtil >= 1 - 1e-9) return `${first} No tier shed; ${names} reached 100%, with nothing to spare.`;
    return `${first} No tier shed; ${names} came closest, at ${fp(end.maxUtil)}${top.length === 1 ? eachOf(end, top[0].id) : ''}.`;
  }
  const at = plan.runs[plan.climax];
  const lost = lostTier(at);
  if (lost) {
    const why =
      lost === 'primary'
        ? 'every request fails at the database: the primary fell with zone A, and no replica could take over'
        : `nothing gets past ${tierWord(at, lost)}: zone A held ${at[lost].n === 1 ? 'the only one' : 'them all'}`;
    return one ? `${first} ${cap1(why)}.` : `${first} From ${fn(plan.stops[0])} on, ${why}.`;
  }
  const b = at.bottleneck;
  if (one) return `${first} ${cap1(tierWord(at, b))} ${verb(at, b)} the bottleneck: ${served}.`;
  const sheds = TIERS.filter((id) => at[id].shed > SHED);
  const last = plan.climax === plan.runs.length - 1;
  const after = last ? `; in all, ${served}` : `; at ${fn(end.offered)}, ${served}`;
  if (sheds.length < 2) return `${first} At ${fn(at.offered)}, ${tierWord(at, b)} began to shed${last ? `: ${served}` : ` first${after}`}.`;
  const each = sheds.map((id, i) => `${tierWord(at, id)}${id === b ? ', the bottleneck,' : ''} ${fn(at[id].shed)}${i ? '' : ' a second'}`);
  return `${first} At ${fn(at.offered)}, ${COUNT[sheds.length]} tiers began to shed at once: ${joinAnd(each)}${after}.`;
}

/** One visually hidden line per tier, which its steppers point to (aria-describedby); it obeys hiding(). */
export function tierLine(r: CapacityRun, id: CapacityTierId, hid: Hid): string {
  if (id === 'lb' || id === 'app') {
    const t = r[id];
    const count = t.lost ? `${t.n}, ${t.up} up after zone A` : `${t.n}`;
    const label = cap1(NOUN[id][1]);
    if (!t.up) return `${label}: ${t.n}, none up after zone A; nothing gets past them.`;
    if (hid.lanes.has(id)) return `${label}: ${count}; their limit shows after your answer.`;
    const each =
      id === 'app' && r.app.bound === 'workers' ? `each ${fn(t.each)} a second, as its workers allow` : `each ${fn(t.each)} a second`;
    return `${label}: ${count}, ${each}; limit ${fn(t.ceiling)} a second.`;
  }
  if (id === 'primary') {
    const t = r.primary;
    const size = `${fn(r.settings.size)} queries a second${largest(r) ? ', the largest' : ''}`;
    if (t.outage) return `Primary: ${size}, lost with zone A.`;
    if (hid.lanes.has('primary')) return `Primary: ${size}; its limit in requests shows after your answer.`;
    return `Primary: ${t.promoted ? 'a promoted replica, ' : ''}${size}; limit ${fn(t.ceiling)} requests a second.`;
  }
  const t = r.replicas;
  if (!t.n) return 'Read replicas: none.';
  const count = t.lost ? `${t.n}, ${t.up} left after zone A` : `${t.n}`;
  if (!t.up) return `Read replicas: ${count}.`;
  if (hid.lanes.has('replicas')) return `Read replicas: ${count}; their limit shows after your answer.`;
  return `Read replicas: ${count}, ${t.up >= 2 ? 'each ' : ''}${fn(r.settings.size)} queries a second; limit ${fn(t.ceiling)} requests a second.`;
}

/** What a stepper or toggle changed, said before the setting's sentence in the notice. */
export function changeLine(a: CapacitySettings, b: CapacitySettings): string {
  if (a.lb !== b.lb) return `Load balancers: now ${fn(b.lb)}.`;
  if (a.app !== b.app) return `App servers: now ${fn(b.app)}.`;
  if (a.size !== b.size) return `Database machine: now ${fn(b.size)} queries a second.`;
  if (a.replicas !== b.replicas) return `Read replicas: now ${b.replicas ? fn(b.replicas) : 'none'}.`;
  if (a.cache !== b.cache) return `Cache reads: ${b.cache ? 'on' : 'off'}.`;
  if (a.zone !== b.zone) return `Zone A: ${b.zone ? 'down' : 'back up'}.`;
  if (a.slow !== b.slow) return `Slow queries: ${b.slow ? 'on' : 'off'}.`;
  return '';
}

/**
 * The notice after a learner's change: what changed, then the setting's sentence. A condition is said once: the change
 * line leaves the summary's own closing sentence for it out, and a new traffic is left to the summary, which opens on it.
 */
export function changeNotice(before: CapacitySettings, r: CapacityRun): string {
  if (before.traffic !== r.settings.traffic) return summary(r);
  const line = changeLine(before, r.settings);
  const said = line.startsWith('Zone A') ? ` ${ZONE_DOWN}` : line.startsWith('Slow') ? ` ${SLOW_ON}` : null;
  const sum = summary(r);
  return `${line} ${said ? sum.replace(said, '') : sum}`.trim();
}

/** The conditions' hints, the long form first. */
export const HINTS = {
  cache: [`${fp(CAPACITY_HIT)} hit`],
  zone: ['one zone of three'],
  slow: [`${formatMs(CAPACITY_SLOW_MS)} a request`, formatMs(CAPACITY_SLOW_MS)],
} as const;

/** Where zone A's loss sheds: every tier that sheds, each with its own amount. */
export function zoneLine(z: CapacityRun): string {
  const sheds = (
    [
      ['lb', z.lb.shed],
      ['app', z.app.shed],
      [z.binding, z.primary.shed + z.replicas.shed],
    ] as const
  ).filter(([, v]) => v > SHED);
  if (sheds.length === 1 && (sheds[0][0] === 'lb' || sheds[0][0] === 'app')) {
    const [id, shed] = sheds[0];
    const t = z[id];
    if (!t.up)
      return `zone A lost: it held ${t.n === 1 ? `the only ${NOUN[id][0]}` : `all ${t.n} ${NOUN[id][1]}`}, so all ${fq(shed)} are shed: not yet`;
    const left = t.up === 1 ? `the one left sheds ${fq(shed)}` : `the ${t.up} left shed ${fq(shed)}`;
    return `zone A lost: it held ${t.lost} of ${t.n} ${NOUN[id][1]}; ${left}: not yet`;
  }
  return `zone A lost: ${joinAnd(sheds.map(([id, v], i) => `${fq(v)}${i ? '' : ' shed'} at ${tierWord(z, id)}`))}: not yet`;
}

/** The challenge's status, each bound in the ask's own terms and its state in words. */
export function goalParts(r: CapacityRun, z: CapacityRun = capacityZoneLoss(r)): { text: string; met: boolean }[] {
  const b = CAPACITY_CHALLENGE_BOUNDS;
  const said = (met: boolean) => (met ? 'met' : 'not yet');
  const served = r.shed < 1;
  const room = capacityMetrics(r, z).headroom >= b.headroom;
  const zoneOk = z.shed < 1;
  const few = r.machines <= b.machines;
  const headroom =
    r.shed > SHED
      ? 'headroom: the busiest tier is full, so none: not yet'
      : r.maxUtil >= 1 - 1e-9
        ? 'headroom: the busiest tier is 100% busy, so none: not yet'
        : `headroom: the busiest tier ${fp(r.maxUtil)} busy leaves ${fp(1 - r.maxUtil)}, at least ${formatPct(b.headroom)}: ${said(room)}`;
  return [
    {
      met: served,
      text: served ? `served: all ${fq(r.offered)}: met` : `served: ${fq(r.served)} of ${fq(r.offered)}, ${fq(r.shed)} shed: not yet`,
    },
    { met: room, text: headroom },
    {
      met: zoneOk,
      text: zoneOk
        ? 'zone A lost: nothing shed: met'
        : z.primary.outage
          ? 'zone A lost: the primary falls with it, and no replica takes over: not yet'
          : zoneLine(z),
    },
    {
      met: few,
      text: `machines: ${r.machines}${r.settings.cache ? `, the cache's ${CAPACITY_CACHE_NODES} nodes among them` : ''}, at most ${b.machines}: ${said(few)}`,
    },
  ];
}
export const GOAL_KEEPS = 'The goal keeps every zone up and the database fast; it tries losing zone A for you.';

/** From this stage width Describe's table takes its full form. */
export const DESCRIBE_WIDE_FROM = 560;
const SHORT: Record<CapacityTierId, string> = { lb: 'LBs', app: 'App', primary: 'Primary', replicas: 'Replicas' };

/**
 * Describe's table: a row per tier and one for the whole path. Compact (under a 560 px stage) it has five columns: the
 * count joins the tier's cell, heads carry the unit and cells are bare numbers.
 */
/** The machines still up: every tier's instances up, the primary unless lost, and the cache's nodes outside zone A. */
export const machinesUp = (r: CapacityRun) =>
  r.lb.up + r.app.up + (r.primary.outage ? 0 : 1) + r.replicas.up + (r.settings.cache ? CAPACITY_CACHE_NODES - r.settings.zone : 0);

export function describeTable(r: CapacityRun, compact: boolean): { head: string[]; rows: string[][]; note: string } {
  const head = compact ? ['Tier', 'Limit/s', 'In/s', 'Busy', 'Shed/s'] : ['Tier', 'Up', 'Limit', 'Arriving', 'Busy', 'Shed'];
  const q = (v: number) => (compact ? fn(v) : fq(v));
  const none = compact ? '0' : 'none';
  const busy = (id: CapacityTierId) => (r[id].shed > SHED ? 'full' : loadOf(r, id) <= 0 ? 'idle' : fp(r[id].util));
  const rows = TIERS.map((id) => {
    const t = r[id];
    let count: string;
    let cells: string[];
    if (id === 'replicas' && !t.up) {
      count = r.replicas.n ? `0 of ${r.replicas.n}` : '0';
      cells = ['–', '–', '–', '–'];
    } else if (id === 'primary' && r.primary.outage) {
      count = 'lost';
      cells = ['0', q(t.arriving), 'lost', q(t.shed)];
    } else {
      count =
        id === 'primary'
          ? r.primary.promoted
            ? compact
              ? '1*'
              : '1, promoted'
            : '1'
          : r[id].lost
            ? `${t.up} of ${r[id].n}`
            : `${r[id].n}`;
      cells = [q(t.ceiling), q(id === 'lb' || id === 'app' ? t.arriving : r.dbArriving), busy(id), t.shed > SHED ? q(t.shed) : none];
    }
    return compact ? [`${SHORT[id]} ${count}`, ...cells] : [NAMES[id][NAMES[id].length - 1], count, ...cells];
  });
  const path = [q(Math.min(r.lb.ceiling, r.app.ceiling, r.dbCeiling)), q(r.offered), '', r.shed > SHED ? q(r.shed) : none];
  // The path's machine count is no count of instances up, so its Up cell stays blank and the note says it.
  rows.push(compact ? ['Path', ...path] : ['Whole path', '', ...path]);
  const cache = r.settings.cache ? `, the cache's ${CAPACITY_CACHE_NODES} nodes among them` : '';
  const left = r.settings.zone ? `; ${machinesUp(r)} up with zone A down` : '';
  const notes = [`${r.machines} machines in all${cache}${left}.`];
  if (compact && r.primary.promoted) notes.push('1*: a replica promoted to primary.');
  return { head, rows, note: notes.join(' ') };
}
