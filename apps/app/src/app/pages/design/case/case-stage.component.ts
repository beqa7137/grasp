import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { chosenOption, estimateVerdict, parseAmount, type CaseStage, type CaseStageAnswer, type CaseWidget } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { arrowForward, checkmarkCircle, closeCircle, constructOutline } from 'ionicons/icons';
import { refocus, refocusAfterRender } from '../../../core/focus';
import { answerMark } from '../../../review/answer-mark';
import { CodeTextComponent } from '../../../viz/code-text.component';
import { HotAccountWidgetComponent } from './widgets/hot-account-widget.component';
import { ReconcileWidgetComponent } from './widgets/reconcile-widget.component';
import { RetryWidgetComponent } from './widgets/retry-widget.component';

const VERDICTS = {
  'spot-on': 'Spot on.',
  ballpark: 'In the right ballpark: interviewers care about the order of magnitude.',
  off: 'Off by more than 2x. Walk through the working below.',
} as const;

const WIDGET_TITLES: Record<CaseWidget, string> = {
  retries: 'Try it: retries with and without idempotency keys',
  'hot-account': 'Try it: one hot account at peak',
  reconcile: "Try it: reconcile a day's captures",
};

/** One interview stage: commit to a decision or an estimate first, then reveal the model answer a point at a time. */
@Component({
  selector: 'app-case-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, IonIcon, CodeTextComponent, RetryWidgetComponent, HotAccountWidgetComponent, ReconcileWidgetComponent],
  template: `
    @let s = stage();
    <p class="prompt"><g-code-text [text]="s.prompt" /></p>

    @if (s.decision; as d) {
      @if (chosen() !== null) {
        <div class="decision" role="group" [attr.aria-label]="d.question" tabindex="-1" #answered>
          <p class="legend">{{ d.question }}</p>
          <ul class="options">
            @for (o of d.options; track $index) {
              <li class="g-choice option" [class.right]="$index === best()" [class.wrong]="$index === chosen() && $index !== best()">
                <span class="label"><g-code-text [text]="o.label" /></span>
                @if (answerMark($index, best(), chosen()); as mark) {
                  <ion-icon class="g-answer-mark" [name]="mark.icon" [attr.aria-label]="mark.label" role="img" />
                }
                <span class="why"><g-code-text [text]="o.why" /></span>
              </li>
            }
          </ul>
        </div>
      } @else {
        <fieldset class="decision">
          <legend class="legend">{{ d.question }}</legend>
          @for (o of d.options; track $index) {
            <button class="g-choice option" (click)="choose($index)"><g-code-text [text]="o.label" /></button>
          }
        </fieldset>
      }
    }

    @if (s.estimate; as e) {
      <form class="estimate" (submit)="$event.preventDefault(); check(guessInput.value)">
        <label [for]="inputId()">{{ e.question }}</label>
        <div class="row">
          <input
            #guessInput
            [id]="inputId()"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            [value]="answer().guess ?? ''"
            [disabled]="verdict() !== null"
            [attr.aria-describedby]="inputId() + '-unit'"
          />
          <span class="unit muted" [id]="inputId() + '-unit'">{{ e.unit }}</span>
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
            <strong>{{ e.answer | number: '1.0-0' }} {{ e.unit }}.</strong> {{ verdicts[v.tone] }}
          </p>
          <ol>
            @for (w of e.working; track $index) {
              <li><g-code-text [text]="w" /></li>
            }
          </ol>
        </div>
      }
    }

    @if (s.widget && attempted()) {
      <section class="widget" [attr.aria-labelledby]="inputId() + '-widget'">
        <h3 [id]="inputId() + '-widget'">{{ widgetTitles[s.widget] }}</h3>
        @switch (s.widget) {
          @case ('retries') {
            <app-retry-widget />
          }
          @case ('hot-account') {
            <app-hot-account-widget />
          }
          @case ('reconcile') {
            <app-reconcile-widget />
          }
        }
      </section>
    }

    @if (revealed() > 0) {
      <ul class="points" aria-live="polite">
        @for (p of shownPoints(); track $index) {
          <li><g-code-text [text]="p" /></li>
        }
      </ul>
    }

    <div class="controls">
      @if (revealed() < s.points.length) {
        <button class="g-btn" [class.primary]="attempted()" (click)="reveal(revealed() + 1)">
          {{ revealed() ? 'Next point' : 'Show the model answer' }}
        </button>
        @if (revealed()) {
          <span class="muted count">{{ revealed() }} of {{ s.points.length }}</span>
          <button class="g-btn ghost" (click)="reveal(s.points.length)">Show all</button>
        }
      } @else {
        @if (s.lab) {
          <a class="g-btn" routerLink="/design/free-build" [queryParams]="{ case: caseId() }"
            ><ion-icon name="construct-outline" aria-hidden="true" />Load-test it in the Design Lab</a
          >
        }
        @if (showNext()) {
          <button class="g-btn primary" (click)="next.emit()">{{ nextLabel() }}<ion-icon name="arrow-forward" aria-hidden="true" /></button>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .prompt {
      margin: 0 0 12px;
      line-height: 1.55;
    }
    .decision {
      border: 0;
      padding: 0;
      margin: 0 0 12px;
      display: grid;
      gap: 8px;
      min-width: 0;
    }
    .legend {
      padding: 0;
      font-weight: 600;
      margin-bottom: 8px;
      line-height: 1.45;
    }
    .options {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .option {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px 10px;
      padding: 12px 14px;
      border-radius: 12px;
      font: 500 0.90625rem/1.45 var(--ion-font-family);
    }
    .why {
      grid-column: 1 / -1;
      font-weight: 400;
      color: var(--g-muted);
      font-size: 0.875rem;
    }
    .estimate {
      margin: 0 0 12px;
      label {
        display: block;
        font-weight: 600;
        margin-bottom: 8px;
      }
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
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
      margin: 6px 0 0;
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
    .widget {
      margin: 0 0 12px;
      padding: 14px;
      border: 1px solid var(--g-line);
      border-radius: 12px;
      h3 {
        margin: 0 0 12px;
        font-size: 0.9375rem;
      }
    }
    .points {
      margin: 0 0 12px;
      padding-left: 20px;
      display: grid;
      gap: 8px;
      li {
        line-height: 1.55;
        font-size: 0.9375rem;
      }
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      a {
        text-decoration: none;
      }
    }
    .count {
      font-size: 0.8125rem;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class CaseStageComponent {
  readonly stage = input.required<CaseStage>();
  readonly caseId = input.required<string>();
  readonly answer = model<CaseStageAnswer>({});
  readonly nextLabel = input('Next stage');
  readonly showNext = input(true);
  readonly next = output<void>();
  protected readonly answerMark = answerMark;
  private readonly injector = inject(Injector);
  private readonly answered = viewChild<ElementRef<HTMLElement>>('answered');
  private readonly result = viewChild<ElementRef<HTMLElement>>('result');
  protected readonly verdicts = VERDICTS;
  protected readonly widgetTitles = WIDGET_TITLES;

  readonly chosen = computed(() => chosenOption(this.stage(), this.answer()));
  readonly revealed = computed(() => Math.min(this.answer().revealed ?? 0, this.stage().points.length));
  readonly invalid = signal(false);
  readonly verdict = computed(() => {
    const estimate = this.stage().estimate;
    const guess = parseAmount(this.answer().guess ?? '');
    return estimate && guess !== null ? estimateVerdict(guess, estimate.answer) : null;
  });
  readonly inputId = computed(() => `estimate-${this.caseId()}-${this.stage().title.replace(/\W+/g, '-').toLowerCase()}`);
  readonly best = computed(() => this.stage().decision?.options.findIndex((o) => o.best) ?? -1);
  readonly shownPoints = computed(() => this.stage().points.slice(0, this.revealed()));
  readonly attempted = computed(() => {
    const s = this.stage();
    return (!s.decision || this.chosen() !== null) && (!s.estimate || this.verdict() !== null);
  });

  constructor() {
    addIcons({ arrowForward, checkmarkCircle, closeCircle, constructOutline });
  }

  choose(index: number) {
    if (this.chosen() !== null) return;
    this.answer.update((a) => ({ ...a, chosen: index }));
    refocusAfterRender(this.injector, () => this.answered()?.nativeElement);
  }

  reveal(count: number) {
    this.answer.update((a) => ({ ...a, revealed: count }));
  }

  check(raw: string) {
    const guess = parseAmount(raw);
    this.invalid.set(guess === null);
    if (guess === null || !this.stage().estimate) return;
    this.answer.update((a) => ({ ...a, guess: raw.trim() }));
    afterNextRender(
      () => {
        const result = this.result()?.nativeElement;
        // The verdict answers the tap that asked for it, so it comes into view whichever way the check was made.
        result?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        refocus(result);
      },
      { injector: this.injector },
    );
  }
}
