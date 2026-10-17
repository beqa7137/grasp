import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  LOCALE_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { PLAN_ROUNDS, ROUND_NAMES, SENIORITY_LEVELS, calendarDaysBetween, currentTarget, daysLeftLabel } from '@grasp/engine';
import { AnnouncerService } from '../../core/announcer.service';
import { refocusAfterRender } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import { SectionComponent } from '../../ui/section.component';
import { formatMinutes } from '../plan/duration';
import { STARTING_POINT_NAMES } from '../plan/plan-form.component';
import { LoopCardComponent } from '../today/loop-card.component';
import { TodayService, dayLabel, SHORT_DAY } from '../today/today.service';

/** "Your loop", first in Settings (REDESIGN.md 4.10): the Target and plan in two lines, edited with Today's loop card. */
@Component({
  selector: 'app-loop-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AnnouncerService],
  imports: [SectionComponent, LoopCardComponent],
  template: `
    <p class="visually-hidden" role="status">{{ announcer.message() }}</p>
    <g-section heading="Your loop">
      <p #summary class="line" tabindex="-1">{{ line() }}</p>
      @if (editing()) {
        <div class="card">
          <app-loop-card mode="edit" place="settings" />
        </div>
      } @else {
        <p class="muted small">{{ details() }}</p>
        <button type="button" class="g-btn" (click)="edit()">Edit your loop</button>
      }
    </g-section>
  `,
  styles: `
    .line {
      margin: 0 0 var(--g-space-1);
      font-weight: 600;
      &:focus {
        outline: none;
      }
    }
    .small {
      margin: 0 0 var(--g-space-3);
      line-height: 1.45;
    }
    .card {
      padding-top: var(--g-space-3);
      border-top: 1px solid var(--g-line);
    }
  `,
})
export class LoopSettingsComponent {
  private readonly progress = inject(ProgressService);
  private readonly today = inject(TodayService);
  readonly announcer = inject(AnnouncerService);
  private readonly injector = inject(Injector);
  private readonly locale = inject(LOCALE_ID);
  private readonly summary = viewChild.required<ElementRef<HTMLElement>>('summary');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly editing = signal(false);

  readonly line = computed(() => {
    const state = this.progress.state();
    const { target, source } = currentTarget(state);
    const level = SENIORITY_LEVELS.find((l) => l.level === target.level)!.label;
    if (source === 'assumed') return `Assuming a ${level} loop`;
    const parts = [`${level} loop${source === 'derived' ? ' (assumed)' : ''}`];
    const plan = state.plan;
    if (!plan) return [...parts, 'no date yet'].join(' · ');
    const days = calendarDaysBetween(this.progress.day(), plan.interviewDate);
    parts.push(dayLabel(plan.interviewDate, SHORT_DAY, this.locale), daysLeftLabel(days));
    if (days > 0) parts.push(`${formatMinutes(plan.minutesPerDay)} a day`);
    return parts.join(' · ');
  });
  readonly details = computed(() => {
    const state = this.progress.state();
    const { rounds } = currentTarget(state).target;
    const list = PLAN_ROUNDS.filter((r) => rounds[r] > 0).map((r) => `${ROUND_NAMES[r]}${rounds[r] > 1 ? ` ×${rounds[r]}` : ''}`);
    const start = state.plan ? ` · Starting point: ${STARTING_POINT_NAMES[state.plan.level]}` : '';
    return `Rounds: ${list.join(', ')}${start}`;
  });

  /** Opens the loop card in place; the button that opened it goes, so focus moves to the card's first choice. */
  edit(): void {
    this.editing.set(true);
    refocusAfterRender(this.injector, () => this.host.nativeElement.querySelector<HTMLElement>('app-loop-card button'), document.body);
  }

  constructor() {
    const before = this.today.closed();
    effect(() => {
      const closed = this.today.closed();
      if (closed === before || closed?.place !== 'settings') return;
      untracked(() => {
        this.editing.set(false);
        if (closed.message) this.announcer.announce(closed.message);
        refocusAfterRender(this.injector, () => this.summary().nativeElement, document.body);
      });
    });
  }
}
