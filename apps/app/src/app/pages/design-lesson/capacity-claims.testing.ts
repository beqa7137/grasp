import {
  CAPACITY_SIZES,
  CAPACITY_TRAFFIC,
  capacityRamp,
  capacityRun,
  capacityZoneLoss,
  type CapacityRun,
  type CapacitySettings,
} from '@grasp/engine';
import {
  HINTS,
  NOTHING_HIDDEN,
  SHED,
  TIERS,
  busiestOf,
  cacheParts,
  changeNotice,
  convParts,
  describeTable,
  fleetText,
  goalParts,
  rampStory,
  sinkParts,
  statusParts,
  summary,
  tierLine,
  workerParts,
  zoneLine,
  type Words,
} from './capacity-words';

/** A hidden value is never a wrong default, nothing past its limit is busy, and every count reads as one. */
export const FALSE_CLAIMS: readonly RegExp[] = [
  /NaN/,
  /undefined/,
  /Infinity/,
  /(^|[^\d.,])0% busy/,
  /\bat 0%/,
  /(^|[^\d.,])(100\.\d*[1-9]|10[1-9]|1[1-9]\d|[2-9]\d\d)(\.\d+)?% busy/,
  /(?<![\d.,])\d{4,}(?![\d.])/,
  /\b1 (load balancers|app servers|replicas|workers are)\b/,
  /\ba 8,000\b/,
  /(^|[^\d.,])0 are served/,
  /\bleaves 0%/,
  /\ba third lost\b|\bhalf lost\b/,
  /\bfrom ([\d,]+) to \1\b/,
  /\bNo tier filled\b/,
];

const flat = (w: Words) => w.map((p) => p[0]).join('');

/** Every sentence and line the widget prints for one setting, outside a question: what the word rules read. */
export interface Said {
  r: CapacityRun;
  summary: string;
  story: string;
  notice: string;
  lines: string[];
  statuses: Record<string, string>;
  /** Each block's status and conversion with every limit its row could not hold said in words: one press before, and zone A's loss. */
  tails: string[];
  pool: string;
  goals: string[];
  zone: string | null;
  describe: string[][];
  compact: string[][];
  hints: string[];
}

export function sayAll(s: CapacitySettings, before?: CapacitySettings): Said {
  const r = capacityRun(s);
  const z = capacityZoneLoss(r);
  const statuses: Record<string, string> = {};
  for (const id of TIERS) statuses[id] = flat(statusParts(r, id, NOTHING_HIDDEN));
  const tails = TIERS.flatMap((id) => {
    const k = id === 'primary' ? 'size' : id;
    const press =
      k === 'size'
        ? s.size === CAPACITY_SIZES[0]
          ? CAPACITY_SIZES[1]
          : CAPACITY_SIZES[0]
        : s[k] > (k === 'replicas' ? 0 : 1)
          ? s[k] - 1
          : s[k] + 1;
    const was = capacityRun({ ...s, [k]: press })[id].ceiling;
    const left = id === 'primary' ? (z.primary.outage ? null : z.primary.ceiling) : z[id].up > 0 ? z[id].ceiling : null;
    const lane = {
      limitInStatus: true,
      wasInStatus: Math.abs(was - r[id].ceiling) >= 0.5 ? was : null,
      zoneInStatus: !s.zone && left !== null && left < r[id].ceiling - 0.5 ? left : null,
    };
    return [
      statusParts(r, id, NOTHING_HIDDEN, lane),
      ...(id === 'primary' || id === 'replicas' ? [convParts(r, id, NOTHING_HIDDEN, lane)] : []),
    ].map(flat);
  });
  return {
    r,
    summary: summary(r),
    story: rampStory(r.settings),
    notice: before ? changeNotice(before, r) : summary(r),
    lines: [
      ...TIERS.flatMap((id) => [tierLine(r, id, NOTHING_HIDDEN), fleetText(r, id, NOTHING_HIDDEN)]),
      flat(convParts(r, 'primary', NOTHING_HIDDEN)),
      flat(convParts(r, 'replicas', NOTHING_HIDDEN)),
      flat(cacheParts(r)),
      flat(sinkParts(r, NOTHING_HIDDEN)),
    ],
    statuses,
    tails,
    pool: flat(workerParts(r, NOTHING_HIDDEN)),
    goals: goalParts(r, z).map((g) => g.text),
    zone: z.shed >= 1 && !z.primary.outage ? zoneLine(z) : null,
    describe: describeTable(r, false).rows,
    compact: describeTable(r, true).rows,
    hints: Object.values(HINTS).flat(),
  };
}

const sentences = (t: string) => t.split(/(?<=[.;]) /);
const STORY_NOUN = { lb: 'load balancer', app: 'app server', primary: 'primary', replicas: 'replica' } as const;

/** What the word rules (prevention 2 and 9) find wrong in one setting's words; empty when none. */
export function wordFaults(w: Said): string[] {
  const { r } = w;
  const out: string[] = [];
  const all = [
    w.summary,
    w.story,
    w.notice,
    ...w.lines,
    ...Object.values(w.statuses),
    ...w.tails,
    w.pool,
    ...w.goals,
    ...w.hints,
    ...w.describe.flat(),
    ...w.compact.flat(),
  ];
  for (const t of all) for (const g of FALSE_CLAIMS) if (g.test(t)) out.push(`false claim ${g}: "${t}"`);
  for (const t of [w.summary, w.story, w.notice])
    for (const s of sentences(t)) if (/^\d/.test(s)) out.push(`a sentence opens on a numeral: "${s}"`);
  // A limit a lane's row could not hold is a clause of its own that names it, and no limit is said twice in a line (a
  // spare or shed amount may match one).
  for (const t of w.tails) {
    if (/, (?:was )?[\d,.]+\/s/.test(t)) out.push(`a limit without its own clause: "${t}"`);
    const figures = [...t.matchAll(/(?<![\d,.])(\d[\d,.]*)(?:\/s| requests\/s)(?! shed| spare)/g)].map((m) => m[1]);
    const twice = figures.find((f, i) => figures.indexOf(f) !== i);
    if (twice) out.push(`${twice}/s said twice: "${t}"`);
  }
  // "each" only with two or more replicas up; the one left "is".
  if (r.replicas.up === 1) {
    if (/read replicas? (is|are) at [\d.]+% each/.test(w.summary) || / each/.test(w.statuses['replicas']))
      out.push('"each" said of one replica');
    if (/the read replicas are/.test(w.summary)) out.push('one replica named in the plural');
  }
  // Every tied tier is named.
  if (r.shed <= SHED) {
    const named = w.summary.split(' the busiest')[0];
    for (const t of busiestOf(r))
      if (
        !named
          .toLowerCase()
          .includes(t.id === 'lb' ? 'load balancer' : t.id === 'app' ? 'app server' : t.id === 'primary' ? 'primary' : 'replica')
      )
        out.push(`a tie leaves out ${t.id}: "${w.summary}"`);
  }
  // A ramp story says "reached 100%" only where a tier is full, and "came closest" only where none is.
  if (/reached 100%/.test(w.story) !== (r.shed <= SHED && r.maxUtil >= 1 - 1e-9) && /No tier shed/.test(w.story))
    out.push(`the ramp story misreads how full the busiest tier is: "${w.story}"`);
  if (/No tier shed/.test(w.story) && r.shed > SHED) out.push(`"No tier shed" while a tier sheds: "${w.story}"`);
  // At the ramp's climax the story names every tier that sheds, says "first" only when one does, and never says a tier
  // zone A took "began to shed".
  const ramp = capacityRamp(r.settings, CAPACITY_TRAFFIC[0], r.settings.traffic);
  if (ramp.climax >= 0 && ramp.stops.length > 1) {
    const at = ramp.runs[ramp.climax];
    const sheds = TIERS.filter((id) => at[id].shed > SHED);
    const lost = !at.lb.up || !at.app.up || at.primary.outage;
    if (/began to shed first/.test(w.story) && sheds.length !== 1)
      out.push(`"began to shed first" with ${sheds.length} tiers shedding at that stop: "${w.story}"`);
    if (lost && /began to shed/.test(w.story)) out.push(`a tier zone A took "began to shed": "${w.story}"`);
    if (!lost)
      for (const id of sheds)
        if (!w.story.includes(STORY_NOUN[id])) out.push(`the ramp story leaves out ${id}, which sheds at the climax: "${w.story}"`);
  }
  // Describe's Busy is "full" exactly where a tier sheds.
  w.describe.slice(0, 4).forEach((row, i) => {
    const t = r[TIERS[i]];
    if (row[4] === '–' || row[4] === 'lost') return;
    if ((row[4] === 'full') !== t.shed > SHED) out.push(`Describe's Busy for ${TIERS[i]} reads "${row[4]}"`);
  });
  // The zone line names each tier that sheds, its amounts summing to the zone loss's shed.
  if (w.zone) {
    const z = capacityZoneLoss(r);
    const at = [...w.zone.matchAll(/([\d,]+)\/s(?: shed)? at the (load balancers|app servers|database primary|read replicas?)/g)];
    const tierShed = (name: string) =>
      name === 'load balancers' ? z.lb.shed : name === 'app servers' ? z.app.shed : z.primary.shed + z.replicas.shed;
    for (const m of at) {
      const v = Number(m[1].replace(/,/g, ''));
      if (Math.abs(v - tierShed(m[2])) > 1)
        out.push(`the zone line sheds ${v} at the ${m[2]}, the zone loss ${Math.round(tierShed(m[2]))}: "${w.zone}"`);
    }
    const sum = (at.length ? at.map((m) => m[1]) : [...w.zone.matchAll(/([\d,]+)\/s/g)].map((m) => m[1])).reduce(
      (a, v) => a + Number(v.replace(/,/g, '')),
      0,
    );
    if (Math.abs(sum - z.shed) > 2) out.push(`the zone line sheds ${sum} in all, the zone loss ${Math.round(z.shed)}: "${w.zone}"`);
  }
  // Little's law multiplies out as printed: in flight = rate × time.
  const ll = w.pool.match(/^([\d.]+) of 100 busy: ([\d,]+)\/s × (\d+) ms/);
  if (ll) {
    const [busy, rate, ms] = [Number(ll[1]), Number(ll[2].replace(/,/g, '')), Number(ll[3])];
    if (Math.abs(busy - (rate * ms) / 1000) > 0.05 + (0.5 * ms) / 1000) out.push(`Little's law does not multiply out: "${w.pool}"`);
  }
  return out;
}
