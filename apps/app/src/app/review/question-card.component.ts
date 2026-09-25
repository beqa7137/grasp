import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import type { Question, SessionReason } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { checkmarkCircle, closeCircle } from 'ionicons/icons';
import { refocus } from '../core/focus';
import { ArrayViewComponent } from '../viz/array-view.component';
import { CodePanelComponent } from '../viz/code-panel.component';
import { CodeTextComponent } from '../viz/code-text.component';
import { GraphViewComponent } from '../viz/graph-view.component';
import { GridViewComponent } from '../viz/grid-view.component';
import { ListViewComponent } from '../viz/list-view.component';
import { TableViewComponent } from '../viz/table-view.component';
import { TreeViewComponent } from '../viz/tree-view.component';
import { answerMark } from './answer-mark';

export type CardReason = SessionReason | 'practice' | 'diagnostic';

const REASON_LABELS: Record<CardReason, string> = {
  due: 'Review',
  relearn: 'Relearning',
  boosted: 'Flagged for you',
  new: 'New',
  practice: 'Practice',
  diagnostic: 'Placement check',
};

@Component({
  selector: 'g-question-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IonIcon,
    ArrayViewComponent,
    GridViewComponent,
    GraphViewComponent,
    TableViewComponent,
    TreeViewComponent,
    ListViewComponent,
    CodePanelComponent,
    CodeTextComponent,
  ],
  template: `
    @let q = question();
    <article class="card panel" [class.answered]="chosen() !== null">
      <header>
        <span class="eyebrow">{{ q.eyebrow }}</span>
        <span class="reason" [attr.data-reason]="reason()">{{ reasonLabel() }}</span>
      </header>

      <p class="prompt" tabindex="-1" #prompt><g-code-text [text]="q.prompt" /></p>

      @if (q.frame; as f) {
        <div class="visual">
          @if (f.array) {
            <g-array-view [view]="f.array" />
          }
          @if (f.grid) {
            <g-grid-view [view]="f.grid" />
          }
          @if (f.table) {
            <g-table-view [view]="f.table" [legend]="false" />
          }
          @if (f.graph) {
            <g-graph-view [view]="f.graph" [legend]="false" />
          }
          @if (f.tree) {
            <g-tree-view [view]="f.tree" [legend]="false" />
          }
          @if (f.stack || f.queue || f.set) {
            <div class="aux">
              @if (f.stack) {
                <g-list-view [label]="f.stack.label" [items]="f.stack.items" />
              }
              @if (f.queue) {
                <g-list-view [label]="f.queue.label" [items]="f.queue.items" />
              }
              @if (f.set) {
                <g-list-view [label]="f.set.label" [items]="f.set.entries" [highlight]="f.set.active" />
              }
            </div>
          }
        </div>
      }

      @if (q.code; as code) {
        <div class="code" [class.cloze]="code.blank !== undefined">
          <g-code-panel [code]="codeLines()" [active]="activeLine()" />
        </div>
      }

      @if (q.pipeline; as stages) {
        <ol class="pipeline">
          @for (s of stages; track $index) {
            <li>
              <strong>{{ s.name }}</strong>
              <span>{{ s.detail }}</span>
            </li>
          }
        </ol>
      }

      @if (q.facts; as facts) {
        <dl class="facts">
          @for (f of facts; track f.label) {
            <div>
              <dt>{{ f.label }}</dt>
              <dd>{{ f.value }}</dd>
            </div>
          }
        </dl>
      }

      <div class="choices" [class.mono]="q.kind === 'cloze'">
        @for (c of q.choices; track $index) {
          <button
            class="choice"
            [disabled]="chosen() !== null"
            [class.right]="chosen() !== null && $index === q.answer"
            [class.wrong]="chosen() === $index && $index !== q.answer"
            (click)="choose.emit($index)"
          >
            <span class="key">{{ $index + 1 }}</span>
            @if (q.kind === 'cloze') {
              <span class="text">
                <code>{{ c }}</code>
              </span>
            } @else {
              <span class="text">{{ c }}</span>
            }
            @if (answerMark($index, q.answer, chosen()); as mark) {
              <ion-icon class="g-answer-mark" [name]="mark.icon" [attr.aria-label]="mark.label" />
            }
          </button>
        }
      </div>

      @if (chosen() !== null) {
        <div class="reveal" [class.ok]="chosen() === q.answer" tabindex="-1" #reveal>
          <ion-icon [name]="chosen() === q.answer ? 'checkmark-circle' : 'close-circle'" aria-hidden="true" />
          <div>
            <p class="verdict">{{ chosen() === q.answer ? 'Correct' : 'Not quite' }}</p>
            <p class="why"><g-code-text [text]="q.explain" /></p>
            @if (q.link; as link) {
              <a [routerLink]="link.path">{{ link.label }} →</a>
            }
          </div>
        </div>
      }
    </article>
  `,
  styleUrl: './question-card.component.scss',
})
export class QuestionCardComponent {
  readonly question = input.required<Question>();
  readonly reason = input<CardReason>('due');
  readonly chosen = input<number | null>(null);
  readonly choose = output<number>();
  protected readonly answerMark = answerMark;

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly prompt = viewChild.required<ElementRef<HTMLElement>>('prompt');
  private readonly reveal = viewChild<ElementRef<HTMLElement>>('reveal');
  private shown: { question: Question; answered: boolean } | null = null;

  readonly reasonLabel = computed(() => REASON_LABELS[this.reason()]);
  readonly activeLine = computed(() => {
    const code = this.question().code;
    if (!code) return 0;
    return code.blank !== undefined ? code.blank + 1 : (code.highlight ?? 0);
  });
  readonly codeLines = computed(() => {
    const code = this.question().code!;
    if (code.blank === undefined) return code.lines;
    const revealed = this.chosen() !== null;
    return code.lines.map((line, i) => (i === code.blank && !revealed ? `${line.match(/^\s*/)![0]}▁▁▁▁▁▁▁▁▁▁▁▁  ?` : line));
  });

  constructor() {
    addIcons({ checkmarkCircle, closeCircle });
    // A new question or the answer's reveal replaces what focus was on, so focus follows the content.
    afterRenderEffect(() => {
      const question = this.question();
      const answered = this.chosen() !== null;
      const before = this.shown;
      this.shown = { question, answered };
      const page = this.host.closest('.ion-page');
      if (!before) refocus(this.prompt().nativeElement);
      else if (question !== before.question) refocus(this.prompt().nativeElement, page);
      else if (answered && !before.answered) refocus(this.reveal()?.nativeElement, page);
    });
  }
}
