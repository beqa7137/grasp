import { formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  LOCALE_ID,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  CASE_CATALOG,
  buildStudyPlan,
  currentTarget,
  minutesFor,
  roundsInLoop,
  upNext,
  type DeviceWork,
  type PlanDay,
  type StudyPlanInput,
  type UpNextCard,
} from '@grasp/engine';
import { RouterLink } from '@angular/router';
import { AnnouncerService } from '../../core/announcer.service';
import { refocusAfterRender } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { DisclosureComponent } from '../../ui/disclosure.component';
import { StoryBankService } from '../behavioral/story-bank.service';
import { CaseDraftsService } from '../design/case/case-drafts.service';
import { formatMinutes } from '../plan/duration';
import { PlanTodayComponent, daySummary } from '../plan/plan-today.component';
import { coverageLine, type CoverageLine } from './coverage-line';
import { TodayService } from './today.service';
import { UpNextCardComponent } from './up-next-card.component';
import { actionLink, caseWorkId } from './up-next-links';

interface View {
  /** Today's checklist, when a plan gives today any slices. */
  day: PlanDay | null;
  summary: string;
  card: UpNextCard | null;
  /** The plan unit the card stands in for, so its row expands into the card. */
  expanded: string | null;
  /** Plan units hidden with "Not today": the checklist marks them and leaves them out of the time left. */
  hidden: ReadonlySet<string>;
  /** Without a plan: one card for each other round of the loop. */
  others: UpNextCard[];
  coverage: CoverageLine | null;
}

/**
 * Up next (REDESIGN.md 2.7): today's plan as a checklist whose first open row is the Up next card, or without a plan one
 * card and the other rounds. It is built once its inputs have all loaded (progress, stories, this device's drafts) and
 * then held: it rebuilds only when Today is entered again, the day changes, or the learner acts here. So a sync that
 * lands after it renders never moves the button under the learner's finger.
 */
@Component({
  selector: 'app-up-next',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CrossLinkDirective, PlanTodayComponent, UpNextCardComponent, DisclosureComponent],
  template: `
    @if (view(); as v) {
      <section class="block" aria-labelledby="up-next-heading">
        <h2 #heading id="up-next-heading" class="eyebrow" tabindex="-1">
          @if (v.day) {
            Today <span class="summary">{{ v.summary }}</span>
          } @else {
            Up next
          }
        </h2>
        @if (v.day) {
          <app-plan-today [day]="v.day" [expanded]="v.expanded" [hidden]="v.hidden">
            @if (v.card && v.expanded) {
              <app-up-next-card [card]="v.card" [label]="true" (notToday)="hide(v.card)" />
            }
          </app-plan-today>
        }
        @if (v.card && !v.expanded) {
          <app-up-next-card [card]="v.card" [label]="!!v.day" (notToday)="hide(v.card)" />
        } @else if (!v.card && !v.day) {
          <p class="empty">Nothing new is waiting. Review keeps what you know fresh.</p>
        }
        @if (v.coverage; as c) {
          <div class="coverage">
            <p>{{ c.text }}</p>
            <div class="fit">
              @if (c.minutes; as m) {
                <button type="button" class="g-btn" (click)="changePlan({ minutesPerDay: m.value })">{{ m.label }}</button>
              }
              @if (c.date) {
                <button type="button" class="g-btn ghost" (click)="changePlan({ interviewDate: c.date })">
                  Move the date to {{ dayLabel(c.date) }}
                </button>
              }
            </div>
          </div>
        }
        @if (v.others.length) {
          <g-disclosure summary="Other rounds">
            <ul class="others">
              @for (o of v.others; track o.id) {
                <li>
                  @if (link(o); as l) {
                    <a [routerLink]="l" crossLink>{{ o.title }}</a>
                  } @else {
                    <strong>{{ o.title }}</strong>
                  }
                  <span class="muted">{{ o.reason }}</span>
                </li>
              }
            </ul>
          </g-disclosure>
        }
      </section>
    }
  `,
  styles: `
    .block {
      display: grid;
      gap: var(--g-space-3);
    }
    h2 {
      margin: 0;
      line-height: 1.6;
      &:focus {
        outline: none;
      }
    }
    .summary {
      margin-left: var(--g-space-2);
      text-transform: none;
      letter-spacing: normal;
      font-weight: 500;
      font-size: var(--g-text-body-s);
    }
    .coverage {
      display: grid;
      gap: var(--g-space-2);
      padding: var(--g-space-3) var(--g-space-4);
      border-radius: var(--g-radius-md);
      background: var(--g-sunken);
      p {
        margin: 0;
        font-size: var(--g-text-body);
        line-height: 1.5;
      }
    }
    .fit {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-2);
    }
    .empty {
      margin: 0;
      color: var(--g-muted);
      font-size: var(--g-text-body);
    }
    .others {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--g-space-3);
      li {
        display: grid;
        gap: var(--g-space-1);
        font-size: var(--g-text-body);
        line-height: 1.45;
      }
      a {
        font-weight: 600;
        justify-self: start;
      }
    }
  `,
})
export class UpNextComponent {
  private readonly progress = inject(ProgressService);
  private readonly bank = inject(StoryBankService);
  private readonly drafts = inject(CaseDraftsService);
  private readonly today = inject(TodayService);
  private readonly announcer = inject(AnnouncerService);
  private readonly injector = inject(Injector);
  private readonly locale = inject(LOCALE_ID);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly loaded = signal(false);
  readonly view = signal<View | null>(null);
  readonly minutes = formatMinutes;
  readonly link = (card: UpNextCard) => actionLink(card.action);

  constructor() {
    void Promise.all([this.bank.load().catch(() => undefined), this.drafts.load().catch(() => undefined)]).then(() =>
      this.loaded.set(true),
    );
    effect(() => {
      this.today.visit();
      const day = this.today.day();
      if (!this.loaded() || !this.today.shown()) return;
      untracked(() => this.view.set(this.build(day)));
    });
  }

  dayLabel(date: string): string {
    return formatDate(date, 'MMM d', this.locale, 'UTC');
  }

  hide(card: UpNextCard): void {
    const day = this.today.day();
    this.today.hide(day, card.id);
    const next = this.build(day);
    this.view.set(next);
    this.announcer.announce(next.card ? `Hidden until tomorrow. Up next: ${next.card.title}.` : 'Hidden until tomorrow.');
    refocusAfterRender(
      this.injector,
      () => this.host.nativeElement.querySelector<HTMLElement>('app-up-next-card h3') ?? this.heading()?.nativeElement,
      document.body,
    );
  }

  /** The coverage line's one-tap fixes: a plan with more minutes a day, or a later date. */
  async changePlan(change: Partial<StudyPlanInput>): Promise<void> {
    const plan = this.progress.state().plan;
    if (!plan) return;
    await this.progress.record({ type: 'plan.set', plan: { ...plan, ...change } });
    this.today.visit.update((n) => n + 1);
    const message = change.minutesPerDay
      ? `Plan changed to ${formatMinutes(change.minutesPerDay)} a day.`
      : `Interview date moved to ${this.dayLabel(change.interviewDate!)}.`;
    this.announcer.announce(message);
    refocusAfterRender(this.injector, () => this.heading()?.nativeElement, document.body);
  }

  private build(day: string): View {
    const state = this.progress.state();
    const now = this.progress.now();
    const stories = this.bank.stories();
    const { target } = currentTarget(state);
    const plan = state.plan ? buildStudyPlan(state.plan, state, { now, tzOffsetMinutes: now.getTimezoneOffset(), stories, target }) : null;
    const input = {
      state,
      stories,
      now,
      plan,
      online: navigator.onLine,
      deviceWork: this.deviceWork(state.plan?.level),
      hidden: this.today.hiddenOn(day),
    };
    const card = upNext(input);
    const today = plan?.days[0]?.slices.length ? plan.days[0] : null;
    const hiddenUnits = new Set([...input.hidden].filter((id) => id.startsWith('plan:')).map((id) => id.slice('plan:'.length)));
    const others = plan
      ? []
      : roundsInLoop(target.rounds)
          .filter((r) => r !== card?.round)
          .flatMap((r) => upNext(input, r) ?? []);
    return {
      day: today,
      summary: today ? daySummary(today, hiddenUnits) : '',
      hidden: hiddenUnits,
      card,
      expanded: card?.action.kind === 'plan-unit' ? card.action.unit.id : null,
      others,
      coverage: plan && state.plan ? coverageLine(plan, state.plan, day, (d) => this.dayLabel(d)) : null,
    };
  }

  /** Case studies started on this device and not finished: Up next's rule 4 (REDESIGN.md 2.3). */
  private deviceWork(pace: StudyPlanInput['level'] = 'new'): DeviceWork[] {
    const finished = this.progress.state().cases;
    return CASE_CATALOG.flatMap((c) => {
      const draft = this.drafts.draft(c.id);
      if (!draft || draft.reached < 1 || finished[c.id]) return [];
      const stage = Math.min(draft.reached + 1, c.stages);
      return [
        {
          id: caseWorkId(c.id),
          round: 'design' as const,
          title: `Continue ${c.title}`,
          detail: `you stopped at stage ${stage} of ${c.stages}`,
          minutes: minutesFor({ kind: 'case', stages: c.stages - stage + 1 }, pace),
        },
      ];
    });
  }
}
