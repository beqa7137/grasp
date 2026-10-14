import { Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { goalKept, goalMet, type ExperimentSettings, type SdExperiment } from '@grasp/engine';
import type { ExperimentPhase } from './experiment-dock.component';
import { bringStageIntoView, pulseFocus } from './widget-play';

/** What a lesson widget gives its experiments: its settings, its measures, its stage, and how it plays an answer out. */
export interface ExperimentHost {
  /** Sets the widget's settings by the names experiments use. */
  apply(settings: ExperimentSettings): void;
  settings(): ExperimentSettings;
  metrics(): Readonly<Record<string, number>>;
  /** Whether the metrics are for the settings shown (false while a worker is still answering). */
  current?(): boolean;
  /** Plays an answer out on the picture; `done` reveals, and must run however the play ends. */
  play(e: SdExperiment, done: () => void): void;
  stage(): HTMLElement;
  /** The widget's element, which holds every focus outline. */
  root: HTMLElement;
  motion(): boolean;
}

/**
 * One lesson widget's experiments (REDESIGN.md 4.7): which card is open, its phase, the learner's guess, the cards done,
 * the regions its reveal points at, and a challenge's goal watched against the widget's live measures. Answering sets
 * the card's setup again before its act, so a reveal always describes what the picture then shows, whatever the learner
 * moved while deciding. Create it in a component's injection context.
 */
export class ExperimentSession {
  readonly active = signal<SdExperiment | null>(null);
  readonly phase = signal<ExperimentPhase>('asking');
  readonly chosen = signal<number | null>(null);
  readonly done = signal<ReadonlySet<string>>(new Set());
  readonly focusOn = signal<readonly string[]>([]);
  /** While an answer plays, the settings it is about stay fixed. */
  readonly locked = computed(() => this.phase() === 'playing');
  /** The measures and settings when a challenge's goal was met, so its status can say so after the learner moves on. */
  readonly metWith = signal<{ metrics: Readonly<Record<string, number>>; settings: ExperimentSettings } | null>(null);
  readonly kept = computed(() => {
    const goal = this.active()?.goal;
    return !goal || goalKept(goal, this.host.settings());
  });

  private readonly injector = inject(Injector);

  constructor(private readonly host: ExperimentHost) {
    effect(() => {
      const goal = this.active()?.goal;
      if (!goal || this.phase() !== 'asking' || !(this.host.current?.() ?? true)) return;
      const metrics = this.host.metrics();
      if (goalMet(goal, metrics, this.host.settings())) {
        untracked(() => {
          this.metWith.set({ metrics, settings: this.host.settings() });
          this.reveal();
        });
      }
    });
  }

  start(e: SdExperiment) {
    this.active.set(e);
    this.chosen.set(null);
    this.phase.set('asking');
    this.focusOn.set([]);
    this.metWith.set(null);
    this.host.apply(e.setup);
    // The question shows in the dock: on a phone that can be well below the card's tap, so it scrolls into view.
    afterNextRender(
      { read: () => bringStageIntoView(this.host.root.querySelector<HTMLElement>('app-experiment-dock .dock') ?? this.host.stage()) },
      { injector: this.injector },
    );
  }

  answer(index: number | null) {
    this.chosen.set(index);
    const e = this.active();
    if (index === null || !e || this.phase() !== 'asking') return;
    this.phase.set('playing');
    // In the read phase, after the dock has moved focus to its "watch the picture" line, which scrolls to it where a
    // browser does not honour preventScroll; the picture is what the learner needs in view.
    afterNextRender({ read: () => bringStageIntoView(this.host.stage()) }, { injector: this.injector });
    this.host.apply(e.setup);
    if (e.act && 'set' in e.act) this.host.apply(e.act.set);
    // A play another card replaced must not reveal that card.
    this.host.play(e, () => this.active() === e && this.reveal());
  }

  /** Hides the regions a reveal pointed at, when a play of the learner's own starts. */
  clearFocus() {
    if (this.focusOn().length) this.focusOn.set([]);
  }

  private reveal() {
    const e = this.active();
    if (!e || this.phase() === 'revealed') return;
    this.phase.set('revealed');
    this.done.update((d) => new Set([...d, e.id]));
    this.focusOn.set(e.focus);
    if (this.host.motion()) afterNextRender({ write: () => pulseFocus(this.host.root) }, { injector: this.injector });
  }
}
