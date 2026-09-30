import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { StarDraft } from '@grasp/engine';
import { STAR_PARTS } from '../behavioral/star-parts';

/** A STAR answer as sent in the chat, folded so the follow-ups stay in view. */
@Component({
  selector: 'app-star-answer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details>
      <summary>Your answer</summary>
      <dl>
        @for (p of parts(); track p.part) {
          <dt>{{ p.label }}</dt>
          <dd>{{ star()[p.part] }}</dd>
        }
      </dl>
    </details>
  `,
  styles: `
    :host {
      display: block;
      padding: 11px 14px;
      border-radius: 16px 16px 4px 16px;
      background: var(--g-accent);
      border: 1px solid var(--g-accent);
      color: var(--g-on-fill);
      line-height: 1.55;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
    }
    summary:focus-visible {
      outline: 2px solid var(--g-on-fill);
      outline-offset: 2px;
    }
    dl {
      margin: 10px 0 0;
    }
    dt {
      font-weight: 600;
      font-size: 0.8125rem;
      margin-top: 8px;
    }
    dd {
      margin: 2px 0 0;
      white-space: pre-wrap;
    }
  `,
})
export class StarAnswerComponent {
  readonly star = input.required<StarDraft>();
  readonly parts = computed(() => STAR_PARTS.filter(({ part }) => this.star()[part].trim()));
}
