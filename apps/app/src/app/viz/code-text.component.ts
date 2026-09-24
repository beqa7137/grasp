import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { codeSpans, type TextPart } from '@grasp/engine';

type Part = TextPart & { after?: string };

/** Gives each code span the characters right after it, such as `).`, so no line break comes between them. */
function glueTrailing(parts: TextPart[]): Part[] {
  const glued: Part[] = parts.map((part) => ({ ...part }));
  glued.forEach((part, i) => {
    const next = glued[i + 1];
    if (!part.code || !next || next.code) return;
    part.after = next.text.match(/^\S*/)![0];
    next.text = next.text.slice(part.after.length);
  });
  return glued.filter((part) => part.code || part.text);
}

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
        <span class="run"
          ><code>{{ part.text }}</code
          >{{ part.after }}</span
        >
      } @else {
        <span>{{ part.text }}</span>
      }
    }
  `,
  styles: `
    /* A span moves to the next line whole, and breaks inside only when large text makes it wider than a line. */
    .run {
      display: inline-block;
      max-width: 100%;
      overflow-wrap: anywhere;
    }
    code {
      font-family: var(--g-font-mono);
      font-size: 0.92em;
      font-variant-ligatures: none;
      padding: 0.1em 0.3em;
      border-radius: 4px;
      background: rgba(var(--ion-text-color-rgb), 0.08);
    }
  `,
})
export class CodeTextComponent {
  readonly text = input.required<string>();

  readonly parts = computed(() => glueTrailing(codeSpans(this.text())));
}
