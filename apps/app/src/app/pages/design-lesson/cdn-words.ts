import {
  CDN_CHALLENGE_BOUNDS,
  CDN_CHALLENGE_GOAL,
  CDN_EDGE_MS_AT_20,
  CDN_HEAD_RANKS,
  CDN_OBJECTS,
  CDN_ORIGIN_MS,
  CDN_POPS,
  CDN_SHIELD_MS,
  CDN_WINDOW_TTLS,
  cdnCumShare,
  cdnGroup,
  cdnScenario,
  formatMeanMs,
  formatOften,
  formatPathMs,
  formatRank,
  formatReqRate,
  formatShare,
  formatTimelineClock,
  ttlAdj,
  ttlWords,
  type CdnEvent,
  type CdnSample,
  type CdnScenario,
  type CdnSettings,
} from '@grasp/engine';

/**
 * What an open question hides, on every surface: one map from the regions a question names in its own `hide` list.
 * `curve` (E1) hides which objects hit: while it asks and while its answer plays, the square's bands and half-hit ranks
 * and the lanes' model hit shares; while it asks, the outcome of every sampled request (ticks drawn as plain arrivals).
 * `outcome` (E2 to E5) hides, while the answer plays at the act's setting, where requests are answered: every share and
 * rate below the users, the flows and fills that would draw them, the mean, and as for `curve` the square and the
 * lanes' hit shares. No ghost shows while a question is open, every control waits, and the model's note, which states
 * the hit rule, waits too.
 */
export interface Hid {
  curveNumbers: boolean;
  curveBands: boolean;
  laneHits: boolean;
  laneMarks: boolean;
  tierNumbers: boolean;
  tierFlows: boolean;
  mean: boolean;
  ghost: boolean;
  locked: boolean;
  /** The answer is in and playing: what waits says it shows at the reveal. */
  playing: boolean;
}
export type HidFlag = keyof Hid;
export type QuestionPhase = 'rest' | 'asking' | 'playing' | 'revealed';

/** `leak` switches flags off, for the no-answer sweep to prove it catches each one. */
export function hiding(hide: readonly string[], phase: QuestionPhase, leak: readonly HidFlag[] = []): Hid {
  const h = new Set(hide);
  const asking = phase === 'asking';
  const open = asking || phase === 'playing';
  const curve = h.has('curve') && open;
  const outcome = h.has('outcome') && phase === 'playing';
  const map: Hid = {
    curveNumbers: curve || outcome,
    curveBands: curve || outcome,
    laneHits: curve || outcome,
    laneMarks: h.has('curve') && asking,
    tierNumbers: outcome,
    tierFlows: outcome,
    mean: outcome,
    ghost: open,
    locked: open,
    playing: phase === 'playing',
  };
  for (const flag of leak) map[flag] = false;
  return map;
}
export const NOTHING_HIDDEN = hiding([], 'rest');
/** Every flag a question can raise while its answer plays, for the lines a text reserves. */
export const ALL_HIDDEN: Hid = { ...NOTHING_HIDDEN, curveNumbers: true, curveBands: true, laneHits: true, tierNumbers: true, mean: true };
/** When what an open question hides shows: after the answer while it asks, at the reveal once the answer plays. */
export const later = (hid: Hid) => (hid.playing ? 'at the reveal' : 'after your answer');
export const anyHidden = (hid: Hid) => hid.curveNumbers || hid.tierNumbers || hid.laneMarks;

export const locs = (n: number) => `${n} ${n === 1 ? 'location' : 'locations'}`;
const times = (n: number) => (n === 1 ? 'once' : `${n} times`);
const urls = (s: CdnSettings) =>
  s.variants > 1 ? ` A tracking parameter gives each image ${s.variants} URLs, each cached on its own.` : '';
/** The timeline's window, five TTLs, in words. */
export const windowWords = (s: CdnSettings) =>
  ({ 25: '25 seconds', 300: '5 minutes', 1500: '25 minutes', 18000: '5 hours' })[CDN_WINDOW_TTLS * s.ttl] ??
  `${CDN_WINDOW_TTLS * s.ttl} seconds`;

export const titleOf = (s: CdnSettings) => `A CDN of ${locs(s.pops)} serving ${cdnGroup(s.rps)} requests a second`;
export const subOf = (s: CdnSettings) =>
  `The site serves ${cdnGroup(CDN_OBJECTS)} images, popularity on a Zipf curve. Each location keeps a copy for ${ttlWords(s.ttl)} after a miss.${urls(s)}`;

export interface TierRow {
  fig: string | null;
  head: string | null;
  body: string;
}
export interface TierWords {
  users: TierRow;
  edge: TierRow;
  shield: TierRow;
  origin: TierRow;
  mean: string;
}

/** The tiers' words; `narrow` (a stage under 420 px) gives each body its short form. A ghost is said in words only. */
export function tierWords(sc: CdnScenario, hid: Hid, ghost: CdnScenario | null, narrow = false): TierWords {
  const s = sc.settings;
  const q = (v: string) => (hid.tierNumbers ? '?%' : v);
  const was = ghost && !hid.ghost && !hid.tierNumbers ? ghost : null;
  const originWas = was && formatReqRate(was.originRps) !== formatReqRate(sc.originRps) ? ` It was ${formatReqRate(was.originRps)}.` : '';
  const meanWas = was && !hid.mean && formatMeanMs(was.meanMs) !== formatMeanMs(sc.meanMs) ? ` It was ${formatMeanMs(was.meanMs)}.` : '';
  const hop = s.shield ? 'the edge, the shield, then a round trip to the origin' : 'the edge, then a round trip to the origin';
  const one = s.pops === 1;
  const shield: TierRow =
    s.shield && one
      ? {
          fig: null,
          head: null,
          body: narrow
            ? `With 1 location the shield never hits; it adds ${formatPathMs(CDN_SHIELD_MS)} to a miss.`
            : `With 1 location the shield never hits: its copy expires with the edge’s. It adds ${formatPathMs(CDN_SHIELD_MS)} to every miss.`,
        }
      : s.shield
        ? {
            fig: hid.tierNumbers ? '?/s' : formatReqRate(sc.shieldRps),
            head: 'answered by the shield',
            body: narrow
              ? `In ${formatPathMs(sc.paths.shield)}, ${q(formatShare(sc.shieldShare))} of requests.`
              : `In ${formatPathMs(sc.paths.shield)}, for ${q(formatShare(sc.shieldShare))} of requests. It sees every location’s misses.`,
          }
        : {
            fig: null,
            head: null,
            body: narrow ? 'No shield: misses go on to the origin.' : 'No shield: every miss goes on to the origin.',
          };
  const parts: [number, number][] = [
    [sc.edgeShare, sc.paths.edge],
    ...(s.shield ? [[sc.shieldShare, sc.paths.shield] as [number, number]] : []),
    [sc.originShare, sc.paths.origin],
  ];
  return {
    users: {
      fig: formatReqRate(s.rps),
      head: 'requests',
      body: narrow ? 'Each to its nearest location.' : 'From users, each sent to its nearest location (anycast or DNS).',
    },
    edge: {
      fig: hid.tierNumbers ? '?/s' : formatReqRate(sc.edgeRps),
      head: 'answered at the edge',
      body: narrow
        ? `In ${formatPathMs(sc.paths.edge)}, ${q(formatShare(sc.edgeShare))} of requests, ${one ? 'at one location' : `at ${formatReqRate(sc.perPopRps)} a location`}.`
        : `In ${formatPathMs(sc.paths.edge)}, for ${q(formatShare(sc.edgeShare))} of requests. ${one ? 'The one location takes' : `Each of ${locs(s.pops)}, one cell each, takes`} ${formatReqRate(sc.perPopRps)} and keeps its own copies.`,
    },
    shield,
    origin: {
      fig: hid.tierNumbers ? '?/s' : formatReqRate(sc.originRps),
      head: 'reach the origin',
      body:
        (narrow
          ? `In ${formatPathMs(sc.paths.origin)}, ${q(formatShare(sc.originShare))} of ${formatReqRate(s.rps)}.`
          : `In ${formatPathMs(sc.paths.origin)} (${hop}), for ${q(formatShare(sc.originShare))} of ${formatReqRate(s.rps)}.`) + originWas,
    },
    mean: hid.mean
      ? `Mean response: shows ${later(hid)}.`
      : `Mean response ${formatMeanMs(sc.meanMs)} = ${parts.map(([sh, p]) => `${formatShare(sh)} × ${formatPathMs(p)}`).join(' + ')}.${meanWas}`,
  };
}

export const restStep = (s: CdnSettings) => `Play runs these ${windowWords(s)} at the outlined location in 6 seconds.`;
export const REDUCED_STEP = 'Played below the picture: motion is reduced.';

export interface LaneWords {
  who: string;
  asked: string;
  hits: string;
}
export function laneWords(sc: CdnScenario, i: number, hid: Hid): LaneWords {
  const l = sc.lanes[i];
  const s = sc.settings;
  const shield = s.shield ? ` · shield hit ${hid.laneHits ? '?%' : formatShare(l.shieldHit)} of misses` : '';
  return {
    who: `#${cdnGroup(l.rank)}${s.variants > 1 ? ', one of its URLs,' : ''}`,
    asked: `asked for ${formatOften(l.perPop)} here`,
    hits: `edge hit ${hid.laneHits ? '?%' : formatShare(l.edge)}${shield}`,
  };
}

/** A lane the sample never asked for in its window says so on its track, longest form first. */
export const emptyLaneForms = (window: string) => [
  `not asked for here in these ${window}`,
  'not asked for in this window',
  'not asked for',
];

export type Who = 'edge' | 'shield' | 'origin';
export function legendItems(sc: CdnScenario, hid: Hid): { who: Who; text: string }[] {
  const q = (v: number) => (hid.curveNumbers ? '?%' : formatShare(v));
  return [
    { who: 'edge' as const, text: `${q(sc.edgeShare)} at the edge` },
    ...(sc.settings.shield ? [{ who: 'shield' as const, text: `${q(sc.shieldShare)} by the shield` }] : []),
    { who: 'origin' as const, text: `${q(sc.originShare)} at the origin` },
  ];
}

/** The half-hit ranks in words; a rank past the last object is said of every object, one before the first of none. */
export function kneeWords(sc: CdnScenario, hid: Hid): { edge: string; shield: string } {
  const e = sc.edgeKnee;
  const edge = hid.curveNumbers
    ? 'Half of its requests hit at the edge: ?'
    : e < 1
      ? 'No object hits at the edge half the time'
      : e > CDN_OBJECTS
        ? 'Every object hits at the edge at least half the time'
        : `Half of its requests hit at the edge: the ${formatRank(e)}`;
  const k = sc.shieldKnee;
  const shield = !sc.settings.shield
    ? ''
    : k <= 0
      ? 'With 1 location the shield never hits: its copy expires with the edge’s.'
      : hid.curveNumbers
        ? 'Half of its edge misses hit the shield: ?'
        : k > CDN_OBJECTS
          ? 'Every object’s edge misses hit the shield at least half the time'
          : `Half of its edge misses hit the shield: the ${formatRank(k)}`;
  return { edge, shield };
}

/** The stage's summary: obeys `hiding()`, and says which numbers are the model's and which marks are a sample. */
export function summary(sc: CdnScenario, hid: Hid): string {
  const s = sc.settings;
  const parts = [
    `A CDN with ${locs(s.pops)} serves ${cdnGroup(s.rps)} requests a second for ${cdnGroup(CDN_OBJECTS)} images with Zipf popularity; each location keeps a copy for ${ttlWords(s.ttl)} after a miss${s.shield ? ', and an origin shield sits between the locations and the origin' : ''}.${urls(s)}`,
  ];
  if (hid.tierNumbers) parts.push(`Where the requests are answered shows ${later(hid)}.`);
  else
    parts.push(
      `By the model, ${formatShare(sc.edgeShare)} are answered at the edge in ${formatPathMs(sc.paths.edge)}${s.shield ? `, ${formatShare(sc.shieldShare)} by the shield in ${formatPathMs(sc.paths.shield)}` : ''}, and ${formatReqRate(sc.originRps)} reach the origin, in ${formatPathMs(sc.paths.origin)}: a mean response of ${formatMeanMs(sc.meanMs)}.`,
    );
  const e = sc.edgeKnee;
  if (hid.curveNumbers) parts.push(`Which objects hit shows ${later(hid)}.`);
  else
    parts.push(
      e < 1
        ? 'No object hits at the edge half the time.'
        : e > CDN_OBJECTS
          ? 'Every object hits at the edge at least half the time.'
          : `Popular objects hit and the long tail misses: objects more popular than the ${formatRank(e)} hit at the edge more than half the time, and the rest less.`,
    );
  parts.push('The timeline is one random sample of the outlined location’s requests.');
  return parts.join(' ');
}

/** One sentence for a setting: the notice after a change, after a reveal and when the challenge opens. */
export function settingSentence(sc: CdnScenario): string {
  const s = sc.settings;
  return `With ${locs(s.pops)}, a ${ttlAdj(s.ttl)} TTL${s.shield ? ' and the shield' : ' and no shield'}${s.variants > 1 ? `, ${s.variants} URLs an image` : ''}, ${formatShare(sc.edgeShare)} of ${cdnGroup(s.rps)} requests a second hit at the edge, ${formatReqRate(sc.originRps)} reach the origin, and the mean response is ${formatMeanMs(sc.meanMs)}.`;
}
export const WAIT_NOTICE = 'Play and every setting wait for your answer.';
export const ANSWER_NOTICE = 'Your answer is in: the timeline plays the new setting, and its numbers show at the reveal.';
/** The notice while a free play runs; its end says what the play showed (`story`). */
export const playingNotice = (s: CdnSettings) => `Playing ${windowWords(s)} at the outlined location.`;

export const MODEL_NOTE = `An analytic model: requests are independent Poisson arrivals, spread evenly over the locations; an object never changes during its TTL; caches have no size limit; a miss is fetched at once (request collapsing keeps it to one fetch). A copy asked for at rate r hits with probability rT ÷ (1 + rT). A copy fetched from the shield lives a full TTL at the edge (the Age header is ignored), so with a shield an image can be up to two TTLs old. Users reach the nearest of n locations in ${formatPathMs(CDN_EDGE_MS_AT_20)} × √(20 ÷ n); the shield adds ${formatPathMs(CDN_SHIELD_MS)} and the origin ${formatPathMs(CDN_ORIGIN_MS)}. Times are one request on a warm connection; a new connection also pays its TCP and TLS round trips, which end at the nearest location, so a CDN saves several long round trips, not one. The timeline is one random sample; the hit shares beside it are the model's.`;
/** The note states the hit rule, which would answer the first question: it waits while any question is open. */
export const noteText = (hid: Hid) =>
  hid.locked ? `An analytic model with a random sample beside it. Its assumptions show ${later(hid)}.` : MODEL_NOTE;

/** How to read the timeline and the square, under the stage; obeys `hiding()`. */
export function guideText(s: CdnSettings, hid: Hid): string {
  const lanes = hid.laneMarks
    ? 'The timeline is one random sample of the outlined location: each tick is a request, and what hit shows after your answer.'
    : `The timeline is one random sample of the outlined location. A bar is a copy, alive for the TTL after the miss that fetched it. A short tick is a hit; a tall tick is a miss${s.shield ? ', ending in a square on the shield track if the shield answered and running below it to a dot if the origin did' : ', running below the track to a dot: the origin answered'}.`;
  return `${lanes} In the square, objects are ordered by popularity rank, each as wide as its share of requests, and a column’s height is where its requests are answered.`;
}

/** The timeline's one-line key, longest form first. */
export function keyForms(s: CdnSettings, hid: Hid): string[] {
  if (hid.laneMarks)
    return [
      'One random sample: each tick is a request; what hit shows after your answer.',
      'Each tick is a request; what hit shows after your answer.',
    ];
  return s.shield
    ? [
        'One sample. Bar: a copy · short tick: a hit · tall tick: a miss, ending at the shield track if the shield answered, below it if the origin did · gray tick under the shield track: another location’s miss.',
        'Bar: copy · short tick: hit · tall tick: miss, to the shield or below it · gray tick: another location’s miss',
        'Bar: copy · short tick: hit · tall tick: miss, to the shield or below it · gray: others’ misses',
      ]
    : [
        'One sample. Bar: a copy · short tick: a hit · tall tick: a miss, its dot below the track: the origin answered.',
        'Bar: copy · short tick: hit · tall tick: miss',
      ];
}

/** How far after a miss the step still tells it, as a share of the window. */
export const STEP_HOLD = 0.08;

/** What the play shows at time `t` of the window, in words: the step line and the notice while a play runs. */
export function stepWords(sc: CdnScenario, events: readonly CdnEvent[], t: number, window: number): string {
  let last: CdnEvent | null = null;
  for (const e of events) {
    if (e.at > t) break;
    if (!e.hit) last = e;
  }
  const clock = `At ${formatTimelineClock(t)} of ${windowWords(sc.settings)}`;
  if (!last || t - last.at > window * STEP_HOLD)
    return `${clock}: requests arrive at the outlined location; a short tick found its copy there.`;
  if (last.lane === 0 && last.dense)
    return `${clock}: #1’s copy expired; the next request misses, and the requests that arrive during its fetch wait for it (request collapsing), so one fetch goes on, not a herd.`;
  const where =
    last.where === 'shield'
      ? `the shield had a copy, ${formatPathMs(sc.paths.shield)}`
      : `fetched from the origin, ${formatPathMs(sc.paths.origin)}`;
  return `${clock}: #${cdnGroup(sc.lanes[last.lane].rank)} has no live copy here, a miss: ${where}; a new copy lives ${ttlWords(sc.settings.ttl)}.`;
}

/** The longest step a setting can print, for the lines the step reserves: the widest clock and every kind of miss. */
export function stepForms(sc: CdnScenario): string[] {
  const s = sc.settings;
  const wide = { 5: 28, 60: 288, 300: 1728, 3600: 17280 }[s.ttl] ?? 5 * s.ttl;
  const ev = (lane: number, where: Who, dense = false): CdnEvent => ({ lane, at: wide, hit: false, where, dense });
  const forms = [
    stepWords(sc, [], wide, Infinity),
    stepWords(sc, [ev(0, 'origin', true)], wide, Infinity),
    ...[0, 1, 2].flatMap((i) => (['shield', 'origin'] as const).map((w) => stepWords(sc, [ev(i, w)], wide, Infinity))),
  ];
  return [...forms, restStep(s), REDUCED_STEP];
}

/** What a play showed, in words: the Reduced-motion story, written under the stage and read out. */
export function story(sc: CdnScenario, sample: CdnSample, events: readonly CdnEvent[], hid: Hid): string {
  const misses = events.filter((e) => !e.hit);
  const lanes = sc.lanes.map((l, i) => {
    const n = misses.filter((e) => e.lane === i).length;
    const total = events.filter((e) => e.lane === i).length;
    const name = `#${cdnGroup(l.rank)}`;
    if (sample.lanes[i].dense) return `${name} missed ${times(n)}, once each time its copy expired, and every other request hit`;
    if (!total) return `${name} was not asked for at all`;
    return `${name} was asked for ${times(total)} and missed ${n === 0 ? 'never' : times(n)}`;
  });
  const shield = sc.settings.shield
    ? ` Of the outlined location’s ${misses.length} ${misses.length === 1 ? 'miss' : 'misses'}, ${misses.filter((e) => e.where === 'shield').length} found a copy at the shield.`
    : '';
  return `In this sample of ${windowWords(sc.settings)} at the outlined location, ${lanes.join('; ')}. A miss starts a copy that lives for the TTL.${shield}${hid.laneHits ? ` The model’s hit shares show ${later(hid)}.` : ' The hit shares beside each object are the model’s.'}`;
}

/** The challenge's status: each bound in the ask's own terms, with its state in words. */
export function goalParts(sc: CdnScenario): { text: string; met: boolean }[] {
  const b = CDN_CHALLENGE_BOUNDS;
  const keep = CDN_CHALLENGE_GOAL.keep as Partial<CdnSettings>;
  const kept = (Object.keys(keep) as (keyof CdnSettings)[]).every((k) => sc.settings[k] === keep[k]);
  const said = (met: boolean) => (met ? 'met' : 'not yet');
  const o = sc.originRps < b.originRps;
  const m = sc.meanMs < b.meanMs;
  const t = sc.settings.ttl <= b.ttl;
  return [
    { met: o, text: `the origin takes ${formatReqRate(sc.originRps)}, under ${formatReqRate(b.originRps)}: ${said(o)}` },
    { met: m, text: `the mean response is ${formatMeanMs(sc.meanMs)}, under ${formatPathMs(b.meanMs)}: ${said(m)}` },
    { met: t, text: `each cache keeps a copy for ${ttlWords(sc.settings.ttl)}, at most ${ttlWords(b.ttl)}: ${said(t)}` },
    ...(kept ? [] : [{ met: false, text: `traffic stays ${formatReqRate(keep.rps!)} and the cache key the path only: ${said(false)}` }]),
  ];
}

/**
 * Describe: a row for each count of locations at this traffic, TTL and key, the current one marked. The shield's
 * columns would answer "An origin shield" (and the challenge): until `shieldShown` they hold "?".
 */
export function describeTable(sc: CdnScenario, compact: boolean, shieldShown = true) {
  const s = sc.settings;
  const sh = (v: string) => (shieldShown ? v : '?');
  const head = compact
    ? ['PoPs', 'Edge hit', 'Origin /s', 'With shield /s', 'Mean ms']
    : ['Locations', 'Nearest', 'Edge hit', 'Origin', 'Origin, shield', 'Mean', 'Mean, shield'];
  const rows = CDN_POPS.map((pops) => {
    const a = cdnScenario({ ...s, pops, shield: 0 });
    const b = cdnScenario({ ...s, pops, shield: 1 });
    return compact
      ? [
          String(pops),
          formatShare(a.edgeShare),
          formatReqRate(a.originRps).replace('/s', ''),
          sh(formatReqRate(b.originRps).replace('/s', '')),
          s.shield ? sh(b.meanMs.toPrecision(3)) : a.meanMs.toPrecision(3),
        ]
      : [
          locs(pops),
          formatPathMs(a.paths.edge),
          formatShare(a.edgeShare),
          formatReqRate(a.originRps),
          sh(formatReqRate(b.originRps)),
          formatMeanMs(a.meanMs),
          sh(formatMeanMs(b.meanMs)),
        ];
  });
  const note = `Rows are this traffic and TTL${s.variants > 1 ? `, ${s.variants} URLs an image` : ''}; the edge hit rate does not depend on the shield.${shieldShown ? ' With the shield, the origin takes the same load at every count of locations.' : ' The shield columns show once the shield is on or “An origin shield” is answered.'}${compact ? ` The mean is ${s.shield ? 'with' : 'without'} the shield.` : ''} The tail, the ${cdnGroup(CDN_OBJECTS - CDN_HEAD_RANKS)} least popular images, takes ${formatShare(1 - cdnCumShare(CDN_HEAD_RANKS))} of requests.`;
  return { compact, head, rows, active: (CDN_POPS as readonly number[]).indexOf(s.pops), note };
}
