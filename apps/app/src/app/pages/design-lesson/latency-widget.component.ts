import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { queueLatency } from '@grasp/engine';

const SERVICE_MS = 10;
const MAX_MS = 500;
const W = 320;
const H = 160;

const x = (u: number) => u * W;
const y = (ms: number) => H - (Math.min(ms, MAX_MS) / MAX_MS) * H;

/** Drag utilization and watch the queueing curve: p50 and p99 of a server that needs 10 ms per request. */
@Component({
  selector: 'app-latency-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'-4 -4 ' + (w + 8) + ' ' + (h + 22)" role="img" [attr.aria-label]="summary()">
      <line class="axis" x1="0" [attr.y1]="h" [attr.x2]="w" [attr.y2]="h" />
      <line class="axis" x1="0" y1="0" x2="0" [attr.y2]="h" />
      <text class="tick" x="0" [attr.y]="h + 14">0%</text>
      <text class="tick" [attr.x]="w" [attr.y]="h + 14" text-anchor="end">100% busy</text>
      <text class="tick" x="4" y="10">{{ maxMs }} ms</text>
      <line class="comfort" [attr.x1]="w * 0.7" y1="0" [attr.x2]="w * 0.7" [attr.y2]="h" />
      <path class="p99" [attr.d]="p99Path" />
      <path class="p50" [attr.d]="p50Path" />
      <line class="now" [attr.x1]="marker().x" y1="0" [attr.x2]="marker().x" [attr.y2]="h" />
      <circle class="p99" [attr.cx]="marker().x" [attr.cy]="marker().p99" r="5" />
      <circle class="p50" [attr.cx]="marker().x" [attr.cy]="marker().p50" r="5" />
    </svg>
    <p class="legend muted"><span class="key p50"></span>p50 <span class="key p99"></span>p99 <span class="key comfort"></span>70% busy</p>

    <label class="slider">
      <span
        >Utilization <strong class="mono">{{ percent() }}%</strong></span
      >
      <input type="range" min="10" max="99" step="1" [value]="percent()" (input)="percent.set(+$any($event.target).value)" />
    </label>
    <dl class="readouts" aria-live="polite">
      <div>
        <dt>p50</dt>
        <dd class="mono">{{ latency().p50 | number: '1.0-0' }} ms</dd>
      </div>
      <div>
        <dt>p99</dt>
        <dd class="mono">{{ latency().p99 | number: '1.0-0' }} ms</dd>
      </div>
      <div>
        <dt>Mean vs idle</dt>
        <dd class="mono">{{ latency().mean / service | number: '1.1-1' }}x</dd>
      </div>
    </dl>
  `,
  imports: [DecimalPipe],
  styleUrl: './widget.scss',
})
export class LatencyWidgetComponent {
  readonly w = W;
  readonly h = H;
  readonly service = SERVICE_MS;
  readonly maxMs = MAX_MS;
  readonly percent = signal(50);
  readonly latency = computed(() => queueLatency(SERVICE_MS, this.percent() / 100));
  readonly p50Path = curve((u) => queueLatency(SERVICE_MS, u).p50);
  readonly p99Path = curve((u) => queueLatency(SERVICE_MS, u).p99);
  readonly marker = computed(() => {
    const u = this.percent() / 100;
    const l = this.latency();
    return { x: x(u), p50: y(l.p50), p99: y(l.p99) };
  });
  readonly summary = computed(
    () =>
      `At ${this.percent()}% utilization, p50 is ${Math.round(this.latency().p50)} ms and p99 is ${Math.round(this.latency().p99)} ms, for a 10 ms request.`,
  );
}

/** Stops where the curve leaves the chart, so it runs off the top instead of along it. */
function curve(ms: (u: number) => number): string {
  const points: string[] = [];
  for (let u = 0; u <= 0.99; u += 0.005) {
    points.push(`${x(u).toFixed(1)},${y(ms(u)).toFixed(1)}`);
    if (ms(u) >= MAX_MS) break;
  }
  return `M${points.join('L')}`;
}
