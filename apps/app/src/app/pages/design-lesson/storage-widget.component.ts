import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { storageCost } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const PAGES = [4, 8, 16];

interface Slider {
  key: 'dataGB' | 'recordBytes' | 'writeMBps' | 'ratio';
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: Slider[] = [
  { key: 'dataGB', label: 'Data', unit: 'GB', min: 10, max: 1000, step: 10 },
  { key: 'recordBytes', label: 'Record size', unit: 'bytes', min: 64, max: 1000, step: 4 },
  { key: 'writeMBps', label: 'New data written', unit: 'MB/s', min: 1, max: 100, step: 1 },
  { key: 'ratio', label: 'LSM size ratio between levels', unit: '×', min: 4, max: 20, step: 1 },
];

/** One random-write workload on a B-tree and on a leveled LSM tree: what each writes to disk and reads per lookup. */
@Component({
  selector: 'app-storage-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    @for (s of sliders; track s.key) {
      <label class="slider">
        <span
          >{{ s.label }} <strong class="mono">{{ values()[s.key] | number }} {{ s.unit }}</strong></span
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
    <div class="controls" role="radiogroup" aria-label="B-tree page size">
      <span class="muted">Page</span>
      @for (p of pages; track p) {
        <button class="g-btn" role="radio" [attr.aria-checked]="pageKB() === p" [class.primary]="pageKB() === p" (click)="pageKB.set(p)">
          {{ p }} KB
        </button>
      }
    </div>
    <label class="toggle">
      <input type="checkbox" [checked]="bloom()" (change)="bloom.set($any($event.target).checked)" />
      Bloom filters on the LSM tree's files
    </label>

    <div class="engines">
      @for (e of engines(); track e.name) {
        <section class="engine" [attr.aria-label]="e.name">
          <h3>{{ e.name }}</h3>
          <dl class="readouts">
            <div>
              <dt>{{ e.name === 'B-tree' ? 'Height' : 'Levels' }}</dt>
              <dd class="mono">{{ e.cost.levels }}</dd>
            </div>
            <div [class.bad]="e.cost.writeAmplification > 30">
              <dt>Write amp.</dt>
              <dd class="mono">{{ e.cost.writeAmplification | number: '1.0-1' }}×</dd>
            </div>
            <div>
              <dt>Disk writes</dt>
              <dd class="mono">{{ e.cost.diskWriteMBps | number: '1.0-0' }} MB/s</dd>
            </div>
            <div [class.bad]="e.cost.lookupReads > 1">
              <dt>Reads per lookup</dt>
              <dd class="mono">{{ e.cost.lookupReads }}</dd>
            </div>
          </dl>
        </section>
      }
    </div>
    <p class="muted note">
      A rough model: each random B-tree update writes its whole page back, with the upper levels cached; the LSM tree writes its log,
      flushes a 64 MB memtable and rewrites data about (ratio + 1) / 2 times per level as it compacts.
    </p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    .toggle {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 0.875rem;
      margin-bottom: 12px;
    }
    .engines {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
    }
    .engine h3 {
      margin: 0 0 6px;
      font-size: 0.9375rem;
    }
    .readouts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class StorageWidgetComponent {
  readonly sliders = SLIDERS;
  readonly pages = PAGES;
  readonly values = signal<Record<Slider['key'], number>>({ dataGB: 100, recordBytes: 100, writeMBps: 10, ratio: 10 });
  readonly pageKB = signal(4);
  readonly bloom = signal(true);
  readonly engines = computed(() => {
    const options = { ...this.values(), pageKB: this.pageKB(), memtableMB: 64, bloom: this.bloom() };
    return [
      { name: 'B-tree', cost: storageCost('btree', options) },
      { name: 'LSM tree', cost: storageCost('lsm', options) },
    ];
  });

  set(key: Slider['key'], value: number) {
    this.values.update((v) => ({ ...v, [key]: value }));
  }
}
