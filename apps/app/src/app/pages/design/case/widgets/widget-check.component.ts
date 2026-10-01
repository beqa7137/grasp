import { ChangeDetectionStrategy, Component, ElementRef, Injector, inject, input, model, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import type { WidgetCheckpoint } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { checkmarkCircle, closeCircle } from 'ionicons/icons';
import { refocusAfterRender } from '../../../../core/focus';
import { answerMark } from '../../../../review/answer-mark';
import { CodeTextComponent } from '../../../../viz/code-text.component';

/** A case widget's question about its own settings: choose first, then every choice is marked and the answer explained. */
@Component({
  selector: 'app-widget-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, CodeTextComponent],
  template: `
    @let c = check();
    @if (chosen() === null) {
      <fieldset class="check">
        <legend class="legend">{{ c.prompt }}</legend>
        @for (choice of c.choices; track $index) {
          <button class="g-choice option" (click)="choose($index)">{{ choice }}</button>
        }
      </fieldset>
    } @else {
      <div class="check" role="group" [attr.aria-label]="c.prompt" tabindex="-1" #answered>
        <p class="legend">{{ c.prompt }}</p>
        <ul class="options">
          @for (choice of c.choices; track $index) {
            <li class="g-choice option" [class.right]="$index === c.answer" [class.wrong]="$index === chosen() && $index !== c.answer">
              <span>{{ choice }}</span>
              @if (answerMark($index, c.answer, chosen()); as mark) {
                <ion-icon class="g-answer-mark" [name]="mark.icon" [attr.aria-label]="mark.label" role="img" />
              }
            </li>
          }
        </ul>
        <p class="explain"><g-code-text [text]="c.explain" /></p>
        <ng-content />
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .check {
      border: 0;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 8px;
      min-width: 0;
      outline: none;
    }
    .legend {
      padding: 0;
      margin: 0 0 4px;
      font-weight: 600;
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
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 12px;
      font: 500 0.90625rem/1.45 var(--ion-font-family);
      text-align: left;
    }
    .explain {
      margin: 0;
      line-height: 1.55;
      font-size: 0.90625rem;
    }
  `,
})
export class WidgetCheckComponent {
  readonly check = input.required<WidgetCheckpoint>();
  readonly chosen = model<number | null>(null);
  protected readonly answerMark = answerMark;
  private readonly injector = inject(Injector);
  private readonly answered = viewChild<ElementRef<HTMLElement>>('answered');

  constructor() {
    addIcons({ checkmarkCircle, closeCircle });
  }

  choose(index: number) {
    this.chosen.set(index);
    refocusAfterRender(this.injector, () => this.answered()?.nativeElement);
  }
}
