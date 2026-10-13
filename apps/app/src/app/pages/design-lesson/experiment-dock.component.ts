import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import type { SdExperiment, WidgetCheckpoint } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { checkmarkCircle, flagOutline, sparklesOutline } from 'ionicons/icons';
import { CodeTextComponent } from '../../viz/code-text.component';
import { WidgetCheckComponent } from '../design/case/widgets/widget-check.component';

export type ExperimentPhase = 'asking' | 'playing' | 'revealed';

/**
 * A lesson widget's experiments (REDESIGN.md 4.7): the active one's question in a dock under the stage, held while the
 * widget plays the answer out, then marked and explained; and below it a card per experiment, which sets the widget up
 * in one tap. A challenge shows its goal and the widget's live status instead of choices.
 */
@Component({
  selector: 'app-experiment-dock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, CodeTextComponent, WidgetCheckComponent],
  template: `
    @if (active(); as e) {
      <section class="dock" [attr.aria-label]="'Experiment: ' + e.title">
        @if (e.goal) {
          <p class="ask">{{ e.ask }}</p>
          <p class="status" [class.met]="phase() === 'revealed'" role="status">
            @if (phase() === 'revealed') {
              <ion-icon name="checkmark-circle" aria-hidden="true" />
            }
            {{ goalStatus() }}
          </p>
          <div aria-live="polite">
            @if (phase() === 'revealed') {
              <p class="reveal"><g-code-text [text]="e.reveal" /></p>
            }
          </div>
        } @else if (check(); as c) {
          <app-widget-check
            [check]="c"
            [held]="phase() !== 'revealed'"
            heldText="Watch the picture: the answer plays out on it."
            [(chosen)]="chosen"
          />
        }
      </section>
    }
    <h3 class="heading"><ion-icon name="sparkles-outline" aria-hidden="true" />Experiments</h3>
    <ol class="cards">
      @for (e of experiments(); track e.id; let i = $index) {
        <li>
          <button type="button" class="card" [attr.aria-current]="e.id === active()?.id ? 'step' : null" (click)="start.emit(e)">
            <span class="num" aria-hidden="true">
              @if (e.goal) {
                <ion-icon name="flag-outline" aria-hidden="true" />
              } @else {
                {{ i + 1 }}
              }
            </span>
            <span class="title">{{ e.title }}</span>
            @if (done().has(e.id)) {
              <ion-icon class="done" name="checkmark-circle" aria-label="done" role="img" />
            }
          </button>
        </li>
      }
    </ol>
  `,
  styles: `
    @use '../../../type' as *;

    :host {
      display: block;
    }
    .dock {
      margin-top: var(--g-space-3);
      padding: var(--g-space-3) var(--g-space-4);
      border-radius: var(--g-radius-md);
      border: 1px solid var(--g-line);
      border-left: 3px solid var(--g-accent);
      background: var(--g-surface);
    }
    .ask {
      margin: 0 0 var(--g-space-2);
      font-weight: 600;
      line-height: 1.45;
    }
    .status {
      display: flex;
      align-items: center;
      gap: var(--g-space-2);
      margin: 0;
      font: 600 var(--g-text-body) var(--ion-font-family);
      font-variant-numeric: tabular-nums;
      color: var(--g-muted);
      &.met {
        color: var(--g-success-ink);
        ion-icon {
          font-size: var(--g-text-title-l);
          animation: met var(--g-motion-sheet) var(--g-ease-enter);
        }
      }
    }
    @keyframes met {
      from {
        transform: scale(0.4);
        opacity: 0;
      }
    }
    .reveal {
      margin: var(--g-space-2) 0 0;
      line-height: 1.55;
      font-size: var(--g-text-body);
    }
    .heading {
      @include title;
      display: flex;
      align-items: center;
      gap: var(--g-space-2);
      font-size: var(--g-text-title-s);
      margin: var(--g-space-5) 0 var(--g-space-2);
      ion-icon {
        color: var(--g-accent);
      }
    }
    .cards {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: var(--g-space-2);
    }
    .card {
      width: 100%;
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: var(--g-space-3);
      padding: var(--g-space-2) var(--g-space-3);
      border: 1px solid var(--g-line-strong);
      border-radius: var(--g-radius-sm);
      background: var(--g-raised);
      box-shadow: var(--g-shadow-raised);
      color: var(--g-text);
      font: 500 var(--g-text-body) var(--ion-font-family);
      text-align: left;
      cursor: pointer;
      &[aria-current] {
        border-color: var(--g-accent);
        box-shadow: inset 0 0 0 1px var(--g-accent);
        background: var(--g-accent-soft);
      }
    }
    @media (hover: hover) {
      .card:hover:not([aria-current]) {
        border-color: var(--g-faint);
      }
    }
    .num {
      flex: none;
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: var(--g-radius-pill);
      background: var(--g-sunken);
      font: 600 var(--g-text-body-s) var(--g-font-mono);
      color: var(--g-muted);
    }
    .title {
      flex: 1;
    }
    .done {
      flex: none;
      color: var(--g-success-ink);
      font-size: var(--g-text-title-m);
    }
  `,
})
export class ExperimentDockComponent {
  readonly experiments = input.required<readonly SdExperiment[]>();
  readonly active = input<SdExperiment | null>(null);
  readonly phase = input<ExperimentPhase>('asking');
  readonly done = input<ReadonlySet<string>>(new Set());
  readonly goalStatus = input('');
  readonly chosen = model<number | null>(null);
  readonly start = output<SdExperiment>();

  readonly check = computed((): WidgetCheckpoint | null => {
    const e = this.active();
    return e && { prompt: e.ask, choices: e.choices, answer: e.answer, explain: e.reveal };
  });

  constructor() {
    addIcons({ checkmarkCircle, flagOutline, sparklesOutline });
  }
}
