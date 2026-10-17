import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PLAN_ROUNDS, ROUND_NAMES, type StudyPlan, type TargetInput } from '@grasp/engine';
import { formatMinutes } from './duration';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The plan by round (REDESIGN.md 4.9): the minutes still planned for each round against how much the Target weighs it,
 * so a plan that leans on one round shows it. The tick on each bar is the round's share of the loop.
 */
@Component({
  selector: 'app-plan-rounds',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel rounds" aria-labelledby="rounds-title">
      <h2 id="rounds-title">By round</h2>
      <ul>
        @for (r of rows(); track r.round) {
          <li>
            <div class="head">
              <strong>{{ r.name }}</strong>
              <span class="muted">{{ r.planned }} planned</span>
            </div>
            <span
              class="bar"
              role="meter"
              aria-valuemin="0"
              aria-valuemax="100"
              [attr.aria-valuenow]="r.share"
              [attr.aria-valuetext]="r.share + '% of the planned time, ' + r.loop"
              [attr.aria-label]="r.name + ' share of the plan'"
              ><i [style.width.%]="r.share"></i>
              @if (r.weight) {
                <b class="weight" [style.left.%]="r.weight"></b>
              }
            </span>
            <p class="muted">{{ r.share }}% of the plan · {{ r.loop }} · {{ r.left }}</p>
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    @use '../../../type' as *;

    .rounds {
      padding: var(--g-space-4);
      margin-bottom: var(--g-space-4);
    }
    h2 {
      @include title;
      font-size: var(--g-text-title-m);
      margin: 0 0 var(--g-space-3);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--g-space-4);
    }
    .head {
      display: flex;
      justify-content: space-between;
      gap: var(--g-space-3);
      font-size: var(--g-text-body);
    }
    .bar {
      position: relative;
      display: block;
      height: 8px;
      margin: var(--g-space-2) 0;
      border-radius: var(--g-radius-pill);
      background: var(--g-sunken);
      i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--g-info-ink);
      }
    }
    .weight {
      position: absolute;
      top: -3px;
      bottom: -3px;
      width: 2px;
      transform: translateX(-50%);
      background: var(--g-text);
    }
    p {
      margin: 0;
      font-size: var(--g-text-body-s);
      line-height: 1.45;
    }
  `,
})
export class PlanRoundsComponent {
  readonly plan = input.required<StudyPlan>();
  readonly target = input.required<TargetInput>();

  readonly rows = computed(() => {
    const p = this.plan();
    const counts = this.target().rounds;
    const loop = PLAN_ROUNDS.reduce((sum, r) => sum + counts[r], 0);
    const planned = Object.fromEntries(
      PLAN_ROUNDS.map((round) => [
        round,
        p.days.reduce((sum, d) => sum + d.slices.filter((s) => !s.done && s.unit.round === round).reduce((m, s) => m + s.minutes, 0), 0),
      ]),
    );
    const total = PLAN_ROUNDS.reduce((sum, r) => sum + planned[r], 0);
    return PLAN_ROUNDS.filter((round) => p.remaining[round] || counts[round]).map((round) => {
      const left = p.remaining[round];
      return {
        round,
        name: ROUND_NAMES[round],
        planned: formatMinutes(Math.round(planned[round] / 5) * 5),
        share: total ? Math.round((100 * planned[round]) / total) : 0,
        weight: loop ? Math.round((100 * counts[round]) / loop) : 0,
        loop: !counts[round]
          ? 'not in your loop'
          : counts[round] === loop
            ? 'your only round'
            : `${Math.round((100 * counts[round]) / loop)}% of your loop`,
        left: left?.units ? `${plural(left.units, 'item')} left` : 'All covered',
      };
    });
  });
}
