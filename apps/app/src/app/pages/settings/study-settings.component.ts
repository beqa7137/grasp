import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { STUDY_OPTIONS, relativeWorkload, type StudySettings } from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { RovingSelectDirective } from '../../core/roving-select.directive';
import { ReminderService } from '../../reminders/reminder.service';

export interface Choice<T> {
  value: T;
  label: string;
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

@Component({
  selector: 'app-study-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, RovingSelectDirective],
  template: `
    <section class="panel block">
      <h2>Study</h2>
      <p class="muted small intro">Synced to every device you use. Changes apply from your next review.</p>

      <div class="setting" role="radiogroup" aria-labelledby="budget-label">
        <div class="label">
          <strong id="budget-label">Daily session</strong>
          <span class="muted small">How long a review session aims to take.</span>
        </div>
        <div class="g-chip-radios">
          @for (c of budgets; track c.value) {
            <button role="radio" [attr.aria-checked]="settings().budgetMinutes === c.value" (click)="set({ budgetMinutes: c.value })">
              {{ c.label }}
            </button>
          }
        </div>
      </div>

      <div class="setting" role="radiogroup" aria-labelledby="new-label">
        <div class="label">
          <strong id="new-label">New cards per day</strong>
          <span class="muted small">Cards flagged for you by misses and interviews still come through.</span>
        </div>
        <div class="g-chip-radios">
          @for (c of newPerDay; track c.value) {
            <button role="radio" [attr.aria-checked]="settings().newPerDay === c.value" (click)="set({ newPerDay: c.value })">
              {{ c.label }}
            </button>
          }
        </div>
      </div>

      <div class="setting" role="radiogroup" aria-labelledby="retention-label">
        <div class="label">
          <strong id="retention-label">Target recall</strong>
          <span class="muted small">How likely you should be to remember a card when it comes back.</span>
        </div>
        <div class="g-chip-radios">
          @for (c of retention; track c.value) {
            <button role="radio" [attr.aria-checked]="settings().retention === c.value" (click)="set({ retention: c.value })">
              {{ c.label }}
            </button>
          }
        </div>
        <p class="hint small">{{ retentionHint() }}</p>
      </div>

      <div class="setting g-control-row">
        <div class="label">
          <strong>Placement check</strong>
          <span class="muted small">
            @if (diagnosedAt(); as last) {
              Taken {{ last | date: 'MMM d' }}. Retake it to reorder which patterns your new cards start with.
            } @else {
              Answer one question per pattern so your new cards start with the ones you don't know yet.
            }
          </span>
        </div>
        <a class="g-btn" routerLink="/diagnostic">{{ diagnosedAt() ? 'Retake' : 'Take it' }}</a>
      </div>
    </section>

    <section class="panel block">
      <h2>Reminders</h2>
      @if (!reminders.supported) {
        <p class="muted small intro">Daily reminders are available in the iOS and Android app.</p>
      } @else {
        <div class="setting g-control-row">
          <div class="label">
            <strong>Daily reminder</strong>
            <span class="muted small">Only on days with something to review, and it says how much.</span>
          </div>
          <label class="g-switch">
            <input
              type="checkbox"
              [checked]="reminders.prefs().enabled"
              (change)="toggle($any($event.target))"
              aria-label="Daily reminder"
            />
            <span class="track"><span class="knob"></span></span>
          </label>
        </div>
        @if (reminders.prefs().enabled) {
          <div class="setting g-control-row">
            <div class="label">
              <strong>Time</strong>
              <span class="muted small">{{ scheduledText() }}</span>
            </div>
            <input
              class="time mono"
              type="time"
              aria-label="Reminder time"
              [value]="reminders.prefs().time"
              (change)="reminders.setTime($any($event.target).value)"
            />
          </div>
        }
        @if (denied()) {
          <p class="notice small">Notifications are turned off for Grasp. Allow them in your device settings to get reminders.</p>
        }
      }
    </section>
  `,
  styles: `
    .block {
      padding: 18px 18px 8px;
      margin-bottom: 16px;
    }
    h2 {
      font: 600 1.0625rem/1.2 var(--g-font-display);
      margin: 0 0 6px;
    }
    .intro {
      margin: 0 0 8px;
    }
    .small {
      font-size: 0.8125rem;
    }
    .setting {
      padding: 12px 0;
      border-top: 1px solid var(--g-line);
    }
    .label {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 10px;
    }
    .g-control-row .label {
      margin: 0;
    }
    a.g-btn {
      flex: none;
    }
    .hint {
      margin: 10px 0 0;
      color: var(--g-muted);
      line-height: 1.45;
    }
    .time {
      background: var(--g-raised);
      color: var(--g-text);
      border: 1px solid var(--g-stroke);
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 0.9375rem;
    }
    .notice {
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(var(--g-warn-rgb), 0.12);
      color: var(--g-warn);
    }
  `,
})
export class StudySettingsComponent {
  private readonly progress = inject(ProgressService);
  readonly reminders = inject(ReminderService);
  readonly settings = this.progress.settings;
  readonly diagnosedAt = computed(() => this.progress.state().diagnosedAt);
  readonly denied = computed(() => this.reminders.permission() === 'denied');
  private readonly declined = signal(false);

  readonly budgets: Choice<number>[] = STUDY_OPTIONS.budgetMinutes.map((m) => ({ value: m, label: `${m} min` }));
  readonly newPerDay: Choice<number>[] = STUDY_OPTIONS.newPerDay.map((n) => ({ value: n, label: String(n) }));
  readonly retention: Choice<number>[] = STUDY_OPTIONS.retention.map((r) => ({ value: r, label: pct(r) }));

  readonly retentionHint = computed(() => {
    const r = this.settings().retention;
    const load = relativeWorkload(r);
    if (Math.abs(load - 1) < 0.01) return `${pct(r)} is the recommended balance of recall and review time.`;
    const ratio = load > 1 ? `about ${load.toFixed(1)}× the reviews` : `about ${Math.round((1 - load) * 100)}% fewer reviews`;
    return `${pct(r)} means ${ratio} of 90% once cards are mature${load > 1 ? ', for a small gain in recall' : ', but you will forget more often'}.`;
  });

  readonly scheduledText = computed(() => {
    if (this.declined() || this.reminders.permission() !== 'granted') return 'Waiting for notification permission.';
    const n = this.reminders.scheduled();
    return n ? `Scheduled for ${n} of the next 7 days.` : 'Nothing to remind you about in the next 7 days.';
  });

  set(change: Partial<StudySettings>) {
    void this.progress.updateSettings(change);
  }

  async toggle(input: HTMLInputElement) {
    const ok = await this.reminders.setEnabled(input.checked);
    this.declined.set(!ok);
    if (!ok) input.checked = false;
  }
}
