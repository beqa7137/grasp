import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PopoverController } from '@ionic/angular';
import type { AlgorithmDef, CodingProblemSummary, PatternSummary } from '@grasp/engine';
import { CodeTextComponent } from '../../viz/code-text.component';

export type PlayerIntroChoice = 'pattern' | 'code';

/** The visualizer's intro, behind the player's ⓘ. Its links close it first and leave the navigation to the page. */
@Component({
  selector: 'app-player-intro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CodeTextComponent],
  template: `
    <h2>{{ algo.title }}</h2>
    <div class="meta">
      @if (pattern; as p) {
        <a class="chip accent" [href]="'/learn/pattern/' + p.id" (click)="go($event, 'pattern')">{{ p.name }}</a>
      }
      <span class="chip" [class]="algo.difficulty">{{ algo.difficulty }}</span>
      <span class="chip mono">time {{ algo.complexity.time }}</span>
      <span class="chip mono">space {{ algo.complexity.space }}</span>
    </div>
    <p class="muted"><g-code-text [text]="algo.summary" /></p>
    @if (problem; as c) {
      <a class="code-it" [href]="'/code/' + c.id" (click)="go($event, 'code')">Now write it yourself: {{ c.title }} →</a>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
    }
    h2 {
      margin: 0;
      font: inherit;
      font-weight: 700;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    a.chip {
      text-decoration: none;
    }
    p {
      margin: 0;
      line-height: 1.5;
    }
    .code-it {
      color: var(--g-found);
      text-decoration: none;
      overflow-wrap: anywhere;
      padding: 4px 0;
    }
  `,
})
export class PlayerIntroComponent {
  private readonly popovers = inject(PopoverController);
  algo!: AlgorithmDef;
  pattern?: PatternSummary;
  problem?: CodingProblemSummary;

  go(event: MouseEvent, choice: PlayerIntroChoice) {
    event.preventDefault();
    void this.popovers.dismiss(choice);
  }
}
