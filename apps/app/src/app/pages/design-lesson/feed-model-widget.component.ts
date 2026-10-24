import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  FEED_BASELINE,
  FEED_PAGE_SIZES,
  FEED_PLACES,
  FEED_READS,
  feedAt,
  feedModelOf,
  formatDuration,
  formatMs,
  goalBounds,
  renderExperiment,
  type ExperimentSpec,
  type FeedModel,
  type FeedSettings,
  type SdExperiment,
} from '@grasp/engine';
import { motionAllowed } from '../../core/motion';
import { DataTableComponent } from '../../viz/kit/data-table.component';
import { HandleComponent } from '../../viz/kit/handle.component';
import { ParticlePool, watchMotion, watchVisibility } from '../../viz/kit/particles';
import { StageComponent } from '../../viz/kit/stage.component';
import { ExperimentDockComponent } from './experiment-dock.component';
import { ExperimentSession } from './experiment-session';
import { AXIS_MS, GRID_CELLS, PAD, TABLE_ROWS, readLayout, tablesLayout, timeX, trackBoxes } from './feed-layout';
import { count, pageFocus, readName, readView, readWord, renamesPerS, staleText, tablesView, type PageState } from './feed-page-view';
import { RENAME_PLAY_MS, readReplay, renameSlowdown } from './feed-replay';
import { FeedTrackComponent } from './feed-track.component';
import { FeedTrafficComponent } from './feed-traffic.component';
import { FeedWriteComponent } from './feed-write.component';
import { FocusBoxComponent } from './focus-box.component';
import { WidgetPlay, bringStageIntoView } from './widget-play';

const SCHEMAS = [
  { value: 0, label: 'Normalized' },
  { value: 1, label: 'Denormalized' },
];
const READ_LABELS: Record<(typeof FEED_READS)[number], string> = { 'n-plus-one': 'N+1', batched: 'Batched IN', join: 'Join' };
const READS = FEED_READS.map((model, value) => ({ value, label: READ_LABELS[model] }));
/** An answer with nothing of its own to play holds this long, so the dock reads as watching the picture. */
const HOLD_MS = 1_500;
/** A page dot lands on the posts card this often while a rename plays. */
const PAGE_DOT_MS = 120;
/** A trip shorter than this on screen gets no dot: it would only flicker. */
const DOT_MIN_MS = 80;
/** A copy rewrite that falls behind loops this many times in its play, never finishing. */
const LOOPS_BEHIND = 3;
/** The share of copies a falling-behind rewrite reaches before the next renames reset it: never all of them. */
const BEHIND_REACH = 0.6;

const queries = (n: number) => `${count(n)} ${n === 1 ? 'query' : 'queries'}`;
type Setting = keyof FeedSettings;
const KEEP_WORDS: Partial<Record<Setting, (v: number) => string>> = {
  pageSize: (v) => `${v} posts a page`,
  pagesPerSecond: (v) => `${count(v)} pages a second`,
  renamesPerSecond: renamesPerS,
  postsPerAuthor: (v) => `Ada's ${count(v)} posts`,
  place: (v) => `the database ${FEED_PLACES[v].at}`,
};

/**
 * Data Modeling (REDESIGN.md 5.2, R41): one feed page and one rename, then the traffic that decides which schema wins.
 * The read is drawn as its round trips on a fixed time axis, with the SQL on the picture, and the rows each query reads
 * light in the tables; the write is Ada's rename, her copies as cells a copy rewrite brings up to date
 * (`app-feed-write`); the traffic is rows per post shown against renames per post shown (`app-feed-traffic`). Every
 * number comes from the engine's `feedCost`. Experiment cards set it up, ask, play and reveal the model's numbers.
 */
@Component({
  selector: 'app-feed-model-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    StageComponent,
    HandleComponent,
    DataTableComponent,
    FeedTrackComponent,
    FeedTrafficComponent,
    FeedWriteComponent,
    FocusBoxComponent,
    ExperimentDockComponent,
  ],
  templateUrl: './feed-model-widget.component.html',
  styleUrls: ['./feed-stage.scss', './feed-model-widget.component.scss'],
})
export class FeedModelWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));

  readonly schemas = SCHEMAS;
  readonly reads = READS;
  readonly places = FEED_PLACES;
  readonly pageSizes: readonly number[] = FEED_PAGE_SIZES;
  readonly pageStops = FEED_PAGE_SIZES.map(String);
  readonly pad = PAD;
  readonly count = count;
  readonly formatMs = formatMs;

  readonly schema = signal(FEED_BASELINE.schema);
  readonly read = signal(FEED_BASELINE.read);
  readonly pageSize = signal(FEED_BASELINE.pageSize);
  readonly postsPerAuthor = signal(FEED_BASELINE.postsPerAuthor);
  readonly pagesPerSecond = signal(FEED_BASELINE.pagesPerSecond);
  readonly renamesPerSecond = signal(FEED_BASELINE.renamesPerSecond);
  readonly place = signal(FEED_BASELINE.place);
  readonly settings = computed((): FeedSettings => ({
    schema: this.schema(),
    read: this.read(),
    pageSize: this.pageSize(),
    postsPerAuthor: this.postsPerAuthor(),
    pagesPerSecond: this.pagesPerSecond(),
    renamesPerSecond: this.renamesPerSecond(),
    place: this.place(),
  }));
  readonly model = computed(() => feedModelOf(this.settings()));
  readonly cost = computed(() => feedAt(this.settings()));

  /** The previous read, drawn behind a faster one until the next non-read change or Load a page. */
  readonly ghost = signal<FeedModel | null>(null);
  /** Trips a running replay has completed; null at rest. */
  readonly replayed = signal<number | null>(null);
  readonly replayCaption = signal('');
  /** The page-ready marker lands when a replay ends. */
  readonly landed = signal(false);
  /** How far Ada's rename is, 0 to 1; null before one. */
  readonly rename = signal<number | null>(null);
  readonly renameSpeed = signal(1);
  readonly motion = signal(false);
  readonly describe = signal(false);
  readonly notice = signal('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly pageStage = viewChild.required(StageComponent);
  private readonly pageEl = viewChild.required(StageComponent, { read: ElementRef });
  private readonly writeStage = viewChild.required(FeedWriteComponent);
  private readonly trafficStage = viewChild.required(FeedTrafficComponent);
  private readonly dotLayer = viewChild<ElementRef<SVGGElement>>('dots');
  private pool: ParticlePool | null = null;
  private visible = true;
  readonly ready = computed(() => this.pageStage().width() > 0);
  private readonly player = new WidgetPlay(() => this.motion() && this.ready());
  readonly playing = this.player.playing;

  readonly exp: ExperimentSession = new ExperimentSession({
    apply: (s) => this.applySettings(s),
    settings: () => ({ ...this.settings() }),
    metrics: () => this.metrics(),
    play: (e, done) => this.playAnswer(e, done),
    stage: (): HTMLElement => this.stageFor(this.exp.active()),
    root: this.host,
    motion: () => this.motion(),
  });
  readonly locked = this.exp.locked;
  readonly asking = computed(() => {
    const e = this.exp.active();
    return !!e && !e.goal && this.exp.phase() === 'asking';
  });
  /** What the open question hides until it is answered: its answer would otherwise be on the picture. */
  /** Any question open, a challenge's included: Describe and Table would answer it, so they wait. */
  readonly askingAny = computed(() => !!this.exp.active() && this.exp.phase() === 'asking');
  private readonly hidden = computed((): readonly string[] => (this.asking() ? this.exp.active()!.hide : []));
  readonly hideDenormalized = computed(() => this.hidden().includes('denormalized'));
  readonly hideStale = computed(() => this.hidden().includes('stale'));
  readonly showBehindWrite = computed(() => !this.hidden().includes('behind'));
  /** The copy rewrite's limit shows on the chart where copies are in play: Denormalized, or an experiment that denormalizes. */
  readonly showBehind = computed(() => {
    if (!this.showBehindWrite()) return false;
    const e = this.exp.active();
    const copies = !!e && (e.setup['schema'] === 1 || (!!e.act && 'set' in e.act && e.act.set['schema'] === 1));
    return this.schema() === 1 || copies;
  });

  readonly readL = computed(() => readLayout(Math.max(248, this.pageStage().width())));
  readonly tablesL = computed(() => tablesLayout(this.readL().width, this.readL().height));
  readonly pageHeight = computed(() => this.readL().height + this.tablesL().height);
  private readonly pageState = computed((): PageState => ({
    settings: this.settings(),
    ghost: this.ghost(),
    replayed: this.replayed(),
    rename: this.rename(),
    reduced: !this.motion(),
  }));
  readonly readV = computed(() => readView(this.readL(), this.pageState()));
  readonly tablesV = computed(() => tablesView(this.tablesL(), this.readL().wide, this.pageState()));
  readonly pageIndex = computed(() => this.pageSizes.indexOf(this.pageSize()));
  readonly axisTicks = computed(() => {
    const L = this.readL();
    const step = L.wide ? 20 : 40;
    return Array.from({ length: AXIS_MS / step + 1 }, (_, i) => i * step).map((t) => ({
      t,
      x: timeX(L, t),
      label: t === AXIS_MS ? `${t} ms` : String(t),
      anchor: t === AXIS_MS ? 'end' : 'middle',
    }));
  });
  /** The rows a page reads, lit: the sample rows and the "more" row of each table, as far as a replay has reached. */
  readonly litRows = computed(() => {
    const T = this.tablesL();
    const { lit } = this.tablesV();
    const rows = (card: { x: number; y: number; width: number }, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        x: card.x,
        y: card.y + T.headH + i * T.rowH,
        width: card.width,
        height: i < TABLE_ROWS ? T.rowH : T.rowH - 1,
        full: lit.full,
      }));
    return [...rows(T.posts, lit.posts), ...rows(T.authors, lit.authors)];
  });
  readonly placeAt = computed(() => FEED_PLACES[this.place()].at);
  /** The old name's window as a notice may say it: nothing while a question hides it. */
  private readonly staleSaid = computed(() => {
    const c = this.cost();
    if (this.hideStale() || (c.fanoutLoad > 1 && !this.showBehindWrite())) return '';
    return Number.isFinite(c.staleMs) ? ` and shows the old name for ${formatDuration(c.staleMs)}` : ', and the old name never clears';
  });
  /** The trips and the tables, each outline taking in its captions, with its tag over no text. */
  readonly focus = computed(() => {
    const T = this.tablesL();
    const track = trackBoxes(T.pageTrack, this.pageStops, this.pageIndex(), String(this.pageSize()), 'Posts a page');
    return pageFocus(this.readL(), T, [...this.readV().texts, ...this.tablesV().texts, ...track]);
  });

  readonly readSummary = computed(() => {
    const s = this.settings();
    const c = this.cost();
    const how = s.schema === 1 ? 'Denormalized' : `Normalized, read with ${readWord(this.model())}`;
    const sent = c.queriesPerPage === 1 ? '1 query' : `${queries(c.queriesPerPage)} one after another`;
    const rows =
      s.schema === 1 ? `${s.pageSize} posts rows; the authors table is not read` : `${s.pageSize} posts and ${s.pageSize} authors rows`;
    const g = this.ghost();
    const ghost = g ? `; ${readWord(g)} was ${formatMs(feedAt(s, g).waitMs)}` : '';
    return `${how}: ${sent}, ${formatMs(c.waitMs)} page wait, the database ${this.placeAt()}; reads ${rows}${ghost}.`;
  });

  readonly metrics = computed((): Record<string, number> => {
    const c = this.cost();
    return { waitMs: c.waitMs, staleMs: c.staleMs, rowsPerSecond: c.rowsPerSecond };
  });
  readonly goalStatus = computed(() => {
    const goal = this.exp.active()?.goal;
    if (!goal) return '';
    const c = this.cost();
    const bounds = Object.fromEntries(goalBounds(goal).map((b) => [b.metric, b.below]));
    const mark = (metric: string, v: number) => (v < bounds[metric] ? '✓' : '✗');
    const how = this.schema() === 1 ? 'Denormalized' : readName(this.model());
    const stale = c.staleMs ? `old name ${staleText(c.staleMs)}` : 'fresh';
    const status = `${how} · ${formatMs(c.waitMs)} ${mark('waitMs', c.waitMs)} · ${stale} ${mark('staleMs', c.staleMs)} · ${count(c.rowsPerSecond)} rows/s ${mark('rowsPerSecond', c.rowsPerSecond)}`;
    if (this.exp.phase() === 'revealed') return this.exp.kept() ? `Goal met: ${status}` : `You met it; now: ${status}`;
    if (this.exp.kept()) return status;
    const keep = Object.entries(goal.keep ?? {}).map(([k, v]: [string, number]) => KEEP_WORDS[k as Setting]?.(v) ?? `${k} ${v}`);
    return `${status}. The goal keeps ${keep.slice(0, -1).join(', ')} and ${keep.at(-1)}.`;
  });

  readonly describeHead = [
    'Schema and read',
    'Trips a page',
    'Page wait',
    'Rows read a page',
    'Rows a rename',
    'Old name for',
    'Pages while stale',
    'Rows a second',
  ];
  readonly describeRows = computed(() => {
    const s = this.settings();
    return [...FEED_READS, 'denormalized' as const].map((m) => {
      const c = feedAt(s, m);
      return [
        m === 'denormalized' ? 'Denormalized' : `Normalized, ${readWord(m)}`,
        count(c.queriesPerPage),
        formatMs(c.waitMs),
        count(c.rowsReadPerPage),
        count(c.rowsPerRename),
        m === 'denormalized' ? staleText(c.staleMs) : 'none',
        Number.isFinite(c.pagesWhileStale) ? count(c.pagesWhileStale) : 'every page',
        count(c.rowsPerSecond),
      ];
    });
  });
  readonly describeRow = computed(() => [...FEED_READS, 'denormalized'].indexOf(this.model()));

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const stopMotion = watchMotion(motionAllowed, (allowed) => this.motion.set(allowed));
      const stopVisibility = watchVisibility(this.host, (visible) => {
        this.visible = visible;
        this.player.setVisible(visible);
        if (visible) this.pool?.resume();
        else this.pool?.pause();
      });
      destroyRef.onDestroy(() => {
        stopMotion();
        stopVisibility();
        this.player.stop(false);
        this.pool?.clear();
      });
    });
  }

  setSchema(value: number) {
    if (this.locked() || value === this.schema()) return;
    this.settle();
    this.schema.set(value);
    const c = this.cost();
    const stale = this.staleSaid();
    this.notice.set(
      value === 1
        ? `Denormalized: 1 query reads ${count(c.rowsReadPerPage)} rows; a rename writes ${count(c.rowsPerRename)} rows${stale}.`
        : `Normalized, read with ${readWord(this.model())}: ${queries(c.queriesPerPage)}, ${formatMs(c.waitMs)} page wait; a rename writes 1 row.`,
    );
  }

  setRead(value: number) {
    if (this.locked() || value === this.read()) return;
    const before = this.model();
    const beforeWait = this.cost().waitMs;
    this.settle(false);
    this.read.set(value);
    const c = this.cost();
    this.ghost.set(before);
    const ghost = this.ghost() ? ` (${readWord(before)} was ${formatMs(beforeWait)})` : '';
    const after = c.queriesPerPage > 1 ? ' one after another' : '';
    this.notice.set(
      `Read with ${readWord(this.model())}: ${queries(c.queriesPerPage)}${after}, ${formatMs(c.waitMs)} page wait${ghost}; the same ${count(c.rowsReadPerPage)} rows.`,
    );
  }

  setPlace(value: number) {
    if (this.locked() || value === this.place()) return;
    this.settle();
    this.place.set(value);
    const c = this.cost();
    this.notice.set(
      `The database ${this.placeAt()}: ${formatMs(FEED_PLACES[value].rttMs)} a round trip, so ${queries(c.queriesPerPage)} wait ${formatMs(c.waitMs)}.`,
    );
  }

  setPageSize(value: number) {
    this.settle();
    this.pageSize.set(value);
    const c = this.cost();
    this.notice.set(
      `${value} posts a page: ${queries(c.queriesPerPage)}, ${formatMs(c.waitMs)} page wait, ${count(c.rowsReadPerPage)} rows read.`,
    );
  }

  setPostsPerAuthor(value: number) {
    this.settle();
    this.postsPerAuthor.set(value);
    const c = this.cost();
    const stale = this.staleSaid();
    this.notice.set(
      this.schema() === 1
        ? `Ada has ${count(value)} posts: a rename writes ${count(c.rowsPerRename)} rows${stale}.`
        : `Ada has ${count(value)} posts; normalized, a rename still writes 1 row.`,
    );
  }

  setPages(value: number) {
    this.settle();
    this.pagesPerSecond.set(value);
    this.notice.set(this.trafficNotice());
  }

  setRenames(value: number) {
    this.settle();
    this.renamesPerSecond.set(value);
    this.notice.set(this.trafficNotice());
  }

  /** Load a page: the read replays with every trip slowed alike; without motion its final frame says it all. */
  loadPage(done: () => void = () => undefined, keepGhost = false) {
    this.exp.clearFocus();
    this.player.stop();
    if (!keepGhost) this.ghost.set(null);
    this.rename.set(null);
    const c = this.cost();
    const said = `Page loaded: ${queries(c.queriesPerPage)}${c.queriesPerPage > 1 ? ' one after another' : ''}, ${formatMs(c.waitMs)}.`;
    if (!this.motion()) {
      this.notice.set(said);
      return done();
    }
    bringStageIntoView(this.pageEl().nativeElement);
    const replay = readReplay(c.queriesPerPage, FEED_PLACES[this.place()].rttMs);
    let last = -1;
    this.notice.set('');
    this.replayCaption.set(replay.caption);
    this.landed.set(false);
    this.replayed.set(0);
    this.player.play(
      replay.durationMs,
      (p) => {
        const { trip, tripMs } = replay.at(p * replay.durationMs);
        const k = Math.floor(trip);
        if (k === last) return;
        last = k;
        this.replayed.set(k);
        if (k < c.queriesPerPage && tripMs >= DOT_MIN_MS) this.emitTrip(k, tripMs);
      },
      () => {
        this.replayed.set(null);
        done();
      },
      () => {
        this.landed.set(true);
        this.notice.set(said);
      },
    );
  }

  /** Rename Ada: her row changes at once; denormalized, the copy rewrite plays over 3 s, or rests half done without motion. */
  renameAda(done: () => void = () => undefined) {
    this.exp.clearFocus();
    this.player.stop();
    this.ghost.set(null);
    const c = this.cost();
    if (this.schema() === 0) {
      this.rename.set(null);
      this.notice.set('Ada renames to Ada K.: 1 row changes, and the next page shows the new name.');
      return done();
    }
    const behind = c.fanoutLoad > 1 && this.showBehindWrite();
    this.renameSpeed.set(renameSlowdown(c.staleMs));
    if (!this.motion()) {
      this.rename.set(0.5);
      this.notice.set(
        behind
          ? 'Ada renames, and renames keep arriving faster than the copy rewrite writes: the copies never all catch up.'
          : 'Ada renamed: the copy rewrite is shown half done. Drag its playhead to step through it.',
      );
      return done();
    }
    bringStageIntoView(this.writeStage().element().nativeElement);
    this.notice.set(`Ada renames to Ada K.: the copy rewrite starts on ${count(this.postsPerAuthor())} copies.`);
    const cells = Math.min(GRID_CELLS, this.postsPerAuthor());
    let lastCells = -1;
    let lastDot = -Infinity;
    this.rename.set(0);
    this.player.play(
      RENAME_PLAY_MS,
      (p) => {
        const share = behind ? BEHIND_REACH * ((p * LOOPS_BEHIND) % 1) : p;
        const k = Math.floor(share * cells);
        if (k !== lastCells) {
          lastCells = k;
          this.rename.set(k / cells);
        }
        const ms = p * RENAME_PLAY_MS;
        if (ms - lastDot >= PAGE_DOT_MS) {
          lastDot = ms;
          this.emitPage(k < cells);
        }
      },
      done,
      () => {
        this.rename.set(behind ? 0.5 : 1);
        this.notice.set(
          behind
            ? `Renames keep arriving: the copy rewrite falls behind by ${count(c.fanoutBacklogRowsPerSecond)} rows a second, so some copies stay stale.`
            : 'The copy rewrite finished: every copy says Ada K.',
        );
      },
    );
  }

  setRewrite(share: number) {
    this.player.stop();
    this.rename.set(share);
  }

  start(e: SdExperiment) {
    this.player.stop(false);
    this.notice.set('');
    this.describe.set(false);
    this.exp.start(e);
  }

  toggleDescribe() {
    this.describe.update((d) => !d);
  }

  private trafficNotice() {
    const s = this.settings();
    const [norm, den] = [feedAt(s, 'join'), feedAt(s, 'denormalized')];
    const head = `${count(s.pagesPerSecond)} pages and ${renamesPerS(s.renamesPerSecond)}: normalized ${count(norm.rowsPerSecond)} rows a second`;
    return this.hideDenormalized() ? `${head}.` : `${head}, denormalized ${count(den.rowsPerSecond)}.`;
  }

  /** Any change but a read's: the ghost, a replay and a rename are about the settings before it. */
  private settle(clearGhost = true) {
    this.player.stop();
    this.exp.clearFocus();
    if (clearGhost) this.ghost.set(null);
    this.rename.set(null);
    this.replayed.set(null);
    this.landed.set(false);
  }

  private applySettings(s: Readonly<Record<string, number>>) {
    this.settle();
    this.describe.set(false);
    const set: Record<Setting, (v: number) => void> = {
      schema: (v) => this.schema.set(v),
      read: (v) => this.read.set(v),
      pageSize: (v) => this.pageSize.set(v),
      postsPerAuthor: (v) => this.postsPerAuthor.set(v),
      pagesPerSecond: (v) => this.pagesPerSecond.set(v),
      renamesPerSecond: (v) => this.renamesPerSecond.set(v),
      place: (v) => this.place.set(v),
    };
    for (const [name, value] of Object.entries(s)) set[name as Setting]?.(value);
  }

  /** An answer plays where it happens: a page load, a rename, or a short hold while the settings change shows. */
  private playAnswer(e: SdExperiment, done: () => void) {
    const run = e.act && 'run' in e.act ? e.act.run : undefined;
    // An act that changes the read keeps the card's own read beside it, so the answer shows the two together.
    if (run === 'load' && e.act && 'set' in e.act && e.act.set['read'] !== undefined) {
      this.ghost.set(feedModelOf({ schema: e.setup['schema'], read: e.setup['read'] }));
      return this.loadPage(done, true);
    }
    if (run === 'load') return this.loadPage(done);
    if (run === 'rename') return this.renameAda(done);
    this.player.play(HOLD_MS, () => undefined, done);
  }

  /** The stage an experiment's answer happens on, which a phone scrolls into view. */
  private stageFor(e: SdExperiment | null): HTMLElement {
    const first = e?.focus[0];
    if (first === 'copies' || first === 'rewrite') return this.writeStage().element().nativeElement;
    if (first === 'balance') return this.trafficStage().element().nativeElement;
    return this.pageEl().nativeElement;
  }

  private dots(): ParticlePool | null {
    const layer = this.dotLayer()?.nativeElement;
    if (!layer || !this.motion()) return null;
    if (this.pool?.layer !== layer) {
      this.pool?.clear();
      this.pool = new ParticlePool(layer);
      if (!this.visible) this.pool.pause();
    }
    return this.pool;
  }

  private emitTrip(i: number, tripMs: number) {
    this.dots()?.emit(this.readV().tripPath(i), i === 0 ? 'first' : 'trip', tripMs, { radius: 3 });
  }

  /** A page served during the rename lands on Ada's newest post; while it is stale, that page shows her old name. */
  private emitPage(stale: boolean) {
    const T = this.tablesL();
    const col = this.tablesV().copy;
    if (!col) return;
    // In the copy column's empty right, under the header: clear of the name and its tag.
    const x = col.x + col.width - 12;
    this.dots()?.emit(
      [
        [x, T.posts.y + T.headH + 1],
        [x, T.posts.y + T.headH + 11],
      ],
      stale ? 'page stale' : 'page',
      360,
      { breaks: stale, radius: 3 },
    );
  }
}
