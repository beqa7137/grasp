import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  DEFAULT_ROUND_COUNTS,
  MAX_ROUND_COUNT,
  PLAN_MAX_DAYS,
  PLAN_MINUTES,
  PLAN_ROUNDS,
  ROUND_NAMES,
  SENIORITY_LEVELS,
  addCalendarDays,
  calendarDaysBetween,
  isCalendarDate,
  type PlanLevel,
  type PlanRound,
  type RoundCounts,
  type Seniority,
} from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { uniqueId } from '../../core/unique-id';
import { ChipComponent } from '../../ui/chip.component';
import { formatMinutes } from '../plan/duration';
import { levelCounts, loopEvents } from './loop-events';
import { LOOP_CARD_REST_DAYS, TodayService } from './today.service';

const STARTING_POINTS: { value: PlanLevel; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'rusty', label: 'Rusty' },
  { value: 'confident', label: 'Confident' },
];
/** "When" presets (REDESIGN.md 4.1), in days from today. */
const PRESETS: { value: string; label: string; days?: number }[] = [
  { value: '7', label: '1 week', days: 7 },
  { value: '14', label: '2 weeks', days: 14 },
  { value: '21', label: '3 weeks', days: 21 },
  { value: '30', label: '1 month', days: 30 },
  { value: '60', label: '2 months', days: 60 },
  { value: 'pick', label: 'Pick a date' },
  { value: 'none', label: 'No date yet' },
];
const DEFAULT_MINUTES = 45;
const DEFAULT_PICK_DAYS = 21;

/**
 * "What is your loop?" (REDESIGN.md 4.1): the first-run card, and the same form when the learner edits their loop. A level
 * and a date are the only required picks; rounds, minutes and the starting point default and wait under Details.
 */
@Component({
  selector: 'app-loop-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipComponent],
  template: `
    <form (submit)="$event.preventDefault(); save()" novalidate>
      @if (mode() === 'first-run') {
        <p class="lead">Pick your level and your interview date. Grasp plans each day toward it.</p>
      }
      <div class="field" role="group" [attr.aria-labelledby]="id + '-level'">
        <span class="label" [id]="id + '-level'">Level</span>
        <div class="chips">
          @for (l of levels; track l.level) {
            <button type="button" g-chip [attr.aria-pressed]="level() === l.level" (click)="pickLevel(l.level)">{{ l.name }}</button>
          }
        </div>
      </div>
      <div class="field" role="group" [attr.aria-labelledby]="id + '-when'">
        <span class="label" [id]="id + '-when'">When</span>
        <div class="chips">
          @for (p of presets; track p.value) {
            <button type="button" g-chip [attr.aria-pressed]="when() === p.value" (click)="when.set(p.value)">{{ p.label }}</button>
          }
        </div>
        @if (clearsPlan()) {
          <p class="note">Saving without a date clears your daily plan. Your progress stays.</p>
        }
        @if (when() === 'pick') {
          <label class="date">
            <span>Interview date</span>
            <input
              type="date"
              [min]="earliest()"
              [max]="latest()"
              [value]="picked()"
              (input)="picked.set($any($event.target).value)"
              (change)="picked.set($any($event.target).value)"
            />
          </label>
        }
      </div>
      <p class="summary">
        @if (level()) {
          <span>Rounds: {{ roundsLine() }}</span>
        }
        <span>{{ minutesLabel() }} a day · {{ startLine() }}</span>
        <button
          type="button"
          class="details-toggle"
          [attr.aria-expanded]="details()"
          [attr.aria-controls]="id + '-details'"
          (click)="details.set(!details())"
        >
          Details <span aria-hidden="true">{{ details() ? '▴' : '▾' }}</span>
        </button>
      </p>
      @if (details()) {
        <div class="details" [id]="id + '-details'">
          <div class="field" role="group" [attr.aria-labelledby]="id + '-rounds'">
            <span class="label" [id]="id + '-rounds'">Rounds in your loop</span>
            @for (r of roundNames; track r.round) {
              <div class="stepper">
                <span [id]="id + '-' + r.round">{{ r.name }}</span>
                <button
                  type="button"
                  g-chip
                  [attr.aria-label]="'Fewer ' + r.name + ' rounds'"
                  [disabled]="counts()[r.round] === 0"
                  (click)="step(r.round, -1)"
                >
                  −
                </button>
                <output [attr.aria-labelledby]="id + '-' + r.round" aria-live="polite">{{ counts()[r.round] }}</output>
                <button
                  type="button"
                  g-chip
                  [attr.aria-label]="'More ' + r.name + ' rounds'"
                  [disabled]="counts()[r.round] === maxCount"
                  (click)="step(r.round, 1)"
                >
                  +
                </button>
              </div>
            }
          </div>
          <div class="field" role="group" [attr.aria-labelledby]="id + '-minutes'">
            <span class="label" [id]="id + '-minutes'">Time a day</span>
            <div class="chips">
              @for (m of minuteOptions; track m.value) {
                <button type="button" g-chip [attr.aria-pressed]="minutes() === m.value" (click)="minutes.set(m.value)">
                  {{ m.label }}
                </button>
              }
            </div>
          </div>
          <div class="field" role="group" [attr.aria-labelledby]="id + '-start'">
            <span class="label" [id]="id + '-start'">Starting point</span>
            <div class="chips">
              @for (s of startingPoints; track s.value) {
                <button type="button" g-chip [attr.aria-pressed]="start() === s.value" (click)="start.set(s.value)">{{ s.label }}</button>
              }
            </div>
          </div>
        </div>
      }
      <p class="hint" [id]="id + '-hint'">{{ hint() }}</p>
      <div class="actions">
        <button
          type="submit"
          class="g-btn primary"
          [disabled]="!ready() || saving()"
          [attr.aria-describedby]="hint() ? id + '-hint' : null"
        >
          {{ mode() === 'edit' ? 'Save' : when() === 'none' ? 'Save my loop' : 'Build my plan' }}
        </button>
        @if (mode() === 'first-run') {
          <button type="button" class="g-btn ghost" (click)="notNow()">Not now</button>
        } @else {
          <button type="button" class="g-btn ghost" (click)="cancel()">Cancel</button>
        }
      </div>
    </form>
  `,
  styles: `
    @use '../../../type' as *;

    form {
      display: grid;
      gap: var(--g-space-4);
    }
    .lead,
    .hint,
    .summary {
      margin: 0;
      color: var(--g-muted);
      font-size: var(--g-text-body);
      line-height: 1.45;
    }
    .note {
      margin: 0;
      color: var(--g-warn-ink);
      font-size: var(--g-text-body);
    }
    .hint:empty {
      display: none;
    }
    .field {
      display: grid;
      gap: var(--g-space-2);
    }
    .label {
      @include label;
      color: var(--g-muted);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-2);
    }
    .date {
      display: grid;
      gap: var(--g-space-1);
      justify-items: start;
      font-size: var(--g-text-body);
    }
    input[type='date'] {
      min-height: 40px;
      padding: 0 var(--g-space-3);
      border: 1px solid var(--g-line-strong);
      border-radius: var(--g-radius-sm);
      background: var(--g-sunken);
      color: var(--g-text);
      font: inherit;
      color-scheme: light dark;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      column-gap: var(--g-space-3);
      row-gap: var(--g-space-1);
      color: var(--g-text);
    }
    .details-toggle {
      appearance: none;
      border: 0;
      background: none;
      padding: 0;
      min-height: 24px;
      color: var(--g-accent);
      font: 600 var(--g-text-body) var(--ion-font-family);
      cursor: pointer;
    }
    .details {
      display: grid;
      gap: var(--g-space-4);
      padding-top: var(--g-space-3);
      border-top: 1px solid var(--g-line);
    }
    .stepper {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto 2ch auto;
      align-items: center;
      gap: var(--g-space-2);
      max-width: 320px;
      font-size: var(--g-text-body);
      output {
        text-align: center;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      button {
        justify-content: center;
        min-width: 40px;
      }
      button:disabled {
        opacity: 0.45;
        cursor: default;
      }
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-2);
      .g-btn.primary {
        flex: 1 1 200px;
      }
    }
  `,
})
export class LoopCardComponent {
  private readonly progress = inject(ProgressService);
  private readonly today = inject(TodayService);
  readonly mode = input<'first-run' | 'edit'>('first-run');
  readonly id = uniqueId('loop');
  readonly levels = SENIORITY_LEVELS.map(({ level, label }) => ({ level, name: label }));
  readonly presets = PRESETS;
  readonly roundNames = PLAN_ROUNDS.map((round) => ({ round, name: ROUND_NAMES[round] }));
  readonly minuteOptions = PLAN_MINUTES.map((value) => ({ value, label: formatMinutes(value) }));
  readonly startingPoints = STARTING_POINTS;
  readonly maxCount = MAX_ROUND_COUNT;

  private readonly day = this.today.day;
  readonly earliest = computed(() => addCalendarDays(this.day(), 1));
  readonly latest = computed(() => addCalendarDays(this.day(), PLAN_MAX_DAYS));

  readonly level = signal<Seniority | null>(null);
  readonly counts = signal<RoundCounts>({ ...DEFAULT_ROUND_COUNTS.mid });
  readonly when = signal<string | null>(null);
  readonly picked = signal(addCalendarDays(this.day(), DEFAULT_PICK_DAYS));
  readonly minutes = signal<number>(DEFAULT_MINUTES);
  readonly start = signal<PlanLevel>('new');
  readonly details = signal(false);

  readonly roundsLine = computed(
    () =>
      PLAN_ROUNDS.filter((r) => this.counts()[r] > 0)
        .map((r) => `${ROUND_NAMES[r]}${this.counts()[r] > 1 ? ` ×${this.counts()[r]}` : ''}`)
        .join(' · ') || 'none',
  );
  readonly minutesLabel = computed(() => formatMinutes(this.minutes()));
  readonly startLine = computed(() => `starting point ${STARTING_POINTS.find((s) => s.value === this.start())!.label}`);
  readonly date = computed(() => {
    const when = this.when();
    if (when === null || when === 'none') return null;
    if (when !== 'pick') return addCalendarDays(this.day(), Number(when));
    const picked = this.picked();
    if (!isCalendarDate(picked)) return null;
    const days = calendarDaysBetween(this.day(), picked);
    return days >= 1 && days <= PLAN_MAX_DAYS ? picked : null;
  });
  readonly hint = computed(() => {
    if (!this.level() || this.when() === null) return 'Pick a level and when your interview is.';
    if (this.when() === 'pick' && !this.date()) return 'Pick a date from tomorrow to a year from today.';
    if (!PLAN_ROUNDS.some((r) => this.counts()[r] > 0)) return 'Keep at least one round in your loop.';
    return '';
  });
  readonly ready = computed(() => !this.hint());
  /** Set while the events are written, so a double tap writes them once. */
  readonly saving = signal(false);
  /** Editing a dated plan to "No date yet" clears it; say so before the learner saves. */
  readonly clearsPlan = computed(() => this.when() === 'none' && this.progress.state().plan !== null);

  constructor() {
    this.prefill();
  }

  /** Editing starts from the loop as it stands: the learner's Target (or the derived one) and their plan. */
  private prefill(): void {
    const state = this.progress.state();
    if (!state.target && !state.plan) return;
    // A plan from before Targets edits as the Mid-level loop Today assumes for it, with the plan's rounds.
    const target = state.target ?? { level: 'mid' as const, rounds: levelCounts('mid', state.plan!.rounds) };
    this.level.set(target.level);
    this.counts.set({ ...target.rounds });
    const plan = state.plan;
    this.when.set(plan ? 'pick' : 'none');
    if (plan) this.picked.set(plan.interviewDate);
    this.minutes.set(plan?.minutesPerDay ?? DEFAULT_MINUTES);
    this.start.set(plan?.level ?? 'new');
  }

  pickLevel(level: Seniority): void {
    this.level.set(level);
    this.counts.set({ ...DEFAULT_ROUND_COUNTS[level] });
  }

  step(round: PlanRound, by: number): void {
    this.counts.update((c) => ({ ...c, [round]: Math.min(MAX_ROUND_COUNT, Math.max(0, c[round] + by)) }));
  }

  async save(): Promise<void> {
    const level = this.level();
    if (!this.ready() || !level || this.saving()) return;
    this.saving.set(true);
    const state = this.progress.state();
    const events = loopEvents(
      { level, rounds: this.counts(), date: this.date(), minutesPerDay: this.minutes(), startingPoint: this.start() },
      state,
    );
    for (const event of events) await this.progress.record(event);
    const date = this.date();
    const days = date ? calendarDaysBetween(this.day(), date) : 0;
    this.today.close(
      this.mode() === 'edit'
        ? 'Loop updated.'
        : date
          ? `Plan built: ${days} ${days === 1 ? 'day' : 'days'} to your interview.`
          : 'Loop saved.',
    );
  }

  notNow(): void {
    void this.today.hideLoopCard(addCalendarDays(this.day(), LOOP_CARD_REST_DAYS)).catch(() => undefined);
    this.today.close('Hidden for a week. Set your loop from here whenever you are ready.');
  }

  cancel(): void {
    this.today.close('');
  }
}
