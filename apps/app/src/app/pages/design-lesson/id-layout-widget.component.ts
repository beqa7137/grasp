import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { collisionChance, idLayout } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const TICKS = [1, 10];
const RANDOM_BITS = [64, 122];
const COUNTS = [
  { count: 1e6, label: 'A million' },
  { count: 1e9, label: 'A billion' },
  { count: 1e12, label: 'A trillion' },
];

function chance(p: number): string {
  if (p >= 0.995) return 'near certain';
  if (p >= 0.1) return `${Math.round(p * 100)}%`;
  if (p >= 0.01) return `${(p * 100).toFixed(1)}%`;
  if (p >= 1e-6) return `1 in ${Math.round(1 / p).toLocaleString('en-US')}`;
  const exponent = Math.floor(Math.log10(p));
  return `about ${(p / 10 ** exponent).toFixed(1)} × 10^${exponent}`;
}

function span(years: number): string {
  if (years >= 1) return `${years >= 1000 ? Math.round(years).toLocaleString('en-US') : years.toFixed(1)} years`;
  const days = years * 365.25;
  return days >= 1 ? `${days.toFixed(days >= 10 ? 0 : 1)} days` : `${(days * 24).toFixed(1)} hours`;
}

/** Split a 64-bit Snowflake id between time, generators and a sequence, and weigh random ids by the birthday bound. */
@Component({
  selector: 'app-id-layout-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <h3 class="sub">A time-ordered 64-bit id</h3>
    <div class="bar" role="img" [attr.aria-label]="barLabel()">
      <span class="seg sign" [style.flex-grow]="1">0</span>
      <span class="seg time" [style.flex-grow]="layout().timeBits">time {{ layout().timeBits }}</span>
      @if (generatorBits()) {
        <span class="seg gen" [style.flex-grow]="generatorBits()">{{ generatorBits() >= 6 ? 'gen ' : '' }}{{ generatorBits() }}</span>
      }
      @if (sequenceBits()) {
        <span class="seg seq" [style.flex-grow]="sequenceBits()">{{ sequenceBits() >= 6 ? 'seq ' : '' }}{{ sequenceBits() }}</span>
      }
    </div>
    <label class="slider">
      <span
        >Generator bits <strong class="mono">{{ generatorBits() }}</strong></span
      >
      <input type="range" min="0" max="16" step="1" [value]="generatorBits()" (input)="generatorBits.set(+$any($event.target).value)" />
    </label>
    <label class="slider">
      <span
        >Sequence bits <strong class="mono">{{ sequenceBits() }}</strong></span
      >
      <input type="range" min="0" max="16" step="1" [value]="sequenceBits()" (input)="sequenceBits.set(+$any($event.target).value)" />
    </label>
    <div class="controls" role="radiogroup" aria-label="Time tick">
      <span class="muted">Tick</span>
      @for (t of ticks; track t) {
        <button class="g-btn" role="radio" [attr.aria-checked]="tick() === t" [class.primary]="tick() === t" (click)="tick.set(t)">
          {{ t }} ms
        </button>
      }
    </div>
    <dl class="readouts" aria-live="polite">
      <div [class.bad]="layout().years < 20">
        <dt>Lasts</dt>
        <dd class="word">{{ years() }}</dd>
      </div>
      <div>
        <dt>Generators</dt>
        <dd class="mono">{{ layout().generators | number }}</dd>
      </div>
      <div>
        <dt>Ids/s each</dt>
        <dd class="mono">{{ layout().perGeneratorPerSecond | number }}</dd>
      </div>
    </dl>

    <h3 class="sub">Random ids</h3>
    <div class="controls" role="radiogroup" aria-label="Random bits">
      @for (b of randomBits; track b) {
        <button class="g-btn" role="radio" [attr.aria-checked]="bits() === b" [class.primary]="bits() === b" (click)="bits.set(b)">
          {{ b }} random bits
        </button>
      }
    </div>
    <div class="controls" role="radiogroup" aria-label="Ids issued">
      @for (c of counts; track c.count) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="count() === c.count"
          [class.primary]="count() === c.count"
          (click)="count.set(c.count)"
        >
          {{ c.label }}
        </button>
      }
    </div>
    <dl class="readouts" aria-live="polite">
      <div [class.bad]="collision() >= 1e-6">
        <dt>Chance of any repeat</dt>
        <dd class="word">{{ collisionText() }}</dd>
      </div>
    </dl>
  `,
  styleUrl: './widget.scss',
  styles: `
    .sub {
      margin: 0 0 8px;
      font-size: 0.9375rem;
    }
    .sub:not(:first-child) {
      margin-top: 20px;
    }
    .bar {
      display: flex;
      height: 32px;
      margin-bottom: 12px;
      border-radius: var(--g-radius-sm);
      overflow: hidden;
      border: 1px solid var(--g-line-strong);
    }
    .seg {
      flex-basis: 0;
      min-width: min-content;
      display: grid;
      place-items: center;
      overflow: hidden;
      white-space: nowrap;
      font: 600 0.75rem var(--g-font-mono);
      color: var(--g-text);
      & + .seg {
        border-left: 1px solid var(--g-line-strong);
      }
    }
    .sign {
      background: var(--g-raised);
      color: var(--g-muted);
    }
    .time {
      background: var(--g-accent-soft);
    }
    .gen {
      background: var(--g-raised);
    }
    .seq {
      background: var(--g-surface);
    }
    .controls .muted {
      font-size: 0.875rem;
    }
  `,
})
export class IdLayoutWidgetComponent {
  readonly ticks = TICKS;
  readonly randomBits = RANDOM_BITS;
  readonly counts = COUNTS;
  readonly generatorBits = signal(10);
  readonly sequenceBits = signal(12);
  readonly tick = signal(1);
  readonly bits = signal(122);
  readonly count = signal(1e9);
  readonly layout = computed(() => idLayout(this.generatorBits(), this.sequenceBits(), this.tick()));
  readonly years = computed(() => span(this.layout().years));
  readonly barLabel = computed(
    () =>
      `1 sign bit, ${this.layout().timeBits} time bits, ${this.generatorBits()} generator bits and ${this.sequenceBits()} sequence bits`,
  );
  readonly collision = computed(() => collisionChance(this.bits(), this.count()));
  readonly collisionText = computed(() => chance(this.collision()));
}
