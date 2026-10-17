import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import type { PlanDay, StudyPlan } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { chatbubblesOutline, flashOutline } from 'ionicons/icons';
import { RovingSelectDirective } from '../../core/roving-select.directive';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { formatMinutes } from './duration';
import { PlanTodayComponent } from './plan-today.component';
import { dayLabel } from '../today/today.service';

export type DayKind = 'done' | 'partial' | 'planned' | 'review' | 'taper' | 'interview';

const KIND_NAMES: Record<DayKind, string> = {
  done: 'Done',
  partial: 'Partly done',
  planned: 'Planned',
  review: 'Review only',
  taper: 'Light day',
  interview: 'Interview',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const dayMinutes = (day: Pick<PlanDay, 'review' | 'slices'>) => day.review + day.slices.reduce((s, x) => s + x.minutes, 0);

/** A plan day's dot (REDESIGN.md 4.9): only today can be done or partly done, since the plan rebuilds from today. */
export function dayKind(day: PlanDay): DayKind {
  if (day.taper) return 'taper';
  if (!day.slices.length) return 'review';
  const done = day.slices.filter((s) => s.done).length;
  return done === day.slices.length ? 'done' : done ? 'partial' : 'planned';
}

/**
 * The plan's day strip (REDESIGN.md 4.9): every day from today to the interview as a dot, one radio group with one Tab
 * stop, and the chosen day's list under it. Today's list is the full checklist with its reviews; later days list their
 * units.
 */
@Component({
  selector: 'app-plan-days',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonIcon, CrossLinkDirective, RovingSelectDirective, PlanTodayComponent],
  template: `
    @let p = plan();
    <section class="days" aria-labelledby="days-title">
      <h2 id="days-title">Your days</h2>
      <div class="strip" role="radiogroup" aria-labelledby="days-title">
        @for (d of strip(); track d.date) {
          <button
            type="button"
            role="radio"
            [class]="d.kind"
            [attr.aria-checked]="selected() === d.date"
            [attr.aria-label]="d.label"
            (click)="selected.set(d.date)"
          >
            <span class="wd" aria-hidden="true">{{ d.weekday }}</span>
            <span class="dn" aria-hidden="true">{{ d.day }}</span>
            <span class="dot" aria-hidden="true"></span>
          </button>
        }
      </div>
      <ul class="legend" aria-label="Key">
        @for (k of legend(); track k.kind) {
          <li><span class="dot" [class]="k.kind" aria-hidden="true"></span>{{ k.name }}</li>
        }
      </ul>
    </section>

    @if (chosen(); as day) {
      @if (day.date === p.today) {
        <section class="panel today" aria-labelledby="today-title">
          <h2 id="today-title">
            Today <span class="muted">· about {{ duration(minutes(day)) }}</span>
          </h2>
          <ul class="items">
            <li class="item review">
              <ion-icon name="flash-outline" aria-hidden="true" />
              <span class="text">
                @if (p.todayReview.cards) {
                  <a routerLink="/today/review">Review</a>
                  <span class="muted"
                    >{{ plural(p.todayReview.cards, 'card') }} ready, about {{ duration(p.todayReview.cardMinutes) }}</span
                  >
                } @else {
                  <strong>Review</strong>
                  <span class="muted">Nothing to review yet. Cards arrive as you learn.</span>
                }
              </span>
            </li>
            @if (p.todayReview.stories) {
              <li class="item review">
                <ion-icon name="chatbubbles-outline" aria-hidden="true" />
                <span class="text">
                  <a routerLink="/behavioral/rehearse" crossLink>Rehearse your stories</a>
                  <span class="muted"
                    >{{ p.todayReview.stories === 1 ? '1 story' : p.todayReview.stories + ' stories' }} due{{
                      p.todayReview.storyMinutes ? ', about ' + duration(p.todayReview.storyMinutes) : ', if time allows after your cards'
                    }}</span
                  >
                </span>
              </li>
            }
          </ul>
          @if (day.slices.length) {
            <app-plan-today [day]="day" [details]="true" />
          }
          @if (day.taper) {
            <p class="note">Review only today, so you arrive rested. Leave anything new for after the interview.</p>
          }
        </section>
      } @else {
        <section class="panel day" aria-labelledby="day-title">
          <h2 id="day-title">
            {{ long(day.date) }} <span class="muted">· about {{ duration(minutes(day)) }}</span>
          </h2>
          @if (day.taper) {
            <p class="muted">A light day: review only, so you arrive rested.</p>
          } @else {
            <ul>
              @for (s of day.slices; track s.unit.id) {
                <li>
                  {{ s.unit.title
                  }}<span class="muted"> · {{ duration(s.minutes) }}{{ s.parts > 1 ? ', part ' + s.part + ' of ' + s.parts : '' }}</span>
                </li>
              } @empty {
                <li class="muted">Review, about {{ duration(day.review) }}.</li>
              }
            </ul>
          }
        </section>
      }
    } @else {
      <section class="panel day" aria-labelledby="day-title">
        <h2 id="day-title">{{ long(p.interviewDate) }}</h2>
        <p class="muted">Your interview. Rest the evening before, and trust what you have practiced.</p>
      </section>
    }
  `,
  styles: `
    @use '../../../type' as *;

    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--g-space-4);
      margin-bottom: var(--g-space-4);
    }
    h2 {
      @include title;
      font-size: var(--g-text-title-m);
      margin: 0 0 var(--g-space-2);
    }
    .strip {
      display: flex;
      gap: var(--g-space-1);
      overflow-x: auto;
      padding: var(--g-space-1) var(--g-space-1) var(--g-space-2);
      scroll-snap-type: x proximity;
      button {
        appearance: none;
        flex: none;
        display: grid;
        justify-items: center;
        gap: var(--g-space-1);
        min-width: 2.75rem;
        padding: var(--g-space-2) var(--g-space-1);
        border: 1px solid transparent;
        border-radius: var(--g-radius-sm);
        background: none;
        color: var(--g-text);
        font: inherit;
        scroll-snap-align: start;
        cursor: pointer;
        &[aria-checked='true'] {
          border-color: var(--g-accent);
          background: var(--g-accent-soft);
        }
      }
    }
    .wd {
      font-size: var(--g-text-label);
      color: var(--g-muted);
    }
    .dn {
      font-weight: 600;
      font-size: var(--g-text-body);
      font-variant-numeric: tabular-nums;
    }
    .dot {
      display: inline-block;
      width: 0.625rem;
      height: 0.625rem;
      border-radius: var(--g-radius-pill);
      border: 1.5px solid var(--g-stroke);
    }
    .done .dot,
    .dot.done {
      background: var(--g-success-ink);
      border-color: var(--g-success-ink);
    }
    .partial .dot,
    .dot.partial {
      border-color: var(--g-success-ink);
      background: linear-gradient(to right, var(--g-success-ink) 50%, transparent 50%);
    }
    .planned .dot,
    .dot.planned {
      background: var(--g-info-ink);
      border-color: var(--g-info-ink);
    }
    .taper .dot,
    .dot.taper {
      border-style: dashed;
    }
    .interview .dot,
    .dot.interview {
      background: var(--g-accent);
      border-color: var(--g-accent);
      border-radius: var(--g-radius-xs);
    }
    .legend {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-1) var(--g-space-4);
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
      li {
        display: inline-flex;
        align-items: center;
        gap: var(--g-space-2);
      }
    }
    .today,
    .day {
      padding: var(--g-space-4);
    }
    .items {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--g-space-1);
    }
    .item {
      display: flex;
      gap: var(--g-space-3);
      align-items: flex-start;
      padding: var(--g-space-2) 0;
      border-top: 1px solid var(--g-line);
      ion-icon {
        flex: none;
        font-size: var(--g-text-title-l);
        color: var(--g-muted);
      }
    }
    .items .item:first-child {
      border-top: 0;
    }
    .text {
      display: grid;
      gap: var(--g-space-1);
      min-width: 0;
      line-height: 1.45;
      font-size: var(--g-text-title-s);
      a:first-child {
        font-weight: 600;
      }
      .muted {
        font-size: var(--g-text-body);
      }
    }
    .note {
      margin: var(--g-space-2) 0 0;
      font-size: var(--g-text-body);
      color: var(--g-muted);
    }
    .day {
      ul {
        margin: 0;
        padding-left: var(--g-space-5);
        font-size: var(--g-text-body);
        line-height: 1.5;
      }
      p {
        margin: 0;
        font-size: var(--g-text-body);
      }
    }
  `,
})
export class PlanDaysComponent {
  private readonly locale = inject(LOCALE_ID);
  readonly plan = input.required<StudyPlan>();
  /**
   * The chosen day. The page builds a new plan each minute and on every record, so a choice holds while its day is still
   * in the strip and today has not moved on.
   */
  readonly selected = linkedSignal<StudyPlan, string>({
    source: this.plan,
    computation: (plan, previous) =>
      previous &&
      previous.source.today === plan.today &&
      (previous.value === plan.interviewDate || plan.days.some((d) => d.date === previous.value))
        ? previous.value
        : plan.today,
  });
  readonly duration = formatMinutes;
  readonly plural = plural;
  readonly minutes = dayMinutes;

  readonly strip = computed(() => {
    const p = this.plan();
    const days = p.days.map((d) => ({ date: d.date, kind: dayKind(d), minutes: dayMinutes(d) }));
    const interview = { date: p.interviewDate, kind: 'interview' as const, minutes: 0 };
    return [...days, interview].map((d) => ({
      ...d,
      weekday: dayLabel(d.date, { weekday: 'short' }, this.locale),
      day: dayLabel(d.date, { day: 'numeric' }, this.locale),
      label: `${this.long(d.date)}: ${KIND_NAMES[d.kind]}${d.minutes ? `, about ${formatMinutes(d.minutes)}` : ''}`,
    }));
  });
  readonly legend = computed(() => {
    const kinds = new Set(this.strip().map((d) => d.kind));
    return (Object.keys(KIND_NAMES) as DayKind[]).filter((k) => kinds.has(k)).map((kind) => ({ kind, name: KIND_NAMES[kind] }));
  });
  readonly chosen = computed(() => this.plan().days.find((d) => d.date === this.selected()) ?? null);

  constructor() {
    addIcons({ chatbubblesOutline, flashOutline });
  }

  long(date: string): string {
    return dayLabel(date, { weekday: 'short', month: 'short', day: 'numeric' }, this.locale);
  }
}
