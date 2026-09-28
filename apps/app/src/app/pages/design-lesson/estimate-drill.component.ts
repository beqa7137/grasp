import { ChangeDetectionStrategy, Component, ElementRef, Injector, computed, inject, input, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { estimateVerdict, parseAmount, type CaseEstimate, type EstimateVerdict } from '@grasp/engine';
import { refocusAfterRender } from '../../core/focus';
import { CodeTextComponent } from '../../viz/code-text.component';

const VERDICTS = {
  'spot-on': 'Spot on.',
  ballpark: 'In the right ballpark: the order of magnitude is what counts.',
  off: 'Off by more than 2x. Walk through the working.',
} as const;

/** Back-of-envelope questions one at a time: type an estimate, then see the answer and how it falls out. */
@Component({
  selector: 'app-estimate-drill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, CodeTextComponent],
  template: `
    @if (current(); as q) {
      <p class="muted progress">Question {{ index() + 1 }} of {{ drill().length }}</p>
      <form (submit)="$event.preventDefault(); check(answerInput.value)">
        <label [for]="inputId()"><g-code-text [text]="q.question" /></label>
        <div class="row">
          <input
            #answerInput
            #answerField
            [id]="inputId()"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            [disabled]="verdict() !== null"
          />
          <span class="unit muted">{{ q.unit }}</span>
          @if (verdict() === null) {
            <button class="g-btn primary" type="submit">Check</button>
          }
        </div>
        @if (invalid()) {
          <p class="hint" role="alert">Type a number, such as 120000 or 120k.</p>
        }
      </form>
      @if (verdict(); as v) {
        <div class="result" [class.ok]="v.tone !== 'off'" role="status" tabindex="-1" #result>
          <p>
            <strong>{{ q.answer | number: '1.0-0' }} {{ q.unit }}.</strong> {{ verdicts[v.tone] }}
          </p>
          <ol>
            @for (w of q.working; track $index) {
              <li><g-code-text [text]="w" /></li>
            }
          </ol>
        </div>
        <button class="g-btn primary" (click)="next()">{{ index() + 1 < drill().length ? 'Next question' : 'See how you did' }}</button>
      }
    } @else {
      <p class="summary" role="status">{{ close() }} of {{ drill().length }} within 2x of the answer.</p>
      <button class="g-btn" (click)="restart()">Try them again</button>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .progress {
      font-size: 0.8125rem;
      margin: 0 0 6px;
    }
    label {
      display: block;
      font-weight: 600;
      line-height: 1.5;
      margin-bottom: 8px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    input {
      width: 11em;
      max-width: 100%;
      padding: 10px 12px;
      border-radius: var(--g-radius-sm);
      border: 1px solid var(--g-line-strong);
      background: var(--g-raised);
      color: var(--g-text);
      font: 500 1rem var(--g-font-mono);
    }
    .hint {
      margin: -4px 0 12px;
      color: var(--g-danger-ink);
      font-size: 0.875rem;
    }
    .result {
      margin: 0 0 12px;
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(var(--g-danger-rgb), 0.08);
      &.ok {
        background: rgba(var(--g-found-rgb), 0.1);
      }
      p {
        margin: 0 0 8px;
        line-height: 1.5;
      }
      ol {
        margin: 0;
        padding-left: 20px;
        display: grid;
        gap: 4px;
      }
      li {
        line-height: 1.5;
        font-size: 0.90625rem;
      }
    }
    .summary {
      font-weight: 600;
      margin: 0 0 12px;
    }
  `,
})
export class EstimateDrillComponent {
  readonly drill = input.required<readonly CaseEstimate[]>();
  protected readonly verdicts = VERDICTS;
  private readonly injector = inject(Injector);
  private readonly result = viewChild<ElementRef<HTMLElement>>('result');
  private readonly answerField = viewChild<ElementRef<HTMLElement>>('answerField');
  readonly index = signal(0);
  readonly verdict = signal<EstimateVerdict | null>(null);
  readonly invalid = signal(false);
  private readonly results = signal<EstimateVerdict[]>([]);
  readonly current = computed(() => this.drill()[this.index()]);
  readonly inputId = computed(() => `estimate-drill-${this.index()}`);
  readonly close = computed(() => this.results().filter((r) => r.tone !== 'off').length);

  check(raw: string) {
    const guess = parseAmount(raw);
    const q = this.current();
    this.invalid.set(guess === null);
    if (guess === null || !q) return;
    const verdict = estimateVerdict(guess, q.answer);
    this.verdict.set(verdict);
    this.results.update((r) => [...r, verdict]);
    refocusAfterRender(this.injector, () => this.result()?.nativeElement);
  }

  next() {
    this.verdict.set(null);
    this.invalid.set(false);
    this.index.update((i) => i + 1);
    refocusAfterRender(this.injector, () => this.answerField()?.nativeElement);
  }

  restart() {
    this.results.set([]);
    this.next();
    this.index.set(0);
  }
}
