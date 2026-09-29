import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { batchJob } from '@grasp/engine';

interface Slider {
  key: 'inputGB' | 'workers' | 'reducers' | 'hotPct';
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: Slider[] = [
  { key: 'inputGB', label: 'Input', unit: 'GB', min: 100, max: 5000, step: 100 },
  { key: 'workers', label: 'Workers', unit: '', min: 10, max: 200, step: 10 },
  { key: 'reducers', label: 'Reducers', unit: '', min: 1, max: 200, step: 1 },
  { key: 'hotPct', label: 'Records on the hottest key', unit: '%', min: 0, max: 50, step: 1 },
];

const time = (s: number) => `${Math.round(s).toLocaleString('en-US')} s`;

/** A MapReduce-style job: how long map, shuffle and reduce take, and how one hot key stalls the whole job. */
@Component({
  selector: 'app-batch-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    @for (s of sliders; track s.key) {
      <label class="slider">
        <span
          >{{ s.label }}
          <strong class="mono">{{ values()[s.key] | number }}{{ s.unit === '%' ? '%' : s.unit ? ' ' + s.unit : '' }}</strong></span
        >
        <input
          type="range"
          [min]="s.min"
          [max]="s.max"
          [step]="s.step"
          [value]="values()[s.key]"
          (input)="set(s.key, +$any($event.target).value)"
        />
      </label>
    }
    <label class="toggle">
      <input type="checkbox" [checked]="combiner()" (change)="combiner.set($any($event.target).checked)" />
      Combiner: sum on each mapper before the shuffle
    </label>

    <div class="bar" role="img" [attr.aria-label]="summary()">
      <span class="map" [style.flex-grow]="job().mapSec"></span>
      <span class="shuffle" [style.flex-grow]="job().shuffleSec"></span>
      <span class="reduce" [style.flex-grow]="job().reduceSec"></span>
    </div>
    <p class="legend muted">
      <span class="item"><span class="swatch map"></span>Map</span>
      <span class="item"><span class="swatch shuffle"></span>Shuffle</span>
      <span class="item"><span class="swatch reduce"></span>Reduce</span>
    </p>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Map</dt>
        <dd class="mono">{{ fmt(job().mapSec) }}</dd>
      </div>
      <div>
        <dt>Shuffle data</dt>
        <dd class="mono">{{ job().shuffleGB | number: '1.0-1' }} GB</dd>
      </div>
      <div>
        <dt>Shuffle</dt>
        <dd class="mono">{{ fmt(job().shuffleSec) }}</dd>
      </div>
      <div [class.bad]="job().reduceSec > job().mapSec">
        <dt>Busiest reducer</dt>
        <dd class="mono">{{ job().slowestReducerGB | number: '1.0-1' }} GB</dd>
      </div>
      <div [class.bad]="job().reduceSec > job().mapSec">
        <dt>Reduce</dt>
        <dd class="mono">{{ fmt(job().reduceSec) }}</dd>
      </div>
      <div>
        <dt>Whole job</dt>
        <dd class="mono">{{ fmt(job().totalSec) }}</dd>
      </div>
    </dl>
    <p class="muted note">Each machine reads, sends or reduces 100 MB/s; map output is half the input; a combiner shrinks it tenfold.</p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .toggle {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 0.875rem;
      margin-bottom: 12px;
    }
    .bar {
      display: flex;
      height: 18px;
      border-radius: 6px;
      overflow: hidden;
      background: var(--g-line);
    }
    .map {
      background: var(--g-accent);
    }
    .shuffle {
      background: var(--g-warn);
    }
    .reduce {
      background: var(--g-found);
    }
    .legend .item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .swatch {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class BatchWidgetComponent {
  readonly sliders = SLIDERS;
  readonly values = signal<Record<Slider['key'], number>>({ inputGB: 1000, workers: 50, reducers: 50, hotPct: 0 });
  readonly combiner = signal(false);
  readonly job = computed(() => {
    const v = this.values();
    return batchJob({
      inputGB: v.inputGB,
      workers: v.workers,
      reducers: v.reducers,
      hotKeyShare: v.hotPct / 100,
      combiner: this.combiner(),
    });
  });
  readonly summary = computed(
    () => `Map ${time(this.job().mapSec)}, shuffle ${time(this.job().shuffleSec)}, reduce ${time(this.job().reduceSec)}`,
  );
  readonly fmt = time;

  set(key: Slider['key'], value: number) {
    this.values.update((v) => ({ ...v, [key]: value }));
  }
}
