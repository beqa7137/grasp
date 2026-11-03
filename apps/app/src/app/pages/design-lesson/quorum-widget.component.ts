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
  QUORUM_BASELINE,
  QUORUM_SIZES,
  QUORUM_STALL_MS,
  QUORUM_STATE_KEYS,
  REPLICA_STATES,
  REPLICA_STATE_NAMES,
  formatMs,
  quorumAt,
  quorumLevelName,
  quorumOf,
  renderExperiment,
  stalledIndex,
  type ExperimentSpec,
  type QuorumSettings,
  type SdExperiment,
} from '@grasp/engine';
import { motionAllowed } from '../../core/motion';
import { DataTableComponent } from '../../viz/kit/data-table.component';
import { HandleComponent } from '../../viz/kit/handle.component';
import { ParticlePool, watchMotion, watchVisibility } from '../../viz/kit/particles';
import { StageComponent } from '../../viz/kit/stage.component';
import { ExperimentDockComponent } from './experiment-dock.component';
import { ExperimentSession } from './experiment-session';
import { FocusBoxComponent } from './focus-box.component';
import { focusOutlines, type Prim } from './quorum-draw';
import { LEAVE_MS, changes, playLength, shows, timeline, trips, type Run, type Timeline } from './quorum-motion';
import { WIDE_FROM, buildStage } from './quorum-stage';
import { tw } from './quorum-text';
import {
  DESCRIBE_HEAD,
  DESCRIBE_HEAD_COMPACT,
  NEXT,
  NEXT_PHRASE,
  cardName,
  describeRows,
  goalParts,
  handleText,
  hiding,
  outcomeNotice,
  pillOf,
} from './quorum-words';
import { WidgetPlay, bringStageIntoView } from './widget-play';

type Setting = keyof QuorumSettings;
type Verb = 'Enter' | 'Tap' | 'Click';
/** An answer with nothing of its own to play holds this long, so the dock reads as watching the picture. */
const HOLD_MS = 1_500;
const HINT_H = 22;

/** A level as a handle names it: ONE, QUORUM, ALL, or its count. */
const levelOf = (k: number, n: number) => quorumLevelName(k, n) ?? String(k);
/** W or R carried to the other N by its level: ONE, QUORUM and ALL stay themselves, a count stays as near as it can. */
const carry = (k: number, from: number, to: number) =>
  k === 1 ? 1 : k === from ? to : k === quorumOf(from) ? quorumOf(to) : Math.min(k, to);

/**
 * Consistency & Quorums (REDESIGN.md 5.2, R41): one write of v8, then one read, drawn as replicas in three data
 * centers, the overlap of the read set with the write set, and each request's latency. Every number comes from the
 * engine's `quorumScenario`; the drawing is `buildStage`'s, and a play brings its marks in on a log clock. Experiment
 * cards set it up, ask, play the answer and reveal the model's numbers, hiding until then what would give it away.
 */
@Component({
  selector: 'app-quorum-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, HandleComponent, DataTableComponent, FocusBoxComponent, ExperimentDockComponent],
  templateUrl: './quorum-widget.component.html',
  styleUrl: './quorum-widget.component.scss',
})
export class QuorumWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));
  readonly sizes = QUORUM_SIZES;
  readonly stallMs = formatMs(QUORUM_STALL_MS);

  readonly n = signal<number>(QUORUM_BASELINE.n);
  readonly w = signal<number>(QUORUM_BASELINE.w);
  readonly r = signal<number>(QUORUM_BASELINE.r);
  readonly states = signal<readonly number[]>(QUORUM_STATE_KEYS.map(() => 0));
  readonly stall = signal<number>(QUORUM_BASELINE.stall);
  readonly sloppy = signal<number>(QUORUM_BASELINE.sloppy);
  readonly settings = computed((): QuorumSettings => {
    const s = this.states();
    return {
      n: this.n(),
      w: this.w(),
      r: this.r(),
      s1: s[0],
      s2: s[1],
      s3: s[2],
      s4: s[3],
      s5: s[4],
      stall: this.stall(),
      sloppy: this.sloppy(),
    };
  });
  readonly model = computed(() => quorumAt(this.settings()));
  readonly levels = computed(() => Array.from({ length: this.n() }, (_, i) => i + 1));
  readonly stallName = computed(() => `R${stalledIndex(this.n()) + 1} pauses`);

  readonly motion = signal(false);
  readonly describe = signal(false);
  readonly notice = signal('Tap a replica to change its state; drag W and R on the drawing.');
  /** The card whose next state the hint names, and the input that asked: a key, a tap or a hover. */
  readonly hint = signal<{ i: number; verb: Verb } | null>(null);
  /** The card that holds the toolbar's one Tab stop. */
  readonly rove = signal(0);
  /** Screen ms into a running play; null at rest, where the stage shows its end state. */
  readonly tau = signal<number | null>(null);
  private clock: Timeline = () => 0;
  /** Whether the toolbar was last moved by a key, which makes the next focus a keyboard's even where `:focus-visible` is not reported. */
  private keyed = false;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly stageRef = viewChild.required(StageComponent);
  private readonly stageEl = viewChild.required(StageComponent, { read: ElementRef });
  private readonly dotLayer = viewChild<ElementRef<SVGGElement>>('dots');
  private pool: ParticlePool | null = null;
  private visible = true;
  readonly ready = computed(() => this.stageRef().width() > 0);
  private readonly player = new WidgetPlay(() => this.motion() && this.ready());
  readonly playing = this.player.playing;

  readonly exp: ExperimentSession = new ExperimentSession({
    apply: (s) => this.applySettings(s),
    settings: () => ({ ...this.settings() }),
    metrics: () => this.model().metrics,
    play: (e, done) => this.playAnswer(e, done),
    stage: (): HTMLElement => this.stageEl().nativeElement,
    root: this.host,
    motion: () => this.motion(),
  });
  /** A question (not the challenge) is open and unanswered: Play and the settings it is about wait. */
  readonly asking = computed(() => {
    const e = this.exp.active();
    return !!e && !e.goal && this.exp.phase() === 'asking';
  });
  /** Any question open, the challenge included: Describe would answer it, so it waits. */
  readonly askingAny = computed(() => !!this.exp.active() && this.exp.phase() === 'asking');
  readonly locked = computed(() => this.exp.locked() || this.asking());
  /**
   * What the open question hides: all of it while it asks, and through the answer's own play all but the read itself,
   * which that play is about; everything shows at the reveal.
   */
  readonly hidden = computed((): readonly string[] => {
    const e = this.exp.active();
    if (!e || e.goal || this.exp.phase() === 'revealed') return [];
    return this.exp.phase() === 'playing' ? e.hide.filter((h) => h !== 'read') : e.hide;
  });
  readonly hid = computed(() => hiding(this.hidden()));

  readonly width = computed(() => Math.max(248, this.stageRef().width()));
  readonly wide = computed(() => this.width() >= WIDE_FROM);
  readonly stage = computed(() =>
    buildStage(this.width(), this.model(), {
      hide: this.hidden(),
      hint: this.locked() ? null : (this.hint()?.i ?? null),
      reduced: !this.motion(),
    }),
  );
  readonly focus = computed(() => {
    const st = this.stage();
    return focusOutlines(st.D, this.exp.active()?.focus ?? [], st.H);
  });
  private readonly prims = computed(() => {
    this.focus();
    return this.stage().D.prims();
  });
  /** The marks to draw now, each with the classes that land or retire it in a play. */
  readonly shown = computed(() => {
    const tau = this.tau();
    const T = this.clock;
    return this.prims()
      .filter((p) => shows(p, T, tau))
      .map((p) => {
        if (tau === null) return p;
        const land = !!p.at && T(p.at) > 0;
        const leave = !!p.until && tau >= T(p.until) - LEAVE_MS;
        return land || leave ? ({ ...p, cls: `${p.cls}${land ? ' land' : ''}${leave ? ' leave' : ''}` } as Prim) : p;
      });
  });

  readonly cardNames = computed(() => this.model().replicas.map((_, i) => cardName(this.model(), i, this.locked())));
  readonly wText = computed(() => {
    const m = this.model();
    return handleText(m.settings.w, m.settings.n, m.survives.write, m.avail.write, 'writes', this.hid());
  });
  readonly rText = computed(() => {
    const m = this.model();
    return handleText(m.settings.r, m.settings.n, m.survives.read, m.avail.read, 'reads', this.hid());
  });
  readonly playName = computed(() =>
    this.asking() ? 'Play the write, then the read, after your answer' : 'Play the write, then the read',
  );
  /** The hint over a card: what activating it does next, above the card where it covers no text, else below. */
  readonly hintBox = computed(() => {
    const h = this.hint();
    const card = h ? this.stage().cards[h.i] : null;
    if (!h || !card || this.locked()) return null;
    const rep = this.model().replicas[h.i];
    const text = `${h.verb}: ${NEXT_PHRASE[NEXT[rep.state]].replace('it', rep.name)}`;
    const width = tw(text, 'small') + 16;
    const left = Math.max(4, Math.min(this.width() - width - 4, card.x + card.w / 2 - width / 2));
    const above = card.y - HINT_H - 26;
    const covers = (top: number) =>
      this.stage().D.texts.some((t) => !(t.x1 <= left || t.x0 >= left + width || t.y1 <= top || t.y0 >= top + HINT_H));
    return { text, left, top: covers(above) ? card.y + card.h + 26 : above };
  });

  readonly compact = computed(() => !this.wide());
  readonly describeHead = computed(() => (this.compact() ? DESCRIBE_HEAD_COMPACT : DESCRIBE_HEAD));
  readonly describeRows = computed(() => describeRows(this.model(), this.compact()));
  readonly goalStatus = computed(() => {
    if (!this.exp.active()?.goal) return '';
    const status = goalParts(this.model())
      .map((p) => p.text)
      .join(' · ');
    if (this.exp.phase() === 'revealed') return this.exp.kept() ? `Goal met: ${status}` : `You met it; now: ${status}`;
    if (this.exp.kept()) return status;
    return `${status}. The goal keeps the middle replica pausing, the sloppy quorum off and every replica up.`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const stopMotion = watchMotion(motionAllowed, (allowed) => this.motion.set(allowed));
      // The widget host, not one stage: on a phone the stage scrolls away while the dock under it is read.
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

  setN(k: number) {
    if (this.locked() || k === this.n()) return;
    const from = this.n();
    this.settle();
    this.n.set(k);
    this.w.set(carry(this.w(), from, k));
    this.r.set(carry(this.r(), from, k));
    this.states.update((s) => s.map((v, i) => (i < k ? v : 0)));
    this.rove.set(Math.min(this.rove(), k - 1));
    this.said(`${k} replicas, W ${levelOf(this.w(), k)}, R ${levelOf(this.r(), k)}`);
  }

  setW(k: number) {
    if (this.locked() || k === this.w()) return;
    this.settle();
    this.w.set(k);
    this.said(`W ${levelOf(k, this.n())}`);
  }

  setR(k: number) {
    if (this.locked() || k === this.r()) return;
    this.settle();
    this.r.set(k);
    this.said(`R ${levelOf(k, this.n())}`);
  }

  setStall(on: boolean) {
    if (this.locked()) return;
    this.settle();
    this.stall.set(on ? 1 : 0);
    this.said(on ? `${this.stallName()} for ${this.stallMs}` : 'No pause');
  }

  setSloppy(on: boolean) {
    if (this.locked()) return;
    this.settle();
    this.sloppy.set(on ? 1 : 0);
    this.said(on ? 'Sloppy quorum, stand-ins H1 and H2' : 'Strict quorum');
  }

  /** A card's activation moves its replica to the next state: up, down, stops mid-write, back, up. */
  cycle(i: number) {
    this.rove.set(i);
    if (this.locked()) return;
    this.settle();
    this.states.update((s) => s.map((v, j) => (j === i ? (v + 1) % REPLICA_STATES.length : v)));
    const rep = this.model().replicas[i];
    this.said(`${rep.name} ${REPLICA_STATE_NAMES[rep.state]}`);
  }

  /** Arrow keys, Home and End move the toolbar's Tab stop. */
  cardKey(event: KeyboardEvent, i: number) {
    const last = this.n() - 1;
    const to = ({ ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: last } as Record<string, number>)[
      event.key
    ];
    this.keyed = true;
    if (to === undefined) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(last, to));
    this.rove.set(next);
    this.host.querySelectorAll<HTMLElement>('.card-hit')[next]?.focus();
  }

  cardFocus(i: number, event: FocusEvent) {
    this.rove.set(i);
    let visible = true;
    try {
      visible = (event.target as HTMLElement).matches(':focus-visible');
    } catch {
      visible = true;
    }
    if (this.keyed || visible) this.hint.set({ i, verb: 'Enter' });
  }

  cardPointer(i: number, event: PointerEvent, phase: 'enter' | 'up' | 'leave') {
    this.keyed = false;
    if (phase === 'leave') {
      if (this.hint()?.verb === 'Click') this.hint.set(null);
      return;
    }
    if (event.pointerType === 'mouse' && phase === 'enter') this.hint.set({ i, verb: 'Click' });
    // iOS does not focus a tapped button, so the hint and the next pip's ring show after a tap instead.
    if (event.pointerType !== 'mouse' && phase === 'up') this.hint.set({ i, verb: 'Tap' });
  }

  cardBlur() {
    if (this.hint()?.verb === 'Enter') this.hint.set(null);
  }

  /** Play the write, then the read; without motion the end state is the stage, and the notice says it in order. */
  play(done: () => void = () => undefined, run: Run = 'write-read') {
    this.exp.clearFocus();
    this.player.stop();
    this.pool?.clear();
    const m = this.model();
    if (!this.motion() || !this.ready()) {
      this.notice.set(outcomeNotice(m, this.hid()));
      return done();
    }
    bringStageIntoView(this.stageEl().nativeElement);
    const T = timeline(m, run);
    const prims = this.prims();
    const tripList = trips(m, this.stage(), T, run).sort((a, b) => a.start - b.start);
    const times = changes(prims, T);
    const length = playLength(prims, tripList, T);
    this.clock = T;
    this.notice.set('');
    this.tau.set(0);
    let emitted = 0;
    let reached = -1;
    this.player.play(
      length,
      (p) => {
        const now = p * length;
        let k = reached;
        while (k + 1 < times.length && times[k + 1] <= now) k++;
        if (k !== reached) {
          reached = k;
          this.tau.set(times[k]);
        }
        while (emitted < tripList.length && tripList[emitted].start <= now) {
          const t = tripList[emitted++];
          this.dots()?.emit(t.path, t.tone, t.duration, { breaks: t.breaks, radius: 3.5 });
        }
      },
      () => {
        this.tau.set(null);
        done();
      },
      () => this.notice.set(outcomeNotice(this.model(), this.hid())),
    );
  }

  start(e: SdExperiment) {
    this.player.stop(false);
    this.pool?.clear();
    this.tau.set(null);
    this.describe.set(false);
    this.hint.set(null);
    this.exp.start(e);
    this.notice.set(e.goal ? '' : 'Play and the settings this question is about wait for your answer.');
  }

  toggleDescribe() {
    this.describe.update((d) => !d);
  }

  /** A settings change: the picture shows its end state at once, and the notice says what changed and how it ends. */
  private said(what: string) {
    const outcome = this.hid().any ? '' : `: ${pillOf(this.model(), this.hid()).text}`;
    this.notice.set(`${what}${outcome}.`);
  }

  /** Any change of settings: a running play is about the settings before it. */
  private settle() {
    this.player.stop();
    this.pool?.clear();
    this.exp.clearFocus();
    this.tau.set(null);
  }

  private applySettings(s: Readonly<Record<string, number>>) {
    this.settle();
    this.describe.set(false);
    for (const [name, value] of Object.entries(s) as [Setting, number][]) {
      if (name === 'n') this.n.set(value);
      else if (name === 'w') this.w.set(value);
      else if (name === 'r') this.r.set(value);
      else if (name === 'stall') this.stall.set(value);
      else if (name === 'sloppy') this.sloppy.set(value);
      else {
        const i = (QUORUM_STATE_KEYS as readonly string[]).indexOf(name);
        if (i >= 0) this.states.update((st) => st.map((v, j) => (j === i ? value : v)));
      }
    }
  }

  /** An answer plays its act: the write and then the read, or the read alone after a write already done. */
  private playAnswer(e: SdExperiment, done: () => void) {
    this.notice.set('');
    const run = e.act && 'run' in e.act ? e.act.run : undefined;
    if (run === 'write-read' || run === 'read') return this.play(done, run);
    this.player.play(HOLD_MS, () => undefined, done);
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
}
