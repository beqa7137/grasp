import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import type { ExampleAnswer, StrongExample } from '@grasp/engine';

export const STAR_LABELS = [
  ['situation', 'Situation'],
  ['task', 'Task'],
  ['action', 'Action'],
  ['result', 'Result'],
  ['reflection', 'Reflection'],
] as const;

/** A worked answer, part by part; a strong one can show why each part works. */
@Component({
  selector: 'app-example-answer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notes()) {
      <button class="g-btn ghost toggle" [attr.aria-expanded]="annotated()" (click)="annotated.set(!annotated())">
        {{ annotated() ? 'Hide why it works' : 'Show why it works' }}
      </button>
    }
    <dl>
      @for (p of parts; track p[0]) {
        @if (answer()[p[0]]; as text) {
          <dt>{{ p[1] }}</dt>
          <dd>
            <p>{{ text }}</p>
            @if (annotated() && notes(); as n) {
              <p class="note">{{ n[p[0]] }}</p>
            }
          </dd>
        }
      }
    </dl>
  `,
  styles: `
    @use '../../../type' as *;

    :host {
      display: block;
    }
    .toggle {
      margin-bottom: 12px;
    }
    dl {
      margin: 0;
      display: grid;
      gap: 10px;
    }
    dt {
      @include label;
      color: var(--g-accent);
    }
    dd {
      margin: 0;
    }
    p {
      margin: 0;
      line-height: 1.6;
      font-size: 0.9375rem;
    }
    .note {
      margin-top: 6px;
      padding: 8px 12px;
      border-left: 3px solid var(--g-accent);
      background: var(--g-accent-soft);
      border-radius: 0 var(--g-radius-sm) var(--g-radius-sm) 0;
      font-size: 0.875rem;
    }
  `,
})
export class ExampleAnswerComponent {
  readonly answer = input.required<ExampleAnswer>();
  readonly notes = input<StrongExample['notes']>();
  readonly parts = STAR_LABELS;
  readonly annotated = signal(false);
}
