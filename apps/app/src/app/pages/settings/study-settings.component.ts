import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { STUDY_OPTIONS, relativeWorkload, type StudySettings } from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { ReminderService } from '../../reminders/reminder.service';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { SectionComponent } from '../../ui/section.component';
import { SegmentedComponent, type SegmentOption } from '../../ui/segmented.component';

const pct = (r: number) => `${Math.round(r * 100)}%`;

@Component({
  selector: 'app-study-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CrossLinkDirective, RouterLink, DatePipe, SectionComponent, SegmentedComponent],
  template: `
    <g-section heading="Study">
      <p class="muted small intro">Synced to every device you use. Changes apply from your next review.</p>

      <div class="g-setting">
        <div class="label">
          <strong id="budget-label">Daily session</strong>
          <span class="muted small">How long a review session aims to take.</span>
        </div>
        <g-segmented
          [options]="budgets"
          [value]="settings().budgetMinutes"
          (valueChange)="set({ budgetMinutes: $event! })"
          labelledby="budget-label"
        />
      </div>

      <div class="g-setting">
        <div class="label">
          <strong id="new-label">New cards per day</strong>
          <span class="muted small">Cards flagged for you by misses and interviews still come through.</span>
        </div>
        <g-segmented
          [options]="newPerDay"
          [value]="settings().newPerDay"
          (valueChange)="set({ newPerDay: $event! })"
          labelledby="new-label"
        />
      </div>

      <div class="g-setting">
        <div class="label">
          <strong id="retention-label">Target recall</strong>
          <span class="muted small">How likely you should be to remember a card when it comes back.</span>
        </div>
        <g-segmented
          [options]="retention"
          [value]="settings().retention"
          (valueChange)="set({ retention: $event! })"
          labelledby="retention-label"
        />
        <p class="hint small">{{ retentionHint() }}</p>
      </div>

      <div class="g-setting g-control-row">
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
        <a class="g-btn" routerLink="/coding/placement" crossLink>{{ diagnosedAt() ? 'Retake' : 'Take it' }}</a>
      </div>
    </g-section>

    <g-section heading="Reminders">
      @if (!reminders.supported) {
        <p class="muted small intro">Daily reminders are available in the iOS and Android app.</p>
      } @else {
        <div class="g-setting g-control-row">
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
          <div class="g-setting g-control-row">
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
    </g-section>
  `,
  styles: `
    .intro {
      margin: 0 0 var(--g-space-2);
    }
    .label {
      display: flex;
      flex-direction: column;
      gap: var(--g-space-1);
      margin-bottom: var(--g-space-3);
    }
    .g-control-row .label {
      margin: 0;
    }
    a.g-btn {
      flex: none;
    }
    .hint {
      margin: var(--g-space-3) 0 0;
      color: var(--g-muted);
      line-height: 1.45;
    }
    .time {
      background: var(--g-sunken);
      color: var(--g-text);
      border: 1px solid var(--g-stroke);
      border-radius: var(--g-radius-sm);
      padding: var(--g-space-2) var(--g-space-3);
      font-size: var(--g-text-title-s);
    }
    .notice {
      padding: var(--g-space-3);
      border-radius: var(--g-radius-sm);
      background: var(--g-warn-soft);
      color: var(--g-warn-ink);
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

  readonly budgets: SegmentOption<number>[] = STUDY_OPTIONS.budgetMinutes.map((m) => ({ value: m, label: `${m} min` }));
  readonly newPerDay: SegmentOption<number>[] = STUDY_OPTIONS.newPerDay.map((n) => ({ value: n, label: String(n) }));
  readonly retention: SegmentOption<number>[] = STUDY_OPTIONS.retention.map((r) => ({ value: r, label: pct(r) }));

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
