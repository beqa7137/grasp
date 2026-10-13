import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

/**
 * A skinned native range input (REDESIGN.md 3.2): it keeps the browser's slider role and keys, with an accent fill up to
 * the thumb. `valueText` is what screen readers hear in place of the bare number ("120 ms").
 */
@Component({
  selector: 'g-slider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      type="range"
      [min]="min()"
      [max]="max()"
      [step]="step()"
      [value]="value()"
      [disabled]="disabled()"
      [attr.aria-label]="label()"
      [attr.aria-valuetext]="valueText() ?? null"
      [style.--g-slider-fill]="fill() + '%'"
      (input)="value.set($any($event.target).valueAsNumber)"
    />
  `,
  styles: `
    :host {
      display: block;
    }
    input {
      appearance: none;
      -webkit-appearance: none;
      width: 100%;
      height: 32px;
      margin: 0;
      background: transparent;
      cursor: pointer;
    }
    input:disabled {
      cursor: default;
      opacity: 0.5;
    }
    input::-webkit-slider-runnable-track {
      height: 6px;
      border-radius: var(--g-radius-pill);
      background: linear-gradient(to right, var(--g-accent) var(--g-slider-fill), var(--g-sunken) var(--g-slider-fill));
      box-shadow: inset 0 0 0 1px var(--g-line-strong);
    }
    input::-moz-range-track {
      height: 6px;
      border-radius: var(--g-radius-pill);
      background: linear-gradient(to right, var(--g-accent) var(--g-slider-fill), var(--g-sunken) var(--g-slider-fill));
      box-shadow: inset 0 0 0 1px var(--g-line-strong);
    }
    input::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 22px;
      height: 22px;
      margin-top: calc(var(--g-space-2) * -1);
      border-radius: 50%;
      border: 1px solid var(--g-line-strong);
      background: var(--g-raised);
      box-shadow: var(--g-shadow-raised);
    }
    input::-moz-range-thumb {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1px solid var(--g-line-strong);
      background: var(--g-raised);
      box-shadow: var(--g-shadow-raised);
    }
  `,
})
export class SliderComponent {
  readonly label = input.required<string>();
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly value = model(0);
  readonly valueText = input<string>();
  readonly disabled = input(false);
  readonly fill = computed(() => {
    const span = this.max() - this.min();
    return span > 0 ? ((this.value() - this.min()) / span) * 100 : 0;
  });
}
