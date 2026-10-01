import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  FLAG_A,
  FLAG_B,
  POPULATION,
  REQUESTS,
  ROLLOUT_STAGES,
  bucketingCheckpoint,
  bucketingRun,
  num,
  saltOf,
  type Assignment,
  type BucketingSettings,
  type RolloutState,
} from '@grasp/engine';
import { RovingSelectDirective } from '../../../../core/roving-select.directive';
import { settledAnnouncement } from './settled-announcement';
import { WidgetCheckComponent } from './widget-check.component';

const SCHEMES: { scheme: Assignment; label: string }[] = [
  { scheme: 'flag-salt', label: 'Hash of salt and user id' },
  { scheme: 'user-only', label: 'Hash of user id only' },
  { scheme: 'random', label: 'Random on each request' },
];

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
        <button class="g-btn ghost" (click)="change({ saltVersion: settings().saltVersion + 1 })">Change the salt</button>
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
          [class.both]="view() === 'overlap' && u.inA && u.inB"
          [class.only-b]="view() === 'overlap' && !u.inA && u.inB"
          [class.joined]="view() === 'change' && u.wasIn === false && u.inA"
          [class.left]="view() === 'change' && u.wasIn && !u.inA"
          [class.flip]="view() !== 'plain' && u.flips"
        ></span>
      }
    </div>
    <ul class="legend-list" aria-hidden="true">
      <li><span class="cell"></span>Not in {{ flagA }}</li>
      @switch (view()) {
        @case ('overlap') {
          <li><span class="cell in"></span>In {{ flagA }}</li>
          <li><span class="cell in both"></span>In both flags (dot)</li>
          <li><span class="cell only-b"></span>Only in {{ flagB.key }} (faint)</li>
        }
        @case ('change') {
          <li><span class="cell in"></span>Stayed in</li>
          <li><span class="cell in joined"></span>Joined (dot)</li>
          <li><span class="cell left"></span>Left (outline)</li>
        }
        @default {
          <li><span class="cell in"></span>In {{ flagA }}</li>
        }
      }
      @if (view() !== 'plain' && settings().scheme === 'random') {
        <li><span class="cell in flip"></span>Saw both versions (half filled)</li>
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
      grid-template-columns: repeat(40, minmax(0, 1fr));
      gap: 1px;
      max-width: 440px;
      margin: 0 auto 8px;
    }
    @media (max-width: 400px) {
      .grid {
        grid-template-columns: repeat(25, minmax(0, 1fr));
      }
    }
    .cell {
      display: inline-block;
      aspect-ratio: 1;
      border-radius: 1px;
      background: var(--g-line-strong);
    }
    .cell.in {
      background: var(--g-accent);
    }
    .cell.only-b {
      background: color-mix(in srgb, var(--g-accent) 35%, var(--g-surface));
    }
    .cell.both,
    .cell.joined {
      background: radial-gradient(circle, var(--g-surface) 0 26%, transparent 32%), var(--g-accent);
    }
    .cell.left {
      background: transparent;
      box-shadow: inset 0 0 0 1.5px var(--g-danger-ink);
    }
    .cell.flip {
      background: linear-gradient(135deg, var(--g-accent) 50%, var(--g-line-strong) 50%);
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
  readonly flagA = FLAG_A;
  readonly flagB = FLAG_B;
  readonly requests = REQUESTS;
  readonly population = num(POPULATION);
  readonly format = num;
  readonly settings = signal<BucketingSettings>({ scheme: 'flag-salt', percent: 10, saltVersion: 1 });
  /** The rollout before the last change of stage or salt; a new scheme starts over. */
  readonly previous = signal<RolloutState | null>(null);
  readonly run = computed(() => bucketingRun(this.settings(), this.previous()));
  readonly check = computed(() => bucketingCheckpoint(this.settings(), this.previous(), this.run()));
  readonly salt = computed(() => saltOf(FLAG_A, this.settings().saltVersion));
  private readonly asked = computed(() => JSON.stringify([this.settings(), this.previous()]));
  private readonly answers = signal<{ asked: string; chosen: number } | null>(null);
  readonly chosen = computed(() => {
    const a = this.answers();
    return a?.asked === this.asked() ? a.chosen : null;
  });
  readonly answered = computed(() => this.chosen() !== null);
  /** What the grid marks: nothing beyond flag A until answered, then the overlap with flag B, or the last change. */
  readonly view = computed(() => (!this.answered() ? 'plain' : this.run().stayed === null ? 'overlap' : 'change'));
  readonly gridLabel = computed(() => {
    const run = this.run();
    const base = `${num(run.inA)} of ${this.population} users in ${FLAG_A} at ${this.settings().percent}%`;
    return this.answered() ? `${base}, ${num(run.both)} of them also in ${FLAG_B.key}` : base;
  });
  readonly announcement = settledAnnouncement(() => this.summary());

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
