import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { cdnOutcome } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const TTLS = [
  { sec: 5, label: '5 s' },
  { sec: 60, label: '1 min' },
  { sec: 300, label: '5 min' },
  { sec: 3600, label: '1 h' },
];

/** Zipf-popular traffic through edge locations, an optional shield tier and an origin: where each request is answered. */
@Component({
  selector: 'app-cdn-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <label class="slider">
      <span
        >Traffic <strong class="mono">{{ rps() | number }} requests/s</strong></span
      >
      <input type="range" min="1000" max="100000" step="1000" [value]="rps()" (input)="rps.set(+$any($event.target).value)" />
    </label>
    <label class="slider">
      <span
        >Edge locations <strong class="mono">{{ pops() }}</strong></span
      >
      <input type="range" min="1" max="100" step="1" [value]="pops()" (input)="pops.set(+$any($event.target).value)" />
    </label>
    <div class="controls" role="radiogroup" aria-label="Cache TTL">
      <span class="muted">TTL</span>
      @for (t of ttls; track t.sec) {
        <button class="g-btn" role="radio" [attr.aria-checked]="ttl() === t.sec" [class.primary]="ttl() === t.sec" (click)="ttl.set(t.sec)">
          {{ t.label }}
        </button>
      }
    </div>
    <label class="toggle">
      <input type="checkbox" [checked]="shield()" (change)="shield.set($any($event.target).checked)" />
      Origin shield between the edges and the origin
    </label>

    <div class="bar" role="img" [attr.aria-label]="summary()">
      @for (s of shares(); track s.key) {
        <span [class]="s.key" [style.width.%]="s.share * 100"></span>
      }
    </div>
    <p class="legend muted">
      @for (s of shares(); track s.key) {
        <span class="item"><span class="swatch" [class]="s.key"></span>{{ s.label }} {{ s.share * 100 | number: '1.0-1' }}%</span>
      }
    </p>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Edge hits</dt>
        <dd class="mono">{{ outcome().edgeHitRate * 100 | number: '1.0-1' }}%</dd>
      </div>
      <div [class.bad]="outcome().originShare > 0.2">
        <dt>Origin load</dt>
        <dd class="mono">{{ outcome().originRps | number: '1.0-0' }}/s</dd>
      </div>
      <div>
        <dt>Mean response</dt>
        <dd class="mono">{{ outcome().meanMs | number: '1.0-0' }} ms</dd>
      </div>
    </dl>
    <p class="muted note">
      100,000 objects with Zipf popularity; each cache keeps an object for the TTL after fetching it. An edge answers in 10 ms, the shield
      adds 30 ms and the origin 120 ms.
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
    .bar {
      display: flex;
      height: 18px;
      border-radius: 6px;
      overflow: hidden;
      background: var(--g-line);
    }
    .edge {
      background: var(--g-found);
    }
    .shield {
      background: var(--g-warn);
    }
    .origin {
      background: var(--g-danger);
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
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class CdnWidgetComponent {
  readonly ttls = TTLS;
  readonly rps = signal(10000);
  readonly pops = signal(20);
  readonly ttl = signal(60);
  readonly shield = signal(false);
  readonly outcome = computed(() =>
    cdnOutcome({
      rps: this.rps(),
      objects: 100000,
      zipf: 1,
      pops: this.pops(),
      ttlSec: this.ttl(),
      shield: this.shield(),
      edgeMs: 10,
      shieldMs: 30,
      originMs: 120,
    }),
  );
  readonly shares = computed(() => {
    const { edgeHitRate, originShare } = this.outcome();
    const all = [
      { key: 'edge', label: 'Edge', share: edgeHitRate },
      { key: 'shield', label: 'Shield', share: 1 - edgeHitRate - originShare },
      { key: 'origin', label: 'Origin', share: originShare },
    ];
    return this.shield() ? all : all.filter((s) => s.key !== 'shield');
  });
  readonly summary = computed(() =>
    this.shares()
      .map((s) => `${s.label} ${Math.round(s.share * 100)}%`)
      .join(', '),
  );
}
