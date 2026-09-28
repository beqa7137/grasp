import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { partition } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const SIZES = [3, 4, 5, 6, 7];
const SIDES = [
  { side: 'left', label: 'Left' },
  { side: 'right', label: 'Right' },
] as const;
type Side = (typeof SIDES)[number]['side'];

/** A consensus cluster cut in two: size it, move the cut and the old leader, and see which side can still decide. */
@Component({
  selector: 'app-partition-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Cluster size">
      @for (s of sizes; track s) {
        <button class="g-btn" role="radio" [attr.aria-checked]="n() === s" [class.primary]="n() === s" (click)="resize(s)">
          {{ s }}
        </button>
      }
      <span class="muted">nodes</span>
    </div>
    <label class="slider">
      <span
        >Nodes on the left of the cut <strong class="mono">{{ left() }} | {{ n() - left() }}</strong></span
      >
      <input type="range" min="0" [attr.max]="n()" step="1" [value]="left()" (input)="left.set(+$any($event.target).value)" />
    </label>
    <div class="controls" role="radiogroup" aria-label="Old leader's side">
      <span class="muted">Old leader</span>
      @for (s of sides; track s.side) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="leaderSide() === s.side"
          [class.primary]="leaderSide() === s.side"
          (click)="leaderSide.set(s.side)"
        >
          {{ s.label }}
        </button>
      }
    </div>

    <div class="split" role="img" [attr.aria-label]="summary()">
      @for (g of groups(); track g.side) {
        <div class="side" [class.quorum]="g.quorum">
          <p class="caption">{{ g.caption }}</p>
          <div class="nodes">
            @for (k of g.nodes; track k) {
              <span class="node" [class.leader]="k === g.leaderAt">{{ k === g.leaderAt ? 'L' : '' }}</span>
            } @empty {
              <span class="muted empty">no nodes</span>
            }
          </div>
        </div>
      }
    </div>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Majority</dt>
        <dd class="mono">{{ result().majority }} of {{ n() }}</dd>
      </div>
      <div>
        <dt>Survives</dt>
        <dd class="word">{{ result().tolerates }} {{ result().tolerates === 1 ? 'failure' : 'failures' }}</dd>
      </div>
      <div [class.bad]="!result().quorumSide">
        <dt>Writes</dt>
        <dd class="word">{{ writes() }}</dd>
      </div>
    </dl>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    .split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      margin-bottom: 12px;
    }
    .side {
      padding: 10px 12px;
      min-height: 92px;
      border: 2px solid var(--g-line-strong);
      &:first-child {
        border-right-style: dashed;
        border-radius: var(--g-radius-sm) 0 0 var(--g-radius-sm);
      }
      &:last-child {
        border-left: none;
        border-radius: 0 var(--g-radius-sm) var(--g-radius-sm) 0;
      }
      &.quorum {
        background: var(--g-accent-soft);
      }
    }
    .caption {
      margin: 0 0 8px;
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .nodes {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .node {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: inline-grid;
      place-items: center;
      border: 2px solid var(--g-muted);
      background: var(--g-surface);
      font: 600 0.75rem var(--g-font-mono);
      &.leader {
        border-color: var(--g-accent);
        color: var(--g-accent);
      }
    }
    .empty {
      font-size: 0.8125rem;
    }
  `,
})
export class PartitionWidgetComponent {
  readonly sizes = SIZES;
  readonly sides = SIDES;
  readonly n = signal(5);
  readonly left = signal(2);
  readonly leaderSide = signal<Side>('left');
  readonly result = computed(() => partition(this.n(), this.left(), this.leaderSide()));
  readonly groups = computed(() => {
    const { quorumSide, leaderKept } = this.result();
    const counts = { left: this.left(), right: this.n() - this.left() };
    return SIDES.map(({ side, label }) => {
      const count = counts[side];
      const oldLeaderHere = this.leaderSide() === side && count > 0;
      const quorum = quorumSide === side;
      // A majority side without the old leader elects a new one, drawn like the old one as the side's first node.
      const leaderAt = quorum || oldLeaderHere ? 0 : -1;
      const caption = quorum
        ? leaderKept
          ? `${label}: majority, leader stays`
          : `${label}: majority, elects a new leader`
        : oldLeaderHere
          ? `${label}: old leader cannot commit`
          : `${label}: minority`;
      return { side, quorum, leaderAt, caption, nodes: Array.from({ length: count }, (_, i) => i) };
    });
  });
  readonly writes = computed(() => {
    const side = this.result().quorumSide;
    return side ? `commit on the ${side}` : 'stop everywhere';
  });
  readonly summary = computed(() =>
    this.groups()
      .map((g) => `${g.nodes.length} nodes. ${g.caption}.`)
      .join(' '),
  );

  resize(n: number) {
    this.n.set(n);
    this.left.set(Math.min(this.left(), n));
  }
}
