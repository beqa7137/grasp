import {
  LATENCY_CHALLENGE_BOUNDS,
  LATENCY_CHALLENGE_GOAL,
  LATENCY_LOADS,
  LATENCY_QUEUE,
  LATENCY_SERVICE,
  LATENCY_SERVICE_MS,
  formatDuration,
  formatMs,
  formatPct,
  formatQps,
  formatSlot,
  goalKept,
  latencyConfigKey,
  latencyScenario,
  linesAt,
  type LatencySample,
  type LatencyScenario,
  type LatencySettings,
} from '@grasp/engine';

/**
 * What the open question hides, on every surface: the stage, its summary, the notices, the load handle's value and
 * Describe all read this one map. `sample` hides the requests until the answer's play starts them; `numbers` every model
 * number and curve; `after`, through the answer's play, what the model says of the act's new setting (its numbers, its
 * curves if the act changed them, the cursor); `ahead` cuts the curves at the setup's utilization; `utilization` hides
 * the servers' new load through the play, `stability` whether the new setting settles. No ghost of an earlier setting
 * shows while a question asks: a card's setup is a new start. `later` says when a hidden number shows: after the answer
 * while the question asks, at the reveal once it is answered.
 */
export interface Hid {
  sample: boolean;
  numbers: boolean;
  curves: boolean;
  cursorDots: boolean;
  cursorLine: boolean;
  /** The utilization the curves stop at, or null. */
  ahead: number | null;
  utilization: boolean;
  stability: boolean;
  ghost: boolean;
  any: boolean;
  later: string;
}

export type QuestionPhase = 'rest' | 'asking' | 'playing' | 'revealed';

export function hiding(hide: readonly string[], phase: QuestionPhase, setupRho: number | null = null, configChanged = false): Hid {
  const h = new Set(phase === 'asking' || phase === 'playing' ? hide : []);
  const playing = phase === 'playing';
  const after = h.has('after') && playing;
  const numbers = h.has('numbers') || after;
  return {
    sample: h.has('sample') && phase === 'asking',
    numbers,
    curves: h.has('numbers') || (after && configChanged),
    cursorDots: !numbers,
    cursorLine: !after,
    ahead: h.has('ahead') ? setupRho : null,
    utilization: h.has('utilization') && playing,
    stability: h.has('stability') && playing,
    ghost: phase === 'asking',
    any: h.size > 0,
    later: playing ? 'at the reveal' : 'after your answer',
  };
}

export const NOTHING_HIDDEN = hiding([], 'rest');

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
export const serverWord = (n: number) => `${n} ${plural(n, 'server', 'servers')}`;
/** A model time on the stage: one that would print as 0 says so, never a false 0. */
export const fwait = (v: number) => (v > 0 && v < 0.005 ? 'under 0.01 ms' : formatDuration(v));
/** A sampled request's time: three significant figures past a second too, so one line keeps one precision. */
export const sampleTime = (ms: number) => (ms < 1_000 ? formatDuration(ms) : `${Number((ms / 1_000).toPrecision(3))} s`);
const count = (n: number) => formatSlot({ value: n, unit: 'num' });
/** One decimal under 100 ms, whole above: the precision of Describe's columns. */
export const ms1 = (v: number) => (v < 100 ? String(Number(v.toFixed(1))) : String(Math.round(v)));
/** A share as a percentage; one that would print as 0% says so. */
export const pctOf = (v: number) => (v > 0 && v < 0.0005 ? 'under 0.1%' : formatPct(v * 100));
const rate = (v: number) => formatQps(v).replace('/s', '');
/** Exactly 100% of what the servers that are up can serve: no steady state, and no drift either. */
export const critical = (m: LatencyScenario) => Math.abs(m.rho - 1) < 1e-9;
const split = (s: LatencySettings) => s.queue === LATENCY_QUEUE.split && s.servers - s.down > 1;
const steadyWork = (s: LatencySettings) => s.service === LATENCY_SERVICE.steady;

const allUp = (servers: number) => (servers === 2 ? 'both' : `all ${servers}`);

/** The load row: the fleet's load with every server up, then the arrival rate and the work it means, longest first. */
export function loadParts(m: LatencyScenario): { busy: string; rates: string[] } {
  const s = m.settings;
  const busy = s.down ? `${s.load}% busy with ${allUp(s.servers)} up` : `${s.load}% busy`;
  const r = rate(m.ratePerS);
  const each = formatMs(LATENCY_SERVICE_MS);
  const rates = steadyWork(s)
    ? [`${r} requests/s at random, exactly ${each} each`, `${r}/s, exactly ${each} each`, `${r}/s at random`]
    : [`${r} requests/s at random, ${each} each on average`, `${r}/s at random, ${each} each`, `${r}/s at random`];
  return { busy, rates };
}

/** The load handle's value in words: the setting, never the model's numbers. */
export function loadValueText(m: LatencyScenario): string {
  const s = m.settings;
  return `${s.load}% busy${s.down ? ` with ${allUp(s.servers)} up` : ''}, ${rate(m.ratePerS)} requests a second`;
}

/** The servers' load: "busy" only below 100%; past it the offered load is a share of the capacity left. */
export function serversLabel(m: LatencyScenario, hid: Hid): string {
  const s = m.settings;
  if (hid.utilization) return m.up === 1 ? '1 up · ?%' : `${m.up} up · each ?%`;
  const p = formatPct(m.rho * 100);
  if (!m.stable) return `${m.up} up · ${p} of capacity`;
  if (s.servers === 1) return `Server · ${p} busy`;
  if (s.down) return m.up === 1 ? `1 up · ${p} busy` : `${m.up} up · each ${p} busy`;
  return `Servers · each ${p} busy`;
}

/** The band's label, longest form first: it names the moment it shows. */
export function queueForms(m: LatencyScenario, smp: LatencySample | null, hid: Hid, nowWaiting: number | null): string[] {
  const word = split(m.settings) ? 'Queues' : 'Queue';
  if (hid.sample || !smp) return [word];
  if (nowWaiting !== null) return [nowWaiting ? `${word} · ${nowWaiting} waiting now` : `${word} · nobody waiting now`];
  const rest = smp.rest;
  if (rest.kind === 'none') return [`${word} · nobody waited in this sample`, 'Nobody waited in this sample', 'Nobody waited'];
  const at = formatDuration(Math.round(rest.t));
  const n = rest.n;
  if (rest.kind === 'idle') {
    const idle = `S${rest.idle! + 1}`;
    return [`${word} · ${idle} idle beside a line of ${n} at ${at}`, `${idle} idle beside ${n}, at ${at}`, `${idle} idle beside ${n}`];
  }
  if (rest.kind === 'most')
    return [`${word} at their fullest · ${n} waiting at ${at}`, `Fullest · ${n} waiting at ${at}`, `Fullest · ${n} waiting`];
  if (rest.kind === 'end')
    return n
      ? [`${word} after ${at} · ${n} waiting`, `After ${at} · ${n} waiting`, `${n} waiting at ${at}`]
      : [`${word} after ${at} · nobody waiting`, `After ${at} · nobody waiting`, `Nobody waiting at ${at}`];
  return [`${word} at its longest · ${n} waiting at ${at}`, `Longest · ${n} waiting at ${at}`, `Longest · ${n} waiting`];
}
/** The longest form each band label takes at any setting, so the label rows are one value per width. */
export const LONGEST_QUEUE = [
  'Queues · S4 idle beside a line of 99 at 400 ms',
  'Queues at their fullest · 999 waiting at 400 ms',
  'Queue at its longest · 999 waiting at 400 ms',
  'Queues · nobody waited in this sample',
  'Queues after 4 s · nobody waiting',
];

/** The timeline label's right side at rest: the moment the band shows, longest form first. */
export function momentForms(smp: LatencySample): string[] {
  const r = smp.rest;
  if (r.kind === 'none') return [];
  if (r.kind === 'idle')
    return [
      `drawn above: S${r.idle! + 1} idle beside a line of ${r.n}`,
      `S${r.idle! + 1} idle, ${r.n} waiting`,
      `idle beside ${r.n}`,
      `idle, ${r.n}`,
    ];
  if (r.kind === 'most') return [`drawn above: the most waiting, ${r.n}`, `above: most, ${r.n}`, `most: ${r.n}`];
  if (r.kind === 'end') return [`drawn above: the end, ${r.n} waiting`, `above: the end, ${r.n}`, `end: ${r.n}`];
  return [`drawn above: the longest queue, ${r.n}`, `above: the longest, ${r.n}`, `longest: ${r.n}`];
}

/**
 * The widest pairs of facts any setting prints, the hidden one among them: the block reserves the most lines any of
 * these wraps to at its width, so its height depends on the width alone (`latency-words.spec.ts` checks every setting).
 */
export const LONGEST_FACTS: readonly (readonly string[])[] = [
  [
    '100/s arrive, exactly what the one server left can serve.',
    'With no slack, the queue wanders without a bound and the waits keep growing.',
  ],
  [
    '140/s arrive, and the one server left can serve 100/s.',
    'So 40 more arrive than leave each second, and every wait grows without bound.',
  ],
  ['32.3% of requests wait at all; the rest take exactly 10 ms.', "1.18 in the system at once on average: 100/s × 11.8 ms (Little's law)."],
];

/**
 * The two facts under the bar: who waits at all, and Little's law multiplied out as printed, the mean to as many decimals
 * as keep the product within the model's number in the system to its last printed digit.
 */
export function factLines(m: LatencyScenario, hid: Hid): string[] {
  if (hid.numbers) return [`Who waits, and how many are in the system at once, show ${hid.later}.`];
  const left = m.up === 1 ? 'the one server left' : `the ${m.up} servers left`;
  if (critical(m))
    return [
      `${formatQps(m.ratePerS)} arrive, exactly what ${left} can serve.`,
      'With no slack, the queue wanders without a bound and the waits keep growing.',
    ];
  if (!m.stable)
    return [
      `${formatQps(m.ratePerS)} arrive, and ${left} can serve ${formatQps(m.capacityPerS)}.`,
      `So ${rate(m.growthPerS)} more arrive than leave each second, and every wait grows without bound.`,
    ];
  const w = pctOf(m.waitChance);
  const share = w.startsWith('under') ? `U${w.slice(1)}` : w;
  const a =
    steadyWork(m.settings) && m.waitChance < 0.995
      ? `${share} of requests wait at all; the rest take exactly ${formatMs(LATENCY_SERVICE_MS)}.`
      : `${share} of requests wait at all.`;
  const d = m.mean < 100 ? 1 : 0;
  const mean =
    [d, d + 1, d + 2].map((k) => Number(m.mean.toFixed(k))).find((v) => Math.abs((m.ratePerS * v) / 1000 - m.inSystem) < 0.005) ??
    Number(m.mean.toFixed(d + 2));
  const inSystem = formatSlot({ value: (m.ratePerS * mean) / 1000, unit: 'num' });
  return [a, `${inSystem} in the system at once on average: ${formatQps(m.ratePerS)} × ${mean} ms (Little's law).`];
}

/** The headline's words with no steady state, longest first. */
export function headlineForms(m: LatencyScenario): string[] {
  const left = m.up === 1 ? 'the server left' : 'the servers left';
  if (critical(m)) return [`arrivals exactly match what ${left} can serve`, 'arrivals exactly match the capacity left', 'no slack left'];
  const g = m.stable ? '' : rate(m.growthPerS);
  return [`the queue grows by ${g} requests a second`, `the queue grows by ${g} a second`, `grows by ${g} a second`];
}

/** The curve ghost's name: what was different about the configuration it shows. */
export function ghostName(was: LatencySettings, now: LatencySettings): string {
  const a = latencyScenario(was).settings;
  const b = latencyScenario(now).settings;
  const diff = (['servers', 'queue', 'service', 'down'] as const).filter((k) => a[k] !== b[k]);
  if (diff.length !== 1) return 'p99 before';
  if (diff[0] === 'queue') return a.queue === LATENCY_QUEUE.split ? 'p99, a queue each' : 'p99, one queue';
  if (diff[0] === 'service') return steadyWork(a) ? 'p99, steady work' : 'p99, random work';
  if (diff[0] === 'servers') return `p99, ${serverWord(a.servers)}`;
  return 'p99 before';
}

export const sameConfig = (a: LatencySettings, b: LatencySettings) => latencyConfigKey(a) === latencyConfigKey(b);

/** The stage's description in full sentences, which says nothing the open question hides. */
export function summary(m: LatencyScenario, hid: Hid): string {
  const s = m.settings;
  const who =
    s.servers === 1
      ? `One server, ${s.load}% busy`
      : `${serverWord(s.servers)} with ${s.queue === LATENCY_QUEUE.split ? 'a queue each' : 'one shared queue'}${s.down ? ', one of them down' : ''}, ${s.load}% busy with all up`;
  const work = steadyWork(s)
    ? `every request taking exactly ${formatMs(LATENCY_SERVICE_MS)}`
    : `requests taking ${formatMs(LATENCY_SERVICE_MS)} on average`;
  const parts = [`${who}, ${work}.`];
  const left = m.up === 1 ? 'the server left' : 'the servers left';
  if (hid.numbers) parts.push(`The model's numbers show ${hid.later}.`);
  else if (critical(m))
    parts.push(
      `There is no steady state: ${formatQps(m.ratePerS)} arrive, exactly what ${left} can serve, so the queue wanders without a bound and the waits keep growing.`,
    );
  else if (!m.stable)
    parts.push(
      `There is no steady state: ${formatQps(m.ratePerS)} arrive and ${left} serve${m.up === 1 ? 's' : ''} ${formatQps(m.capacityPerS)}, so the queue grows by ${rate(m.growthPerS)} requests a second.`,
    );
  else
    parts.push(
      `The model gives p50 ${formatDuration(m.p50)}, p99 ${formatDuration(m.p99)} and a mean of ${formatDuration(m.mean)}, of which ${fwait(m.meanWait)} is waiting.`,
    );
  if (hid.sample) parts.push('The sample of requests plays after your answer.');
  return parts.join(' ');
}

/** A settings change in words: the new setting and, unless a question hides them, the model's numbers there. */
export function changeNotice(m: LatencyScenario, hid: Hid): string {
  const s = m.settings;
  const who =
    s.servers === 1
      ? 'One server'
      : `${serverWord(s.servers)} with ${s.queue === LATENCY_QUEUE.split ? 'a queue each' : 'one shared queue'}${s.down ? ', one down' : ''}`;
  const p = formatPct(m.rho * 100);
  const load = !m.stable ? `${p} of capacity` : s.servers === 1 ? `${p} busy` : m.up === 1 ? `the one left ${p} busy` : `each ${p} busy`;
  const head = `${who}, ${hid.utilization ? `${s.load}% busy with all up` : load}${steadyWork(s) ? ', steady work' : ''}`;
  if (hid.numbers || hid.utilization) return `${head}.`;
  if (critical(m)) return `${head}: no steady state; arrivals exactly match the capacity left.`;
  if (!m.stable) return `${head}: no steady state; the queue grows by ${rate(m.growthPerS)} requests a second.`;
  return `${head}: p99 ${formatDuration(m.p99)}, p50 ${formatDuration(m.p50)}, ${pctOf(m.waitChance)} of requests wait.`;
}

/**
 * What the sample did, in order, for the notice, the Reduced-motion caption and Describe: every number is written. With
 * no steady state it ends on the window's end against the model's trend.
 */
export function sampleStory(smp: LatencySample, m: LatencyScenario): string {
  const arrivals = smp.reqs.filter((r) => r.arrive >= 0).length;
  const span = `${smp.stable ? 'the last' : 'the first'} ${formatDuration(smp.window)}`;
  const end = linesAt(smp, smp.window - 1e-6).total;
  const endWords = end ? `${count(end)} ${plural(end, 'was', 'were')} waiting at the end` : 'nobody was waiting at the end';
  const r = smp.rest;
  const at = formatDuration(Math.round(r.t));
  const first = `In this sample, ${count(arrivals)} ${plural(arrivals, 'request', 'requests')} arrived in ${span}.`;
  if (r.kind === 'none') return `${first} None had to wait.`;
  if (r.kind === 'end') {
    const atEnd = end ? `At the end, ${count(end)} ${plural(end, 'was', 'were')} waiting` : 'At the end, nobody was waiting';
    if (m.stable || critical(m)) return `${first} ${atEnd}: with no slack, the queue wanders with no trend.`;
    return `${first} ${atEnd}; the model's trend, ${rate(m.growthPerS)} more a second, reaches ${count(Math.round((m.growthPerS * smp.window) / 1000))} by then.`;
  }
  if (r.kind === 'idle')
    return `${first} At ${at}, S${r.idle! + 1} sat idle while ${count(r.n)} waited in S${r.line! + 1}'s line; ${endWords}.`;
  if (r.kind === 'most') return `${first} The most were waiting at ${at}: ${count(r.n)} across the ${smp.up} lines; ${endWords}.`;
  return `${first} The line grew to ${count(r.n)} waiting at ${at}; ${endWords}.`;
}

/** The stage width under which Describe's table takes its compact form: heads carry the unit, cells whole numbers. */
export const DESCRIBE_WIDE_FROM = 560;

/**
 * Describe: a row per load stop for this configuration, the current one marked, and the note for rows past 100%. Compact,
 * the heads carry the unit and the times and loads are whole numbers, so six columns fit a 320px phone.
 */
export function describeTable(
  m: LatencyScenario,
  compact: boolean,
): { head: string[]; rows: string[][]; active: number; note: string | null } {
  const s = m.settings;
  const onWhom = m.up === 1 ? 'S1' : 'each';
  const busyHead = s.servers === 1 ? 'Busy' : s.down ? `Load on ${onWhom}` : 'Each busy';
  const head = compact
    ? ['Load', s.servers === 1 ? 'Busy' : s.down ? `On ${onWhom}` : 'Each', 'Mean, ms', 'p50, ms', 'p99, ms', 'Waits']
    : ['Load', busyHead, 'Mean', 'p50', 'p99', 'Wait at all'];
  const t = (v: number) => (compact ? String(Math.round(v)) : `${ms1(v)} ms`);
  let unstable = false;
  const rows = LATENCY_LOADS.map((load) => {
    const r = latencyScenario({ ...s, load });
    const p = compact ? `${Math.round(r.rho * 100)}%` : formatPct(r.rho * 100);
    if (!r.stable) {
      unstable = true;
      const g = compact ? '∞' : 'grows';
      return [`${load}%`, compact ? p : critical(r) ? `${p} (full)` : `${p} (over)`, g, g, g, 'all'];
    }
    const w = pctOf(r.waitChance);
    return [`${load}%`, p, t(r.mean), t(r.p50), t(r.p99), w.startsWith('under') ? '<0.1%' : w];
  });
  const note = unstable ? `${compact ? '∞' : 'grows'}: no steady state; every wait grows without bound.` : null;
  return { head, rows, active: LATENCY_LOADS.indexOf(s.load as (typeof LATENCY_LOADS)[number]), note };
}

/**
 * The challenge's status, each bound in the ask's own terms with its state in words. The goal measures p99 at the
 * settings it keeps (a server down, random work), so p99 is met only there; elsewhere its row says what the goal keeps.
 */
export function goalParts(m: LatencyScenario): { text: string; met: boolean }[] {
  const b = LATENCY_CHALLENGE_BOUNDS;
  const s = m.settings;
  const said = (met: boolean) => (met ? 'met' : 'not yet');
  const p99Met = goalKept(LATENCY_CHALLENGE_GOAL, s) && m.stable && m.p99 < b.p99;
  const loadMet = s.load >= b.load;
  const down = s.down ? 'with one server down' : 'with every server up';
  const value = m.stable ? formatDuration(m.p99) : 'grows without bound';
  const p99 =
    s.servers === 1
      ? `p99 with one server down: needs two or more servers: ${said(false)}`
      : !s.down
        ? `p99 ${down}: ${value}; the goal measures it with one server down: ${said(false)}`
        : steadyWork(s)
          ? `p99 ${down} and steady work: ${value}; the goal keeps random work: ${said(false)}`
          : m.stable
            ? `p99 ${down}: ${value}, under ${formatMs(b.p99)}: ${said(p99Met)}`
            : `p99 ${down}: ${value}, needs under ${formatMs(b.p99)}: ${said(false)}`;
  return [
    { met: p99Met, text: p99 },
    { met: loadMet, text: `the fleet at ${m.settings.load}% busy with all up, at least ${b.load}%: ${said(loadMet)}` },
  ];
}
