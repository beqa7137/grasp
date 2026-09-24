import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { STUDY_OPTIONS, relativeWorkload, type StudySettings } from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { ReminderService } from '../../reminders/reminder.service';

interface Choice<T> {
  value: T;
  label: string;
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

@Component({
  selector: 'app-study-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel block">
      <h2>Study</h2>
      <p class="muted small intro">Synced to every device you use. Changes apply from your next review.</p>

      <div class="setting" role="radiogroup" aria-labelledby="budget-label">
        <div class="label">
          <strong id="budget-label">Daily session</strong>
          <span class="muted small">How long a review session aims to take.</span>
        </div>
        <div class="chips">
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
        <div class="chips">
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
        <div class="chips">
          @for (c of retention; track c.value) {
            <button role="radio" [attr.aria-checked]="settings().retention === c.value" (click)="set({ retention: c.value })">
              {{ c.label }}
            </button>
          }
        </div>
        <p class="hint small">{{ retentionHint() }}</p>
      </div>
    </section>

    <section class="panel block">
      <h2>Reminders</h2>
      @if (!reminders.supported) {
        <p class="muted small intro">Daily reminders are available in the iOS and Android app.</p>
      } @else {
        <div class="setting toggle-row">
          <div class="label">
            <strong>Daily reminder</strong>
            <span class="muted small">Only on days with something to review, and it says how much.</span>
          </div>
          <label class="switch">
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
          <div class="setting toggle-row">
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
      font: 600 17px/1.2 var(--g-font-display);
      margin: 0 0 6px;
    }
    .intro {
      margin: 0 0 8px;
    }
    .small {
      font-size: 13px;
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
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .toggle-row .label {
      margin: 0;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chips button {
      min-width: 52px;
      min-height: 36px;
      padding: 0 12px;
      border-radius: 10px;
      border: 1px solid var(--g-line-strong);
      background: var(--g-raised);
      color: var(--g-text);
      font: 600 14px var(--g-font-mono);
      cursor: pointer;
    }
    .chips button[aria-checked='true'] {
      background: var(--g-accent);
      border-color: var(--g-accent);
      color: #0b0d12;
    }
    .hint {
      margin: 10px 0 0;
      color: var(--g-muted);
      line-height: 1.45;
    }
    .time {
      background: var(--g-raised);
      color: var(--g-text);
      border: 1px solid var(--g-line-strong);
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 15px;
      color-scheme: dark;
    }
    .notice {
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(255, 181, 71, 0.12);
      color: var(--g-warn);
    }
    .switch {
      position: relative;
      flex: none;
      cursor: pointer;
    }
    .switch input {
      position: absolute;
      opacity: 0;
      inset: 0;
      margin: 0;
      cursor: pointer;
    }
    .track {
      display: block;
      width: 46px;
      height: 28px;
      border-radius: 14px;
      background: var(--g-line-strong);
      transition: background 0.2s;
    }
    .knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--g-text);
      transition: transform 0.2s;
    }
    .switch input:checked + .track {
      background: var(--g-accent);
    }
    .switch input:checked + .track .knob {
      transform: translateX(18px);
    }
    .switch input:focus-visible + .track {
      outline: 2px solid var(--g-accent);
      outline-offset: 2px;
    }
  `,
})
export class StudySettingsComponent {
  private readonly progress = inject(ProgressService);
  readonly reminders = inject(ReminderService);
  readonly settings = this.progress.settings;
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
