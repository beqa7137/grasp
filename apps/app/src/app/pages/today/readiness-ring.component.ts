import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const R = 15.5;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** Loop readiness as a ring meter (REDESIGN.md 4.1): the arc is the score out of 100, the number sits inside it. */
@Component({
  selector: 'app-readiness-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'meter',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'score()',
    '[attr.aria-valuetext]': 'score() + ", " + band()',
    '[attr.aria-label]': 'label()',
  },
  template: `
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <circle class="track" cx="18" cy="18" [attr.r]="r" />
      @if (score() > 0) {
        <circle class="arc" cx="18" cy="18" [attr.r]="r" [attr.stroke-dasharray]="dash()" />
      }
    </svg>
    <span class="n" aria-hidden="true">{{ score() }}</span>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 3.5em;
      height: 3.5em;
    }
    svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    circle {
      fill: none;
      stroke-width: 3.5;
    }
    .track {
      stroke: var(--g-sunken);
    }
    .arc {
      stroke: var(--g-success-ink);
      stroke-linecap: round;
    }
    .n {
      font: 700 var(--g-text-title-m) var(--ion-font-family);
      font-variant-numeric: tabular-nums;
    }
    @media (forced-colors: active) {
      .arc {
        stroke: CanvasText;
      }
    }
  `,
})
export class ReadinessRingComponent {
  readonly score = input.required<number>();
  readonly band = input.required<string>();
  readonly label = input('Loop readiness');
  readonly r = R;
  readonly dash = computed(() => `${(CIRCUMFERENCE * this.score()) / 100} ${CIRCUMFERENCE}`);
}
