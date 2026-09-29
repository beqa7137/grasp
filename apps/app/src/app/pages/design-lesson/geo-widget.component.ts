import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { geoQuery } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const LATITUDES = [
  { lat: 0, label: 'Equator' },
  { lat: 45, label: '45°' },
  { lat: 60, label: '60°' },
];
const DENSITY = 50;

const size = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${Math.round(km * 100) / 100} km`);

/** A radius search over a geohash index: cell size by precision, cells read, and how many places are read for nothing. */
@Component({
  selector: 'app-geo-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <label class="slider">
      <span
        >Geohash precision <strong class="mono">{{ precision() }} characters</strong></span
      >
      <input type="range" min="4" max="8" step="1" [value]="precision()" (input)="precision.set(+$any($event.target).value)" />
    </label>
    <label class="slider">
      <span
        >Search radius <strong class="mono">{{ radius() }} km</strong></span
      >
      <input type="range" min="0.5" max="20" step="0.5" [value]="radius()" (input)="radius.set(+$any($event.target).value)" />
    </label>
    <div class="controls" role="radiogroup" aria-label="Latitude">
      <span class="muted">Latitude</span>
      @for (l of latitudes; track l.lat) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="latitude() === l.lat"
          [class.primary]="latitude() === l.lat"
          (click)="latitude.set(l.lat)"
        >
          {{ l.label }}
        </button>
      }
    </div>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Cell size</dt>
        <dd class="word">{{ cell() }}</dd>
      </div>
      <div [class.bad]="run().cells > 100">
        <dt>Cells read</dt>
        <dd class="mono">{{ run().cells | number }}</dd>
      </div>
      <div>
        <dt>Places read</dt>
        <dd class="mono">{{ run().candidates | number: '1.0-0' }}</dd>
      </div>
      <div>
        <dt>Places in range</dt>
        <dd class="mono">{{ run().matches | number: '1.0-0' }}</dd>
      </div>
      <div [class.bad]="wasted() > 0.7">
        <dt>Reads wasted</dt>
        <dd class="mono">{{ wasted() * 100 | number: '1.0-0' }}%</dd>
      </div>
    </dl>
    <p class="muted note">
      {{ density }} places per km², read from every cell the circle's bounding square touches, then filtered by distance.
    </p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class GeoWidgetComponent {
  readonly latitudes = LATITUDES;
  readonly density = DENSITY;
  readonly precision = signal(6);
  readonly radius = signal(2);
  readonly latitude = signal(45);
  readonly run = computed(() =>
    geoQuery({ precision: this.precision(), radiusKm: this.radius(), latitude: this.latitude(), density: DENSITY }),
  );
  readonly cell = computed(() => `${size(this.run().cellWidthKm)} × ${size(this.run().cellHeightKm)}`);
  readonly wasted = computed(() => 1 - this.run().matches / this.run().candidates);
}
