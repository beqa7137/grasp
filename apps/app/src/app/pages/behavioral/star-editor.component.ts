import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { countWords, formatClock, reviewStar, type StarDraft, type StarPart } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { alertCircle, checkmarkCircle } from 'ionicons/icons';

const PARTS: readonly { part: StarPart; label: string; hint: string }[] = [
  { part: 'situation', label: 'Situation', hint: 'Where and when, in two sentences. Only what the story needs.' },
  { part: 'task', label: 'Task', hint: 'What you owned, and what made it hard.' },
  { part: 'action', label: 'Action', hint: 'What you did and why, step by step. Say "I".' },
  { part: 'result', label: 'Result', hint: 'What changed, with a number: time, errors, users, money, a date.' },
  { part: 'reflection', label: 'Reflection', hint: 'What you learned, or would do differently. One or two sentences.' },
];

@Component({
  selector: 'app-star-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <div class="layout" [class.coached]="coached()">
      <form class="star" (submit)="$event.preventDefault()">
        @for (p of parts; track p.part) {
          <label class="field">
            <span class="label"
              >{{ p.label }} <span class="count muted">{{ words()[p.part] }} words</span></span
            >
            <textarea
              [attr.aria-label]="p.label"
              [value]="draft()[p.part]"
              (input)="edit.emit({ part: p.part, text: $any($event.target).value })"
              [placeholder]="p.hint"
              [rows]="p.part === 'action' ? 6 : 3"
            ></textarea>
          </label>
        }
        @if (coached()) {
          <p class="saved muted">Saved on this device only.</p>
        }
      </form>

      @if (coached()) {
        <aside class="panel checks" aria-label="Answer check">
          <p class="time">
            <span class="big">{{ spoken() }}</span>
            <span class="muted">to say aloud, aim for 1:30 to 3:00</span>
          </p>
          <p class="score">{{ passing() }} of {{ review().checks.length }} checks pass</p>
          <ul>
            @for (c of review().checks; track c.id) {
              <li [class.ok]="c.ok">
                <ion-icon [name]="c.ok ? 'checkmark-circle' : 'alert-circle'" [attr.aria-label]="c.ok ? 'Pass' : 'To fix'" role="img" />
                <span>{{ c.message }}</span>
              </li>
            }
          </ul>
        </aside>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .layout {
      display: grid;
      gap: 16px;
      align-items: start;
    }
    @media (min-width: 720px) {
      .layout.coached {
        grid-template-columns: minmax(0, 1fr) 260px;
      }
      .checks {
        position: sticky;
        top: 12px;
      }
    }
    .star {
      display: grid;
      gap: 14px;
    }
    .field {
      display: grid;
      gap: 6px;
    }
    .label {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-weight: 600;
      font-size: 0.9375rem;
    }
    .count {
      font-weight: 400;
      font-size: 0.8125rem;
    }
    textarea {
      width: 100%;
      resize: vertical;
      background: var(--g-surface);
      color: var(--g-text);
      border: 1px solid var(--g-stroke);
      border-radius: var(--g-radius-sm);
      padding: 12px;
      font: 0.9375rem/1.5 var(--ion-font-family);
    }
    .saved {
      font-size: 0.8125rem;
      margin: 0;
    }
    .checks {
      padding: 16px;
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 10px;
      }
      li {
        display: flex;
        gap: 8px;
        font-size: 0.875rem;
        line-height: 1.45;
        ion-icon {
          flex: none;
          margin-top: 2px;
          color: var(--g-warn-ink);
        }
        &.ok ion-icon {
          color: var(--g-found-ink);
        }
      }
    }
    .time {
      display: grid;
      margin: 0 0 6px;
      .big {
        font-size: 1.75rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .muted {
        font-size: 0.8125rem;
      }
    }
    .score {
      font-weight: 600;
      font-size: 0.875rem;
      margin: 0 0 12px;
    }
  `,
})
export class StarEditorComponent {
  readonly draft = input.required<StarDraft>();
  /** Off in a mock interview, where no one checks the answer as it is given and nothing is kept. */
  readonly coached = input(true);
  readonly edit = output<{ part: StarPart; text: string }>();
  readonly parts = PARTS;
  readonly review = computed(() => reviewStar(this.draft()));
  readonly passing = computed(() => this.review().checks.filter((c) => c.ok).length);
  readonly words = computed(() => {
    const draft = this.draft();
    return Object.fromEntries(PARTS.map(({ part }) => [part, countWords(draft[part])])) as Record<StarPart, number>;
  });
  readonly spoken = computed(() => formatClock(this.review().seconds));

  constructor() {
    addIcons({ checkmarkCircle, alertCircle });
  }
}
