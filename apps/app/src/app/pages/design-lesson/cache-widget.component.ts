import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { cacheOutcome } from '@grasp/engine';

const QPS = 10_000;
const CACHE_MS = 1;
/** The origin serves about 2,000 requests a second before it saturates, so the widget can mark overload. */
const ORIGIN_CAPACITY = 2_000;
const REFILL_STEPS = 12;

/** Set the hit rate and origin latency for 10,000 requests a second, then flush the cache and watch the origin take it all. */
@Component({
  selector: 'app-cache-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <label class="slider">
      <span
        >Hit rate <strong class="mono">{{ hitRate() | number: '1.1-1' }}%</strong></span
      >
      <input
        type="range"
        min="50"
        max="99.9"
        step="0.1"
        [value]="target()"
        [disabled]="refilling()"
        (input)="target.set(+$any($event.target).value)"
      />
    </label>
    <label class="slider">
      <span
        >Origin latency <strong class="mono">{{ originMs() }} ms</strong></span
      >
      <input type="range" min="10" max="200" step="5" [value]="originMs()" (input)="originMs.set(+$any($event.target).value)" />
    </label>
    <div class="controls">
      <button class="g-btn" [disabled]="refilling()" (click)="flush()">Flush the cache</button>
      @if (refilling()) {
        <span class="muted" role="status">The cache is empty and refilling: every request goes to the origin.</span>
      }
    </div>
    <dl class="readouts" aria-live="polite">
      <div [class.bad]="overloaded()">
        <dt>Origin load</dt>
        <dd class="mono">{{ outcome().originQps | number: '1.0-0' }}/s</dd>
      </div>
      @if (overloaded()) {
        <div class="bad">
          <dt>Mean</dt>
          <dd class="word">overloaded</dd>
        </div>
        <div class="bad">
          <dt>p99</dt>
          <dd class="word">timing out</dd>
        </div>
      } @else {
        <div>
          <dt>Mean</dt>
          <dd class="mono">{{ outcome().meanMs | number: '1.1-1' }} ms</dd>
        </div>
        <div>
          <dt>p99</dt>
          <dd class="mono">{{ outcome().p99Ms | number: '1.0-0' }} ms</dd>
        </div>
      }
    </dl>
    <p class="muted note">The origin handles about {{ originCapacity | number }} requests a second; above that it queues and times out.</p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .note {
      font-size: 0.8125rem;
      margin: 8px 0 0;
    }
  `,
})
export class CacheWidgetComponent {
  readonly originCapacity = ORIGIN_CAPACITY;
  readonly target = signal(90);
  readonly originMs = signal(50);
  /** Fraction of the target hit rate the cache has refilled to after a flush; 1 when warm. */
  readonly warmth = signal(1);
  readonly refilling = computed(() => this.warmth() < 1);
  readonly hitRate = computed(() => this.target() * this.warmth());
  readonly outcome = computed(() => cacheOutcome(QPS, this.hitRate() / 100, CACHE_MS, this.originMs()));
  /** Past its capacity the origin queues without bound, so the latency model no longer holds. */
  readonly overloaded = computed(() => this.outcome().originQps > ORIGIN_CAPACITY);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  flush() {
    this.warmth.set(0);
    let step = 0;
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      step++;
      this.warmth.set(Math.min(1, step / REFILL_STEPS));
      if (step >= REFILL_STEPS) clearInterval(this.timer);
    }, 400);
  }
}
