import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { quorumRound } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const SIZES = [3, 5] as const;

/** A leaderless store: set N, W and R, take replicas down, and see whether the worst-case read still finds the write. */
@Component({
  selector: 'app-quorum-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Replicas">
      @for (s of sizes; track s) {
        <button class="g-btn" role="radio" [attr.aria-checked]="n() === s" [class.primary]="n() === s" (click)="resize(s)">
          {{ s }} replicas
        </button>
      }
    </div>
    <div class="steppers">
      @for (q of quorums; track q.key) {
        @let v = q.key === 'w' ? w() : r();
        <div class="stepper" role="group" [attr.aria-label]="q.label">
          <span>{{ q.label }}</span>
          <button class="g-btn" [disabled]="v <= 1" (click)="step(q.key, -1)" [attr.aria-label]="'Lower ' + q.label">−</button>
          <strong class="mono">{{ q.key.toUpperCase() }} = {{ v }}</strong>
          <button class="g-btn" [disabled]="v >= n()" (click)="step(q.key, 1)" [attr.aria-label]="'Raise ' + q.label">+</button>
        </div>
      }
    </div>

    <p class="muted note">Tap a replica to take it down or bring it back.</p>
    <ul class="replicas">
      @for (i of ids(); track i) {
        @let isDown = down().includes(i);
        @let wrote = round().writeSet.includes(i);
        @let asked = round().readSet.includes(i);
        <li>
          <button
            class="replica"
            [class.down]="isDown"
            [class.wrote]="wrote"
            [class.asked]="asked"
            [attr.aria-pressed]="isDown"
            [attr.aria-label]="label(i, isDown, wrote, asked)"
            (click)="toggle(i)"
          >
            <span class="id mono">R{{ i + 1 }}</span>
            <span class="state">{{ isDown ? 'down' : wrote ? 'new value' : 'old value' }}</span>
            @if (asked) {
              <span class="tag">read asks</span>
            }
          </button>
        </li>
      }
    </ul>

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="!round().writeOk">
        <dt>Write</dt>
        <dd class="word">{{ round().writeOk ? 'succeeds' : 'fails' }}</dd>
      </div>
      <div [class.bad]="!round().overlap">
        <dt>R + W vs N</dt>
        <dd class="mono">{{ r() + w() }} {{ round().overlap ? '>' : '≤' }} {{ n() }}</dd>
      </div>
      <div [class.bad]="!round().readOk || (round().writeOk && !round().fresh)">
        <dt>The read sees</dt>
        <dd class="word">{{ verdict() }}</dd>
      </div>
    </dl>
  `,
  styleUrl: './widget.scss',
  styles: `
    @use '../../../type' as *;

    .steppers {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      margin-bottom: 12px;
    }
    .stepper {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.875rem;
      span {
        color: var(--g-muted);
      }
    }
    .note {
      font-size: 0.8125rem;
      margin: 0 0 8px;
    }
    .replicas {
      list-style: none;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
      gap: 8px;
      margin: 0 0 12px;
      padding: 0;
    }
    .replica {
      width: 100%;
      min-height: 76px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 8px 4px;
      border-radius: var(--g-radius-sm);
      border: 2px solid var(--g-line-strong);
      background: var(--g-surface);
      color: var(--g-text);
      font: inherit;
      cursor: pointer;
      &.wrote {
        background: var(--g-accent-soft);
      }
      &.asked {
        border-color: var(--g-accent);
      }
      &.down {
        border-style: dashed;
        background: var(--g-sunken);
        color: var(--g-muted);
      }
    }
    .id {
      font-weight: 600;
    }
    .state {
      font-size: 0.8125rem;
    }
    .tag {
      @include label;
      color: var(--g-accent);
    }
  `,
})
export class QuorumWidgetComponent {
  readonly sizes = SIZES;
  readonly quorums = [
    { key: 'w', label: 'Write quorum' },
    { key: 'r', label: 'Read quorum' },
  ] as const;
  readonly n = signal<number>(3);
  readonly w = signal(2);
  readonly r = signal(2);
  readonly down = signal<number[]>([]);
  readonly ids = computed(() => Array.from({ length: this.n() }, (_, i) => i));
  readonly round = computed(() => quorumRound(this.n(), this.w(), this.r(), this.down()));
  readonly verdict = computed(() => {
    const { writeOk, readOk, fresh } = this.round();
    if (!readOk) return 'nothing: it fails';
    if (!writeOk) return 'the old value';
    return fresh ? 'the new value' : 'possibly the old value';
  });

  resize(n: number) {
    this.n.set(n);
    this.w.set(Math.floor(n / 2) + 1);
    this.r.set(Math.floor(n / 2) + 1);
    this.down.set([]);
  }

  step(key: 'w' | 'r', by: number) {
    (key === 'w' ? this.w : this.r).update((v) => v + by);
  }

  toggle(i: number) {
    this.down.update((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));
  }

  label(i: number, isDown: boolean, wrote: boolean, asked: boolean) {
    const state = isDown ? 'down' : wrote ? 'has the new value' : 'has the old value';
    return `Replica ${i + 1}, ${state}${asked ? ', asked by the read' : ''}`;
  }
}
