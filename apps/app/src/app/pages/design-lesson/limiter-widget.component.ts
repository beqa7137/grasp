import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { runLimiter, type Limiter } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const LIMIT = 10;
const BURST = 10;
const W = 320;

/** Requests are spaced evenly in arrival order, so a burst 10 ms apart stays readable. */
const at = (i: number, n: number) => ((i + 0.5) / n) * W;

const PATTERNS = {
  steady: { label: 'Steady', arrivals: Array.from({ length: 24 }, (_, i) => i * 125) },
  edge: { label: 'Edge burst', arrivals: Array.from({ length: 20 }, (_, i) => 900 + i * 10) },
  bursty: { label: 'Bursty', arrivals: [0, 1000, 2000].flatMap((start) => Array.from({ length: 15 }, (_, i) => start + i * 10)) },
} as const;
type Pattern = keyof typeof PATTERNS;

const LIMITERS: { kind: Limiter; label: string }[] = [
  { kind: 'token-bucket', label: 'Token bucket' },
  { kind: 'fixed-window', label: 'Fixed window' },
  { kind: 'sliding-window', label: 'Sliding log' },
];

/** The same traffic through three limiters at 10 requests a second: see which requests each accepts. */
@Component({
  selector: 'app-limiter-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Traffic">
      @for (p of patternKeys; track p) {
        <button class="g-btn" role="radio" [attr.aria-checked]="pattern() === p" [class.primary]="pattern() === p" (click)="pattern.set(p)">
          {{ patterns[p].label }}
        </button>
      }
    </div>
    <p class="muted note">Limit: {{ limit }} requests a second; the token bucket saves up to {{ burst }} tokens.</p>

    @for (r of runs(); track r.kind) {
      <div class="row">
        <p class="name">{{ r.label }}</p>
        <svg [attr.viewBox]="'-6 -8 ' + (w + 12) + ' 16'" role="img" [attr.aria-label]="r.summary">
          @for (s of r.secondLines; track s) {
            <line class="second" [attr.x1]="s" y1="-8" [attr.x2]="s" y2="8" />
          }
          @for (d of r.dots; track $index) {
            <circle [attr.cx]="d.x" cy="0" r="3.4" [class.rejected]="!d.ok" />
          }
        </svg>
        <p class="stats mono">{{ r.accepted }} of {{ r.total }} accepted · worst second {{ r.worstSecond }}</p>
      </div>
    }
    <p class="legend muted">
      <span class="item"><span class="dot"></span>accepted</span>
      <span class="item"><span class="dot rejected"></span>rejected</span>
      <span class="item">requests in arrival order; a line marks each new second</span>
    </p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .note {
      font-size: 0.8125rem;
      margin: 0 0 10px;
    }
    .row {
      margin-bottom: 10px;
    }
    .name {
      margin: 0 0 2px;
      font-size: 0.875rem;
      font-weight: 600;
    }
    .stats {
      margin: 2px 0 0;
      font-size: 0.8125rem;
      color: var(--g-muted);
    }
    svg {
      max-width: none;
    }
    .second {
      stroke: var(--g-line-strong);
      stroke-dasharray: 2 2;
    }
    circle {
      fill: var(--g-found);
      stroke: none;
    }
    circle.rejected {
      fill: var(--g-danger);
    }
    .legend .item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--g-found);
      &.rejected {
        background: var(--g-danger);
      }
    }
  `,
})
export class LimiterWidgetComponent {
  readonly w = W;
  readonly limit = LIMIT;
  readonly burst = BURST;
  readonly patterns = PATTERNS;
  readonly patternKeys = Object.keys(PATTERNS) as Pattern[];
  readonly pattern = signal<Pattern>('edge');
  readonly runs = computed(() => {
    const arrivals = PATTERNS[this.pattern()].arrivals;
    return LIMITERS.map(({ kind, label }) => {
      const run = runLimiter(kind, arrivals, LIMIT, BURST);
      const accepted = run.accepted.filter(Boolean).length;
      return {
        kind,
        label,
        accepted,
        total: arrivals.length,
        worstSecond: run.worstSecond,
        dots: arrivals.map((_, i) => ({ x: at(i, arrivals.length), ok: run.accepted[i] })),
        secondLines: arrivals.flatMap((t, i) =>
          i > 0 && Math.floor(t / 1000) !== Math.floor(arrivals[i - 1] / 1000)
            ? [(at(i - 1, arrivals.length) + at(i, arrivals.length)) / 2]
            : [],
        ),
        summary: `${label}: accepts ${accepted} of ${arrivals.length}, at most ${run.worstSecond} in any one second.`,
      };
    });
  });
}
