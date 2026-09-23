import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { ApiError, ApiService } from '../core/api.service';
import { haptic } from '../core/haptics';
import { RuntimeConfigService } from '../core/runtime-config.service';

type Kind = 'bug' | 'confusing' | 'idea' | 'praise';

const KINDS: { id: Kind; label: string; placeholder: string }[] = [
  { id: 'bug', label: 'Something broke', placeholder: 'What did you do, what happened, and what did you expect?' },
  { id: 'confusing', label: 'Confusing', placeholder: 'Which part was hard to follow?' },
  { id: 'idea', label: 'Idea', placeholder: 'What would make Grasp more useful for your prep?' },
  { id: 'praise', label: 'Loved it', placeholder: 'What worked well?' },
];
const MAX_LENGTH = 2000;

@Component({
  selector: 'app-feedback-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="sheet">
      @if (sent()) {
        <div class="done">
          <h2>Thank you</h2>
          <p class="muted">Every note is read. It helps decide what we build next.</p>
          <button class="g-btn primary" (click)="closed.emit()">Close</button>
        </div>
      } @else {
        <h2>Send feedback</h2>
        <div class="kinds" role="radiogroup" aria-label="Kind of feedback">
          @for (k of kinds; track k.id) {
            <button
              type="button"
              role="radio"
              class="chip"
              [class.accent]="kind() === k.id"
              [attr.aria-checked]="kind() === k.id"
              (click)="kind.set(k.id)"
            >
              {{ k.label }}
            </button>
          }
        </div>
        <textarea
          [ngModel]="message()"
          (ngModelChange)="message.set($event)"
          [maxlength]="maxLength"
          [placeholder]="placeholder()"
          rows="5"
          aria-label="Your feedback"
        ></textarea>
        <div class="meta muted">
          <span>Includes the screen you're on ({{ route() }}) and app version.</span>
          <span>{{ message().length }}/{{ maxLength }}</span>
        </div>

        <p class="rating-label">How useful is Grasp for your interview prep right now? <span class="muted">(optional)</span></p>
        <div class="rating" role="radiogroup" aria-label="Usefulness from 1 to 5">
          @for (n of [1, 2, 3, 4, 5]; track n) {
            <button
              type="button"
              role="radio"
              class="dot"
              [class.on]="rating() === n"
              [attr.aria-checked]="rating() === n"
              (click)="toggleRating(n)"
            >
              {{ n }}
            </button>
          }
        </div>

        @if (error(); as e) {
          <p class="error" role="alert">{{ e }}</p>
        }
        <div class="actions">
          <button class="g-btn ghost" (click)="closed.emit()">Cancel</button>
          <button class="g-btn primary" [disabled]="!canSend()" (click)="send()">{{ sending() ? 'Sending…' : 'Send' }}</button>
        </div>
      }
    </div>
  `,
  styles: `
    .sheet {
      padding: 20px 20px 28px;
      max-width: 560px;
      margin: 0 auto;
    }
    h2 {
      font: 600 20px/1.2 var(--g-font-display);
      margin: 0 0 14px;
    }
    .kinds {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .kinds .chip {
      cursor: pointer;
      font-size: 13px;
      padding: 6px 12px;
    }
    textarea {
      width: 100%;
      resize: vertical;
      background: var(--g-surface);
      color: var(--g-text);
      border: 1px solid var(--g-line-strong);
      border-radius: var(--g-radius-sm);
      padding: 12px;
      font: 15px/1.45 var(--ion-font-family);
    }
    textarea:focus {
      outline: 2px solid var(--g-accent);
      outline-offset: 1px;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
      margin-top: 6px;
    }
    .rating-label {
      margin: 18px 0 8px;
      font-size: 14px;
    }
    .rating {
      display: flex;
      gap: 8px;
    }
    .dot {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 1px solid var(--g-line-strong);
      background: var(--g-raised);
      color: var(--g-text);
      font-weight: 600;
      cursor: pointer;
    }
    .dot.on {
      background: var(--g-accent);
      border-color: var(--g-accent);
      color: #0b0d12;
    }
    .error {
      color: var(--g-danger);
      font-size: 14px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
    }
    .done {
      text-align: center;
      padding: 12px 0;
    }
  `,
})
export class FeedbackSheetComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly runtime = inject(RuntimeConfigService);

  readonly closed = output<void>();
  readonly kinds = KINDS;
  readonly maxLength = MAX_LENGTH;

  readonly kind = signal<Kind>('bug');
  readonly message = signal('');
  readonly rating = signal<number | null>(null);
  readonly sending = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  readonly route = computed(() => this.router.url.split('?')[0]);
  readonly placeholder = computed(() => KINDS.find((k) => k.id === this.kind())!.placeholder);
  readonly canSend = computed(() => !this.sending() && this.message().trim().length > 0);

  toggleRating(n: number) {
    this.rating.update((r) => (r === n ? null : n));
  }

  async send() {
    if (!this.canSend()) return;
    this.sending.set(true);
    this.error.set(null);
    try {
      await this.api.post('/feedback', {
        kind: this.kind(),
        message: this.message().trim(),
        rating: this.rating(),
        context: { route: this.route(), release: this.runtime.config().release, platform: Capacitor.getPlatform() },
      });
      void haptic.success();
      this.sent.set(true);
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'Could not send your feedback. Check your connection and try again.');
    } finally {
      this.sending.set(false);
    }
  }
}
