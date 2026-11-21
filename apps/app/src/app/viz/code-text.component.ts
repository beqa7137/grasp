import { ChangeDetectionStrategy, Component, InjectionToken, computed, inject, input } from '@angular/core';
import { codeSpans, type TextPart } from '@grasp/engine';

type Part = TextPart & { after?: string; keep?: boolean };

/** A number and its unit, and a percentile with its value ("p99 69 ms"): a line never breaks inside one. */
const KEEP = /(?:\bp\d{2,3} )?\d[\d,.]* (?:ns|µs|ms|s|min|KB|MB|GB|TB)\b/g;
/** The runs a line never breaks inside, for every `g-code-text` under the provider: a widget may keep more of its own. */
export const CODE_TEXT_KEEP = new InjectionToken<RegExp>('CODE_TEXT_KEEP', { factory: () => KEEP });

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

/** Splits the prose so each number with its unit is a run of its own, which the template keeps on one line. */
function keepUnits(parts: Part[], keep: RegExp): Part[] {
  return parts.flatMap((part) => {
    if (part.code) return [part];
    const out: Part[] = [];
    let at = 0;
    for (const m of part.text.matchAll(keep)) {
      if (m.index > at) out.push({ ...part, text: part.text.slice(at, m.index) });
      out.push({ ...part, text: m[0], keep: true });
      at = m.index + m[0].length;
    }
    if (at < part.text.length) out.push({ ...part, text: part.text.slice(at) });
    return out;
  });
}

/**
 * Learner text with its backtick spans set as code, and every number kept on one line with its unit (content bans the
 * non-breaking space that would do it in the text). Prose gets a span of its own: a bare interpolation would pick up the
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
      } @else if (part.keep) {
        <span class="keep">{{ part.text }}</span>
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
    .keep {
      white-space: nowrap;
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

  private readonly keep = inject(CODE_TEXT_KEEP);

  readonly parts = computed(() => keepUnits(glueTrailing(codeSpans(this.text())), this.keep));
}
