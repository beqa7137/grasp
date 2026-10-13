import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { chainAvailability } from '@grasp/engine';

const LEVELS = [0.99, 0.999, 0.9995, 0.9999];

interface Part {
  name: string;
  availability: number;
  copies: number;
}

/** Three components every request needs: pick each one's availability and copies, and see the whole chain's. */
@Component({
  selector: 'app-availability-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="parts">
      @for (p of parts(); track p.name; let i = $index) {
        <div class="part" [class.weakest]="result().weakest === i">
          <p class="name">
            {{ p.name }}
            @if (result().weakest === i) {
              <span class="tag">weakest</span>
            }
          </p>
          <label>
            <span class="muted">Each copy</span>
            <select [value]="p.availability" (change)="set(i, { availability: +$any($event.target).value })">
              @for (l of levels; track l) {
                <option [value]="l" [selected]="l === p.availability">{{ l * 100 | number: '1.0-2' }}%</option>
              }
            </select>
          </label>
          <div class="copies" role="group" [attr.aria-label]="p.name + ' copies'">
            <button
              class="g-btn"
              [disabled]="p.copies <= 1"
              (click)="set(i, { copies: p.copies - 1 })"
              [attr.aria-label]="'Fewer ' + p.name + ' copies'"
            >
              −
            </button>
            <span class="mono">{{ p.copies }} {{ p.copies === 1 ? 'copy' : 'copies' }}</span>
            <button
              class="g-btn"
              [disabled]="p.copies >= 3"
              (click)="set(i, { copies: p.copies + 1 })"
              [attr.aria-label]="'More ' + p.name + ' copies'"
            >
              +
            </button>
          </div>
        </div>
      }
    </div>
    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Whole request</dt>
        <dd class="mono">{{ result().availability * 100 | number: '1.3-5' }}%</dd>
      </div>
      <div [class.bad]="result().downtimeMinutesPerYear > 526">
        <dt>Down a year</dt>
        <dd class="mono">{{ downtime() }}</dd>
      </div>
    </dl>
    <p class="muted note">
      Assumes copies fail independently and one copy can carry the full load. A bad deploy or a region outage takes them down together.
    </p>
  `,
  styleUrl: './widget.scss',
  styles: `
    @use '../../../type' as *;

    .parts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .part {
      padding: 10px 12px;
      border-radius: var(--g-radius-sm);
      border: 1px solid var(--g-line-strong);
      display: grid;
      gap: 8px;
      &.weakest {
        border-color: var(--g-danger);
      }
    }
    .name {
      margin: 0;
      font-weight: 600;
      font-size: 0.9375rem;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tag {
      @include label;
      color: var(--g-danger-ink);
    }
    label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.8125rem;
    }
    select {
      font: 500 0.875rem var(--g-font-mono);
      padding: 4px 6px;
      border-radius: 6px;
      border: 1px solid var(--g-line-strong);
      background: var(--g-raised);
      color: var(--g-text);
    }
    .copies {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-size: 0.8125rem;
    }
    .note {
      font-size: 0.8125rem;
      margin: 8px 0 0;
    }
  `,
})
export class AvailabilityWidgetComponent {
  readonly levels = LEVELS;
  readonly parts = signal<Part[]>([
    { name: 'Load balancer', availability: 0.9999, copies: 2 },
    { name: 'App servers', availability: 0.999, copies: 3 },
    { name: 'Database', availability: 0.9995, copies: 1 },
  ]);
  readonly result = computed(() => chainAvailability(this.parts()));
  readonly downtime = computed(() => {
    const minutes = this.result().downtimeMinutesPerYear;
    return minutes >= 120
      ? `${(minutes / 60).toFixed(1)} h`
      : minutes >= 1
        ? `${Math.round(minutes)} min`
        : `${Math.round(minutes * 60)} s`;
  });

  set(index: number, change: Partial<Part>) {
    this.parts.update((parts) => parts.map((p, i) => (i === index ? { ...p, ...change } : p)));
  }
}
