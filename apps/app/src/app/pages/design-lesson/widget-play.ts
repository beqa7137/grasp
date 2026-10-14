import { signal } from '@angular/core';
import { motionScroll } from '../../core/motion';
import { PlayClock } from '../../viz/kit/particles';

/**
 * A lesson widget's one running play (a replay, an experiment's answer): bounded, paused while the stage is offscreen
 * or the page hidden, and never left half done. `done` runs however the play stops, so an experiment always reveals;
 * `ended` runs only when it plays to its end, so an interrupted play never settles the picture behind the one that
 * replaced it. Without motion (or before the stage is drawn) nothing plays and `done` runs at once.
 */
export class WidgetPlay {
  readonly playing = signal(false);
  private clock: PlayClock | null = null;
  private pendingDone: (() => void) | null = null;
  private visible = true;

  constructor(private readonly canPlay: () => boolean) {}

  play(durationMs: number, onFrame: (progress: number) => void, done: () => void, ended: () => void = () => undefined): void {
    this.stop();
    if (!this.canPlay()) return done();
    this.pendingDone = done;
    this.playing.set(true);
    this.clock = new PlayClock(durationMs, onFrame, () => {
      this.clock = null;
      ended();
      this.finish(true);
    });
    if (!this.visible) this.clock.pause();
    this.clock.start();
  }

  /** Stops a running play; unless `complete` is false, its `done` still runs. */
  stop(complete = true): void {
    this.clock?.stop();
    this.clock = null;
    this.finish(complete);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) this.clock?.resume();
    else this.clock?.pause();
  }

  private finish(complete: boolean) {
    const done = this.pendingDone;
    this.pendingDone = null;
    this.playing.set(false);
    if (complete) done?.();
  }
}

/**
 * Scrolls a stage into view when an answer or a run starts to play, unless it is already whole on screen: on a phone the
 * question sits below the picture. The margin clears the page's translucent header.
 */
export function bringStageIntoView(stage: HTMLElement): void {
  const header = stage.closest('ion-content')?.previousElementSibling?.getBoundingClientRect().bottom ?? 0;
  const tabBar = document.querySelector('ion-tab-bar')?.getBoundingClientRect().top ?? window.innerHeight;
  const box = stage.getBoundingClientRect();
  if (box.top >= header && box.bottom <= tabBar) return;
  stage.style.scrollMarginTop = `${header + 8}px`;
  stage.scrollIntoView({ block: 'start', behavior: motionScroll() });
}

/** Pulses the outlines of the regions a reveal points at, twice, when motion is allowed. */
export function pulseFocus(host: HTMLElement): void {
  for (const outline of host.querySelectorAll<SVGElement>('.focused .focus-outline'))
    outline.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], {
      duration: 1400,
      easing: 'ease-in-out',
    });
}
