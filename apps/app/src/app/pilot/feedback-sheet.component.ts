import { ChangeDetectionStrategy, Component, ElementRef, Injector, computed, inject, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { IonContent } from '@ionic/angular';
import { ApiError, ApiService } from '../core/api.service';
import { refocusAfterRender } from '../core/focus';
import { haptic } from '../core/haptics';
import { RovingSelectDirective } from '../core/roving-select.directive';
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
  imports: [FormsModule, IonContent, RovingSelectDirective],
  template: `
    <ion-content [class.form]="!sent()">
      @if (sent()) {
        <div class="done" tabindex="-1" #done>
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
      }
    </ion-content>
    @if (!sent()) {
      <div class="actions">
        <button class="g-btn ghost" (click)="closed.emit()">Cancel</button>
        <button class="g-btn primary" [disabled]="!canSend()" (click)="send()">{{ sending() ? 'Sending…' : 'Send' }}</button>
      </div>
    }
  `,
  styles: `
    ion-content {
      --padding-top: 20px;
      --padding-start: 20px;
      --padding-end: 20px;
    }
    /* Room below the last rating for its focus ring, which the scroll area would clip. */
    ion-content.form {
      --padding-bottom: 8px;
    }
    h2 {
      font: 600 1.25rem/1.2 var(--g-font-display);
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
      font-size: 0.8125rem;
      padding: 6px 12px;
    }
    textarea {
      width: 100%;
      resize: vertical;
      background: var(--g-surface);
      color: var(--g-text);
      border: 1px solid var(--g-stroke);
      border-radius: var(--g-radius-sm);
      padding: 12px;
      font: 0.9375rem/1.45 var(--ion-font-family);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 12px;
      font-size: 0.75rem;
      margin-top: 6px;
    }
    /* The note wraps beside the count, and the count drops below it only when large text leaves no room. */
    .meta span:first-child {
      flex: 1;
    }
    .rating-label {
      margin: 18px 0 8px;
      font-size: 0.875rem;
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
      color: var(--g-on-fill);
    }
    .error {
      color: var(--g-danger);
      font-size: 0.875rem;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 12px 20px 28px;
    }
    .done {
      text-align: center;
      padding: 12px 0 28px;
    }
  `,
})
export class FeedbackSheetComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly runtime = inject(RuntimeConfigService);
  private readonly injector = inject(Injector);
  private readonly done = viewChild<ElementRef<HTMLElement>>('done');

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
      refocusAfterRender(this.injector, () => this.done()?.nativeElement);
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'Could not send your feedback. Check your connection and try again.');
    } finally {
      this.sending.set(false);
    }
  }
}
