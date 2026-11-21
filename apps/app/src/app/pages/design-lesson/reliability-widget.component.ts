import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  FAILOVER_MIN,
  FAILOVER_STOP_SHARE,
  RELIABILITY_ANSWER_PLAYS,
  RELIABILITY_BASELINE,
  RELIABILITY_COPIES,
  RELIABILITY_PARTS,
  bypassMoments,
  formatOneIn,
  goalMet,
  reliabilityAnswerHold,
  reliabilityPlayPlan,
  reliabilityRestMoment,
  reliabilityScenario,
  reliabilityStepMoments,
  reliabilityYear,
  renderExperiment,
  sameMoment,
  SHARED_SHARE,
  type ExperimentSpec,
  type ReliabilityPartId,
  type ReliabilitySettings,
  type SdExperiment,
  type YearMoment,
  type YearPlayPlan,
} from '@grasp/engine';
import { motionAllowed } from '../../core/motion';
import { CODE_TEXT_KEEP, CodeTextComponent } from '../../viz/code-text.component';
import { DataTableComponent } from '../../viz/kit/data-table.component';
import { watchMotion, watchVisibility } from '../../viz/kit/particles';
import { StageComponent } from '../../viz/kit/stage.component';
import { ExperimentDockComponent } from './experiment-dock.component';
import { ExperimentSession } from './experiment-session';
import { FocusBoxComponent } from './focus-box.component';
import type { Prim } from './latency-draw';
import { buildStage, liveLines, type StageView } from './reliability-layout';
import { clipX, playheadX } from './reliability-motion';
import { ReliabilityPrimsComponent } from './reliability-prims.component';
import { RELIABILITY_PROSE_KEEP } from './reliability-text';
import {
  NOTHING_HIDDEN,
  SAMPLE_HIDDEN,
  ANSWER_PLAYS,
  WAITS_NOTICE,
  describe,
  describeForm,
  goalChecks,
  hiding,
  momentWords,
  playedWords,
  readoutWords,
  settingWords,
  standingWords,
  summary,
  sweepWords,
  yearWords,
  type QuestionPhase,
} from './reliability-words';
import { WidgetPlay, bringStageIntoView } from './widget-play';

/** The table box shows its head and this many rows, so a row is cut through and the box reads as one that scrolls. */
const TABLE_ROWS = 4.5;
const settingsOf = (s: Readonly<Record<string, number>>): ReliabilitySettings => ({ ...RELIABILITY_BASELINE, ...s });
const actOf = (e: SdExperiment) => settingsOf({ ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) });
/** The parts an experiment's act changes: their bars wait while its answer plays, and its hold is in one of them. */
export function changedParts(e: SdExperiment): ReliabilityPartId[] {
  const a = reliabilityScenario(settingsOf(e.setup));
  const b = reliabilityScenario(actOf(e));
  return b.parts.filter((p, i) => p.copies !== a.parts[i].copies || Math.abs(p.u - a.parts[i].u) > 1e-15).map((p) => p.id);
}
const CONDITIONS = [
  { key: 'optional', name: 'Recs', sub: 'optional', label: 'Recs optional: the page renders without recommendations' },
  {
    key: 'shared',
    name: 'Shared',
    sub: 'failures',
    label: `Shared failures: ${formatOneIn(SHARED_SHARE)} of a copy’s outages hits every copy of its part`,
  },
  {
    key: 'failover',
    name: 'Failover',
    sub: `${FAILOVER_MIN} min`,
    label: `Failover ${FAILOVER_MIN} min: traffic takes that long to move off a dead copy`,
  },
] as const;

/**
 * Reliability (REDESIGN.md 5.2, R41): a request crossing a chain of parts, each a set of copies, drawn as a reliability
 * block diagram at one moment over a simulated year (a row per copy, a strip per part, the request's row as their union),
 * over the exact model's nines scale with the weakest link capping the chain. Every number comes from the engine's
 * `reliabilityScenario`; the year (`reliabilityYear`) is only ever labeled as one. A play sweeps the year on one clock
 * and holds on each kind of moment; experiment cards set the widget up, ask, play the answer's year and reveal the
 * model, hiding until then what would give it away.
 */
@Component({
  selector: 'app-reliability-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, DataTableComponent, FocusBoxComponent, ExperimentDockComponent, ReliabilityPrimsComponent, CodeTextComponent],
  providers: [{ provide: CODE_TEXT_KEEP, useValue: RELIABILITY_PROSE_KEEP }],
  templateUrl: './reliability-widget.component.html',
  styleUrl: './reliability-widget.component.scss',
})
export class ReliabilityWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));
  readonly parts = RELIABILITY_PARTS;
  readonly conditions = CONDITIONS;
  readonly minCopies = RELIABILITY_COPIES[0];
  readonly maxCopies = RELIABILITY_COPIES[RELIABILITY_COPIES.length - 1];

  readonly settings = signal<ReliabilitySettings>(RELIABILITY_BASELINE);
  readonly model = computed(() => reliabilityScenario(this.settings()));
  readonly year = computed(() => reliabilityYear(this.settings()));

  readonly motion = signal(false);
  readonly describeOpen = signal(false);
  readonly notice = signal('');
  /** The setting before the learner's last change. */
  private readonly ghost = signal<ReliabilitySettings | null>(null);
  /** The moment a learner stepped to, as an index into the setting's moments; null for the rest moment. */
  readonly step = signal<number | null>(null);
  /** An answer's hold, which the band keeps after its reveal until the next change or play. */
  private readonly kept = signal<YearMoment | null>(null);
  /** The running play and its clock; null at rest. */
  readonly plan = signal<YearPlayPlan | null>(null);
  readonly weeks = signal(0);
  private readonly hold = signal<{ moment: YearMoment; stop: boolean } | null>(null, {
    equal: (a, b) => a?.moment === b?.moment && a?.stop === b?.stop,
  });
  private readonly tableRow = signal<{ head: number; row: number } | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  readonly stageRef = viewChild.required(StageComponent);
  private readonly stageEl = viewChild.required(StageComponent, { read: ElementRef });
  readonly ready = computed(() => this.stageRef().width() > 0);
  private readonly player = new WidgetPlay(() => this.motion() && this.ready());
  readonly playing = this.player.playing;

  readonly exp: ExperimentSession = new ExperimentSession({
    apply: (s) => this.applySettings(s),
    settings: () => ({ ...this.model().settings }),
    metrics: () => this.model().metrics,
    play: (e, done) => this.playAnswer(e, done),
    stage: (): HTMLElement => this.stageEl().nativeElement,
    root: this.host,
    motion: () => this.motion(),
  });
  private readonly question = computed(() => {
    const e = this.exp.active();
    return e && !e.goal ? e : null;
  });
  private readonly challenge = computed(() => {
    const e = this.exp.active();
    return e?.goal ? e : null;
  });
  readonly phase = computed((): QuestionPhase => (this.question() ? this.exp.phase() : 'rest'));
  readonly hid = computed(() => {
    const e = this.question();
    return e ? hiding(e.hide, this.phase(), changedParts(e)) : NOTHING_HIDDEN;
  });
  /** A question asks, or its answer plays: Play and the settings wait. */
  readonly locked = computed(() => this.hid().waits);
  readonly met = computed(() => {
    const c = this.challenge();
    return !!c?.goal && goalMet(c.goal, this.model().metrics, this.model().settings);
  });

  readonly width = computed(() => Math.max(248, this.stageRef().width()));
  readonly moments = computed(() => reliabilityStepMoments(this.settings()));
  /** The moment the band shows at rest: a stepped one, an answer's kept hold, the met challenge's bypass, else the rest. */
  private readonly restMoment = computed((): YearMoment | null => {
    const k = this.step();
    if (k !== null) return this.moments()[k] ?? null;
    if (this.kept()) return this.kept();
    if (this.met()) return bypassMoments(this.year())[0] ?? reliabilityRestMoment(this.settings());
    return reliabilityRestMoment(this.settings());
  });
  private readonly ghostShown = computed((): ReliabilitySettings | null => {
    const c = this.challenge();
    if (c) return this.model().key === reliabilityScenario(settingsOf(c.setup)).key ? null : settingsOf(c.setup);
    // A revealed answer keeps its setup as the ghost, until the learner moves on from the act.
    const e = this.question();
    if (e && this.exp.phase() === 'revealed' && !this.ghost()) {
      const setup = reliabilityScenario(settingsOf(e.setup)).key;
      if (this.model().key === reliabilityScenario(actOf(e)).key && setup !== this.model().key) return settingsOf(e.setup);
    }
    return this.ghost();
  });
  readonly view = computed((): StageView => {
    const plan = this.plan();
    const h = this.hold();
    const e = this.question();
    return {
      hid: this.hid(),
      moment: plan ? (h?.moment ?? null) : this.restMoment(),
      into: plan && !h?.stop ? 1 : 0,
      playing: !!plan,
      ghost: this.ghostShown(),
      challenge: this.challenge() ? { met: this.met() } : null,
      focus: this.exp.active()?.focus ?? [],
      watch: e ? (RELIABILITY_ANSWER_PLAYS[e.id]?.watch ?? '') : '',
    };
  });
  readonly summary = computed(() => summary(this.model(), this.hid()));
  readonly stage = computed(() => buildStage(this.width(), this.model(), this.year(), this.view(), this.summary()));
  readonly under = computed(() => this.stage().D.prims(['back', 'grid', 'links']));
  readonly clipped = computed(() => this.stage().D.prims(['clip']));
  readonly over = computed(() => this.stage().D.prims(['marks', 'dots', 'text', 'top']));
  /** During a play: the caption and the year's sentence on the clock, and the playhead. */
  readonly liveText = computed((): Prim[] => {
    const plan = this.plan();
    if (!plan) return [];
    const st = this.stage();
    const h = this.hold();
    const m = this.model();
    const caption = this.hid().sample
      ? SAMPLE_HIDDEN
      : h
        ? momentWords(h.moment, m.parts.find((p) => p.id === h.moment.part)!.copies, !!m.settings.shared)
        : sweepWords(this.weeks());
    const shown = this.year().fails.filter((f) => f.week + 0.5 <= this.weeks() + 1e-9);
    const sentence = this.hid().request ? this.view().watch : yearWords(shown, true);
    return [...liveLines('caption', st.caption, caption, 'ink'), ...liveLines('year', st.sentence, sentence)].map((l): Prim => ({
      k: 'text',
      id: l.id,
      cls: '',
      x: l.x,
      y: l.y,
      anchor: 'start',
      spans: [{ t: l.t, cls: l.cls }],
    }));
  });
  readonly playMarks = computed((): Prim[] => {
    const plan = this.plan();
    if (!plan) return [];
    const yr = this.stage().year;
    const x = playheadX(yr, plan, this.weeks());
    return [{ k: 'line', id: 'playhead', cls: 'playhead', x1: x, y1: yr.rowsTop - 3, x2: x, y2: yr.bottom + 3 }];
  });
  readonly clipWidth = computed(() => (this.plan() ? clipX(this.stage().year, this.weeks()) : 0));

  readonly playName = computed(() => {
    if (this.locked()) return this.exp.phase() === 'asking' ? 'Play the year, after your answer' : 'Play the year, after the reveal';
    if (this.playing()) return 'Stop the year';
    if (!this.motion()) return this.stepName(1);
    return 'Play the year';
  });
  readonly readout = computed(() => readoutWords(this.model(), this.hid()));
  readonly standing = computed(() => standingWords(this.settings()));

  /** Describe waits while a question asks or plays, and until a challenge's goal is met: it would answer them. */
  readonly describeWaits = computed(() => this.hid().waits || (!!this.challenge() && this.exp.phase() === 'asking'));
  readonly describeWaitsWhy = computed(() =>
    this.challenge() ? 'Describe waits until you meet the goal.' : 'Describe waits for your answer.',
  );
  readonly form = computed(() => describeForm(this.width()));
  /** Tight cells and heads that wrap, below the wide form. */
  readonly compact = computed(() => this.form() !== 'wide');
  readonly described = computed(() => describe(this.model(), this.year(), this.form()));
  readonly tableHeight = computed(() => {
    const m = this.tableRow();
    return m ? Math.round(m.head + Math.min(TABLE_ROWS, this.described().rows.length) * m.row) : null;
  });
  readonly goalChecks = computed(() => (this.challenge() ? goalChecks(this.model()) : []));
  readonly goalStatus = computed(() => {
    const c = this.challenge();
    if (!c?.goal) return '';
    if (this.exp.phase() === 'revealed') return this.exp.kept() && this.met() ? 'Goal met:' : 'You met it; now:';
    return this.exp.kept() ? '' : 'The goal keeps shared failures and the 5 min failover on.';
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.notice.set(settingWords(this.model()));
    afterNextRender(() => {
      const stopMotion = watchMotion(motionAllowed, (allowed) => this.motion.set(allowed));
      // The widget host, not one stage: on a phone the stage scrolls away while the dock under it is read.
      const stopVisibility = watchVisibility(this.host, (visible) => this.player.setVisible(visible));
      destroyRef.onDestroy(() => {
        stopMotion();
        stopVisibility();
        this.player.stop(false);
      });
    });
  }

  copies(id: ReliabilityPartId): number {
    return this.settings()[id];
  }
  stepCopies(id: ReliabilityPartId, by: number) {
    const n = this.settings()[id] + by;
    if (this.locked() || n < this.minCopies || n > this.maxCopies) return;
    this.change({ [id]: n });
  }
  setCondition(key: 'optional' | 'shared' | 'failover', on: boolean) {
    if (this.locked() || this.conditionLocked(key)) return;
    this.change({ [key]: on ? 1 : 0 });
  }
  conditionLocked(key: string): boolean {
    return !!this.challenge()?.goal?.keep && key in this.challenge()!.goal!.keep!;
  }

  togglePlay() {
    if (this.locked()) return;
    if (this.playing()) return this.player.stop();
    if (!this.motion() || !this.ready()) return this.stepTo(1);
    this.exp.clearFocus();
    this.step.set(null);
    this.kept.set(null);
    this.run(
      reliabilityPlayPlan(this.settings()),
      () => undefined,
      () => {
        this.notice.set(playedWords(this.year(), this.restMoment(), this.model()));
        afterNextRender({ write: () => this.fade() }, { injector: this.injector });
      },
    );
  }

  /** Left and Right on Play step through the moments, at every width. */
  onPlayKey(ev: KeyboardEvent) {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    ev.preventDefault();
    this.stepTo(ev.key === 'ArrowRight' ? 1 : -1);
  }

  stepName(dir: 1 | -1): string {
    const n = this.moments().length;
    if (this.locked()) return `${dir > 0 ? 'Next' : 'Previous'} moment, after your answer`;
    return `${dir > 0 ? 'Next' : 'Previous'} moment, ${this.stepIndex(dir) + 1} of ${n}`;
  }
  /** From the picture shown: a step always moves to a moment it does not show. */
  private stepIndex(dir: 1 | -1): number {
    const n = this.moments().length;
    const shown = this.restMoment();
    const cur = this.step() ?? this.moments().findIndex((mo) => !!shown && sameMoment(mo, shown));
    if (cur < 0) return dir > 0 ? 0 : n - 1;
    return dir > 0 ? (cur + 1) % n : (cur - 1 + n) % n;
  }
  stepTo(dir: 1 | -1) {
    if (this.locked() || this.playing() || !this.moments().length) return;
    this.exp.clearFocus();
    this.kept.set(null);
    this.step.set(this.stepIndex(dir));
    const mo = this.moments()[this.step()!];
    const m = this.model();
    this.notice.set(momentWords(mo, m.parts.find((p) => p.id === mo.part)!.copies, !!m.settings.shared));
  }

  start(e: SdExperiment) {
    this.player.stop(false);
    this.describeOpen.set(false);
    this.exp.start(e);
    this.notice.set(e.goal ? settingWords(this.model()) : WAITS_NOTICE);
  }

  toggleDescribe() {
    this.describeOpen.update((d) => !d);
    if (this.describeOpen())
      afterNextRender(
        {
          read: () => {
            const table = this.host.querySelector('g-data-table');
            const head = table?.querySelector('thead')?.getBoundingClientRect().height ?? 0;
            const row = table?.querySelector('tbody tr')?.getBoundingClientRect().height ?? 0;
            if (head && row) this.tableRow.set({ head, row });
          },
        },
        { injector: this.injector },
      );
  }

  /** A learner's change: a play ends, the old setting stays as a ghost, and the notice says the new one in a sentence. */
  private change(next: Partial<ReliabilitySettings>) {
    const was = this.settings();
    this.settle();
    this.settings.set({ ...was, ...next });
    this.ghost.set(was);
    this.notice.set(settingWords(this.model(), this.hid()));
  }

  /** Ends a running play, a step and a kept hold: the stage draws the rest state at once. */
  private settle() {
    this.player.stop();
    this.exp.clearFocus();
    this.plan.set(null);
    this.hold.set(null);
    this.step.set(null);
    this.kept.set(null);
  }

  /** A card's setup, or an answer's act: a new start, with no ghost of what came before. */
  private applySettings(s: Readonly<Record<string, number>>) {
    this.settle();
    this.describeOpen.set(false);
    this.ghost.set(null);
    this.settings.set(settingsOf({ ...this.settings(), ...s }));
  }

  /** An answer plays its year and holds once, on its climax; without motion it reveals at once on that hold. */
  private playAnswer(e: SdExperiment, done: () => void) {
    this.notice.set(ANSWER_PLAYS);
    const mode = RELIABILITY_ANSWER_PLAYS[e.id]?.hold ?? 'part';
    const changed = changedParts(e);
    const hold = reliabilityAnswerHold(this.settings(), changed, mode);
    const reveal = () => {
      done();
      if (this.exp.active() !== e || this.exp.phase() !== 'revealed') return;
      this.kept.set(hold);
      this.notice.set(settingWords(this.model()));
      afterNextRender({ write: () => this.land() }, { injector: this.injector });
    };
    if (!this.motion() || !this.ready()) return reveal();
    this.run(reliabilityPlayPlan(this.settings(), { changed, mode }), reveal);
  }

  /** Runs a play on one clock: the year shows up to it, and the band acts out each hold it reaches. */
  private run(plan: YearPlayPlan, done: () => void, ended: () => void = () => undefined) {
    if (!this.motion() || !this.ready()) return done();
    bringStageIntoView(this.stageEl().nativeElement);
    this.plan.set(plan);
    this.weeks.set(0);
    this.hold.set(null);
    this.player.play(
      plan.total,
      (p) => {
        const c = plan.at(p * plan.total);
        this.weeks.set(c.weeks);
        this.hold.set(c.hold ? { moment: c.hold, stop: c.hold.kind === 'failover' && c.into < FAILOVER_STOP_SHARE } : null);
      },
      () => {
        this.plan.set(null);
        this.hold.set(null);
        done();
      },
      ended,
    );
  }

  /** When a free play ends, the band crossfades to the rest moment, now marked. */
  private fade() {
    for (const el of this.host.querySelectorAll<SVGElement>(
      'svg.draw [data-id^="box-"], svg.draw [data-id^="path-"], svg.draw [data-id="ring"]',
    ))
      el.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  }

  /** At the reveal the model lands: values settle and bars grow to their lengths, once the scale is on screen. */
  private land() {
    if (!this.motion()) return;
    const svg = this.host.querySelector('svg.draw');
    const first = this.host.querySelector('.focused .focus-outline');
    const box = first?.getBoundingClientRect();
    if (first && box && (box.top < 0 || box.bottom > window.innerHeight)) first.scrollIntoView({ block: 'nearest' });
    if (!svg) return;
    for (const el of svg.querySelectorAll<SVGElement>('[data-id^="stat-"]:not([data-id$="-name"]), [data-id^="val-"]'))
      el.animate(
        [
          { opacity: 0, transform: 'translateY(-4px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 400, easing: 'ease-out' },
      );
    for (const el of svg.querySelectorAll<SVGElement>('rect.bar'))
      el.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 520, easing: 'ease-in-out' });
    for (const el of svg.querySelectorAll<SVGElement>('[data-id="capline"], [data-id^="capend-"], [data-id^="paper-"]'))
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, easing: 'ease-in-out' });
  }
}
