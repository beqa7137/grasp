import { FEED_FANOUT_ROWS_PER_S, feedAt, formatDuration, type FeedSettings } from '@grasp/engine';
import { GRID_CELLS, LINE, PAD, headerBoxes, textBox, textWidth, wrap, type WriteLayout } from './feed-layout';
import { compact, count, staleText } from './feed-page-view';
import { focusBoxes, pad, union, type Box } from './focus-layout';

export type CellKind = 'ghost' | 'rest' | 'fresh' | 'stale';

export interface WriteState {
  settings: FeedSettings;
  /** How far the copy rewrite is, 0 to 1; null with no rename. */
  rename: number | null;
  /** On screen, a rename's real time is this many times slower (above 1) or faster (below). */
  slowdown: number;
  /** The old name's window is what an experiment asks, so its numbers wait for the answer. */
  hideStale: boolean;
  /** Whether the copy rewrite falling behind may show (an experiment asking about it hides it). */
  showBehind: boolean;
}

export interface WriteView {
  headline: { value: string; unit: string; bad: boolean };
  /** The stage in words, for its accessible name. */
  summary: string;
  caption: string[];
  cells: { x: number; y: number; kind: CellKind }[];
  cell: number;
  empty: { x: number; y: number; width: number } | null;
  legend: { kind: CellKind | null; parts: { text: string; num?: boolean }[]; y: number; small: boolean }[];
  bar: {
    kind: 'none' | 'rest' | 'renaming' | 'behind';
    done: number;
    elapsed: string;
    lines: { text: string; num?: boolean }[][];
  };
  barLabel: string;
  /** How many copies the rewrite has reached. */
  rewritten: number;
  texts: Box[];
}

/** A duration and a part of it in the same unit: "45 of 100 ms", "9 of 20 s". */
function partOf(totalMs: number, share: number) {
  const total = formatDuration(totalMs);
  const unit = total.split(' ').at(-1)!;
  const scale = unit === 's' ? 1_000 : 1;
  const part = (totalMs * share) / scale;
  return `${Number(part.toFixed(part < 10 && unit === 's' ? 1 : 0))} of ${total}`;
}

/** Ada's rename: her copies as a grid of 100 cells, each `A / 100` posts, and the copy rewrite that brings them up to date. */
export function writeView(W: WriteLayout, s: WriteState): WriteView {
  const denormalized = s.settings.schema === 1;
  const A = s.settings.postsPerAuthor;
  const cost = feedAt(s.settings);
  const over = denormalized && cost.fanoutLoad > 1;
  const behind = over && s.showBehind;
  // An open question about falling behind hides it, so the window reads "?" rather than a run that never ends.
  const unknown = s.hideStale || (over && !s.showBehind);
  const renaming = denormalized && s.rename !== null;
  const cells = Math.min(GRID_CELLS, A);
  const per = A / cells;
  const doneCells = renaming ? Math.floor(s.rename! * cells + 1e-9) : 0;
  const G = W.grid;
  const texts: Box[] = [];
  const stale = unknown ? '?' : staleText(cost.staleMs);
  const run = unknown ? '?' : formatDuration(cost.rewriteMs);
  const pagesMeanwhile = (format: (n: number) => string) => (unknown ? '?' : format(cost.pagesWhileStale));

  const units = [`rows · old name ${stale}`, `rows · ${Number.isFinite(cost.staleMs) || unknown ? `old ${stale}` : stale}`];
  const fits = (unit: string) => headerBoxes('', PAD, count(cost.rowsPerRename), unit, W.width - PAD, W.headlineY)[2].x >= PAD;
  const headline = denormalized
    ? { value: count(cost.rowsPerRename), unit: units.find(fits) ?? units[1], bad: behind }
    : { value: '1', unit: 'row · new name at once', bad: false };
  texts.push(...headerBoxes('Write · Ada renames', PAD + 42, headline.value, headline.unit, W.width - PAD, W.headlineY));

  const captionText = denormalized ? 'Each of her posts carries a copy of her name' : 'Her posts carry only author_id';
  const caption = wrap(captionText, 'cap', W.width - 2 * PAD, W.caption.lines);
  caption.forEach((t, i) => texts.push(textBox(t, 'cap', PAD, W.caption.y + i * LINE)));

  const cellsOut = Array.from({ length: cells }, (_, i) => ({
    x: G.x + (i % G.cols) * G.pitch,
    y: G.y + Math.floor(i / G.cols) * G.pitch,
    kind: (!denormalized ? 'ghost' : renaming ? (i < doneCells ? 'fresh' : 'stale') : 'rest') as CellKind,
  }));
  const empty = denormalized ? null : { x: G.x + G.width / 2, y: G.y + G.height / 2 + 4, width: 184 };
  if (empty) texts.push(textBox('No copies to rewrite', 'cap', empty.x, empty.y, 'middle'));

  const fresh = renaming ? Math.round(s.rename! * A) : 0;
  const unit = { text: `each square = ${count(per)} ${per === 1 ? 'post' : 'posts'}` };
  const rows: [CellKind | null, { text: string; num?: boolean }[]][] = !denormalized
    ? [
        ['ghost', [{ text: 'no copies' }]],
        [null, []],
        ['ghost', [unit]],
      ]
    : renaming
      ? [
          ['fresh', [{ text: count(fresh), num: true }, { text: ' say “Ada K.”' }]],
          ['stale', [{ text: count(A - fresh), num: true }, { text: ' still “Ada”' }]],
          ['rest', [unit]],
        ]
      : [
          ['rest', [{ text: 'all ' }, { text: count(A), num: true }, { text: ' say “Ada”' }]],
          [null, []],
          ['rest', [unit]],
        ];
  const legend = rows.map(([kind, parts], i) => ({ kind, parts, y: W.legend.ys[i], small: i === 2 }));
  legend.forEach(
    (l) => l.parts.length && texts.push(textBox(l.parts.map((p) => p.text).join(''), l.small ? 'small' : 'cap', W.legend.x + 16, l.y)),
  );

  const b = W.bar;
  const width = b.x1 - b.x0;
  const say = (text: string) => wrap(text, 'cap', width, b.lines).map((t) => [{ text: t }]);
  let bar: WriteView['bar'];
  if (!denormalized) {
    bar = { kind: 'none', done: 0, elapsed: '', lines: say('Nothing to rewrite: one row changes, and the next page reads the new name') };
  } else if (behind) {
    bar = {
      kind: 'behind',
      done: renaming ? s.rename! : 0,
      elapsed: '',
      lines: say(
        `Renames need ${count(s.settings.renamesPerSecond * A)} copy rows/s; the rewrite does ${count(FEED_FANOUT_ROWS_PER_S)}. The backlog grows by ${count(cost.fanoutBacklogRowsPerSecond)} rows/s.`,
      ),
    };
  } else if (renaming) {
    const speed = unknown ? 'shown ?' : s.slowdown >= 1 ? `shown ${count(s.slowdown)}× slower` : `shown ${count(1 / s.slowdown)}× faster`;
    const rewrites = [{ text: 'rewrites ' }, { text: count(FEED_FANOUT_ROWS_PER_S), num: true }, { text: ' rows/s' }];
    bar = {
      kind: 'renaming',
      done: s.rename!,
      elapsed: unknown ? '? of ?' : partOf(cost.rewriteMs, s.rename!),
      lines: W.wide
        ? [
            [...rewrites, { text: ` · ${speed}` }],
            [{ text: pagesMeanwhile(count), num: true }, { text: ' pages served while copies disagree' }],
          ]
        : [rewrites, [{ text: speed }], [{ text: pagesMeanwhile(compact), num: true }, { text: ' pages served meanwhile' }]],
    };
  } else {
    const pages = pagesMeanwhile(count);
    bar = {
      kind: 'rest',
      done: 0,
      elapsed: '',
      lines: W.wide
        ? [
            [{ text: 'A rename would show the old name for ' }, { text: run, num: true }],
            [
              { text: 'at ' },
              { text: count(FEED_FANOUT_ROWS_PER_S), num: true },
              { text: ' rows/s: ' },
              { text: pages, num: true },
              { text: ' pages served meanwhile' },
            ],
          ]
        : say(
            `A rename would show the old name for ${run} at ${count(FEED_FANOUT_ROWS_PER_S)} rows/s: ${pagesMeanwhile(compact)} pages served meanwhile`,
          ),
    };
  }
  const elapsedWidth = bar.elapsed ? textWidth(bar.elapsed, 'cap') + 12 : 0;
  const barLabel = textWidth('Copy rewrite (fan-out)', 'cap') + elapsedWidth <= width ? 'Copy rewrite (fan-out)' : 'Copy rewrite';
  texts.push(textBox(barLabel, 'cap', b.x0, b.labelY));
  if (bar.elapsed) texts.push(textBox(bar.elapsed, 'cap', b.x1, b.labelY, 'end'));
  bar.lines.forEach((line, i) => texts.push(textBox(line.map((p) => p.text).join(''), 'cap', b.x0, b.captionY + i * (LINE + 1))));
  const summary = !denormalized
    ? 'A rename writes 1 row, and the next page shows the new name.'
    : unknown
      ? `A rename writes ${count(cost.rowsPerRename)} rows; how long the old name stays is the question.`
      : behind
        ? `Renames need ${count(s.settings.renamesPerSecond * A)} copy rows a second; the rewrite writes ${count(FEED_FANOUT_ROWS_PER_S)}, so the old name never clears and the backlog grows by ${count(cost.fanoutBacklogRowsPerSecond)} rows a second.`
        : renaming
          ? `Ada renamed: ${count(fresh)} of ${count(A)} copies say Ada K.; one rename's copy rewrite takes ${run}.`
          : `A rename writes ${count(cost.rowsPerRename)} rows; its copy rewrite takes ${run}, and ${pagesMeanwhile(count)} pages are served while copies disagree.`;
  return {
    headline,
    summary,
    caption,
    cells: cellsOut,
    cell: G.pitch - 3,
    empty,
    legend,
    bar,
    barLabel,
    rewritten: Math.round(fresh),
    texts,
  };
}

/** The copies and the rewrite as regions a reveal points at, each outline taking in its captions, its tag over no text. */
export function writeFocus(W: WriteLayout, texts: readonly Box[]) {
  const g = W.grid;
  const b = W.bar;
  const legendRight = W.wide ? W.width - PAD : g.x + g.width;
  const copies = union([
    { x: g.x, y: W.caption.y - 14, width: W.width - 2 * PAD, height: g.y + g.height - (W.caption.y - 14) },
    { x: W.legend.x, y: W.legend.ys[0] - 12, width: legendRight - W.legend.x, height: W.legend.ys[2] + 4 - (W.legend.ys[0] - 12) },
  ]);
  const rewrite = {
    x: b.x0,
    y: b.labelY - 14,
    width: W.width - PAD - b.x0,
    height: b.captionY + (b.lines - 1) * (LINE + 1) + 4 - (b.labelY - 14),
  };
  return focusBoxes(
    [
      ['copies', pad(copies, 3)],
      ['rewrite', pad(rewrite, 3)],
    ],
    texts,
    W.width,
    W.height,
  );
}
