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
import { SegmentedComponent } from '../ui/segmented.component';
import { TextareaDirective } from '../ui/textarea.directive';

type Kind = 'bug' | 'confusing' | 'idea' | 'praise';

const KINDS: { value: Kind; label: string; placeholder: string }[] = [
  { value: 'bug', label: 'Something broke', placeholder: 'What did you do, what happened, and what did you expect?' },
  { value: 'confusing', label: 'Confusing', placeholder: 'Which part was hard to follow?' },
  { value: 'idea', label: 'Idea', placeholder: 'What would make Grasp more useful for your prep?' },
  { value: 'praise', label: 'Loved it', placeholder: 'What worked well?' },
];
const MAX_LENGTH = 2000;

@Component({
  selector: 'app-feedback-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IonContent, RovingSelectDirective, SegmentedComponent, TextareaDirective],
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
        <g-segmented class="kinds" label="Kind of feedback" [options]="kinds" [value]="kind()" (valueChange)="kind.set($event!)" />
        <textarea
          gTextarea
          [ngModel]="message()"
          (ngModelChange)="message.set($event)"
          [maxlength]="maxLength"
          [placeholder]="placeholder()"
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
      --padding-top: var(--g-space-5);
      --padding-start: var(--g-space-5);
      --padding-end: var(--g-space-5);
    }
    /* Room below the last rating for its focus ring, which the scroll area would clip. */
    ion-content.form {
      --padding-bottom: var(--g-space-2);
    }
    h2 {
      font-size: var(--g-text-title-l);
      line-height: 1.2;
      margin: 0 0 var(--g-space-4);
    }
    .kinds {
      margin-bottom: var(--g-space-3);
    }
    textarea {
      min-height: calc(5lh + 2 * var(--g-space-3) + 2px);
      max-height: 40dvh;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--g-space-3);
      font-size: var(--g-text-body-s);
      margin-top: var(--g-space-2);
    }
    /* The note wraps beside the count, and the count drops below it only when large text leaves no room. */
    .meta span:first-child {
      flex: 1;
    }
    .rating-label {
      margin: var(--g-space-5) 0 var(--g-space-2);
      font-size: var(--g-text-body);
    }
    .rating {
      display: flex;
      gap: var(--g-space-2);
    }
    .dot {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 1px solid var(--g-line-strong);
      background: var(--g-raised);
      box-shadow: var(--g-shadow-raised);
      color: var(--g-text);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
    }
    .dot.on {
      background: var(--g-accent-soft);
      border-color: var(--g-accent);
      box-shadow: inset 0 0 0 1px var(--g-accent);
    }
    .error {
      color: var(--g-danger-ink);
      font-size: var(--g-text-body);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--g-space-3);
      padding: var(--g-space-3) var(--g-space-5) var(--g-space-6);
    }
    .done {
      text-align: center;
      padding: var(--g-space-3) 0 var(--g-space-6);
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
  readonly placeholder = computed(() => KINDS.find((k) => k.value === this.kind())!.placeholder);
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
