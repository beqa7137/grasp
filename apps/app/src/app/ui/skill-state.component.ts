import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** The four skill states and the placement check's two results, each with its own shape and name. */
export type SkillGlyph = 'new' | 'learning' | 'practiced' | 'ready' | 'spotted' | 'to-learn';

const NAMES: Record<SkillGlyph, string> = {
  new: 'New',
  learning: 'Learning',
  practiced: 'Practiced',
  ready: 'Ready',
  spotted: 'Spotted',
  'to-learn': 'To learn',
};

/**
 * A skill's state as a shape (REDESIGN.md 2.8), so it reads without colour: an empty ring for New, a half-filled one for
 * Learning, a full disc for Practiced and a disc with a check for Ready. The placement check's "Spotted" is a ring with a
 * check, so it never reads as Ready, and "To learn" is New's ring. Drawn inline, since every ionicons glyph ships with
 * first paint.
 */
@Component({
  selector: 'g-skill-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'name()', '[class]': 'state()' },
  template: `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle class="ring" cx="8" cy="8" r="6.25" />
      @switch (shape()) {
        @case ('half') {
          <path class="fill" d="M1.75 8a6.25 6.25 0 0 0 12.5 0z" />
        }
        @case ('full') {
          <circle class="fill" cx="8" cy="8" r="6.25" />
        }
        @case ('ring-check') {
          <path class="check outline" d="M5 8.2l2 2 4-4.2" />
        }
        @case ('check') {
          <circle class="fill" cx="8" cy="8" r="6.25" />
          <path class="check" d="M5 8.2l2 2 4-4.2" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
      flex: none;
      width: 1.15em;
      height: 1.15em;
      color: var(--g-stroke);
      line-height: 0;
    }
    :host(.learning),
    :host(.practiced) {
      color: var(--g-info-ink);
    }
    :host(.ready),
    :host(.spotted) {
      color: var(--g-success-ink);
    }
    svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .ring {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
    }
    .fill {
      fill: currentColor;
    }
    .check {
      fill: none;
      stroke: var(--g-on-fill);
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .check.outline {
      stroke: currentColor;
    }
    @media (forced-colors: active) {
      :host {
        color: CanvasText;
      }
      .check:not(.outline) {
        stroke: Canvas;
      }
    }
  `,
})
export class SkillStateComponent {
  readonly state = input.required<SkillGlyph>();
  readonly name = computed(() => NAMES[this.state()]);
  readonly shape = computed(() => {
    switch (this.state()) {
      case 'learning':
        return 'half';
      case 'practiced':
        return 'full';
      case 'ready':
        return 'check';
      case 'spotted':
        return 'ring-check';
      default:
        return 'ring';
    }
  });
}
