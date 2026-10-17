import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { READINESS_BAND_NAMES, ROUND_NAMES, type LoopReadiness } from '@grasp/engine';
import { ReadinessRingComponent } from './readiness-ring.component';

/** Today's readiness card (REDESIGN.md 4.1): the loop's ring and band, one meter per round, and the way to Progress. */
@Component({
  selector: 'app-readiness-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReadinessRingComponent],
  template: `
    @let r = readiness();
    <section class="panel readiness" aria-labelledby="readiness-heading">
      <div class="head">
        <app-readiness-ring [score]="r.score" [band]="band()" />
        <div>
          <h2 id="readiness-heading" class="eyebrow">Loop readiness</h2>
          <p class="band">{{ band() }}</p>
          @if (r.source !== 'set') {
            <p class="muted">Assuming a Mid-level loop</p>
          }
        </div>
      </div>
      <ul class="rounds">
        @for (round of rounds(); track round.round) {
          <li>
            <span class="name"
              >{{ round.name }}
              @if (round.count > 1) {
                <span class="count">×{{ round.count }}</span>
              }
            </span>
            <span
              class="bar"
              role="meter"
              aria-valuemin="0"
              aria-valuemax="100"
              [attr.aria-valuenow]="round.score"
              [attr.aria-label]="round.name + ' readiness'"
              ><i [style.width.%]="round.score"></i
            ></span>
            <span class="n" aria-hidden="true">{{ round.score }}</span>
          </li>
        }
      </ul>
      <a class="more" routerLink="/today/progress">See your progress</a>
    </section>
  `,
  styles: `
    .readiness {
      display: grid;
      gap: var(--g-space-3);
      padding: var(--g-space-4);
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--g-space-3);
      p {
        margin: 0;
      }
    }
    h2 {
      margin: 0;
    }
    .band {
      font-weight: 600;
      font-size: var(--g-text-title-m);
    }
    .muted {
      font-size: var(--g-text-body-s);
    }
    .rounds {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--g-space-2);
      grid-template-columns: max-content minmax(0, 1fr) 3ch;
      column-gap: var(--g-space-3);
      // One set of columns for every round, so equal scores draw equal bars whatever the round's name.
      li {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: subgrid;
        align-items: center;
        font-size: var(--g-text-body);
      }
    }
    .count {
      color: var(--g-muted);
      font-variant-numeric: tabular-nums;
    }
    .bar {
      display: block;
      height: 6px;
      border-radius: var(--g-radius-pill);
      background: var(--g-sunken);
      overflow: hidden;
      i {
        display: block;
        height: 100%;
        background: var(--g-success-ink);
      }
    }
    .n {
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: var(--g-muted);
    }
    .more {
      justify-self: start;
      font-weight: 600;
      font-size: var(--g-text-body);
    }
  `,
})
export class ReadinessCardComponent {
  readonly readiness = input.required<LoopReadiness>();
  readonly band = computed(() => READINESS_BAND_NAMES[this.readiness().band]);
  readonly rounds = computed(() => this.readiness().rounds.map((r) => ({ ...r, name: ROUND_NAMES[r.round] })));
}
