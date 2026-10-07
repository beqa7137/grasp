import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import type { WorkedExample } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { bulbOutline, playCircle } from 'ionicons/icons';
import { CodeTextComponent } from '../../viz/code-text.component';

/** A worked example the learner reveals at their own pace: the key move, then one step at a time. */
@Component({
  selector: 'app-worked-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonIcon, CodeTextComponent],
  template: `
    <h3>{{ example().title }}</h3>
    <p class="problem"><g-code-text [text]="example().problem" /></p>

    @if (insightShown()) {
      <p class="insight"><ion-icon name="bulb-outline" aria-hidden="true" /><g-code-text [text]="example().insight" /></p>
    } @else {
      <button class="g-btn" (click)="insightShown.set(true)">Think first, then show the key move</button>
    }

    @if (insightShown()) {
      <ol class="steps" aria-live="polite">
        @for (s of shownSteps(); track $index) {
          <li><g-code-text [text]="s" /></li>
        }
      </ol>
      <div class="controls">
        @if (revealed() < example().steps.length) {
          <button class="g-btn primary" (click)="revealed.set(revealed() + 1)">
            {{ revealed() ? 'Next step' : 'Walk through it' }}
          </button>
          <span class="muted count">{{ revealed() }} of {{ example().steps.length }} steps</span>
          <button class="g-btn ghost" (click)="revealed.set(example().steps.length)">Show all</button>
        } @else if (example().visualize; as v) {
          <a class="g-btn" [routerLink]="['/coding/visualizers', v.algorithmId]" [queryParams]="{ input: inputJson() }"
            ><ion-icon name="play-circle" aria-hidden="true" />Step through it in the visualizer</a
          >
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    h3 {
      font-size: 1rem;
      margin: 0 0 6px;
    }
    .problem {
      margin: 0 0 12px;
      line-height: 1.55;
      font-size: 0.9375rem;
    }
    .insight {
      display: flex;
      gap: 8px;
      margin: 0 0 12px;
      padding: 10px 12px;
      border-radius: var(--g-radius-sm);
      background: var(--g-accent-soft);
      line-height: 1.5;
      font-size: 0.9375rem;
      ion-icon {
        flex: none;
        margin-top: 3px;
        color: var(--g-accent);
      }
    }
    .steps {
      margin: 0 0 12px;
      padding-left: 22px;
      display: grid;
      gap: 8px;
      &:empty {
        display: none;
      }
    }
    li {
      line-height: 1.55;
      font-size: 0.90625rem;
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
export class WorkedExampleComponent {
  readonly example = input.required<WorkedExample>();
  readonly insightShown = signal(false);
  readonly revealed = signal(0);
  readonly shownSteps = computed(() => this.example().steps.slice(0, this.revealed()));
  readonly inputJson = computed(() => JSON.stringify(this.example().visualize?.input ?? {}));

  constructor() {
    addIcons({ bulbOutline, playCircle });
  }
}
