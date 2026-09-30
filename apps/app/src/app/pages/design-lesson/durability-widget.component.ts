import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { durability, type Redundancy } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const SCHEMES: { label: string; redundancy: Redundancy }[] = [
  { label: '2 copies', redundancy: { kind: 'replicas', copies: 2 } },
  { label: '3 copies', redundancy: { kind: 'replicas', copies: 3 } },
  { label: '6 + 3 erasure', redundancy: { kind: 'erasure', data: 6, parity: 3 } },
  { label: '10 + 4 erasure', redundancy: { kind: 'erasure', data: 10, parity: 4 } },
];
const REPAIRS = [1, 6, 24, 72, 168];

const oneIn = (p: number) => {
  if (p <= 0) return 'never';
  const n = 1 / p;
  const digits = Math.floor(Math.log10(n)) - 1;
  const rounded = Math.round(n / 10 ** digits) * 10 ** digits;
  return `1 in ${rounded.toLocaleString('en-US')}`;
};

/** One object under replication or erasure coding: the space it costs, the failures it survives, and its nines. */
@Component({
  selector: 'app-durability-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Redundancy">
      @for (s of schemes; track s.label) {
        <button class="g-btn" role="radio" [attr.aria-checked]="scheme() === s" [class.primary]="scheme() === s" (click)="scheme.set(s)">
          {{ s.label }}
        </button>
      }
    </div>
    <label class="slider">
      <span
        >Disks failing a year <strong class="mono">{{ afr() | number: '1.1-1' }}%</strong></span
      >
      <input type="range" min="0.5" max="10" step="0.5" [value]="afr()" (input)="afr.set(+$any($event.target).value)" />
    </label>
    <div class="controls" role="radiogroup" aria-label="Repair time">
      <span class="muted">Repair time</span>
      @for (h of repairs; track h) {
        <button class="g-btn" role="radio" [attr.aria-checked]="repair() === h" [class.primary]="repair() === h" (click)="repair.set(h)">
          {{ h }} h
        </button>
      }
    </div>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Storage overhead</dt>
        <dd class="mono">{{ run().overhead | number: '1.0-2' }}x</dd>
      </div>
      <div>
        <dt>Failures tolerated</dt>
        <dd class="mono">{{ run().tolerates }}</dd>
      </div>
      <div [class.bad]="run().nines < 9">
        <dt>Nines of durability</dt>
        <dd class="mono">{{ run().nines | number: '1.1-1' }}</dd>
      </div>
      <div>
        <dt>Chance an object is lost in a year</dt>
        <dd class="mono">{{ lost() }}</dd>
      </div>
      <div>
        <dt>Read to repair one piece</dt>
        <dd class="mono">{{ run().repairRead }}x</dd>
      </div>
    </dl>
    <p class="muted note">
      Disks fail independently here. Racks, power and bad batches fail together, which makes real losses far likelier.
    </p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
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
export class DurabilityWidgetComponent {
  readonly schemes = SCHEMES;
  readonly repairs = REPAIRS;
  readonly scheme = signal(SCHEMES[1]);
  readonly afr = signal(2);
  readonly repair = signal(24);
  readonly run = computed(() => durability(this.scheme().redundancy, { afr: this.afr() / 100, repairHours: this.repair() }));
  readonly lost = computed(() => oneIn(this.run().annualLoss));
}
