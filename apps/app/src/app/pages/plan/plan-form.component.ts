import { ChangeDetectionStrategy, Component, ElementRef, computed, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import {
  PLAN_LEVELS,
  PLAN_MAX_DAYS,
  PLAN_MINUTES,
  PLAN_ROUNDS,
  addCalendarDays,
  calendarDaysBetween,
  isCalendarDate,
  type PlanLevel,
  type PlanRound,
  type StudyPlanInput,
} from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';
import { formatMinutes } from './duration';

const ROUND_LABELS: Record<PlanRound, string> = { coding: 'Coding', design: 'System design', behavioral: 'Behavioral' };
const LEVELS: Record<PlanLevel, { label: string; hint: string }> = {
  new: { label: 'New to this', hint: 'Every unit at a learning pace, from the first pattern on.' },
  rusty: { label: 'Rusty', hint: 'You have prepared before: units are a little shorter.' },
  confident: {
    label: 'Confident',
    hint: 'Units are shorter, and patterns your placement check marked strong count as covered.',
  },
};

@Component({
  selector: 'app-plan-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective],
  template: `
    <form class="panel form" (submit)="submit($event)" novalidate>
      <div class="field">
        <label for="plan-date"><strong>Interview date</strong></label>
        <input
          #dateInput
          id="plan-date"
          type="date"
          [min]="today()"
          [max]="latest()"
          [value]="date()"
          (input)="date.set($any($event.target).value)"
          (change)="date.set($any($event.target).value)"
          [attr.aria-invalid]="error()?.field === 'date' ? 'true' : null"
          [attr.aria-describedby]="error()?.field === 'date' ? 'plan-date-hint plan-error' : 'plan-date-hint'"
        />
        <span id="plan-date-hint" class="muted small"
          >Up to a year from today. If your rounds are on different days, choose the first.</span
        >
      </div>

      <div class="field" role="radiogroup" aria-labelledby="plan-minutes-label">
        <strong id="plan-minutes-label">Time a day</strong>
        <div class="g-chip-radios">
          @for (m of minuteOptions; track m.value) {
            <button type="button" role="radio" [attr.aria-checked]="minutes() === m.value" (click)="minutes.set(m.value)">
              {{ m.label }}
            </button>
          }
        </div>
      </div>

      <fieldset class="field">
        <legend><strong>Rounds in your interview</strong></legend>
        <div class="checks">
          @for (r of roundOptions; track r.value) {
            <label class="check">
              <input type="checkbox" [checked]="rounds().includes(r.value)" (change)="toggle(r.value)" />
              {{ r.label }}
            </label>
          }
        </div>
      </fieldset>

      <div class="field" role="radiogroup" aria-labelledby="plan-level-label" aria-describedby="plan-level-hint">
        <strong id="plan-level-label">Where you are starting</strong>
        <div class="g-chip-radios levels">
          @for (l of levelOptions; track l.value) {
            <button type="button" role="radio" [attr.aria-checked]="level() === l.value" (click)="level.set(l.value)">
              {{ l.label }}
            </button>
          }
        </div>
        <span id="plan-level-hint" class="muted small">{{ levelHint() }}</span>
      </div>

      <!-- Keyed by attempt, so the alert is created afresh and read again even when the message repeats. -->
      @for (e of errors(); track e.attempt) {
        <p id="plan-error" class="error" role="alert">{{ e.text }}</p>
      }
      <div class="actions">
        <button type="submit" class="g-btn primary">Save plan</button>
        @if (initial()) {
          <button type="button" class="g-btn ghost" (click)="cancelled.emit()">Cancel</button>
        }
      </div>
    </form>
  `,
  styles: `
    .form {
      padding: 16px;
      display: grid;
      gap: 18px;
    }
    .field {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    legend {
      padding: 0;
      margin-bottom: 8px;
    }
    .small {
      line-height: 1.45;
    }
    input[type='date'] {
      justify-self: start;
      background: var(--g-raised);
      color: var(--g-text);
      border: 1px solid var(--g-stroke);
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 0.9375rem;
    }
    .levels button {
      font-family: inherit;
    }
    .checks {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      font-size: 0.9375rem;
      cursor: pointer;
    }
    .check input {
      width: 18px;
      height: 18px;
      margin: 0;
      accent-color: var(--g-accent);
    }
    .error {
      margin: 0;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(var(--g-danger-rgb), 0.1);
      color: var(--g-danger-ink);
      font-size: 0.875rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class PlanFormComponent {
  readonly today = input.required<string>();
  readonly initial = input<StudyPlanInput | null>(null);
  readonly saved = output<StudyPlanInput>();
  readonly cancelled = output<void>();

  readonly minuteOptions = PLAN_MINUTES.map((m) => ({ value: m as number, label: formatMinutes(m) }));
  readonly roundOptions = PLAN_ROUNDS.map((r) => ({ value: r, label: ROUND_LABELS[r] }));
  readonly levelOptions = PLAN_LEVELS.map((l) => ({ value: l, label: LEVELS[l].label }));

  readonly date = linkedSignal(() => this.initial()?.interviewDate ?? '');
  readonly minutes = linkedSignal<number>(() => this.initial()?.minutesPerDay ?? 30);
  readonly rounds = linkedSignal<PlanRound[]>(() => this.initial()?.rounds ?? [...PLAN_ROUNDS]);
  readonly level = linkedSignal<PlanLevel>(() => this.initial()?.level ?? 'new');
  private readonly dateInput = viewChild.required<ElementRef<HTMLInputElement>>('dateInput');
  readonly error = signal<{ text: string; field: 'date' | 'rounds'; attempt: number } | null>(null);
  readonly errors = computed(() => {
    const e = this.error();
    return e ? [e] : [];
  });
  private attempts = 0;
  readonly latest = computed(() => addCalendarDays(this.today(), PLAN_MAX_DAYS));
  readonly levelHint = computed(() => LEVELS[this.level()].hint);

  toggle(round: PlanRound) {
    this.rounds.update((list) => (list.includes(round) ? list.filter((r) => r !== round) : [...list, round]));
  }

  submit(event: Event) {
    event.preventDefault();
    const date = this.date();
    const ahead = isCalendarDate(date) ? calendarDaysBetween(this.today(), date) : -1;
    if (ahead < 0 || ahead > PLAN_MAX_DAYS) {
      this.error.set({ text: 'Choose an interview date from today to a year from now.', field: 'date', attempt: ++this.attempts });
      this.dateInput().nativeElement.focus();
      return;
    }
    if (!this.rounds().length) {
      this.error.set({ text: 'Choose at least one round.', field: 'rounds', attempt: ++this.attempts });
      return;
    }
    this.error.set(null);
    this.saved.emit({
      interviewDate: date,
      minutesPerDay: this.minutes(),
      rounds: PLAN_ROUNDS.filter((r) => this.rounds().includes(r)),
      level: this.level(),
    });
  }
}
