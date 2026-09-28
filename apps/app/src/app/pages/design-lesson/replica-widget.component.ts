import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { replicaRead } from '@grasp/engine';

const SPAN_MS = 3_000;
const PIN_MS = 1_000;
const W = 320;

const x = (ms: number) => (ms / SPAN_MS) * W;

/** A user writes at 0 and reads a moment later: drag the replication lag and the read time, and pin reads after a write. */
@Component({
  selector: 'app-replica-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="-8 -24 336 96" role="img" [attr.aria-label]="summary()">
      <line class="axis" x1="0" y1="30" [attr.x2]="w" y2="30" />
      @if (pinned()) {
        <rect class="pin" x="0" y="20" [attr.width]="pinX" height="20" />
        <text class="pin-label" [attr.x]="pinX - 4" y="16" text-anchor="end">reads go to the primary</text>
      }
      <rect class="lag" x="0" y="27" [attr.width]="lagX()" height="6" />
      <g class="event write">
        <circle cx="0" cy="30" r="6" />
        <text x="0" y="62" text-anchor="start">write</text>
      </g>
      <g class="event applied">
        <line [attr.x1]="lagX()" y1="14" [attr.x2]="lagX()" y2="46" />
        <text [attr.x]="lagX()" y="-8" [attr.text-anchor]="anchor(lagX())">replica has it</text>
      </g>
      <g class="event read" [class.stale]="read().stale">
        <circle [attr.cx]="readX()" cy="30" r="6" />
        <text [attr.x]="readX()" y="62" [attr.text-anchor]="anchor(readX())">read</text>
      </g>
    </svg>

    <label class="slider">
      <span
        >Replication lag <strong class="mono">{{ lag() }} ms</strong></span
      >
      <input type="range" min="0" max="3000" step="50" [value]="lag()" (input)="lag.set(+$any($event.target).value)" />
    </label>
    <label class="slider">
      <span
        >Read after the write <strong class="mono">{{ readAfter() }} ms</strong></span
      >
      <input type="range" min="0" max="3000" step="50" [value]="readAfter()" (input)="readAfter.set(+$any($event.target).value)" />
    </label>
    <label class="toggle">
      <input type="checkbox" [checked]="pinned()" (change)="pinned.set($any($event.target).checked)" />
      Read your own writes: send this user's reads to the primary for {{ pinMs / 1000 }} s after they write
    </label>

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="read().stale">
        <dt>The read sees</dt>
        <dd class="word">{{ read().stale ? 'the old value' : 'the new value' }}</dd>
      </div>
      <div>
        <dt>Served by</dt>
        <dd class="word">{{ read().servedBy === 'primary' ? 'the primary' : 'a replica' }}</dd>
      </div>
    </dl>
  `,
  styleUrl: './widget.scss',
  styles: `
    svg {
      margin-bottom: 12px;
    }
    .lag {
      fill: var(--g-warn);
      opacity: 0.35;
    }
    .pin {
      fill: var(--g-accent-soft);
    }
    .pin-label {
      fill: var(--g-accent);
      font: 10px var(--g-font-mono);
    }
    .event text {
      fill: var(--g-muted);
      font: 11px var(--g-font-mono);
    }
    .write circle {
      fill: var(--g-accent);
      stroke: none;
    }
    .applied line {
      stroke: var(--g-warn);
      stroke-width: 2;
    }
    .read circle {
      fill: var(--g-found);
      stroke: none;
    }
    .read.stale circle {
      fill: var(--g-danger);
    }
    .toggle {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      font-size: 0.875rem;
      line-height: 1.45;
      margin-bottom: 12px;
      input {
        margin-top: 3px;
      }
    }
  `,
})
export class ReplicaWidgetComponent {
  readonly w = W;
  readonly pinMs = PIN_MS;
  readonly pinX = x(PIN_MS);
  readonly lag = signal(800);
  readonly readAfter = signal(300);
  readonly pinned = signal(false);
  readonly read = computed(() => replicaRead(this.lag(), this.readAfter(), this.pinned(), PIN_MS));
  readonly lagX = computed(() => x(this.lag()));
  readonly readX = computed(() => x(this.readAfter()));
  readonly summary = computed(
    () =>
      `The replica applies the write after ${this.lag()} ms; a read ${this.readAfter()} ms after the write goes to ${
        this.read().servedBy === 'primary' ? 'the primary' : 'a replica'
      } and sees ${this.read().stale ? 'the old value' : 'the new value'}.`,
  );

  anchor(at: number) {
    return at < 30 ? 'start' : at > W - 30 ? 'end' : 'middle';
  }
}
