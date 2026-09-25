import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import type { Frame } from '@grasp/engine';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { pause, play, playSkipBack, playSkipForward, refresh } from 'ionicons/icons';
import { onPageKey } from '../core/on-page-key';
import { ArrayViewComponent } from '../viz/array-view.component';
import { GridViewComponent } from '../viz/grid-view.component';
import { ListViewComponent } from '../viz/list-view.component';
import { TreeViewComponent } from '../viz/tree-view.component';

const SPEEDS = [1, 2, 4];

@Component({
  selector: 'app-trace-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, ArrayViewComponent, GridViewComponent, ListViewComponent, TreeViewComponent],
  template: `
    @if (frame(); as f) {
      <div class="viz">
        @if (f.array) {
          <g-array-view [view]="f.array" />
        }
        @if (f.grid) {
          <g-grid-view [view]="f.grid" [legend]="false" />
        }
        @if (f.tree) {
          <g-tree-view [view]="f.tree" />
        }
        @if (f.stack || f.queue || f.set || f.output) {
          <div class="aux">
            @if (f.stack) {
              <g-list-view [label]="f.stack.label" [items]="f.stack.items" orientation="vertical" />
            }
            @if (f.queue) {
              <g-list-view [label]="f.queue.label" [items]="f.queue.items" />
            }
            @if (f.set) {
              <g-list-view [label]="f.set.label" [items]="f.set.entries" />
            }
            @if (f.output) {
              <g-list-view [label]="f.output.label" [items]="f.output.items" />
            }
          </div>
        }
        @if (varNames().length) {
          <dl class="vars mono">
            @for (name of varNames(); track name) {
              <div [class.changed]="changed().has(name)">
                <dt>{{ name }}</dt>
                <dd>{{ f.vars[name] ?? 'null' }}</dd>
              </div>
            }
          </dl>
        }
      </div>
      <div class="narration" aria-live="polite">
        <span class="line mono">L{{ f.line }}</span>
        <p>{{ f.note }}</p>
      </div>
    }

    <div class="controls">
      <div class="buttons">
        <button class="g-btn ghost icon" (click)="seek(0)" aria-label="Restart"><ion-icon name="refresh" aria-hidden="true" /></button>
        <button class="g-btn icon" (click)="step(-1)" [disabled]="index() === 0" aria-label="Step back">
          <ion-icon name="play-skip-back" aria-hidden="true" />
        </button>
        <button class="g-btn primary play" (click)="togglePlay()" [attr.aria-label]="playing() ? 'Pause' : 'Play'">
          <ion-icon [name]="playing() ? 'pause' : 'play'" aria-hidden="true" />
        </button>
        <button class="g-btn icon" (click)="step(1)" [disabled]="index() === last()" aria-label="Step forward">
          <ion-icon name="play-skip-forward" aria-hidden="true" />
        </button>
        <button class="g-btn ghost speed mono" (click)="cycleSpeed()" [attr.aria-label]="'Playback speed ' + speed() + '×'">
          {{ speed() }}×
        </button>
      </div>
      <div class="scrub">
        <input
          type="range"
          min="0"
          [max]="last()"
          [value]="index()"
          (input)="seek(+$any($event.target).value)"
          aria-label="Timeline"
          [attr.aria-valuetext]="'Step ' + (index() + 1) + ' of ' + frames().length"
        />
        <span class="count mono">{{ index() + 1 }} / {{ frames().length }}</span>
      </div>
    </div>
  `,
  styles: `
    .viz {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 8px 0;
      overflow-x: auto;
    }
    .aux {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    .vars {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0;
    }
    .vars div {
      display: flex;
      gap: 6px;
      padding: 4px 9px;
      border-radius: 7px;
      background: var(--g-raised);
      border: 1px solid var(--g-line);
      font-size: 0.78125rem;
      transition: border-color 0.2s;
    }
    .vars div.changed {
      border-color: var(--g-active);
    }
    .vars dt {
      color: var(--g-muted);
    }
    .vars dd {
      margin: 0;
    }
    .narration {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 14px 0 6px;
      min-height: 40px;
    }
    .narration p {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.45;
      word-break: break-word;
    }
    .line {
      font-size: 0.6875rem;
      padding: 3px 7px;
      border-radius: 6px;
      background: var(--g-raised);
      color: var(--g-active);
      flex: none;
    }
    .controls {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .buttons {
      display: flex;
      justify-content: center;
      gap: 8px;
    }
    .play {
      width: 48px;
      height: 40px;
    }
    .scrub {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .scrub input {
      flex: 1;
      accent-color: var(--g-accent);
    }
    .count {
      font-size: 0.75rem;
      color: var(--g-muted);
      min-width: 70px;
      text-align: right;
    }
  `,
})
export class TracePlayerComponent {
  readonly frames = input.required<Frame[]>();
  readonly lineChange = output<number | null>();

  readonly index = signal(0);
  readonly playing = signal(false);
  readonly speed = signal(1);
  readonly last = computed(() => Math.max(0, this.frames().length - 1));
  readonly frame = computed<Frame | undefined>(() => this.frames()[this.index()]);
  readonly varNames = computed(() => Object.keys(this.frame()?.vars ?? {}));
  readonly changed = computed(() => {
    const prev = this.frames()[this.index() - 1];
    const cur = this.frame();
    if (!prev || !cur) return new Set<string>();
    return new Set(Object.keys(cur.vars).filter((k) => prev.vars[k] !== cur.vars[k]));
  });

  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    addIcons({ refresh, playSkipBack, playSkipForward, play, pause });
    effect(() => {
      this.frames();
      this.index.set(0);
      this.playing.set(false);
    });
    effect(() => this.lineChange.emit(this.frame()?.line ?? null));
    effect(() => {
      clearInterval(this.timer);
      if (this.playing()) this.timer = setInterval(() => this.step(1), 700 / this.speed());
    });
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
    onPageKey((e) => this.onKey(e));
  }

  step(delta: number) {
    const next = Math.min(this.last(), Math.max(0, this.index() + delta));
    this.index.set(next);
    if (next === this.last()) this.playing.set(false);
  }

  seek(i: number) {
    this.playing.set(false);
    this.index.set(i);
  }

  togglePlay() {
    if (this.index() === this.last()) this.index.set(0);
    this.playing.update((p) => !p);
  }

  cycleSpeed() {
    this.speed.update((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]);
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') this.step(1);
    else if (e.key === 'ArrowLeft') this.step(-1);
    else return;
    e.preventDefault();
  }
}
