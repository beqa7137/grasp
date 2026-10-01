import { DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, LOCALE_ID, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import {
  PLAN_MINUTES,
  PLAN_ROUNDS,
  buildStudyPlan,
  dayKey,
  getProblemSummary,
  type PlanRound,
  type PlanUnit,
  type StudyPlanInput,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { checkmarkCircle, chatbubblesOutline, ellipseOutline, flashOutline } from 'ionicons/icons';
import { AnnouncerService } from '../../core/announcer.service';
import { refocusAfterRender } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import { StoryBankService } from '../behavioral/story-bank.service';
import { formatMinutes } from './duration';
import { PlanFormComponent } from './plan-form.component';

const ROUND_NAMES: Record<PlanRound, string> = { coding: 'Coding', design: 'System design', behavioral: 'Behavioral' };
const UPCOMING_DAYS = 6;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

@Component({
  selector: 'app-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AnnouncerService],
  imports: [RouterLink, DatePipe, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon, PlanFormComponent],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/learn" text="" /></ion-buttons>
        <ion-title>Study plan</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <p class="visually-hidden" role="status">{{ announcer.message() }}</p>
        @if (!input() || editing()) {
          <h1 #heading tabindex="-1">{{ input() ? 'Change your plan' : 'Plan to your interview' }}</h1>
          @if (!input()) {
            <p class="lead">
              Tell Grasp when your interview is and how much time you have. Each day you get a short list across the rounds you face,
              rebuilt from what you have actually done, so a missed day never leaves you behind a stale schedule.
            </p>
          }
          <app-plan-form [today]="today()" [initial]="input()" (saved)="save($event)" (cancelled)="cancel()" />
        } @else if (plan(); as p) {
          <section class="hero">
            @switch (p.status) {
              @case ('past') {
                <h1 #heading tabindex="-1">Your interview date has passed</h1>
              }
              @case ('interview-day') {
                <h1 #heading tabindex="-1">Interview day</h1>
              }
              @default {
                <h1 #heading tabindex="-1">{{ p.daysLeft === 1 ? 'Interview tomorrow' : 'Interview in ' + p.daysLeft + ' days' }}</h1>
              }
            }
            <p class="date">{{ p.interviewDate | date: 'EEEE, MMMM d, y' }}{{ p.daysLeft > 0 ? ' · ' + minutesLabel() + ' a day' : '' }}</p>
            <p class="status" [attr.data-status]="p.status">{{ statusText() }}</p>
          </section>

          @if (p.status === 'interview-day' && p.todayReview.cards) {
            <a class="panel item review" routerLink="/drill">
              <ion-icon name="flash-outline" aria-hidden="true" />
              <span><strong>A light review</strong><span class="muted">Only if it calms you. Stop whenever you like.</span></span>
            </a>
          }

          @if (p.days[0]; as day) {
            <section class="panel today" aria-labelledby="today-title">
              <h2 id="today-title">
                Today <span class="muted">· about {{ duration(dayMinutes(day)) }}</span>
              </h2>
              <ul class="items">
                <li class="item review">
                  <ion-icon name="flash-outline" aria-hidden="true" />
                  <span class="text">
                    @if (p.todayReview.cards) {
                      <a routerLink="/drill">Review</a>
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
                      <a routerLink="/behavioral/rehearse">Rehearse your stories</a>
                      <span class="muted"
                        >{{ p.todayReview.stories === 1 ? '1 story' : p.todayReview.stories + ' stories' }} due{{
                          p.todayReview.storyMinutes
                            ? ', about ' + duration(p.todayReview.storyMinutes)
                            : ', if time allows after your cards'
                        }}</span
                      >
                    </span>
                  </li>
                }
                @for (s of day.slices; track s.unit.id) {
                  <li class="item" [class.done]="s.done">
                    <ion-icon [name]="s.done ? 'checkmark-circle' : 'ellipse-outline'" aria-hidden="true" />
                    <span class="text">
                      <a [routerLink]="link(s.unit)">
                        @if (s.done) {
                          <span class="visually-hidden">Done: </span>
                        }
                        {{ s.unit.title }}</a
                      >
                      <span class="muted">{{ s.unit.detail }}</span>
                      @if (s.unit.kind === 'pattern' && !s.done) {
                        <a class="also" [routerLink]="['/code', s.unit.problemId]">Solve {{ problemTitle(s.unit) }}</a>
                      }
                      <span class="meta">
                        about {{ duration(s.minutes) }}{{ s.parts > 1 ? ' · part ' + s.part + ' of ' + s.parts : '' }}
                      </span>
                    </span>
                  </li>
                }
              </ul>
              @if (day.taper) {
                <p class="note">Review only today, so you arrive rested. Leave anything new for after the interview.</p>
              }
            </section>
          }

          @if (upcoming().length) {
            <section class="ahead" aria-labelledby="ahead-title">
              <h2 id="ahead-title">Coming up</h2>
              <ol class="days">
                @for (d of upcoming(); track d.date) {
                  <li class="panel day">
                    <h3>
                      {{ d.date | date: 'EEE, MMM d' }} <span class="muted">· about {{ duration(dayMinutes(d)) }}</span>
                    </h3>
                    @if (d.taper) {
                      <p class="muted">Review only, so you arrive rested.</p>
                    } @else {
                      <ul>
                        @for (s of d.slices; track s.unit.id) {
                          <li>
                            {{ s.unit.title
                            }}<span class="muted">
                              · {{ duration(s.minutes) }}{{ s.parts > 1 ? ', part ' + s.part + ' of ' + s.parts : '' }}</span
                            >
                          </li>
                        } @empty {
                          <li class="muted">Review, about {{ duration(d.review) }}.</li>
                        }
                      </ul>
                    }
                  </li>
                }
              </ol>
              @if (laterDays(); as n) {
                <p class="muted more">Then {{ plural(n, 'more day') }} until the interview.</p>
              }
            </section>
          }

          @if (remaining().length) {
            <section class="panel left" aria-labelledby="left-title">
              <h2 id="left-title">Still to learn</h2>
              <dl>
                @for (r of remaining(); track r.round) {
                  <dt>{{ r.name }}</dt>
                  <dd>{{ r.text }}</dd>
                }
              </dl>
            </section>
          }

          <div class="actions">
            <button type="button" class="g-btn" (click)="edit()">{{ p.status === 'past' ? 'Set a new date' : 'Change plan' }}</button>
            <button type="button" class="g-btn ghost" (click)="clear()">Clear plan</button>
          </div>
          <p class="muted footnote">
            Times are estimates. The plan rebuilds itself from what you finish, so do things in any order you like.
          </p>
        }
      </div>
    </ion-content>
  `,
  styles: `
    h1 {
      font-size: clamp(1.5rem, 5vw, 2.125rem);
      margin: 8px 0 8px;
    }
    h1:focus {
      outline: none;
    }
    .lead {
      font-size: 1rem;
      line-height: 1.55;
      margin: 0 0 16px;
    }
    .hero {
      margin-bottom: 16px;
    }
    .date {
      margin: 0 0 8px;
      color: var(--g-muted);
      font-size: 0.9375rem;
    }
    .status {
      margin: 0;
      line-height: 1.55;
      max-width: 62ch;
    }
    h2 {
      font-size: 1.0625rem;
      margin: 0 0 10px;
    }
    .today,
    .left {
      padding: 16px;
      margin-bottom: 16px;
    }
    .items {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 4px;
    }
    .item {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 10px 0;
      border-top: 1px solid var(--g-line);
      ion-icon {
        flex: none;
        font-size: 20px;
        margin-top: 1px;
        color: var(--g-muted);
      }
      &.done ion-icon {
        color: var(--g-found-ink);
      }
      &.done > .text > a:first-child {
        text-decoration: line-through;
      }
    }
    .items .item:first-child {
      border-top: 0;
    }
    a.item.review {
      padding: 12px 16px;
      margin-bottom: 16px;
      color: inherit;
      text-decoration: none;
      align-items: center;
    }
    .text {
      display: grid;
      gap: 3px;
      min-width: 0;
      line-height: 1.45;
      font-size: 0.9375rem;
      a:first-child {
        font-weight: 600;
      }
      .muted {
        font-size: 0.875rem;
      }
    }
    .also {
      font-size: 0.875rem;
      justify-self: start;
    }
    .meta {
      font-size: 0.8125rem;
      color: var(--g-muted);
    }
    .note {
      margin: 10px 0 0;
      font-size: 0.875rem;
      color: var(--g-muted);
    }
    .ahead {
      margin-bottom: 16px;
    }
    .days {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .day {
      padding: 12px 16px;
      h3 {
        font-size: 0.9375rem;
        margin: 0 0 6px;
      }
      ul {
        margin: 0;
        padding-left: 18px;
        font-size: 0.875rem;
        line-height: 1.5;
      }
      p {
        margin: 0;
        font-size: 0.875rem;
      }
    }
    .more {
      margin: 10px 0 0;
      font-size: 0.875rem;
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 16px;
      margin: 0;
      font-size: 0.9375rem;
    }
    dt {
      font-weight: 600;
    }
    dd {
      margin: 0;
      color: var(--g-muted);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .footnote {
      font-size: 0.8125rem;
      line-height: 1.5;
      margin: 0;
    }
  `,
})
export class PlanPage {
  private readonly progress = inject(ProgressService);
  private readonly bank = inject(StoryBankService);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly locale = inject(LOCALE_ID);
  readonly announcer = inject(AnnouncerService);
  readonly duration = formatMinutes;
  readonly plural = plural;
  readonly editing = signal(false);

  readonly input = computed(() => this.progress.state().plan);
  readonly today = computed(() => dayKey(this.progress.now(), this.progress.now().getTimezoneOffset()));
  readonly plan = computed(() => {
    const input = this.input();
    const now = this.progress.now();
    return input
      ? buildStudyPlan(input, this.progress.state(), { now, tzOffsetMinutes: now.getTimezoneOffset(), stories: this.bank.stories() })
      : null;
  });
  readonly minutesLabel = computed(() => formatMinutes(this.input()?.minutesPerDay ?? 0));
  readonly upcoming = computed(() => this.plan()?.days.slice(1, 1 + UPCOMING_DAYS) ?? []);
  readonly laterDays = computed(() => Math.max(0, (this.plan()?.days.length ?? 0) - 1 - UPCOMING_DAYS));
  readonly remaining = computed(() => {
    const p = this.plan();
    if (!p) return [];
    return PLAN_ROUNDS.flatMap((round) => {
      const r = p.remaining[round];
      if (!r) return [];
      const text = r.units ? `${plural(r.units, 'item')}, about ${formatMinutes(r.minutes)}` : 'All covered. Keep reviewing.';
      return [{ round, name: ROUND_NAMES[round], text }];
    });
  });
  readonly statusText = computed(() => {
    const p = this.plan();
    if (!p) return '';
    const perDay = this.minutesLabel();
    switch (p.status) {
      case 'past':
        return 'We hope it went well. Set the date of your next interview to plan for it, or clear the plan.';
      case 'interview-day':
        return 'Good luck today. A short review at most, then rest and trust what you have practised.';
      case 'covered':
        return 'You have worked through everything in this plan. Keep your reviews going until the day.';
      case 'tight': {
        const n = p.unscheduled.length;
        const fit = p.minutesToFit
          ? ` At ${formatMinutes(p.minutesToFit)} a day, everything would fit.`
          : ` Even at ${formatMinutes(PLAN_MINUTES.at(-1)!)} a day it would not all fit, so work from the top of each list; the most important items come first.`;
        return `${n ? plural(n, 'item') : 'The last item'} will not ${n ? '' : 'quite '}fit before your interview at ${perDay} a day, so the plan starts with what matters most.${fit}`;
      }
      default: {
        const sameYear = p.finishDate!.slice(0, 4) === p.today.slice(0, 4);
        return `At ${perDay} a day you cover everything by ${formatDate(p.finishDate!, sameYear ? 'EEEE, MMMM d' : 'EEEE, MMMM d, y', this.locale)}.`;
      }
    }
  });

  constructor() {
    addIcons({ checkmarkCircle, chatbubblesOutline, ellipseOutline, flashOutline });
  }

  async ionViewWillEnter() {
    this.progress.now.set(new Date());
    await this.bank.load();
  }

  dayMinutes(day: { review: number; slices: { minutes: number }[] }) {
    return day.review + day.slices.reduce((s, x) => s + x.minutes, 0);
  }

  link(unit: PlanUnit): string[] {
    switch (unit.kind) {
      case 'pattern':
        return ['/learn/pattern', unit.patternId!];
      case 'retry':
        return ['/code', unit.problemId!];
      case 'case':
        return ['/design/case', unit.caseId!];
      case 'story':
        return ['/behavioral', unit.competencyId!];
    }
  }

  problemTitle(unit: PlanUnit) {
    return getProblemSummary(unit.problemId ?? '')?.title ?? 'a problem';
  }

  edit() {
    this.editing.set(true);
    this.focusHeading();
  }

  cancel() {
    this.editing.set(false);
    this.focusHeading();
  }

  async save(plan: StudyPlanInput) {
    const first = !this.input();
    this.editing.set(false);
    await this.progress.record({ type: 'plan.set', plan });
    this.announcer.announce(first ? 'Plan saved.' : 'Plan updated.');
    this.focusHeading();
  }

  async clear() {
    await this.progress.record({ type: 'plan.set', plan: null });
    this.announcer.announce('Plan cleared.');
    this.focusHeading();
  }

  private focusHeading() {
    refocusAfterRender(this.injector, () => this.heading()?.nativeElement, document.body);
  }
}
