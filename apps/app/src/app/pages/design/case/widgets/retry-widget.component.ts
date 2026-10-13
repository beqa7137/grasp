import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MAX_ATTEMPTS, retryCheckpoint, retryRun, type AttemptFate, type KeyMode } from '@grasp/engine';
import { RovingSelectDirective } from '../../../../core/roving-select.directive';
import { WidgetCheckComponent } from './widget-check.component';

const MODES: { mode: KeyMode; label: string }[] = [
  { mode: 'none', label: 'No key' },
  { mode: 'per-attempt', label: 'New key each attempt' },
  { mode: 'per-payment', label: 'One key per payment' },
];

const FATES: { fate: AttemptFate; label: string }[] = [
  { fate: 'ok', label: 'Answered' },
  { fate: 'lost', label: 'Response lost' },
  { fate: 'dropped', label: 'Never arrives' },
];

const EXAMPLES: { label: string; fates: AttemptFate[] }[] = [
  { label: 'Lost, then answered', fates: ['lost', 'ok', 'ok', 'ok'] },
  { label: 'Never arrived, then answered', fates: ['dropped', 'ok', 'ok', 'ok'] },
  { label: 'Lost every time', fates: ['lost', 'lost', 'lost', 'lost'] },
  { label: 'Mixed', fates: ['dropped', 'lost', 'dropped', 'ok'] },
];

/** One request to post a capture, retried up to three times: what each attempt meets, and how many entries the key scheme lets through. */
@Component({
  selector: 'app-retry-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective, WidgetCheckComponent],
  template: `
    <div class="controls" role="radiogroup" aria-label="Idempotency key">
      @for (m of modes; track m.mode) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="mode() === m.mode"
          [class.primary]="mode() === m.mode"
          (click)="mode.set(m.mode)"
        >
          {{ m.label }}
        </button>
      }
    </div>
    <div class="controls examples">
      <span class="muted">Examples</span>
      @for (e of examples; track e.label) {
        <button class="g-btn ghost" (click)="fates.set(e.fates)">{{ e.label }}</button>
      }
    </div>
    <ol class="attempts">
      @for (fate of fates(); track $index; let i = $index) {
        <li>
          <div class="controls" role="radiogroup" [attr.aria-label]="'Attempt ' + (i + 1)">
            <span class="name">Attempt {{ i + 1 }}</span>
            @for (f of fateOptions; track f.fate) {
              <button
                class="g-btn"
                role="radio"
                [attr.aria-checked]="fate === f.fate"
                [class.primary]="fate === f.fate"
                (click)="setFate(i, f.fate)"
              >
                {{ f.label }}
              </button>
            }
          </div>
          @if (i >= sent()) {
            <p class="muted small">Not sent: the caller already has its answer.</p>
          }
        </li>
      }
    </ol>

    <app-widget-check [check]="check()" [chosen]="chosen()" (chosenChange)="answer($event)">
      <ol class="steps">
        @for (step of run().steps; track step.attempt) {
          <li [class.posted]="step.posted">{{ step.text }}</li>
        }
      </ol>
      <dl class="readouts">
        <div [class.bad]="run().entries > 1">
          <dt>Entries posted</dt>
          <dd class="mono">{{ run().entries }}</dd>
        </div>
        <div [class.bad]="!run().confirmed">
          <dt>Caller saw</dt>
          <dd class="word">{{ run().confirmed ? 'a response' : 'only timeouts' }}</dd>
        </div>
        <div [class.bad]="run().entries > 1">
          <dt>Reversals owed</dt>
          <dd class="mono">{{ Math.max(0, run().entries - 1) }}</dd>
        </div>
      </dl>
    </app-widget-check>
    <p class="muted note">Each attempt is sent after the previous one timed out, so the ledger has finished with it.</p>
  `,
  styleUrl: '../../../design-lesson/widget.scss',
  styles: `
    .examples .g-btn {
      font-size: 0.8125rem;
    }
    .attempts {
      list-style: none;
      margin: 0 0 12px;
      padding: 0;
      display: grid;
      gap: 4px;
      .controls {
        margin-bottom: 4px;
      }
    }
    .name {
      min-width: 5.5em;
      font-weight: 600;
      font-size: 0.875rem;
    }
    .small {
      margin: 0 0 6px;
    }
    .steps {
      margin: 0;
      padding-left: 20px;
      display: grid;
      gap: 4px;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    .posted::marker {
      color: var(--g-danger-ink);
      font-weight: 700;
    }
    .readouts {
      margin-top: 4px;
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class RetryWidgetComponent {
  readonly modes = MODES;
  readonly fateOptions = FATES;
  readonly examples = EXAMPLES;
  readonly Math = Math;
  readonly mode = signal<KeyMode>('none');
  readonly fates = signal<AttemptFate[]>(EXAMPLES[0].fates.slice(0, MAX_ATTEMPTS));
  readonly run = computed(() => retryRun(this.fates(), this.mode()));
  readonly sent = computed(() => this.run().steps.length);
  readonly check = computed(() => retryCheckpoint(this.fates(), this.mode()));
  /** The attempts actually sent and the key scheme: changing an attempt the client never sends keeps the answer. */
  private readonly asked = computed(() => `${this.mode()}:${this.fates().slice(0, this.sent()).join()}`);
  private readonly answered = signal<{ asked: string; chosen: number } | null>(null);
  readonly chosen = computed(() => {
    const a = this.answered();
    return a?.asked === this.asked() ? a.chosen : null;
  });

  setFate(index: number, fate: AttemptFate) {
    this.fates.update((fates) => fates.map((f, i) => (i === index ? fate : f)));
  }

  answer(chosen: number | null) {
    if (chosen !== null) this.answered.set({ asked: this.asked(), chosen });
  }
}
