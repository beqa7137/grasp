import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { codeSpans } from '@grasp/engine';

/**
 * Learner text with its backtick spans set as code. Prose gets a span of its own: a bare interpolation would pick up the
 * template's line breaks as extra spaces.
 */
@Component({
  selector: 'g-code-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (part of parts(); track $index) {
      @if (part.code) {
        <code>{{ part.text }}</code>
      } @else {
        <span>{{ part.text }}</span>
      }
    }
  `,
  styles: `
    code {
      font-family: var(--g-font-mono);
      font-size: 0.92em;
      font-variant-ligatures: none;
      white-space: nowrap;
      padding: 0.1em 0.3em;
      border-radius: 4px;
      background: rgba(var(--ion-text-color-rgb), 0.08);
    }
  `,
})
export class CodeTextComponent {
  readonly text = input.required<string>();

  readonly parts = computed(() => codeSpans(this.text()));
}
