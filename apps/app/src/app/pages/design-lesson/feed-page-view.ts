import { FEED_PLACES, feedAt, formatDuration, formatMs, type FeedModel, type FeedSettings } from '@grasp/engine';
import {
  AXIS_MS,
  PAD,
  TABLE_ROWS,
  headerBoxes,
  textBox,
  textWidth,
  timeX,
  wrap,
  type Anchor,
  type ReadLayout,
  type TablesLayout,
} from './feed-layout';
import { focusBoxes, pad, union, type Box } from './focus-layout';

/** A run of SQL: `k` bold (the count), `m` muted (the clause), plain otherwise. */
export interface SqlPart {
  text: string;
  kind?: 'k' | 'm';
}
export interface Placed {
  x: number;
  y: number;
  anchor: Anchor;
}
export interface SqlLine extends Placed {
  parts: SqlPart[];
}
export interface Label extends Placed {
  lines: string[];
}

/** What the page shows beyond the settings: the previous read as a ghost, a replay's progress, and what an experiment hides. */
export interface PageState {
  settings: FeedSettings;
  /** The previous read, kept beside a faster one until the next non-read change. */
  ghost: FeedModel | null;
  /** Trips a running replay has completed; null at rest. */
  replayed: number | null;
  /** How far a rename's copy rewrite is, 0 to 1; null with no rename. */
  rename: number | null;
  /** Under Reduced motion a write shows the old value struck through beside the new one. */
  reduced: boolean;
}

const fms = (v: number) => formatMs(v).replace(' ms', '');
const GROUPED = new Intl.NumberFormat('en-US');
export const count = (n: number) => GROUPED.format(Math.round(n));
/** How long the old name stays: a duration, or never once the copy rewrite falls behind. */
export const staleText = (ms: number) => (Number.isFinite(ms) ? formatDuration(ms) : 'never clears');
/** A rate that may be under one: 0.05, 2.5, 1,000. */
export const rate = (v: number) => (v < 10 ? String(Number(v.toPrecision(2))) : count(v));
/** Renames a second, said with their unit. */
export const renamesPerS = (v: number) => `${rate(v)} ${v === 1 ? 'rename' : 'renames'} a second`;
/** A rate in the fewest characters: 21k, 2.1M. */
export const compact = (n: number) =>
  n >= 1e9 - 0.5
    ? `${Number((n / 1e9).toFixed(1))}B`
    : n >= 1e6
      ? `${Number((n / 1e6).toFixed(1))}M`
      : n >= 1e3
        ? `${Number((n / 1e3).toFixed(1))}k`
        : count(n);
const READ_NAMES: Record<FeedModel, string> = {
  'n-plus-one': 'N+1',
  batched: 'Batched IN',
  join: 'The join',
  denormalized: 'Denormalized',
};
export const readName = (m: FeedModel) => READ_NAMES[m];
/** A read's name inside a sentence. */
export const readWord = (m: FeedModel) =>
  m === 'join' ? 'the join' : m === 'batched' ? 'batched IN' : m === 'denormalized' ? 'one read' : READ_NAMES[m];

const sqlWidth = (parts: readonly SqlPart[]) => textWidth(parts.map((p) => p.text).join(''), 'mono');
const veePoints = (a: number, m: number, b: number, top: number, bottom: number) => `M${a} ${top}L${m} ${bottom}L${b} ${top}`;
const dot = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** One trip's V, inside 70% of its slot so neighbors stay apart. */
function vee(L: ReadLayout, rtt: number, i: number) {
  const slot = timeX(L, rtt) - timeX(L, 0);
  const a = timeX(L, i * rtt) + slot * 0.15;
  const b = timeX(L, (i + 1) * rtt) - slot * 0.15;
  return { a, m: timeX(L, (i + 0.5) * rtt), b };
}

export interface ReadView {
  wait: { value: string; unit: string };
  first: string;
  done: string;
  pending: string;
  hits: string;
  /** The previous read: its comb when it was slower, and its wait said beside this one when it was faster (`behind`). */
  ghost: { path: string; x: number | null; label: Label | null; behind: boolean } | null;
  /** Past the axis: how many trips run off it, and the real wait. */
  overflowLabel: (Placed & { text: string }) | null;
  marker: { x: number; label: Label | null } | null;
  overflow: boolean;
  sql: SqlLine[];
  braces: string[];
  leaders: { x: number; y1: number; y2: number }[];
  magnifier: {
    x: number;
    y: number;
    width: number;
    height: number;
    vees: string[];
    first: string;
    hits: string;
    link: string;
    label: string;
  } | null;
  ruler: { ticks: number[]; left: Placed & { text: string }; right: Placed & { text: string } } | null;
  /** The trips the replay is on, as `[a, m, b]` V points, for the dot that travels each. */
  tripPath: (i: number) => readonly (readonly [number, number])[];
  texts: Box[];
}

/** The read lanes for the settings: every query's trip, the SQL on braces over them, and what labels and magnifies them. */
export function readView(L: ReadLayout, s: PageState): ReadView {
  const p = s.settings.pageSize;
  const model = s.settings.schema === 1 ? 'denormalized' : (['n-plus-one', 'batched', 'join'] as const)[s.settings.read];
  const cost = feedAt(s.settings);
  const rtt = FEED_PLACES[s.settings.place].rttMs;
  const n = cost.queriesPerPage;
  const drawn = Math.min(n, Math.ceil(AXIS_MS / rtt - 1e-9));
  const slot = timeX(L, rtt) - timeX(L, 0);
  const texts: Box[] = headerBoxes('Read · one feed page', PAD + 42, fms(cost.waitMs), 'ms page wait', L.width - PAD, L.headlineY);
  for (const [name, y] of [
    ['App', L.appY],
    ['DB', L.dbY],
  ] as const)
    texts.push(textBox(name, 'cap', PAD + (L.wide ? 24 : 0), y + (L.wide ? 4 : 24)));
  const add = (b: Box) => (texts.push(b), b);
  const replaying = s.replayed !== null;

  let first = '';
  let done = '';
  let pending = '';
  let hits = '';
  for (let i = 0; i < drawn; i++) {
    const v = vee(L, rtt, i);
    const d = veePoints(v.a, v.m, v.b, L.appY, L.dbY);
    if (i === 0) first = d;
    else if (!replaying || i < s.replayed!) done += d;
    else pending += d;
    if (!replaying || i < s.replayed!) hits += dot(v.m, L.dbY, 2);
  }

  const occupied: number[] = [timeX(L, cost.waitMs)];
  const overflow = cost.waitMs > AXIS_MS;
  const limit = L.px1;

  // A label over the lanes takes the stage's color behind it where it may sit on trips.
  let overflowLabel: (Placed & { text: string }) | null = null;
  if (overflow) {
    const trips = `+${n - drawn} ${n - drawn === 1 ? 'trip' : 'trips'}`;
    const text = L.wide ? `${trips} off the axis → ${fms(cost.waitMs)} ms` : `${trips} → ${fms(cost.waitMs)} ms`;
    overflowLabel = { text, x: L.px1 - 12, y: L.appY + 20, anchor: 'end' };
    add(textBox(text, 'small', overflowLabel.x, overflowLabel.y, 'end'));
  }

  let ghost: ReadView['ghost'] = null;
  if (s.ghost) {
    const g = feedAt(s.settings, s.ghost);
    const slower = g.waitMs > cost.waitMs;
    let path = '';
    if (slower)
      for (let i = 0; i < Math.min(g.queriesPerPage, Math.ceil(AXIS_MS / rtt - 1e-9)); i++) {
        const v = vee(L, rtt, i);
        path += veePoints(v.a, v.m, v.b, L.appY, L.dbY);
      }
    const gx = g.waitMs > AXIS_MS ? null : timeX(L, g.waitMs);
    let label: Label | null;
    if (slower) {
      // The slower read's comb runs past this one: its label goes right of its marker, or left of it, clear of this comb.
      const lines = [`${readName(s.ghost)} was`, `${fms(g.waitMs)} ms`];
      const w = Math.max(...lines.map((t) => textWidth(t, 'small')));
      const at = gx ?? L.px1;
      const right = at + 6 + w <= limit && !overflowLabel;
      const x = right ? at + 6 : overflowLabel ? L.px1 - 12 : at - 6;
      const y = overflowLabel ? L.appY + 36 : L.appY + 20;
      label = { lines, x, y, anchor: right ? 'start' : 'end' };
      if (!right && !overflowLabel && x - w < timeX(L, cost.waitMs) + 6) label = null;
      occupied.push(at, right ? at + 6 + w : at);
    } else {
      // The faster read hides under this comb: its wait is said beside its own marker, haloed over the trips.
      const text = `${readName(s.ghost)} was ${fms(g.waitMs)} ms`;
      const w = textWidth(text, 'small');
      const at = gx === null ? null : gx + 6;
      const right = at !== null && at + w <= limit;
      label = {
        lines: [text],
        x: right ? at : L.px1 - 12,
        y: overflow ? L.appY + 36 : L.appY + 20,
        anchor: right ? 'start' : 'end',
      };
      occupied.push(right ? at + w : L.px1);
    }
    ghost = { path, x: gx, label, behind: !slower };
    if (label) label.lines.forEach((t, i) => add(textBox(t, i ? 'mono' : 'small', label!.x, label!.y + i * 16, label!.anchor)));
  }

  let marker: ReadView['marker'] = null;
  if (!overflow) {
    const x = timeX(L, cost.waitMs);
    const lines = L.wide ? ['page ready'] : ['page', 'ready'];
    const w = Math.max(...lines.map((t) => textWidth(t, 'small')));
    const fits = !ghost && x + 6 + w <= limit;
    marker = { x, label: fits ? { lines, x: x + 6, y: L.appY + 20, anchor: 'start' } : null };
    if (fits) {
      lines.forEach((t, i) => add(textBox(t, 'small', x + 6, L.appY + 20 + i * 16)));
      occupied.push(x + 6 + w);
    }
  }

  const { sql, braces, leaders } = sqlLines(L, model, p, rtt, n);
  for (const line of sql) add(textBox(line.parts.map((q) => q.text).join(''), 'mono', line.x, line.y, line.anchor));

  let ruler: ReadView['ruler'] = null;
  if (n > 2 || replaying) {
    const step = n <= 21 ? 5 : n <= 51 ? 10 : 25;
    const ticks = [1, ...Array.from({ length: Math.floor(n / step) }, (_, i) => (i + 1) * step)]
      .filter((k) => k <= n && (k - 0.5) * rtt <= AXIS_MS)
      .map((k) => timeX(L, (k - 0.5) * rtt));
    const left = replaying
      ? `trip ${Math.min(n, s.replayed! + 1)} of ${n}`
      : L.wide
        ? `trips 1 to ${n}, one after another`
        : `trips 1 to ${n}`;
    const leftAt = { text: left, x: L.px0, y: L.rulerY + 9, anchor: 'start' as const };
    ruler = { ticks: n > 2 ? ticks : [], left: leftAt, right: { text: '', x: L.px1, y: L.rulerY + 9, anchor: 'end' } };
    add(textBox(left, 'small', leftAt.x, leftAt.y));
  }
  const load = L.wide
    ? `${count(cost.queriesPerSecond)} queries/s at ${count(s.settings.pagesPerSecond)} pages/s`
    : `${compact(cost.queriesPerSecond)} queries/s`;
  const right = { text: load, x: L.px1, y: L.rulerY + 9, anchor: 'end' as const };
  if (ruler) ruler.right = right;
  else ruler = { ticks: [], left: { text: '', x: L.px0, y: L.rulerY + 9, anchor: 'start' }, right };
  add(textBox(load, 'small', right.x, right.y, 'end'));

  let magnifier: ReadView['magnifier'] = null;
  if (slot < 8) {
    const M = L.magnifier;
    const shown = Math.min(M.below ? 6 : 3, n);
    const zoom = Math.round(M.slot / slot);
    const label = L.wide ? `×${zoom}: 1 trip = ${fms(rtt)} ms there and back` : `×${zoom} · 1 trip = ${fms(rtt)} ms`;
    const width = M.below ? L.width - 2 * PAD : Math.max(shown * M.slot + 24, M.width, textWidth(label, 'small') + 16);
    const x = M.below ? PAD : L.px1 - width;
    if (M.below || x >= Math.max(...occupied) + 8) {
      const y = M.top;
      const h = M.height;
      const top = M.below ? y + 22 : y + 26;
      const vees: string[] = [];
      let hitDots = '';
      for (let i = 0; i < shown; i++) {
        const a = x + 12 + i * M.slot;
        vees.push(veePoints(a + 4, a + M.slot / 2, a + M.slot - 4, top, y + h - 8));
        hitDots += dot(a + M.slot / 2, y + h - 8, 2.5);
      }
      const edge = timeX(L, shown * rtt) + 2;
      magnifier = {
        x,
        y,
        width,
        height: h,
        vees: vees.slice(1),
        first: vees[0],
        hits: hitDots,
        link: M.below
          ? `M${timeX(L, 0)} ${L.dbY}L${x + 12} ${y}M${edge} ${L.dbY}L${x + 12 + shown * M.slot} ${y}`
          : `M${edge} ${L.appY}L${x} ${y + 26}M${edge} ${L.dbY}L${x} ${y + h - 4}`,
        label,
      };
      add(textBox(label, 'small', x + 8, y + 15));
    }
  }

  return {
    wait: { value: fms(cost.waitMs), unit: 'ms page wait' },
    first,
    done,
    pending,
    hits,
    ghost,
    marker,
    overflow,
    overflowLabel,
    sql,
    braces,
    leaders,
    magnifier,
    ruler,
    tripPath: (i) => {
      const v = vee(L, rtt, i);
      return [
        [v.a, L.appY],
        [v.m, L.dbY],
        [v.b, L.appY],
      ];
    },
    texts,
  };
}

/** The queries as SQL over their trips: on a brace over a run of trips, or on a leader to a trip too narrow for one. */
function sqlLines(L: ReadLayout, model: FeedModel, p: number, rtt: number, n: number) {
  const sql: SqlLine[] = [];
  const braces: string[] = [];
  const leaders: ReadView['leaders'] = [];
  const room = (x: number, parts: SqlPart[], min: number) => {
    const at = Math.min(x, L.width - PAD - sqlWidth(parts));
    return at >= min ? at : null;
  };
  const brace = (t0: number, t1: number, toY: number, x: number) => {
    const [x0, x1] = [timeX(L, t0), timeX(L, t1)];
    if (x1 - x0 >= 12) braces.push(`M${x0 + 1} ${L.braceY + 5}V${L.braceY}H${x1 - 1}V${L.braceY + 5}`);
    leaders.push({ x, y1: toY + 4, y2: x1 - x0 >= 12 ? L.braceY : L.appY - 2 });
  };
  const posts: SqlPart[] = [{ text: '1 ×', kind: 'k' }, { text: ' posts ' }, { text: 'LIMIT', kind: 'm' }, { text: ` ${p}` }];
  const x1c = timeX(L, rtt / 2);
  if (model === 'n-plus-one' || model === 'batched') {
    brace(0, rtt, L.rowA, x1c);
    sql.push({ parts: posts, x: room(x1c - 3, posts, PAD)!, y: L.rowA, anchor: 'start' });
    const variants: SqlPart[][] =
      model === 'n-plus-one'
        ? ['WHERE id = ?', 'WHERE id=?', ''].map((m) => [
            { text: `${p} ×`, kind: 'k' as const },
            { text: ' authors ' },
            { text: m, kind: 'm' as const },
          ])
        : [`WHERE id IN (a7, a3, a12, a5, … ${p} ids)`, `WHERE id IN (${p} ids)`, 'WHERE id IN (…)', 'id IN (…)'].map((m) => [
            { text: '1 ×', kind: 'k' as const },
            { text: ' authors ' },
            { text: m, kind: 'm' as const },
          ]);
    const want = timeX(L, rtt) + 2;
    const fits = variants.map((v) => ({ v, x: room(want, v, Math.min(want, x1c + 4)) }));
    const fit = fits.find((f) => f.x !== null) ?? { v: variants.at(-1)!, x: x1c + 4 };
    sql.push({ parts: fit.v, x: fit.x!, y: L.rowB, anchor: 'start' });
    const t1 = rtt * (model === 'n-plus-one' ? n : 2);
    const [b0, b1] = [timeX(L, rtt), timeX(L, t1)];
    if (b1 - b0 >= 12) braces.push(`M${b0 + 1} ${L.braceY + 5}V${L.braceY}H${b1 - 1}V${L.braceY + 5}`);
    else leaders.push({ x: timeX(L, 1.5 * rtt), y1: L.rowB + 4, y2: L.appY - 2 });
  } else {
    const one: SqlPart[] =
      model === 'join'
        ? [
            { text: '1 ×', kind: 'k' },
            { text: ' posts ' },
            { text: 'JOIN', kind: 'm' },
            { text: ' authors ' },
            { text: 'ON authors.id = posts.author_id', kind: 'm' },
          ]
        : [...posts, { text: ' ' }, { text: '-- name is in the row', kind: 'm' }];
    const x = room(x1c - 3, one, PAD);
    if (x !== null) sql.push({ parts: one, x, y: L.rowB, anchor: 'start' });
    else {
      const [top, bottom]: SqlPart[][] =
        model === 'join'
          ? [
              [{ text: '1 ×', kind: 'k' }, { text: ' posts p ' }, { text: 'JOIN', kind: 'm' }, { text: ' authors a' }],
              [{ text: 'ON a.id = p.author_id', kind: 'm' }],
            ]
          : [posts, [{ text: '-- name is in the row', kind: 'm' }]];
      sql.push({ parts: top, x: room(x1c - 3, top, PAD) ?? PAD, y: L.rowA, anchor: 'start' });
      sql.push({ parts: bottom, x: room(x1c - 3, bottom, PAD) ?? PAD, y: L.rowB, anchor: 'start' });
    }
    leaders.push({ x: x1c, y1: L.rowB + 4, y2: L.appY - 2 });
  }
  return { sql, braces, leaders };
}

/** One sample row of the page: a post and its author. */
export const SAMPLE = [
  { id: 'p901', author: 'a7', name: 'Ada', title: 'Sharding 101' },
  { id: 'p900', author: 'a3', name: 'Lin', title: 'Why B-trees win' },
  { id: 'p899', author: 'a12', name: 'Sam', title: 'Paxos, gently' },
  { id: 'p898', author: 'a5', name: 'Kofi', title: 'Bloom filters' },
] as const;
export const RENAMED = 'Ada K.';

export interface Column {
  name: string;
  x: number;
  width: number;
}

export interface TablesView {
  headline: { value: string; unit: string };
  postColumns: Column[];
  /** The copied name's column, denormalized. */
  copy: Column | null;
  authorsNameX: number;
  rows: { y: number; post: string[]; authorName: string }[];
  /** Lit rows: the wash at rest, or each row's light during a replay. */
  lit: { posts: number; authors: number; full: boolean };
  more: { posts: Label; authors: Label | null };
  off: { y: number; note: Label };
  notes: { posts: string; authors: string } | null;
  fk: string;
  note: Label;
  rename: { authors: 'final' | null; p901: 'stale' | 'fresh' | null; struck: boolean };
  texts: Box[];
}

const COLUMN_GAP = 8;

/** Where columns fit across `width` from `x`: each as wide as its widest value and its header, 8px apart. */
function fitColumns(x: number, width: number, cols: { name: string; values: readonly string[]; min?: number }[]): Column[] | null {
  let at = x + 10;
  const out: Column[] = [];
  for (const c of cols) {
    const w = Math.max(c.min ?? 0, textWidth(c.name, 'mono'), ...c.values.map((v) => textWidth(v, 'mono'))) + COLUMN_GAP;
    out.push({ name: c.name, x: at, width: w });
    at += w;
  }
  return at - COLUMN_GAP <= x + width - 8 ? out : null;
}

/**
 * The tables for the settings: a page's sample rows lit as read (every lit row the replay has reached), the off-page row
 * that shows them a selection, and denormalized, the copied name's column and the authors table off the read path.
 */
export function tablesView(T: TablesLayout, wide: boolean, s: PageState): TablesView {
  const denormalized = s.settings.schema === 1;
  const p = s.settings.pageSize;
  const cost = feedAt(s.settings);
  const texts: Box[] = headerBoxes(
    'Tables',
    PAD,
    count(cost.rowsReadPerPage),
    'rows read a page',
    T.posts.x + (T.side ? T.authors.x + T.authors.width - T.posts.x : T.posts.width),
    T.top + 28,
    T.top + 26,
  );
  const P = T.posts;
  const A = T.authors;
  const ids = SAMPLE.map((r) => r.id);
  const authors = [...SAMPLE.map((r) => r.author), 'a9'];
  const names = SAMPLE.map((r) => r.name);
  const tag = wide && T.side ? 110 : 40;
  const copyMin = denormalized ? Math.max(tag, textWidth(RENAMED, 'mono')) : 0;
  const options = [
    ['id', 'author_id', 'author_name · copy'],
    ['id', 'author_id', 'name·copy'],
    ['id', 'author', 'name·copy'],
  ];
  let postColumns: Column[] | null = null;
  for (const [id, author, copy] of options) {
    const base = [
      { name: id, values: ids },
      { name: author, values: authors },
      ...(denormalized ? [{ name: copy, values: names, min: copyMin }] : []),
    ];
    postColumns =
      fitColumns(P.x, P.width, [...base, { name: 'title', values: SAMPLE.map((r) => r.title) }]) ?? fitColumns(P.x, P.width, base);
    if (postColumns) break;
  }
  postColumns ??= [];
  const copy = denormalized ? (postColumns[2] ?? null) : null;
  const authorsNameX = A.x + (wide ? 50 : 40);
  const rowY = (i: number) => P.y + T.headH + i * T.rowH + 15;
  const renaming = s.rename !== null && denormalized;
  const p901Fresh = renaming && s.rename! >= 1;
  const rows = SAMPLE.map((r, i) => ({
    y: rowY(i),
    post: [
      r.id,
      r.author,
      ...(denormalized ? [i === 0 && p901Fresh ? RENAMED : r.name] : []),
      ...(postColumns!.length > (denormalized ? 3 : 2) ? [r.title] : []),
    ],
    authorName: i === 0 && renaming ? RENAMED : r.name,
  }));
  for (const row of rows) row.post.forEach((v, j) => texts.push(textBox(v, 'mono', postColumns![j].x, row.y)));
  postColumns.forEach((c) => texts.push(textBox(c.name, 'mono', c.x, P.y + 36)));

  const replay = s.replayed;
  const model = denormalized ? 'denormalized' : (['n-plus-one', 'batched', 'join'] as const)[s.settings.read];
  const reached = (trip: number) => replay === null || replay >= trip;
  const authorsLit =
    denormalized || replay === null
      ? denormalized
        ? 0
        : TABLE_ROWS + 1
      : model === 'n-plus-one'
        ? Math.max(0, Math.min(TABLE_ROWS + 1, replay - 1))
        : reached(model === 'batched' ? 2 : 1)
          ? TABLE_ROWS + 1
          : 0;
  const lit = { posts: reached(1) ? TABLE_ROWS + 1 : 0, authors: authorsLit, full: replay !== null };

  const moreY = P.y + T.headH + TABLE_ROWS * T.rowH + 15;
  const more = {
    posts: { lines: [`⋮ ${p - TABLE_ROWS} more on this page`], x: P.x + 10, y: moreY, anchor: 'start' as const },
    authors: denormalized
      ? null
      : { lines: [`⋮ ${p - TABLE_ROWS} more`], x: A.x + 10, y: A.y + T.headH + TABLE_ROWS * T.rowH + 15, anchor: 'start' as const },
  };
  texts.push(textBox(more.posts.lines[0], 'small', more.posts.x, more.posts.y));
  if (more.authors) texts.push(textBox(more.authors.lines[0], 'small', more.authors.x, more.authors.y));
  const offY = P.y + T.headH + TABLE_ROWS * T.rowH + 22 + 17;
  const offText = postColumns.length > 2 || wide ? 'not on this page' : 'off page';
  const off = { y: offY, note: { lines: [offText], x: P.x + P.width - 10, y: offY, anchor: 'end' as const } };
  texts.push(textBox(offText, 'small', off.note.x, offY, 'end'));

  const fk = T.side ? `M${P.x + P.width} ${P.y + T.headH + 11}H${A.x - 2}` : `M${postColumns[1].x + 8} ${P.y + P.height}V${A.y - 2}`;
  const noteText = denormalized
    ? 'The authors table is not read: the name is in each post'
    : `N+1, batched IN and the join all read these same ${cost.rowsReadPerPage} rows`;
  const noteLines = wrap(noteText, 'cap', T.note.width, T.note.lines);
  noteLines.forEach((t, i) => texts.push(textBox(t, 'cap', T.note.x, T.note.y + i * 17)));
  return {
    headline: { value: count(cost.rowsReadPerPage), unit: 'rows read a page' },
    postColumns,
    copy,
    authorsNameX,
    rows,
    lit,
    more,
    off,
    notes: wide ? { posts: `${p} read`, authors: denormalized ? 'not read' : `${p} read` } : null,
    fk,
    note: { lines: noteLines, x: T.note.x, y: T.note.y, anchor: 'start' },
    rename: {
      authors: renaming ? 'final' : null,
      p901: renaming ? (p901Fresh ? 'fresh' : 'stale') : null,
      struck: renaming && s.reduced && authorsNameX + textWidth(`Ada ${RENAMED}`, 'mono') <= A.x + A.width - 6,
    },
    texts,
  };
}

/** The trips and the tables as regions a reveal points at, each outline taking in its captions, its tag over no text. */
export function pageFocus(L: ReadLayout, T: TablesLayout, texts: readonly Box[]) {
  const trips = { x: 8, y: L.rowA - 14, width: L.width - 16, height: L.rulerY + 14 - (L.rowA - 14) };
  const tables = union([
    { x: PAD, y: T.top + 12, width: L.width - 2 * PAD, height: T.height - 16 },
    { x: T.posts.x, y: T.posts.y, width: L.width - 2 * PAD, height: T.authors.y + T.authors.height - T.posts.y },
  ]);
  return focusBoxes(
    [
      ['trips', trips],
      ['tables', pad(tables, 6)],
    ],
    texts,
    L.width,
    L.height + T.height,
  );
}
