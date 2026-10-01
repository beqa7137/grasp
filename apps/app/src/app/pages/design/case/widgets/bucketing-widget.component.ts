import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import {
  FLAG_A,
  FLAG_B,
  POPULATION,
  REQUESTS,
  ROLLOUT_STAGES,
  SALT_VERSIONS,
  bucketingCheckpoint,
  bucketingRun,
  num,
  saltOf,
  type Assignment,
  type BucketingSettings,
  type RolloutState,
} from '@grasp/engine';
import { RovingSelectDirective } from '../../../../core/roving-select.directive';
import { WidgetCheckComponent } from './widget-check.component';

const SCHEMES: { scheme: Assignment; label: string }[] = [
  { scheme: 'flag-salt', label: 'Hash of salt and user id' },
  { scheme: 'user-only', label: 'Hash of user id only' },
  { scheme: 'random', label: 'Random on each request' },
];

/** How long input must rest before the summary is announced, so stepping through stages does not queue one per step. */
const SETTLE_MS = 600;

/** A rollout of new-checkout over 1,000 users: which users each scheme picks, who stays when it grows, and its overlap with another flag. */
@Component({
  selector: 'app-bucketing-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective, WidgetCheckComponent],
  template: `
    <div class="controls" role="radiogroup" aria-label="How users are picked">
      @for (s of schemes; track s.scheme) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="settings().scheme === s.scheme"
          [class.primary]="settings().scheme === s.scheme"
          (click)="setScheme(s.scheme)"
        >
          {{ s.label }}
        </button>
      }
    </div>
    <div class="controls" role="radiogroup" [attr.aria-label]="'Rollout of ' + flagA">
      <span class="name mono">{{ flagA }}</span>
      @for (p of stages; track p) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="settings().percent === p"
          [class.primary]="settings().percent === p"
          (click)="change({ percent: p })"
        >
          {{ p }}%
        </button>
      }
    </div>
    <div class="controls">
      @if (settings().scheme === 'flag-salt') {
        <span class="muted"
          >Salt <span class="mono">{{ salt() }}</span></span
        >
        <button class="g-btn ghost" (click)="change({ saltVersion: (settings().saltVersion % saltVersions) + 1 })">Change the salt</button>
      } @else {
        <span class="muted">{{
          settings().scheme === 'random' ? 'No salt: every request rolls a die.' : 'No salt: every flag hashes the user id alone.'
        }}</span>
      }
    </div>

    <div class="grid" role="img" [attr.aria-label]="gridLabel()">
      @for (u of run().users; track u.id) {
        <span
          class="cell"
          [class.in]="u.inA"
          [class.b]="answered() && u.inB"
          [class.left]="answered() && u.wasIn && !u.inA"
          [class.joined]="answered() && u.wasIn === false && u.inA"
          [class.flip]="answered() && u.flips"
        ></span>
      }
    </div>
    <ul class="legend-list" aria-hidden="true">
      <li><span class="cell in"></span>In {{ flagA }}</li>
      @if (answered()) {
        <li><span class="cell b"></span>Also in {{ flagB.key }} ({{ flagB.percent }}%)</li>
        @if (run().stayed !== null) {
          <li><span class="cell in joined"></span>Joined in the last change</li>
          <li><span class="cell left"></span>Left in the last change</li>
        }
        @if (settings().scheme === 'random') {
          <li><span class="cell in flip"></span>Saw both versions in {{ requests }} requests</li>
        }
      }
    </ul>

    <dl class="readouts">
      <div>
        <dt>In {{ flagA }}</dt>
        <dd class="mono">{{ format(run().inA) }}</dd>
      </div>
      @if (answered()) {
        <div>
          <dt>Also in {{ flagB.key }}</dt>
          <dd class="mono">{{ format(run().both) }}</dd>
        </div>
        @if (run().stayed !== null) {
          <div>
            <dt>Stayed</dt>
            <dd class="mono">{{ format(run().stayed!) }}</dd>
          </div>
          <div [class.bad]="run().left! > 0">
            <dt>Left</dt>
            <dd class="mono">{{ format(run().left!) }}</dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd class="mono">{{ format(run().joined!) }}</dd>
          </div>
        }
        <div [class.bad]="run().flipped > 0">
          <dt>Saw both versions</dt>
          <dd class="mono">{{ format(run().flipped) }}</dd>
        </div>
      }
    </dl>
    @if (!answered()) {
      <p class="muted hidden-note">The overlap, who stayed and who flickered show once you answer the prediction below.</p>
    }
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
    <p class="muted note">
      {{ population }} users, user-1 to user-{{ population }}. A user is in when murmur3 of the salt and their id, mod 10,000, is below the
      percentage × 100; {{ flagB.key }} hashes its own salt.
    </p>

    <app-widget-check [check]="check()" [chosen]="chosen()" (chosenChange)="answer($event)" />
  `,
  styleUrl: '../../../design-lesson/widget.scss',
  styles: `
    .name {
      font-weight: 600;
      font-size: 0.875rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(40, 1fr);
      gap: 1px;
      max-width: 440px;
      margin: 0 auto 8px;
    }
    .cell {
      display: inline-block;
      aspect-ratio: 1;
      min-width: 5px;
      border-radius: 1px;
      background: var(--g-line);
    }
    .cell.in {
      background: var(--g-accent);
    }
    .cell.b {
      box-shadow: inset 0 0 0 1.5px var(--g-text);
    }
    .cell.joined {
      background: var(--g-found);
    }
    .cell.left {
      background: var(--g-danger);
    }
    .cell.flip {
      background: repeating-linear-gradient(45deg, var(--g-accent) 0 2px, var(--g-danger) 2px 4px);
    }
    .legend-list {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 4px 14px;
      margin: 0 0 12px;
      padding: 0;
      font-size: 0.8125rem;
      li {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .cell {
        width: 10px;
      }
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    }
    .hidden-note {
      font-size: 0.8125rem;
      margin: 8px 0 0;
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 16px;
      line-height: 1.5;
    }
  `,
})
export class BucketingWidgetComponent {
  readonly schemes = SCHEMES;
  readonly stages = ROLLOUT_STAGES;
  readonly saltVersions = SALT_VERSIONS;
  readonly flagA = FLAG_A;
  readonly flagB = FLAG_B;
  readonly requests = REQUESTS;
  readonly population = num(POPULATION);
  readonly format = num;
  readonly settings = signal<BucketingSettings>({ scheme: 'flag-salt', percent: 10, saltVersion: 1 });
  /** The rollout before the last change of stage or salt; a new scheme starts over. */
  readonly previous = signal<RolloutState | null>(null);
  readonly run = computed(() => bucketingRun(this.settings(), this.previous()));
  readonly check = computed(() => bucketingCheckpoint(this.settings(), this.previous()));
  readonly salt = computed(() => saltOf(FLAG_A, this.settings().saltVersion));
  private readonly asked = computed(() => JSON.stringify([this.settings(), this.previous()]));
  private readonly answers = signal<{ asked: string; chosen: number } | null>(null);
  readonly chosen = computed(() => {
    const a = this.answers();
    return a?.asked === this.asked() ? a.chosen : null;
  });
  readonly answered = computed(() => this.chosen() !== null);
  readonly gridLabel = computed(() => {
    const run = this.run();
    const base = `${num(run.inA)} of ${this.population} users in ${FLAG_A} at ${this.settings().percent}%`;
    return this.answered() ? `${base}, ${num(run.both)} of them also in ${FLAG_B.key}` : base;
  });
  readonly announcement = signal('');

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    effect(() => {
      const summary = this.summary();
      clearTimeout(timer);
      timer = setTimeout(() => this.announcement.set(summary), SETTLE_MS);
    });
  }

  private summary(): string {
    const run = this.run();
    const head = `${FLAG_A} at ${this.settings().percent}%: ${num(run.inA)} of ${this.population} users in.`;
    if (!this.answered()) return `${head} Answer the prediction to see the rest.`;
    const moved =
      run.stayed === null ? '' : ` Since the last change ${num(run.stayed)} stayed, ${num(run.left!)} left and ${num(run.joined!)} joined.`;
    return `${head} ${num(run.both)} also in ${FLAG_B.key}.${moved} ${num(run.flipped)} saw both versions.`;
  }

  setScheme(scheme: Assignment) {
    if (scheme === this.settings().scheme) return;
    this.previous.set(null);
    this.settings.update((s) => ({ ...s, scheme, saltVersion: 1 }));
  }

  change(to: Partial<RolloutState>) {
    const { percent, saltVersion } = this.settings();
    const next = { ...this.settings(), ...to };
    if (next.percent === percent && next.saltVersion === saltVersion) return;
    this.previous.set({ percent, saltVersion });
    this.settings.set(next);
  }

  answer(chosen: number | null) {
    if (chosen !== null) this.answers.set({ asked: this.asked(), chosen });
  }
}
