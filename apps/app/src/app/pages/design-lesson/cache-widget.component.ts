import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  CACHE_CAPACITY_SNAPS,
  CACHE_HIT_MS,
  CACHE_HIT_SNAPS,
  CACHE_ORIGIN_MS_SNAPS,
  CACHE_QPS,
  CACHE_REFILL_SECONDS,
  cacheRefill,
  cacheSteady,
  formatApprox,
  formatMs,
  formatPct,
  formatQps,
  formatSeconds,
  formatTimes,
  renderExperiment,
  type ExperimentSpec,
  type SdExperiment,
} from '@grasp/engine';
import { motionAllowed, motionScroll } from '../../core/motion';
import { SliderComponent } from '../../ui/slider.component';
import { ChartFrameComponent, type ChartAxis, type ChartSeries, type ChartTable } from '../../viz/kit/chart-frame.component';
import { HandleComponent } from '../../viz/kit/handle.component';
import { ParticlePool, PlayClock, watchMotion, watchVisibility, type Pt } from '../../viz/kit/particles';
import { StageComponent } from '../../viz/kit/stage.component';
import { TAG, cacheLayout, waffleSide, type CacheLayout } from './cache-layout';
import { CacheTraffic, REQUESTS_PER_DOT, WAIT_SCALE } from './cache-traffic';
import { barAt, meterAt, meterMarks, meterTicks, waffleCells, waffleCounts, waffleLegend } from './cache-view';
import { ExperimentDockComponent, type ExperimentPhase } from './experiment-dock.component';

const STEADY_PLAY_MS = 2000;
/** A flush's simulated seconds play at this many per real second. */
const FLUSH_PLAY_RATE = 3;
const LAST = CACHE_REFILL_SECONDS * 10;
const TIMES = Array.from({ length: LAST + 1 }, (_, i) => i / 10);

const X_AXIS: ChartAxis = { min: 0, max: CACHE_REFILL_SECONDS, ticks: [0, 5, 10, 15, 20], format: formatSeconds };
const Y_AXIS: ChartAxis = { min: 0, max: CACHE_QPS, ticks: [0, 5_000, 10_000], format: (v) => (v ? `${v / 1_000}k/s` : '0') };
const Y2_AXIS: ChartAxis = { min: 0, max: 100, ticks: [0, 100], format: (v) => `${v}%` };
const METRIC_WORDS: Record<string, string> = { meanMs: 'mean', p99Ms: 'p99' };

/**
 * Caching (REDESIGN.md 4.7b): 10,000 requests a second meet a cache, whose hit rate is a handle on a nines scale, and the
 * misses go on to an origin with a capacity handle on its load meter. Request dots flow while the stage is in view and
 * motion is allowed. A waffle of 100 requests and the mean and p99 sit beside the drawing; flushing the cache plays the
 * miss storm on a chart with a playhead, from the engine's `cacheRefill`, until the cache is warm again. Experiment cards
 * set it up, ask, play and reveal the model's numbers.
 */
@Component({
  selector: 'app-cache-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, HandleComponent, ChartFrameComponent, SliderComponent, ExperimentDockComponent],
  templateUrl: './cache-widget.component.html',
  styleUrl: './cache-widget.component.scss',
})
export class CacheWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));

  readonly hitSnaps = CACHE_HIT_SNAPS;
  readonly capacitySnaps = CACHE_CAPACITY_SNAPS;
  readonly times = TIMES;
  readonly originSnaps: readonly number[] = CACHE_ORIGIN_MS_SNAPS;
  readonly qps = formatQps(CACHE_QPS);
  readonly dotLegend = `1 dot = ${REQUESTS_PER_DOT.toLocaleString('en-US')} requests`;
  readonly waitLegend = `misses wait at the origin (drawn ${WAIT_SCALE}× longer so you can see it)`;
  readonly x = X_AXIS;
  readonly y = Y_AXIS;
  readonly y2 = Y2_AXIS;
  readonly formatPct = formatPct;
  readonly tag = TAG;
  readonly formatQps = formatQps;
  readonly points = (path: readonly Pt[]) => path.map((p) => p.join(',')).join(' ');

  readonly target = signal(90);
  readonly originMs = signal(50);
  readonly capacity = signal(2_000);
  readonly flushed = signal(false);
  /** The playhead, as a sample index (tenths of a second after the flush). */
  readonly t = signal(0);
  /** After a flush has played out, or a setting changed since: the picture shows the warm steady state again. */
  readonly settled = signal(false);
  readonly playing = signal(false);
  readonly motion = signal(false);
  /** A line under the controls for what a press did when nothing moves, as Replay under Reduced motion. */
  readonly notice = signal('');

  readonly active = signal<SdExperiment | null>(null);
  readonly phase = signal<ExperimentPhase>('asking');
  readonly chosen = signal<number | null>(null);
  readonly done = signal<ReadonlySet<string>>(new Set());
  readonly focusOn = signal<readonly string[]>([]);
  /** While an experiment plays, the settings its reveal is about stay fixed. */
  readonly locked = computed(() => this.phase() === 'playing');

  readonly stage = viewChild.required(StageComponent);
  private readonly stageEl = viewChild.required(StageComponent, { read: ElementRef });
  private readonly particleLayer = viewChild<ElementRef<SVGGElement>>('particles');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private visible = true;
  private pool: ParticlePool | null = null;
  private traffic: { flow: CacheTraffic; dots: CacheLayout['dots']; from: number } | null = null;
  private flowClock: PlayClock | null = null;
  private clock: PlayClock | null = null;
  /** What the running play does when it ends, or when something interrupts it: an experiment's reveal. */
  private pendingDone: (() => void) | null = null;

  readonly layout = computed(() => cacheLayout(Math.max(260, this.stage().width())));
  readonly ready = computed(() => this.stage().width() > 0);

  readonly run = computed(() =>
    this.flushed() ? cacheRefill({ hitRate: this.target(), originMs: this.originMs(), capacity: this.capacity() }) : null,
  );
  /** The state at the playhead while a flush is showing, the steady state otherwise. */
  readonly live = computed(() => {
    const run = this.run();
    // A cache that never warms within the run rests on its last sample rather than jumping to a steady state it never reaches.
    if (run && (!this.settled() || run.warmAt == null)) return run.samples[this.t()];
    const steady = cacheSteady({ hitRate: this.target(), originMs: this.originMs() });
    const timedOutPerSec = Math.max(0, steady.originQps - this.capacity());
    return { t: 0, hitRate: this.target(), originQps: steady.originQps, timedOutPerSec, timedOutSoFar: 0 };
  });
  readonly refilling = computed(() => this.live().hitRate < this.target() - 1e-9);
  readonly warmAgain = computed(() => this.flushed() && this.settled() && this.run()?.warmAt != null);
  readonly overloaded = computed(() => this.live().originQps > this.capacity());
  readonly outcome = computed(() => cacheSteady({ hitRate: this.live().hitRate, originMs: this.originMs() }));

  readonly mean = computed(() => (this.overloaded() ? 'timing out' : formatMs(this.outcome().meanMs)));
  readonly p99 = computed(() => (this.overloaded() ? 'timing out' : formatMs(this.outcome().p99Ms)));
  readonly p99IsMiss = computed(() => this.outcome().p99Ms > CACHE_HIT_MS);
  /** Requests the storm has lost by the playhead, or in all once it is over. */
  readonly lostInStorm = computed(() => {
    const run = this.run();
    if (!run) return 0;
    return this.settled() ? run.timedOut : run.samples[this.t()].timedOutSoFar;
  });

  readonly barSplit = computed(() => barAt(this.layout().bar, this.live().hitRate));
  readonly targetX = computed(() => barAt(this.layout().bar, this.target()));
  readonly hitPositions = computed(() => CACHE_HIT_SNAPS.map((h) => barAt(this.layout().bar, h)));
  readonly nineTicks = computed(() => [50, 90, 99, 99.9].map((h) => ({ label: `${h}%`, x: barAt(this.layout().bar, h) })));
  readonly meterTicks = computed(() => meterTicks(this.layout().meter));
  readonly capacityPositions = computed(() => CACHE_CAPACITY_SNAPS.map((c) => meterAt(this.layout().meter, c)));
  readonly meter = computed(() => meterMarks(this.layout().meter, this.live().originQps, this.capacity()));

  readonly counts = computed(() => waffleCounts(this.live().originQps / CACHE_QPS, this.live().timedOutPerSec / CACHE_QPS));
  readonly cells = computed(() => waffleCells(this.layout().waffle, this.counts()));
  readonly p99Cell = computed(() => this.cells()[98]);
  readonly waffleSide = computed(() => waffleSide(this.layout().waffle));
  readonly legend = computed(() => waffleLegend(this.counts()));

  readonly hitText = computed(() =>
    this.refilling()
      ? `Target ${formatPct(this.target())} hits; now ${formatPct(this.live().hitRate)} while the cache refills`
      : `${formatPct(this.target())} hits: ${formatQps(this.live().originQps)} go on to the origin`,
  );
  readonly flowSummary = computed(() => {
    const live = this.live();
    const state = this.overloaded()
      ? `The origin is over capacity (${this.overBy()}), so requests time out.`
      : `Mean ${this.mean()}, p99 ${this.p99()}.`;
    return `${this.qps} from clients; the cache answers ${formatPct(live.hitRate)} and sends ${formatQps(live.originQps)} to an origin that takes ${formatMs(this.originMs())} and answers up to ${formatQps(this.capacity())}. ${state}`;
  });
  readonly capacityText = computed(() => `The origin answers up to ${formatQps(this.capacity())}`);
  /** How far over capacity the origin is, in words: a ratio only once it is clearly more than once over. */
  readonly overBy = computed(() => this.overLines().join(' '));
  /** The overload caption in two short lines, so it stays narrow beside the origin meter. */
  readonly overLines = computed(() => {
    const ratio = this.live().originQps / this.capacity();
    const capacity = formatQps(this.capacity());
    return [ratio >= 1.5 ? `${formatTimes(ratio)} the ${capacity}` : `over the ${capacity}`, 'it can answer'];
  });

  readonly series = computed((): ChartSeries[] => {
    const run = this.run();
    if (!run) return [];
    return [
      { id: 'load', tone: 'critical', label: 'origin load', points: run.samples.map((s) => [s.t, s.originQps] as const) },
      {
        id: 'hits',
        tone: 'final',
        dashed: true,
        right: true,
        label: 'hit rate',
        points: run.samples.map((s) => [s.t, s.hitRate] as const),
      },
    ];
  });
  readonly spans = computed(() => {
    const run = this.run();
    if (!run || run.overCapacityS <= 0) return [];
    const lost = this.lostInStorm();
    const label = this.recovers()
      ? `over capacity until ${formatSeconds(run.overCapacityS)}${lost >= 1 ? `, ${formatApprox(lost)} timed out` : ''}`
      : `over capacity throughout${lost >= 1 ? `, ${formatApprox(lost)} timed out so far` : ''}`;
    return [{ from: 0, to: run.overCapacityS, label }];
  });
  /** Whether the origin is back under capacity by the end of the run. */
  readonly recovers = computed(() => {
    const last = this.run()?.samples.at(-1);
    return !!last && last.originQps <= this.capacity();
  });
  readonly markers = computed(() => {
    const at = this.run()?.warmAt;
    return at == null ? [] : [{ at, label: `warm at ${formatSeconds(at)}`, tone: 'final' as const }];
  });
  readonly threshold = computed(() => ({ value: this.capacity(), label: 'capacity' }));
  readonly table = computed((): ChartTable | undefined => {
    const run = this.run();
    if (!run) return undefined;
    return {
      head: ['Time', 'Hit rate', 'Origin', 'Timed out'],
      rows: run.samples
        .filter((_, i) => i % 10 === 0)
        .map((s) => [formatSeconds(s.t), formatPct(s.hitRate), formatQps(s.originQps), formatQps(s.timedOutPerSec)]),
    };
  });
  readonly tableRow = computed(() => Math.round(this.t() / 10));
  readonly chartSummary = computed(() => {
    const run = this.run();
    if (!run) return 'Origin load after a flush: no flush yet.';
    const warm = run.warmAt == null ? 'is not warm again within the chart' : `is warm again at ${formatSeconds(run.warmAt)}`;
    const over = this.recovers()
      ? `is over capacity for ${formatSeconds(run.overCapacityS)}`
      : 'never gets back under capacity within the chart';
    return `After the flush the origin gets ${this.qps} against a capacity of ${formatQps(this.capacity())} and ${over}; the cache ${warm}.`;
  });
  readonly playheadText = computed(
    () =>
      `${formatSeconds(this.t() / 10)} after the flush: ${formatPct(this.live().hitRate)} hits, origin ${formatQps(this.live().originQps)}`,
  );
  readonly playheadTime = computed(() => this.t() / 10);
  readonly upTo = computed(() => (this.playing() && this.flushed() ? this.t() / 10 : Infinity));

  /** The challenge's measure, by the name its goal gives. */
  readonly metrics = computed((): Record<string, number> => ({ meanMs: this.outcome().meanMs, p99Ms: this.outcome().p99Ms }));
  readonly goalStatus = computed(() => {
    const goal = this.active()?.goal;
    if (!goal) return '';
    const words = METRIC_WORDS[goal.metric] ?? goal.metric;
    const now = formatMs(this.metrics()[goal.metric]);
    return this.phase() === 'revealed'
      ? `Goal met: ${words} ${now}, under ${formatMs(goal.below)}.`
      : `${words[0].toUpperCase()}${words.slice(1)} now ${now}; the goal is under ${formatMs(goal.below)}.`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const stopMotion = watchMotion(motionAllowed, (allowed) => this.motion.set(allowed));
      const stopVisibility = watchVisibility(this.stageEl().nativeElement, (visible) => {
        this.visible = visible;
        for (const c of [this.flowClock, this.clock])
          if (visible) c?.resume();
          else c?.pause();
        if (visible) this.pool?.resume();
        else this.pool?.pause();
      });
      destroyRef.onDestroy(() => {
        stopMotion();
        stopVisibility();
        this.flowClock?.stop();
        this.clock?.stop();
        this.pool?.clear();
      });
    });
    // Dots flow whenever motion is allowed and the stage is drawn; offscreen they pause with the clock.
    effect(() => {
      const flow = this.motion() && this.ready();
      untracked(() => (flow ? this.startFlow() : this.stopFlow()));
    });
    effect(() => {
      const goal = this.active()?.goal;
      if (goal && this.phase() === 'asking' && !this.overloaded() && this.metrics()[goal.metric] < goal.below)
        untracked(() => this.reveal());
    });
  }

  setTarget(value: number) {
    this.target.set(value);
    this.settleAfterChange();
  }

  setOrigin(value: number) {
    this.originMs.set(value);
    this.settleAfterChange();
  }

  setCapacity(value: number) {
    this.capacity.set(value);
    this.settleAfterChange();
  }

  setPlayhead(time: number) {
    this.stopPlay();
    this.notice.set('');
    this.settled.set(false);
    this.t.set(Math.round(time * 10));
  }

  flush() {
    this.flushed.set(true);
    this.focusOn.set([]);
    this.notice.set('');
    this.restart();
  }

  replay() {
    this.restart();
    this.notice.set(this.motion() ? '' : 'Back at the flush: drag the playhead under the chart to step through the refill.');
  }

  private restart() {
    this.bringStageIntoView();
    // Stop the old play first: its end would otherwise settle the picture after this reset.
    this.stopPlay();
    this.settled.set(false);
    this.t.set(0);
    this.playRun(() => undefined);
  }

  start(e: SdExperiment) {
    this.stopPlay(false);
    this.notice.set('');
    this.active.set(e);
    this.chosen.set(null);
    this.phase.set('asking');
    this.focusOn.set([]);
    this.flushed.set(false);
    this.settled.set(false);
    this.t.set(0);
    this.applySettings(e.setup);
    this.stageEl().nativeElement.scrollIntoView({ block: 'nearest', behavior: motionScroll() });
  }

  answer(index: number | null) {
    this.chosen.set(index);
    const e = this.active();
    if (index === null || !e || this.phase() !== 'asking') return;
    this.phase.set('playing');
    this.bringStageIntoView();
    const act = e.act;
    if (act && 'flush' in act) {
      this.flushed.set(true);
      this.settled.set(false);
      this.t.set(0);
      this.playRun(() => this.reveal());
      return;
    }
    if (act) this.applySettings(act.set);
    this.play(
      STEADY_PLAY_MS,
      () => undefined,
      () => this.reveal(),
    );
  }

  /** A setting changed: with no play running, the picture shows the warm steady state of the new settings. */
  private settleAfterChange() {
    this.notice.set('');
    if (this.flushed() && !this.playing()) {
      this.settled.set(true);
      this.t.set(LAST);
    }
  }

  private reveal() {
    const e = this.active();
    if (!e) return;
    this.phase.set('revealed');
    this.done.update((d) => new Set([...d, e.id]));
    this.focusOn.set(e.focus);
    if (!this.motion()) return;
    afterNextRender(
      {
        write: () => {
          for (const outline of this.host.querySelectorAll<SVGElement>('.focused .focus-outline'))
            outline.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], {
              duration: 1400,
              easing: 'ease-in-out',
            });
        },
      },
      { injector: this.injector },
    );
  }

  private applySettings(s: Readonly<Record<string, number>>) {
    if (s['hitRate'] !== undefined) this.target.set(s['hitRate']);
    if (s['originMs'] !== undefined) this.originMs.set(s['originMs']);
    if (s['capacity'] !== undefined) this.capacity.set(s['capacity']);
  }

  /**
   * Scrolls the stage into view when an answer or a flush starts to play, unless it is already whole on screen: on a
   * phone the question sits below the picture. The margin clears the page's translucent header.
   */
  private bringStageIntoView() {
    const stage = this.stageEl().nativeElement as HTMLElement;
    const header = stage.closest('ion-content')?.previousElementSibling?.getBoundingClientRect().bottom ?? 0;
    const tabBar = document.querySelector('ion-tab-bar')?.getBoundingClientRect().top ?? window.innerHeight;
    const box = stage.getBoundingClientRect();
    if (box.top >= header && box.bottom <= tabBar) return;
    stage.style.scrollMarginTop = `${header + 8}px`;
    stage.scrollIntoView({ block: 'start', behavior: motionScroll() });
  }

  /** A flush plays its refill to the end, where the cache is warm again; without motion it rests at the peak. */
  private playRun(done: () => void) {
    this.play(
      (CACHE_REFILL_SECONDS * 1000) / FLUSH_PLAY_RATE,
      (p) => this.t.set(Math.round(p * LAST)),
      done,
      () => {
        this.t.set(LAST);
        this.settled.set(true);
      },
    );
  }

  /**
   * Plays for `durationMs`. `done` runs however the play stops, so an experiment always reveals; `ended` runs only when
   * it plays to its end, so an interrupted flush never settles the picture behind the play that replaced it.
   */
  private play(durationMs: number, onFrame: (progress: number) => void, done: () => void, ended = () => undefined) {
    this.stopPlay();
    if (!this.motion() || !this.ready()) return done();
    this.pendingDone = done;
    this.playing.set(true);
    this.clock = new PlayClock(durationMs, onFrame, () => {
      this.clock = null;
      ended();
      this.finishPlay(true);
    });
    if (!this.visible) this.clock.pause();
    this.clock.start();
  }

  /** Stops a running play. An interrupted experiment play still reveals, so it never stays half done. */
  private stopPlay(complete = true) {
    this.clock?.stop();
    this.clock = null;
    this.finishPlay(complete);
  }

  private finishPlay(complete: boolean) {
    const done = this.pendingDone;
    this.pendingDone = null;
    this.playing.set(false);
    if (complete) done?.();
  }

  private startFlow() {
    if (this.flowClock) return;
    this.flowClock = new PlayClock(Infinity, (_, elapsed) => this.sendDots(elapsed));
    if (!this.visible) this.flowClock.pause();
    this.flowClock.start();
  }

  private stopFlow() {
    this.flowClock?.stop();
    this.flowClock = null;
    this.pool?.clear();
  }

  /** Sends the dots due by `elapsed`, rebuilding the pool when the drawing (and its dots layer) was rebuilt. */
  private sendDots(elapsed: number) {
    const layer = this.particleLayer()?.nativeElement;
    if (!layer) return;
    if (this.pool?.layer !== layer) {
      this.pool?.clear();
      this.pool = new ParticlePool(layer);
      if (!this.visible) this.pool.pause();
      this.traffic = null;
    }
    const dots = this.layout().dots;
    if (this.traffic?.dots !== dots) this.traffic = { flow: new CacheTraffic(this.pool, dots), dots, from: elapsed };
    const live = this.live();
    this.traffic.flow.sendUntil(elapsed - this.traffic.from, {
      hit: live.hitRate / 100,
      timedOut: live.timedOutPerSec / CACHE_QPS,
      originMs: this.originMs(),
    });
  }
}
