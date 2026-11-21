import {
  COPY_FAILS_PER_YEAR,
  COPY_MTBF_H,
  COPY_MTTR_H,
  COPY_UNAVAILABILITY,
  FAILOVER_MIN,
  RELIABILITY_CHALLENGE_BOUNDS,
  RELIABILITY_MONTH_H,
  RELIABILITY_PARTS,
  RELIABILITY_WEEKS,
  SHARED_SHARE,
  formatAvailability,
  formatDown,
  formatHours,
  formatOneIn,
  hoursAYear,
  yearHours,
  ninesOf,
  partAvailability,
  reliabilityRestMoment,
  type PartAvailability,
  type ReliabilityPart,
  type ReliabilityPartId,
  type ReliabilityScenario,
  type ReliabilitySettings,
  type ReliabilityYear,
  type YearEvent,
  type YearMoment,
} from '@grasp/engine';

/** Where an open question stands; `rest` when none is open (a challenge counts as none: it hides nothing). */
export type QuestionPhase = 'rest' | 'asking' | 'playing' | 'revealed';

/** What an open question hides, on every surface: the stage, its summary, the notices, the readout and Describe. */
export interface Hidden {
  /** The simulated year: ticks, strips, the request's row, the band's moment and the year's sentence. */
  sample: boolean;
  /** The model's numbers for the request: the headline, its bar, the cap and the facts. */
  request: boolean;
  /** Which part caps the chain: the cap line, its ends and words, the marked values and the weakest-link sentence. */
  weakest: boolean;
  /** The facts' second line (the paper rule, or what a set of copies is down from) and its split. */
  rule: boolean;
  /** Parts whose bar, paper label and value wait during an answer's play: those its act changed. */
  parts: ReadonlySet<ReliabilityPartId>;
  /** No ghost of an earlier setting: a card's setup is a new start. */
  ghost: boolean;
  /** Play, the steppers, the toggles and Describe wait. */
  waits: boolean;
}

export const NOTHING_HIDDEN: Hidden = {
  sample: false,
  request: false,
  weakest: false,
  rule: false,
  parts: new Set(),
  ghost: false,
  waits: false,
};

/**
 * The one map from a question's hidden regions to every surface (prevention 1). `sample` hides the year while it asks;
 * `request` the request's numbers while it asks and plays; `weakest`, while it asks and plays, which part caps the chain;
 * `after`, during the answer's play, all of `request` and the bars of the parts the act changed. Every question holds
 * back the facts' rule and the ghost while it asks and plays. Hiding releases at the reveal.
 */
export function hiding(hide: readonly string[], phase: QuestionPhase, changed: readonly ReliabilityPartId[]): Hidden {
  const asking = phase === 'asking';
  const active = asking || phase === 'playing';
  if (!active) return NOTHING_HIDDEN;
  const h = new Set(hide);
  const after = h.has('after') && phase === 'playing';
  const request = h.has('request') || after;
  return {
    sample: h.has('sample') && asking,
    request,
    weakest: h.has('weakest') || request,
    rule: true,
    parts: new Set(after ? changed : []),
    ghost: true,
    waits: true,
  };
}

const PART = Object.fromEntries(RELIABILITY_PARTS.map((p) => [p.id, p])) as Record<ReliabilityPartId, (typeof RELIABILITY_PARTS)[number]>;
export const copyName = (id: ReliabilityPartId, i: number) => `${PART[id].short} ${i + 1}`;
const SINGLE: Record<ReliabilityPartId, string> = {
  lb: 'the load balancer',
  app: 'the app server',
  db: 'the database',
  recs: 'the recommendations service',
};
const STAY: Record<ReliabilityPartId, string> = {
  lb: 'the load balancers stay up',
  app: 'the app servers stay up',
  db: 'the databases stay up',
  recs: 'recommendations stay up',
};
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const countWord = (n: number) => (n === 2 ? 'both' : `all ${n}`);
export const listOf = (items: readonly string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const timesWord = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const copiesOf = (n: number) => `${n} ${plural(n, 'copy', 'copies')}`;
const pct = (v: number) => `${Number(v.toFixed(2))}%`;
const COPY_PCT = pct(COPY_UNAVAILABILITY * 100);
const num = (v: number) => String(Number(v.toFixed(2)));

/** The band's moment in words. An absorbed outage claims only what is true of its part, and with independent copies says why its strip stays empty. */
export function momentWords(mo: YearMoment, copies: number, shared: boolean): string {
  const wk = `Week ${mo.week + 1}`;
  if (mo.kind === 'outage') return `${wk}: ${SINGLE[mo.part]} is down for ${COPY_MTTR_H} h and has no other copy, so the request fails.`;
  if (mo.kind === 'shared')
    return `${wk}: a shared failure takes ${countWord(copies)} ${PART[mo.part].many} down at once for ${COPY_MTTR_H} h, so the request fails.`;
  if (mo.kind === 'failover')
    return `${wk}: ${copyName(mo.part, 0)} dies. For ${FAILOVER_MIN} min requests still go to it and fail, then ${copyName(mo.part, 1)} carries them.`;
  if (mo.kind === 'bypassed')
    return `${wk}: recommendations are down for ${mo.cause === 'failover' ? `${FAILOVER_MIN} min` : `${COPY_MTTR_H} h`}. The page renders without them, so the request is served.`;
  const carrier = mo.copy === 0 ? 1 : 0;
  const said = `${wk}: ${copyName(mo.part, mo.copy)} is down for ${COPY_MTTR_H} h. ${copyName(mo.part, carrier)} carries the request, so ${STAY[mo.part]}.`;
  if (shared) return said;
  return copies === 2
    ? `${said} ${copyName(mo.part, carrier)} is itself down only ${COPY_PCT} of the time.`
    : `${said} The others are each down only ${COPY_PCT} of the time.`;
}
export const SAMPLE_HIDDEN = 'The year plays after your answer.';
export const sweepWords = (weeks: number) => `Week ${Math.min(RELIABILITY_WEEKS, Math.floor(weeks) + 1)} of ${RELIABILITY_WEEKS}.`;

/** Every sentence the band can say, for the reserve under the chain. */
export function allMomentWords(): string[] {
  const out = [SAMPLE_HIDDEN, sweepWords(RELIABILITY_WEEKS - 1)];
  const at = (part: ReliabilityPartId, kind: YearMoment['kind'], copy = 0, cause?: YearEvent['kind']): YearMoment => ({
    week: RELIABILITY_WEEKS - 1,
    part,
    kind,
    copy,
    fails: false,
    hours: COPY_MTTR_H,
    cause,
  });
  for (const p of RELIABILITY_PARTS) {
    out.push(momentWords(at(p.id, 'outage'), 1, false));
    for (const n of [2, 3]) {
      out.push(momentWords(at(p.id, 'shared'), n, true), momentWords(at(p.id, 'failover'), n, false));
      for (let c = 0; c < n; c++) for (const shared of [false, true]) out.push(momentWords(at(p.id, 'absorbed', c), n, shared));
    }
  }
  for (const cause of ['outage', 'failover'] as const) out.push(momentWords(at('recs', 'bypassed', 0, cause), 1, false));
  return out;
}

/** The simulated year's own sentence: counts and hours of this one year, never the model's. */
export function yearWords(fails: readonly YearEvent[], soFar = false): string {
  const n = fails.length;
  const lead = soFar ? 'So far this simulated year' : 'In this simulated year';
  if (!n) return soFar ? `${lead} the request has not failed.` : `${lead} the request never failed; the model’s long-run average is below.`;
  const long = fails.filter((e) => e.kind !== 'failover').length;
  const short = n - long;
  const hours = yearHours(fails);
  if (soFar) return `${lead} the request has failed ${timesWord(n)}, ${formatDown(hours)} in all.`;
  const each = !short
    ? `each for ${COPY_MTTR_H} h`
    : !long
      ? `each for ${FAILOVER_MIN} min`
      : `(${long} × ${COPY_MTTR_H} h) + (${short} × ${FAILOVER_MIN} min)`;
  return `${lead} the request failed ${timesWord(n)}, ${formatDown(hours)} in all: ${each}.`;
}
/** The longest the year's sentence gets at any setting, for its reserve. */
export const YEAR_LONGEST = [
  'In this simulated year the request failed 35 times, 20.3 h in all: (19 × 1 h) + (16 × 5 min).',
  'So far this simulated year the request has failed 35 times, 20.3 h in all.',
  yearWords([]),
];

/** The weakest links: every needed part that prints the worst downtime, grouped by copies when they differ. */
export function weakestWords(m: ReliabilityScenario, short = false): string {
  const ws = m.weakest.map((id) => m.parts.find((p) => p.id === id)!);
  const nm = (p: ReliabilityPart) => (short ? p.short : `the ${plural(p.copies, p.one, p.many)}`);
  const down = formatDown(m.parts.find((p) => p.id === m.capPart)!.downH);
  const counts = [...new Set(ws.map((p) => p.copies))].sort();
  if (ws.length === 1) return `Weakest link: ${nm(ws[0])} (${copiesOf(ws[0].copies)}), down ${down} a year.`;
  if (counts.length === 1) {
    const names = ws.length === RELIABILITY_PARTS.length ? `all ${ws.length} parts` : listOf(ws.map(nm));
    return `Weakest links: ${names} (${copiesOf(counts[0])} each), each down ${down} a year.`;
  }
  const groups = counts.map((n) => {
    const g = ws.filter((p) => p.copies === n);
    return `${listOf(g.map(nm))} (${copiesOf(n)}${g.length > 1 ? ' each' : ''})`;
  });
  return `Weakest links: ${groups.join(' and ')}, each down ${down} a year.`;
}
/** Tied weakest parts with different copies: the extra copy bought nothing the printed value shows. */
export function tiedWords(m: ReliabilityScenario): string {
  const ws = m.parts.filter((p) => m.weakest.includes(p.id));
  return new Set(ws.map((p) => p.copies)).size < 2 ? '' : 'A third copy buys under a minute a year here.';
}

/** The least redundant set of copies the request needs, which the facts and the split speak for. */
export const leastSet = (m: ReliabilityScenario): ReliabilityPart | null =>
  m.parts.filter((p) => !p.optional && p.copies > 1).reduce<ReliabilityPart | null>((a, b) => (!a || b.copies < a.copies ? b : a), null);
export const NO_PAIR = 'No needed part has a second copy yet.';

/** What the conditions do: on paper the rule, else what the least redundant set is down from, as counts times durations. */
export function causesWords(m: ReliabilityScenario): string {
  const s = m.settings;
  const p = leastSet(m);
  if (!p) return NO_PAIR;
  if (!s.shared && !s.failover)
    return `On paper each copy adds ${Math.round(ninesOf(COPY_UNAVAILABILITY))} nines: a part is down only while all its copies are.`;
  return `${p.copies === 2 ? 'A pair' : 'A set of 3'} is down ${formatDown(p.downH)} a year, ${formatDown(p.paperDownH)} on paper: ${causeSum(p)}.`;
}
/** A part's downtime causes as one sum, every product in parentheses, the facts line and "if" frame alike. */
export function causeSum(a: PartAvailability): string {
  const items: string[] = [];
  if (a.causes.shared) items.push(`(${num(a.sharedPerYear)} shared outages × ${COPY_MTTR_H} h)`);
  if (a.causes.failover) items.push(`(${num(a.failovers)} failovers × ${FAILOVER_MIN} min)`);
  items.push(`${formatDown(hoursAYear(a.causes.overlap))} ${countWord(a.n)} down by chance`);
  return items.join(' + ');
}
export const ghostWords = (g: ReliabilityScenario, challenge = false) =>
  `${challenge ? 'At the start' : 'Before this change'}: ${formatDown(g.downH)} a year.`;
export const GHOST_LONGEST = 'Before this change: 20.6 h a year.';
export const HIDDEN_FACT = 'The request’s numbers and its weakest link show after your answer.';
export const HIDDEN_WEAKEST = 'The weakest link shows after your answer.';

/**
 * "That hour" names only what it draws (the moment's copy down, the others up). What would take the part down gets its
 * own frame and title, "if", with its yearly figure: by chance, or with shared failures the facts line's sum of the
 * shared outages that take every copy down at once and the overlap by chance, ending in their total.
 */
export function hourWords(
  id: ReliabilityPartId,
  n: number,
  down: number,
  shared = false,
): { title: string; ifTitle: string; body: string } {
  const up = Array.from({ length: n }, (_, k) => k).filter((k) => k !== down);
  const odds = n === 2 ? COPY_PCT : `${COPY_PCT} × ${COPY_PCT}`;
  const a = partAvailability(n, shared, false);
  const chance = formatDown(hoursAYear(a.causes.overlap));
  return {
    title: `That hour: ${copyName(id, down)} down, ${listOf(up.map((k) => copyName(id, k)))} up.`,
    ifTitle: `If ${n === 2 ? 'both were' : `all ${n} were`} down at once:`,
    body: shared
      ? `${causeSum(a)} = ${formatDown(hoursAYear(a.u))} a year.`
      : `their overlap, magnified, is ${odds} of ${num(COPY_FAILS_PER_YEAR)} h = ${chance} a year.`,
  };
}
/** Every "that hour" the stage can draw, for the lines it reserves. */
export const allHourWords = () =>
  RELIABILITY_PARTS.flatMap((p) =>
    [2, 3].flatMap((n) => Array.from({ length: n }, (_, k) => [false, true].map((sh) => ({ n, ...hourWords(p.id, n, k, sh) }))).flat()),
  );

const chainWords = (m: ReliabilityScenario) =>
  listOf(m.parts.map((p) => `${p.copies} ${plural(p.copies, p.one, p.many)}${p.optional ? ' (optional)' : ''}`));

/** The conditions in words, as the standing sentence and the summary say them; only the standing one points at marks. */
export function conditionWords(s: ReliabilitySettings, marks = false): string {
  const c = [
    s.shared ? `${formatOneIn(SHARED_SHARE)} of a copy’s outages is shared by every copy of its part` : 'copies fail independently',
    s.failover
      ? `traffic takes ${FAILOVER_MIN} min to move off a dead copy: requests go to the first copy while it is up, so only its outages cost a failover`
      : 'traffic moves off a dead copy at once',
  ];
  return (
    c.join(', and ') +
    (s.optional ? `; recommendations are optional, so their outages${marks ? ' (the hollow marks)' : ''} never reach the request` : '')
  );
}

/** The model's standing simplifications, under the stage. */
export const standingWords = (s: ReliabilitySettings) =>
  `Every copy is ${formatAvailability(COPY_UNAVAILABILITY)} available: ${num(COPY_FAILS_PER_YEAR)} outages a year × ${COPY_MTTR_H} h each is ${num(
    COPY_FAILS_PER_YEAR * COPY_MTTR_H,
  )} h down, or up ${COPY_MTBF_H} h for every ${COPY_MTTR_H} h down. Parts fail independently of each other, and one copy can carry the full load. Here ${conditionWords(s, true)}.`;

/** The stage's summary: the setting, then what the model gives, or that it shows after the answer. */
export function summary(m: ReliabilityScenario, hid: Hidden): string {
  const out = [
    `A request crosses ${chainWords(m)}, every copy ${formatAvailability(COPY_UNAVAILABILITY)} available; ${conditionWords(m.settings)}.`,
  ];
  if (hid.request) out.push('The model’s numbers for the request show after your answer.');
  else
    out.push(
      `By the model the request is ${formatAvailability(m.u)} available: down ${formatDown(m.downH)} a year, ${formatDown(m.monthH)} in 30 days. ${
        hid.weakest ? HIDDEN_WEAKEST : weakestWords(m)
      }`,
    );
  if (hid.sample) out.push('The simulated year plays after your answer.');
  return out.join(' ');
}

/** The notice after a change, and when a challenge opens or a question is revealed. */
export const settingWords = (m: ReliabilityScenario, hid: Hidden = NOTHING_HIDDEN) =>
  hid.request
    ? 'The model’s numbers for the request show after your answer.'
    : `The request is ${formatAvailability(m.u)} available, down ${formatDown(m.downH)} a year. ${hid.weakest ? HIDDEN_WEAKEST : weakestWords(m)}`;
export const WAITS_NOTICE = 'Play and the settings this question is about wait for your answer.';
export const ANSWER_PLAYS = 'The year plays, then the answer shows.';

/** The one-column layout's readout of the request, beside the controls. */
export const readoutWords = (m: ReliabilityScenario, hid: Hidden) =>
  hid.request
    ? 'Request: ? available · down ? a year'
    : `Request: ${formatAvailability(m.u)} available · down ${formatDown(m.downH)} a year`;

/** The year in words for a free play's end and for Describe. */
export const playedWords = (y: ReliabilityYear, mo: YearMoment | null, m: ReliabilityScenario) =>
  [yearWords(y.fails), mo ? momentWords(mo, m.parts.find((p) => p.id === mo.part)!.copies, !!m.settings.shared) : '']
    .filter(Boolean)
    .join(' ');

/** The challenge's status, each bound in the ask's terms and its state in words. */
export function goalChecks(m: ReliabilityScenario): { met: boolean; text: string }[] {
  const b = RELIABILITY_CHALLENGE_BOUNDS;
  const said = (met: boolean) => (met ? 'met' : 'not yet');
  const downMet = m.downH < b.down;
  const copiesMet = m.copies < b.copies;
  return [
    { met: downMet, text: `the request down ${formatDown(m.downH)} a year, under ${formatHours(b.down)}: ${said(downMet)}` },
    { met: copiesMet, text: `${m.copies} copies in all, no more than ${b.copies - 1}: ${said(copiesMet)}` },
  ];
}

/** Describe's table: its six columns from the wide width, the same in tight cells with short names from the middle one. */
export const DESCRIBE_WIDE_FROM = 680;
export const DESCRIBE_MID_FROM = 560;
export type DescribeForm = 'wide' | 'mid' | 'compact';
export const describeForm = (W: number): DescribeForm => (W >= DESCRIBE_WIDE_FROM ? 'wide' : W >= DESCRIBE_MID_FROM ? 'mid' : 'compact');

/** Describe's sentences and its table: a row per part and one for the request. */
export function describe(m: ReliabilityScenario, y: ReliabilityYear, form: DescribeForm) {
  const compact = form === 'compact';
  const head = compact
    ? ['Part', 'Copies', 'Down a year', 'This year']
    : ['Part', 'Copies', 'Available', 'Down a year', 'In 30 days', 'Simulated year'];
  const yearCell = (events: readonly YearEvent[]) => {
    if (!events.length) return 'none';
    const h = yearHours(events);
    return compact
      ? `${events.length}×, ${formatDown(h)}`
      : `${events.length} ${plural(events.length, 'failure', 'failures')}, ${formatDown(h)}`;
  };
  const rows = m.parts.map((p, i) => {
    // A table at the stage's width has no room for a mark: the sentence above it names the weakest links.
    const name = form === 'wide' ? p.name : p.short;
    if (p.optional)
      return compact
        ? [name, String(p.copies), 'optional', 'none']
        : [name, String(p.copies), formatAvailability(p.u), 'optional', 'optional', 'none'];
    const ev = y.parts[i].events;
    return compact
      ? [name, String(p.copies), formatDown(p.downH), yearCell(ev)]
      : [name, String(p.copies), formatAvailability(p.u), formatDown(p.downH), formatDown(p.u * RELIABILITY_MONTH_H), yearCell(ev)];
  });
  rows.push(
    compact
      ? ['Request', String(m.copies), formatDown(m.downH), yearCell(y.fails)]
      : [
          form === 'wide' ? 'The request' : 'Request',
          String(m.copies),
          formatAvailability(m.u),
          formatDown(m.downH),
          formatDown(m.monthH),
          yearCell(y.fails),
        ],
  );
  const mo = reliabilityRestMoment(m.settings);
  const rests = mo
    ? momentWords(mo, m.parts.find((p) => p.id === mo.part)!.copies, !!m.settings.shared).replace(
        /^Week (\d+): /,
        'The picture rests on week $1, when ',
      )
    : '';
  const said = [
    `${summary(m, NOTHING_HIDDEN)} ${causesWords(m)}`,
    `${yearWords(y.fails)} ${rests} The year is drawn so that no two outages of one part fall in the same week unless they are one shared outage, so two ticks in one column of a part are always that; by chance alone a pair overlaps about once in ${Math.round(
      1 / partAvailability(2, false, false).overlapsPerYear,
    )} years.`,
  ];
  return { head, rows, active: rows.length - 1, said };
}
