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
  LB_LOADS,
  LB_POLICIES,
  LB_SERVER_SNAPS,
  LB_SERVICE_MS,
  LB_SLOWDOWNS,
  formatDuration,
  formatPct,
  formatQps,
  goalBounds,
  lbSweep,
  type BalanceRun,
  type Balancer,
  type ExperimentSpec,
  type SdExperiment,
} from '@grasp/engine';
import { motionAllowed } from '../../core/motion';
import { SimClient, SimSuperseded } from '../../sim/sim-client';
import { HandleComponent } from '../../viz/kit/handle.component';
import { watchMotion, watchVisibility } from '../../viz/kit/particles';
import { StageComponent } from '../../viz/kit/stage.component';
import { BalancerChartsComponent, POLICY_LABELS } from './balancer-charts.component';
import { balancerLayout, blockCap, perBlock } from './balancer-layout';
import { ExperimentDockComponent } from './experiment-dock.component';
import { ExperimentSession } from './experiment-session';
import { FleetPainter, fleetColors } from './fleet-painter';
import { queuesAt, type FleetLane, type FleetUpdate, type Pt } from './fleet-scene';
import { FocusBoxComponent } from './focus-box.component';
import { FrameQueue } from './frame-queue';
import { WidgetPlay, bringStageIntoView } from './widget-play';

const SAMPLES = 61;
const LAST = SAMPLES - 1;
const REPLAY_MS = 12_000;
const EXPERIMENT_PLAY_MS = 2_000;
const PICK_MS = 900;
/** The share bar's fixed scale: as much as a normal server of 4 can keep up with at 50% load. */
const SHARE_MAX = 50;
const FAILED = 'The simulation stopped. Reload the page to run it again.';

const KEEP_WORDS: Record<string, (v: number) => string> = {
  slowdown: (v) => `S1 ${v}× slower`,
  servers: (v) => `${v} servers`,
  load: (v) => `${v}% load`,
};

/** One formatter for every count: `toLocaleString` with a locale builds a new one on each call. */
const GROUPED = new Intl.NumberFormat('en-US');
const count = (n: number) => GROUPED.format(Math.round(n));
const serverName = (s: number) => `S${s + 1}`;

/**
 * Load Balancing (REDESIGN.md 4.7): clients send requests through a balancer to a fleet of 4, 10 or 20 servers, one of
 * them slow. Each server is a lane whose queue grows from the engine's `balanceRun`, replayed on a time handle; the load,
 * the fleet size and the slow server's speed are handles on the picture, and the policy sits right under it. The lanes,
 * their blocks and the request dots are painted on a canvas under the labels, in a worker where the browser allows
 * (`FleetPainter`), so a settings change costs the page's main thread little. The charts (`app-balancer-charts`) follow
 * a change a frame or two later, one per frame. Runs come from the simulation worker; p99 against load is a table
 * (`LB_SWEEPS`). Experiment cards set it up, ask, play and reveal the model's numbers.
 */
@Component({
  selector: 'app-balancer-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, HandleComponent, BalancerChartsComponent, ExperimentDockComponent, FocusBoxComponent],
  templateUrl: './balancer-widget.component.html',
  styleUrl: './balancer-widget.component.scss',
})
export class BalancerWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  private readonly rendered = signal<readonly SdExperiment[] | null>(null);
  /** The cards show at once from the specs' titles; the worker renders the questions when a card is first opened. */
  readonly experiments = computed(
    (): readonly SdExperiment[] =>
      this.rendered() ??
      this.experimentSpecs().map((e) => ({
        id: e.id,
        title: e.title,
        setup: e.setup,
        act: e.act,
        ask: '',
        choices: [],
        answer: -1,
        reveal: '',
        focus: e.focus,
        hide: e.hide ?? [],
        goal: e.goal,
      })),
  );

  readonly policyOptions = LB_POLICIES.map((p) => ({ value: p, label: POLICY_LABELS[p] }));
  readonly policyLabels = POLICY_LABELS;
  readonly serverSnaps = LB_SERVER_SNAPS;
  readonly slowSnaps = LB_SLOWDOWNS;
  readonly loads = LB_LOADS;
  readonly formatPct = formatPct;
  readonly formatQps = formatQps;
  readonly count = count;
  readonly failedText = FAILED;

  readonly policy = signal<Balancer>('round-robin');
  readonly servers = signal(10);
  readonly load = signal(70);
  readonly slowdown = signal(1);
  /** Where the replay is, as a fractional sample index: the end of the run unless a replay or the time handle says otherwise. */
  readonly t = signal(LAST);
  readonly motion = signal(false);
  private readonly visible = signal(true);
  private readonly message = signal('');
  /** The worker failed: the picture keeps its last run, and the page says how to get a working one back. */
  readonly broken = signal(false);
  readonly notice = computed(() => (this.broken() ? FAILED : this.message()));
  /** The mid-run dispatch "Watch it choose" is showing, or null. */
  readonly pick = signal<number | null>(null);

  readonly fleetStage = viewChild.required('fleet', { read: StageComponent });
  private readonly fleetEl = viewChild.required('fleet', { read: ElementRef });
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly sim = inject(SimClient);
  private readonly injector = inject(Injector);
  readonly ready = computed(() => this.fleetStage().width() > 0);
  private readonly player = new WidgetPlay(() => this.motion() && this.ready());
  readonly playing = this.player.playing;
  readonly exp = new ExperimentSession({
    apply: (s) => this.applySettings(s),
    settings: () => this.settingsNow(),
    metrics: () => this.metrics(),
    current: () => this.current(),
    play: (e, done) => this.playAnswer(e, done),
    stage: () => this.fleetEl().nativeElement,
    root: this.host,
    motion: () => this.motion(),
  });
  readonly locked = this.exp.locked;
  private pickClock: ReturnType<typeof setInterval> | null = null;
  private painter: FleetPainter | null = null;
  private readonly frames = new FrameQueue();

  readonly layout = computed(() => balancerLayout(Math.max(256, this.fleetStage().width())));

  readonly settings = computed(() => ({ servers: this.servers(), load: this.load() / 100, slowdown: this.slowdown() }));
  private readonly runKey = computed(() => JSON.stringify([this.policy(), this.settings()]));
  /** The run for the current settings, or the last one while the worker answers. */
  readonly run = signal<BalanceRun | null>(null);
  private readonly runFor = signal('');
  readonly current = computed(() => this.runFor() === this.runKey());
  /** p99 against load for this fleet, every policy: a table, not a run, so changing the fleet costs no simulation. */
  readonly sweep = computed(() => lbSweep(this.servers(), this.slowdown()));
  /**
   * What the charts show: the run (with the previous one as a ghost), the sweep and the policy follow the fleet a frame
   * or more later, each chart in a frame of its own (`FrameQueue`), so a phone never draws a whole change at once.
   */
  readonly chartRun = signal<BalanceRun | null>(null);
  readonly ghost = signal<readonly number[] | null>(null);
  readonly chartSweep = signal<Readonly<Record<Balancer, readonly number[]>> | null>(null);
  readonly chartPolicy = signal<Balancer>('round-robin');
  readonly chartLoadText = signal('');

  readonly slowIndex = computed(() => Math.max(0, (LB_SLOWDOWNS as readonly number[]).indexOf(this.slowdown())));
  readonly slowBoxX = computed(() => this.layout().slowPositions[this.slowIndex()]);
  readonly isSlow = computed(() => this.slowdown() > 1);
  /** Each lane as the canvas draws it: the slow server's queue stops at its bigger box. */
  readonly lanes = computed((): FleetLane[] =>
    this.layout()
      .lanes(this.servers())
      .map((lane, i) => {
        const own = i === 0 ? { ...lane, x1: this.slowBoxX() - 4, boxX: this.slowBoxX() } : { ...lane, boxX: lane.serverX };
        return { ...own, cap: blockCap(own), name: lane.height >= 14 ? serverName(i) : '' };
      }),
  );
  readonly links = computed(() => this.layout().links(this.servers()));
  /** Requests one block stands for in this run, so its longest queue fits the slow server's lane. */
  readonly blockSize = computed(() => perBlock(this.run()?.maxQueue ?? 0, this.lanes()[0].cap));
  readonly keyY = computed(() => this.layout().rackHandles[(LB_SERVER_SNAPS as readonly number[]).indexOf(this.servers())] ?? 0);

  readonly choice = computed(() => {
    const i = this.pick();
    return i === null ? null : (this.run()?.choices?.[i] ?? null);
  });
  readonly sample = computed(() => Math.round(Math.min(LAST, Math.max(0, this.t()))));
  private readonly queueSamples = computed(() => {
    const series = this.run()?.series;
    return series?.[0].queues.length === this.servers() ? series.map((s) => s.queues) : null;
  });
  /** Requests in flight on each server at the time handle's sample, or at the dispatch "Watch it choose" shows. */
  readonly queues = computed((): readonly number[] => {
    const choice = this.choice();
    if (choice) return choice.inFlight;
    const samples = this.queueSamples();
    return samples ? queuesAt(samples, this.sample()) : Array(this.servers()).fill(0);
  });
  readonly slowQueue = computed(() => this.queues()[0] ?? 0);
  /** While "Watch it choose" runs: the lanes the policy looked at, the one it chose, and their counts where they fit. */
  readonly pickMarks = computed(() => {
    const c = this.choice();
    if (!c) return [];
    return this.lanes().flatMap((lane, i) =>
      c.looked.includes(i) || c.server === i
        ? [
            {
              top: lane.y - lane.height / 2,
              y: lane.y,
              height: lane.height,
              chosen: c.server === i,
              count: i > 0 && lane.height >= 14 ? count(c.inFlight[i]) : '',
            },
          ]
        : [],
    );
  });

  readonly arrivals = computed(() => {
    const capacity = (this.servers() - 1) / LB_SERVICE_MS + 1 / (LB_SERVICE_MS * this.slowdown());
    return capacity * 1_000 * (this.load() / 100);
  });
  readonly partial = computed(() => this.sample() < LAST);
  /** p99 and the mean of the requests answered by the replay's moment, or of every request at its end. */
  readonly readout = computed(() => {
    const run = this.run();
    if (!run) return null;
    const sofar = this.partial() ? run.answered?.[this.sample()] : null;
    return sofar ? { p99Ms: sofar.p99Ms, meanMs: sofar.meanMs } : { p99Ms: run.p99Ms, meanMs: run.meanMs };
  });
  readonly p99 = computed(() => {
    const p99 = this.readout()?.p99Ms;
    if (p99 === undefined) return this.broken() ? 'unavailable' : '';
    return p99 === null ? 'none yet' : formatDuration(p99);
  });
  readonly mean = computed(() => {
    const mean = this.readout()?.meanMs;
    return mean === undefined ? '' : mean === null ? 'none yet' : formatDuration(mean);
  });
  /** A tail longer than the run: its slowest requests waited out the queue that was left when arrivals stopped. */
  readonly drains = computed(() => !this.partial() && !!this.run() && this.run()!.p99Ms > this.run()!.durationMs);
  readonly p99Label = computed(() => (this.partial() ? 'p99 so far' : this.drains() ? 'p99, run and drain' : 'p99'));
  readonly meanLabel = computed(() => (this.partial() ? 'mean so far' : 'mean'));
  readonly p99Bad = computed(() => (this.readout()?.p99Ms ?? 0) >= 1_000);
  readonly sentPct = computed(() => (this.run()?.slowShare ?? 0) * 100);
  /** The share of requests S1 can keep up with at this load: its share of the fleet's capacity over the load. */
  readonly keepPct = computed(() => ((this.run()?.slowCapacityShare ?? 0) * 100) / (this.load() / 100));
  readonly overfed = computed(() => this.sentPct() > this.keepPct());
  readonly shareMax = SHARE_MAX;
  readonly shareX = (pct: number) => {
    const s = this.layout().share;
    return s.x0 + (Math.min(pct, SHARE_MAX) / SHARE_MAX) * (s.x1 - s.x0);
  };

  readonly sampleValues = Array.from({ length: SAMPLES }, (_, i) => i);
  readonly scrubPositions = computed(() => {
    const s = this.layout().scrub;
    return this.sampleValues.map((i) => s.x0 + ((s.x1 - s.x0) * i) / LAST);
  });
  readonly runSeconds = computed(() => Math.round((this.run()?.durationMs ?? 0) / 1_000));
  readonly timeText = computed(() => {
    const at = Math.round(((this.run()?.durationMs ?? 0) * this.sample()) / LAST / 1_000);
    return `${at} s of the ${this.runSeconds()} s run: S1 has ${count(this.slowQueue())} in flight`;
  });
  /** The replay's sample for the charts, or null at the run's end. */
  readonly chartSample = computed(() => (this.partial() ? this.sample() : null));

  readonly flowSummary = computed(() => {
    const slow = this.isSlow() ? `, one of them (S1) ${this.slowdown()} times slower` : '';
    const drain = this.drains() ? `, past the ${this.runSeconds()} s run as its queue drains` : '';
    const tail = this.run()
      ? ` ${this.p99Label()} ${this.p99()}${drain}, ${this.meanLabel()} ${this.mean()}; S1 is sent ${formatPct(this.sentPct())} of requests and can keep up with ${formatPct(
          this.keepPct(),
        )}, and has ${count(this.slowQueue())} in flight.`
      : '';
    return `${formatQps(this.arrivals())} from clients at ${this.load()}% load through ${POLICY_LABELS[
      this.policy()
    ].toLowerCase()} to ${this.servers()} servers${slow}.${tail}`;
  });
  readonly loadText = computed(() => `${this.load()}% of what the fleet can answer, ${formatQps(this.arrivals())}`);
  readonly slowText = computed(() =>
    this.isSlow() ? `S1 is ${this.slowdown()} times slower than the others` : 'S1 is as fast as the others',
  );
  readonly slowHeader = computed(() => (this.isSlow() ? `S1 is ${this.slowdown()}× slower` : 'S1 at full speed'));
  readonly serversText = computed(() => `${this.servers()} servers`);

  readonly metrics = computed((): Record<string, number> => ({ p99Ms: this.run()?.p99Ms ?? Infinity }));
  readonly settingsNow = computed((): Record<string, number> => ({
    policy: LB_POLICIES.indexOf(this.policy()),
    servers: this.servers(),
    load: this.load(),
    slowdown: this.slowdown(),
  }));
  readonly goalStatus = computed(() => {
    const goal = this.exp.active()?.goal;
    const run = this.run();
    if (!goal || !run) return '';
    const [bound] = goalBounds(goal);
    const now = `p99 ${formatDuration(run.p99Ms)}`;
    const met = this.exp.metWith();
    if (this.exp.phase() === 'revealed' && met)
      return this.exp.kept() && run.p99Ms < bound.below
        ? `Goal met: ${now}, under ${formatDuration(bound.below)}.`
        : `You met it at p99 ${formatDuration(met.metrics['p99Ms'])}; now ${now}.`;
    if (this.exp.kept()) return `Now ${now}; the goal is under ${formatDuration(bound.below)}.`;
    const keep = Object.entries(goal.keep ?? {}).map(([k, v]) => KEEP_WORDS[k]?.(v) ?? `${k} ${v}`);
    return `Now ${now}, but the goal keeps ${keep.slice(0, -1).join(', ')}${keep.length > 1 ? ' and ' : ''}${keep.at(-1)}.`;
  });

  readonly pickCaption = computed(() => {
    const c = this.choice();
    if (!c) return '';
    const inFlight = (s: number) => `${serverName(s)} (${count(c.inFlight[s])} in flight)`;
    const n = `Request ${this.pick()! + 1} of ${this.run()?.choices?.length ?? 0}`;
    switch (this.policy()) {
      case 'round-robin':
        return `${n}: it is ${serverName(c.server)}'s turn (${count(c.inFlight[c.server])} in flight), however long its queue.`;
      case 'random':
        return `${n}: ${inFlight(c.server)}, picked at random.`;
      case 'least-connections': {
        const fewest = Math.min(...c.inFlight);
        const tied = c.inFlight.filter((q) => q === fewest).length;
        return tied > 1
          ? `${n}: scans all ${this.servers()}; ${tied} have the fewest (${count(fewest)} in flight), and ${serverName(c.server)} is next in turn among them.`
          : `${n}: scans all ${this.servers()}, and ${inFlight(c.server)} has the fewest.`;
      }
      default:
        return `${n}: picks ${inFlight(c.looked[0])} and ${inFlight(c.looked[1])} at random, and sends it to ${serverName(c.server)}.`;
    }
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const stopMotion = watchMotion(motionAllowed, (allowed) => this.motion.set(allowed));
      const stopVisibility = watchVisibility(this.fleetEl().nativeElement, (visible) => {
        this.visible.set(visible);
        this.player.setVisible(visible);
      });
      // A theme switch changes the canvas's colours, which no signal here follows.
      const theme = new MutationObserver(() => this.painter?.update({ colors: fleetColors(this.host) }));
      theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      destroyRef.onDestroy(() => {
        theme.disconnect();
        stopMotion();
        stopVisibility();
        this.player.stop(false);
        this.stopPicks();
        this.frames.stop();
        this.painter?.destroy();
      });
    });
    effect(() => {
      const key = this.runKey();
      void this.sim.run({ kind: 'balance', policy: this.policy(), settings: this.settings(), samples: SAMPLES }).then((run) => {
        if (key !== untracked(this.runKey)) return;
        this.run.set(run);
        this.runFor.set(key);
      }, this.failed);
    });
    effect(() => {
      const run = this.run();
      this.frames.run('histogram', () => {
        const before = this.chartRun();
        if (before?.histogram && run && before !== run) this.ghost.set(before.histogram);
        this.chartRun.set(run);
      });
    });
    effect(() => {
      const [sweep, policy, loadText] = [this.sweep(), this.policy(), this.loadText()];
      this.frames.run('p99', () => {
        this.chartSweep.set(sweep);
        this.chartPolicy.set(policy);
        this.chartLoadText.set(loadText);
      });
    });
    this.sendToCanvas();
  }

  setPolicy(p: Balancer) {
    if (this.locked() || p === this.policy()) return;
    this.afterInput(() => {
      this.policy.set(p);
      // Measured after the change renders, so the change does not lay the page out a second time.
      afterNextRender({ read: () => bringStageIntoView(this.fleetEl().nativeElement) }, { injector: this.injector });
      this.settleAfterChange();
    });
  }

  setLoad(v: number) {
    this.afterInput(() => {
      this.load.set(v);
      this.settleAfterChange();
    });
  }

  setServers(v: number) {
    this.afterInput(() => {
      this.servers.set(v);
      this.settleAfterChange();
    });
  }

  setSlowdown(v: number) {
    this.afterInput(() => {
      this.slowdown.set(v);
      this.settleAfterChange();
    });
  }

  setTime(i: number) {
    this.afterInput(() => {
      this.player.stop();
      this.stopPicks();
      this.message.set('');
      this.exp.clearFocus();
      this.t.set(i);
    });
  }

  replay() {
    bringStageIntoView(this.fleetEl().nativeElement);
    this.stopPicks();
    this.exp.clearFocus();
    // Stop the old play first: its end would otherwise settle the picture after this reset.
    this.player.stop();
    this.t.set(0);
    this.player.play(
      REPLAY_MS,
      (p) => this.playTo(p * LAST),
      () => undefined,
      () => this.t.set(LAST),
    );
    this.message.set(this.motion() ? '' : 'Back at the start: drag the time handle under the fleet to watch the queues grow.');
  }

  /** Steps through a dozen dispatches across the run's second half: on its own with motion, one per press without. */
  watchPicks() {
    const choices = this.run()?.choices ?? [];
    if (!choices.length || this.pickClock) return this.stopPicks();
    this.player.stop();
    this.exp.clearFocus();
    const next = this.pick() === null ? 0 : this.pick()! + 1;
    if (next >= choices.length) return this.stopPicks();
    bringStageIntoView(this.fleetEl().nativeElement);
    this.showPick(next);
    if (!this.motion()) return;
    this.pickClock = setInterval(() => {
      if (!this.visible()) return;
      const i = (this.pick() ?? -1) + 1;
      if (i >= (this.run()?.choices?.length ?? 0)) this.stopPicks();
      else this.showPick(i);
    }, PICK_MS);
  }

  start(e: SdExperiment) {
    const rendered = this.rendered()?.find((r) => r.id === e.id);
    if (!rendered) {
      this.sim.run({ kind: 'lb-experiments' }).then((list) => {
        this.rendered.set(list);
        if (list.some((r) => r.id === e.id)) this.start(e);
      }, this.failed);
      return;
    }
    this.player.stop(false);
    this.stopPicks();
    this.message.set('');
    this.t.set(LAST);
    this.exp.start(rendered);
  }

  private readonly failed = (error: unknown) => {
    if (!(error instanceof SimSuperseded)) this.broken.set(true);
  };

  /** The answer's run plays from its start, once the worker has it. */
  private playAnswer(e: SdExperiment, done: () => void) {
    this.stopPicks();
    const key = this.runKey();
    this.sim.run({ kind: 'balance', policy: this.policy(), settings: this.settings(), samples: SAMPLES }).then(
      () => {
        if (key !== this.runKey() || this.exp.active() !== e) return done();
        this.t.set(0);
        this.player.play(
          EXPERIMENT_PLAY_MS,
          (p) => this.playTo(p * LAST),
          () => {
            this.t.set(LAST);
            done();
          },
        );
      },
      (error) => {
        this.failed(error);
        done();
      },
    );
  }

  /**
   * The canvas gets its state piece by piece, each when it changes: the replay's position every frame it moves, the
   * fleet's shape on a settings change, the run when it comes in. None of it re-renders anything on the page.
   */
  private sendToCanvas() {
    const send = <T>(read: () => T, update: (value: T) => FleetUpdate) =>
      effect(() => {
        const value = read();
        if (this.canvasRef()) untracked(() => this.paint(update(value)));
      });
    send(
      () => [this.layout().canvas, this.lanes(), this.links()] as const,
      ([box, lanes, links]) => ({ box, lanes, links: links as Pt[][] }),
    );
    send(
      () => this.queueSamples(),
      (queues) => ({ queues }),
    );
    send(
      () => this.run()?.picks ?? null,
      (picks) => ({ picks }),
    );
    send(
      () => this.t(),
      (t) => ({ t }),
    );
    send(
      () => this.choice()?.inFlight ?? null,
      (override) => ({ override }),
    );
    send(
      () => [this.blockSize(), this.isSlow(), this.isSlow() && this.overfed()] as const,
      ([size, slow, bad]) => ({ perBlock: size, slow, bad }),
    );
    send(
      () => this.motion() && this.visible(),
      (flow) => ({ flow }),
    );
  }

  /** Creates the painter, with the theme and the screen's density, before its first state; then passes each change on. */
  private paint(update: FleetUpdate) {
    const canvas = this.canvasRef()!.nativeElement;
    if (!this.painter) {
      canvas.dataset['dots'] = '0';
      this.painter = new FleetPainter(canvas, (dots) => (canvas.dataset['dots'] = String(dots)));
      this.painter.update({ dpr: Math.min(2, window.devicePixelRatio || 1), colors: fleetColors(this.host) });
    }
    this.painter.update(update);
  }

  /**
   * A play's frame: the canvas moves every frame, straight from the play's clock; the page's numbers, which change per
   * sample, only when the sample does, so a replay checks the page a few times a second rather than every frame.
   */
  private playTo(t: number) {
    this.painter?.update({ t });
    if (Math.round(t) !== this.sample()) this.t.set(t);
  }

  /**
   * Applies a learner's change a task after its input event. Input reaches the page just before a frame draws, so the
   * check of everything the change touches would run inside that frame's task, next to its layout and paint; a task
   * later, it runs on its own and the frame after draws it, so neither task is long on a slow phone.
   */
  private afterInput(apply: () => void) {
    setTimeout(apply);
  }

  private showPick(i: number) {
    this.pick.set(i);
    this.message.set(this.pickCaption());
  }

  private stopPicks() {
    if (this.pickClock) clearInterval(this.pickClock);
    this.pickClock = null;
    if (this.pick() === null) return;
    this.pick.set(null);
    this.message.set('');
  }

  /** A setting changed: with no play running, the picture shows the new run's end. */
  private settleAfterChange() {
    this.message.set('');
    this.stopPicks();
    this.exp.clearFocus();
    if (!this.playing()) this.t.set(LAST);
  }

  private applySettings(s: Readonly<Record<string, number>>) {
    if (s['policy'] !== undefined) this.policy.set(LB_POLICIES[s['policy']]);
    if (s['servers'] !== undefined) this.servers.set(s['servers']);
    if (s['load'] !== undefined) this.load.set(s['load']);
    if (s['slowdown'] !== undefined) this.slowdown.set(s['slowdown']);
  }
}
