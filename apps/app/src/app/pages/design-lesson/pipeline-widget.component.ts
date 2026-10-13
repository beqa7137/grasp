import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { pipeline } from '@grasp/engine';

interface Tier {
  name: string;
  perInstance: number;
  instances: number;
}

/** Every request passes three tiers: set the load and the instances, and see which tier caps what the system serves. */
@Component({
  selector: 'app-pipeline-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <label class="slider">
      <span
        >Offered load <strong class="mono">{{ offered() | number }}/s</strong></span
      >
      <input type="range" min="1000" max="20000" step="500" [value]="offered()" (input)="offered.set(+$any($event.target).value)" />
    </label>

    <div class="tiers">
      @for (t of tiers(); track t.name; let i = $index) {
        @let busy = result().utilization[i];
        <div class="tier" [class.bottleneck]="result().bottleneck === i && busy >= 1">
          <div class="head">
            <span class="name">{{ t.name }}</span>
            <span class="mono muted">{{ t.perInstance | number }}/s each</span>
          </div>
          <div class="bar" role="img" [attr.aria-label]="t.name + ' ' + (busy * 100 | number: '1.0-0') + '% busy'">
            <span [style.width.%]="busy * 100" [class.hot]="busy >= 0.8"></span>
          </div>
          <div class="foot">
            <div class="copies" role="group" [attr.aria-label]="t.name + ' instances'">
              <button
                class="g-btn"
                [disabled]="t.instances <= 1"
                (click)="setInstances(i, t.instances - 1)"
                [attr.aria-label]="'Fewer ' + t.name"
              >
                −
              </button>
              <span class="mono">×{{ t.instances }}</span>
              <button
                class="g-btn"
                [disabled]="t.instances >= 10"
                (click)="setInstances(i, t.instances + 1)"
                [attr.aria-label]="'More ' + t.name"
              >
                +
              </button>
            </div>
            <span class="mono">{{ result().capacities[i] | number }}/s · {{ busy * 100 | number: '1.0-0' }}%</span>
          </div>
        </div>
      }
    </div>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Served</dt>
        <dd class="mono">{{ result().throughput | number }}/s</dd>
      </div>
      <div [class.bad]="dropped() > 0">
        <dt>Dropped</dt>
        <dd class="mono">{{ dropped() | number }}/s</dd>
      </div>
      <div>
        <dt>Bottleneck</dt>
        <dd class="word">{{ dropped() > 0 ? tiers()[result().bottleneck].name : 'none' }}</dd>
      </div>
    </dl>
  `,
  styleUrl: './widget.scss',
  styles: `
    .tiers {
      display: grid;
      gap: 8px;
      margin-bottom: 12px;
    }
    .tier {
      padding: 10px 12px;
      border-radius: var(--g-radius-sm);
      border: 1px solid var(--g-line-strong);
      display: grid;
      gap: 6px;
      &.bottleneck {
        border-color: var(--g-danger);
      }
    }
    .head,
    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.8125rem;
    }
    .name {
      font-weight: 600;
      font-size: 0.9375rem;
    }
    .bar {
      height: 8px;
      border-radius: 4px;
      background: var(--g-sunken);
      overflow: hidden;
      span {
        display: block;
        height: 100%;
        background: var(--g-found);
        &.hot {
          background: var(--g-danger);
        }
      }
    }
    .copies {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  `,
})
export class PipelineWidgetComponent {
  readonly offered = signal(8_000);
  readonly tiers = signal<Tier[]>([
    { name: 'Load balancer', perInstance: 5_000, instances: 2 },
    { name: 'App servers', perInstance: 1_500, instances: 4 },
    { name: 'Database', perInstance: 4_000, instances: 1 },
  ]);
  readonly result = computed(() => pipeline(this.offered(), this.tiers()));
  readonly dropped = computed(() => this.offered() - this.result().throughput);

  setInstances(index: number, instances: number) {
    this.tiers.update((tiers) => tiers.map((t, i) => (i === index ? { ...t, instances } : t)));
  }
}
