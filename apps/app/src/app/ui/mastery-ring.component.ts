import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'g-mastery-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 40 40" role="img" [attr.aria-label]="pct() + '% mastery'">
      <circle cx="20" cy="20" r="16" class="bg" />
      <circle cx="20" cy="20" r="16" class="fg" [class.empty]="!pct()" [attr.stroke-dasharray]="dash()" [attr.data-level]="level()" />
      @if (showLabel()) {
        <text x="20" y="24" text-anchor="middle">{{ pct() }}</text>
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
      line-height: 0;
    }
    svg {
      transform: rotate(-90deg);
    }
    circle {
      fill: none;
      stroke-width: 4;
    }
    .bg {
      stroke: var(--g-line);
    }
    .fg {
      stroke: var(--g-accent);
      stroke-linecap: round;
      transition: stroke-dasharray 0.6s ease;
    }
    .fg.empty {
      stroke-linecap: butt;
    }
    .fg[data-level='mid'] {
      stroke: var(--g-pointer);
    }
    .fg[data-level='high'] {
      stroke: var(--g-found);
    }
    text {
      transform: rotate(90deg);
      transform-origin: 20px 20px;
      fill: var(--g-text);
      font: 600 11px var(--g-font-mono);
    }
  `,
})
export class MasteryRingComponent {
  readonly value = input.required<number>();
  readonly size = input(40);
  readonly showLabel = input(true);

  readonly pct = computed(() => Math.round(this.value() * 100));
  readonly dash = computed(() => {
    const c = 2 * Math.PI * 16;
    return `${this.pct() ? this.value() * c : 0} ${c}`;
  });
  readonly level = computed(() => (this.value() >= 0.7 ? 'high' : this.value() >= 0.35 ? 'mid' : 'low'));
}
