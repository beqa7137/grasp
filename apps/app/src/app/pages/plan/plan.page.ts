import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  LOCALE_ID,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlertController, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { PLAN_MINUTES, buildStudyPlan, currentTarget, type PlanStatus, type StudyPlanInput } from '@grasp/engine';
import { AnnouncerService } from '../../core/announcer.service';
import { refocusAfterRender } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import { StoryBankService } from '../behavioral/story-bank.service';
import { formatMinutes } from './duration';
import { PlanDaysComponent } from './plan-days.component';
import { PlanFormComponent, STARTING_POINT_NAMES } from './plan-form.component';
import { PlanRoundsComponent } from './plan-rounds.component';
import { coverageLine } from '../today/coverage-line';
import { ChipComponent, type ChipTone } from '../../ui/chip.component';
import { BackComponent } from '../../ui/back.component';
import { reviewIcon } from '../../ui/icons';
import { dayLabel, SHORT_DAY } from '../today/today.service';

const UNDO_MS = 8_000;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The header's chip (REDESIGN.md 4.9); the interview day and a passed date need none. */
const STATUS_CHIPS: Partial<Record<PlanStatus, { text: string; tone: ChipTone }>> = {
  'on-track': { text: 'On track', tone: 'success' },
  tight: { text: 'Tight', tone: 'warn' },
  covered: { text: 'All covered', tone: 'success' },
  eve: { text: 'Review only', tone: 'neutral' },
};

@Component({
  selector: 'app-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AnnouncerService],
  imports: [
    BackComponent,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    IonIcon,
    PlanFormComponent,
    PlanDaysComponent,
    PlanRoundsComponent,
    ChipComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><app-back href="/today" /></ion-buttons>
        <ion-title>Study plan</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <p class="visually-hidden" role="status">{{ announcer.message() }}</p>
        @if (!input() || editing()) {
          <h1 #heading tabindex="-1">{{ input() ? 'Change your plan' : 'Plan to your interview' }}</h1>
          @if (cleared()) {
            <p #undoRow class="undo panel">Plan cleared. <button type="button" class="g-btn ghost" (click)="undo()">Undo</button></p>
          }
          @if (!input()) {
            <p class="lead">
              Tell Grasp when your interview is and how much time you have. Each day you get a short list across the rounds you face,
              rebuilt from what you have actually done, so a missed day never leaves you behind a stale schedule.
            </p>
          }
          <app-plan-form [today]="today()" [initial]="input()" [loop]="target()" (saved)="save($event)" (cancelled)="cancel()" />
        } @else if (plan(); as p) {
          <section class="hero">
            <div class="title-row">
              <h1 #heading tabindex="-1">{{ title() }}</h1>
              @if (chip(); as c) {
                <g-chip [tone]="c.tone">{{ c.text }}</g-chip>
              }
              <button type="button" class="link" (click)="edit()">{{ p.status === 'past' ? 'Set a new date' : 'Edit' }}</button>
            </div>
            <p class="date">{{ dateLine() }}</p>
            <p class="status" [attr.data-status]="p.status">
              {{ statusText() }}
            </p>
            @if (coverage(); as c) {
              <div class="fit">
                @if (c.minutes; as m) {
                  <button type="button" class="g-btn" (click)="change({ minutesPerDay: m.value })">{{ m.label }}</button>
                }
                @if (c.date) {
                  <button type="button" class="g-btn ghost" (click)="change({ interviewDate: c.date })">
                    Move the date to {{ short(c.date) }}
                  </button>
                }
              </div>
            }
          </section>

          @if (p.status === 'interview-day' && p.todayReview.cards) {
            <a class="panel item review" routerLink="/today/review">
              <ion-icon [icon]="reviewIcon" aria-hidden="true" />
              <span><strong>A light review</strong><span class="muted">Only if it calms you. Stop whenever you like.</span></span>
            </a>
          }

          @if (p.days.length) {
            <app-plan-days [plan]="p" />
            <app-plan-rounds [plan]="p" [target]="target()" />
          }

          <div class="actions">
            <button type="button" class="g-btn ghost" (click)="confirmClear()">Clear plan</button>
          </div>
          <p class="muted footnote">
            Times are estimates. The plan rebuilds itself from what you finish, so do things in any order you like.
          </p>
        }
      </div>
    </ion-content>
  `,
  styles: `
    @use '../../../type' as *;

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
    .title-row {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      column-gap: var(--g-space-3);
    }
    .link {
      appearance: none;
      border: 0;
      background: none;
      padding: 0;
      min-height: 24px;
      color: var(--g-accent);
      font: 600 var(--g-text-body) var(--ion-font-family);
      text-decoration: underline;
      text-underline-offset: 3px;
      cursor: pointer;
    }
    .fit {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-2);
      margin-top: var(--g-space-3);
    }
    h2 {
      @include title;
      font-size: var(--g-text-title-m);
      margin: 0 0 10px;
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
    }
    a.item.review {
      padding: 12px 16px;
      margin-bottom: 16px;
      color: inherit;
      text-decoration: none;
      align-items: center;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .undo {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 12px 0;
      padding: 8px 8px 8px 14px;
    }
    .footnote {
      font-size: 0.8125rem;
      line-height: 1.5;
      margin: 0;
    }
  `,
})
export class PlanPage {
  readonly reviewIcon = reviewIcon;
  private readonly progress = inject(ProgressService);
  private readonly bank = inject(StoryBankService);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly undoRow = viewChild<ElementRef<HTMLElement>>('undoRow');
  private readonly content = viewChild.required(IonContent);
  private readonly locale = inject(LOCALE_ID);
  readonly announcer = inject(AnnouncerService);
  readonly duration = formatMinutes;
  readonly plural = plural;
  readonly editing = signal(false);
  private readonly alerts = inject(AlertController);
  /** The plan just cleared, while it can still be restored. */
  readonly cleared = signal<StudyPlanInput | null>(null);
  private undoTimer: ReturnType<typeof setTimeout> | undefined;

  readonly input = computed(() => this.progress.state().plan);
  readonly today = this.progress.day;
  readonly plan = computed(() => {
    const input = this.input();
    const now = this.progress.now();
    return input
      ? buildStudyPlan(input, this.progress.state(), {
          now,
          tzOffsetMinutes: now.getTimezoneOffset(),
          stories: this.bank.stories(),
          target: currentTarget(this.progress.state()).target,
        })
      : null;
  });
  readonly minutesLabel = computed(() => formatMinutes(this.input()?.minutesPerDay ?? 0));
  readonly target = computed(() => currentTarget(this.progress.state()).target);
  readonly coverage = computed(() => {
    const p = this.plan();
    const input = this.input();
    return p && input ? coverageLine(p, input, p.today, (d) => this.short(d)) : null;
  });
  readonly title = computed(() => {
    const p = this.plan();
    if (!p) return '';
    if (p.status === 'past') return 'Your interview date has passed';
    if (p.status === 'interview-day') return 'Interview day';
    return p.daysLeft === 1 ? 'Interview tomorrow' : `${p.daysLeft} days to ${this.short(p.interviewDate)}`;
  });
  readonly dateLine = computed(() => {
    const p = this.plan();
    const input = this.input();
    if (!p || !input) return '';
    const date = dayLabel(p.interviewDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }, this.locale);
    return p.daysLeft > 0 ? `${date} · ${this.minutesLabel()} a day · Starting point: ${STARTING_POINT_NAMES[input.level]}` : date;
  });
  readonly chip = computed(() => {
    const status = this.plan()?.status;
    return status ? (STATUS_CHIPS[status] ?? null) : null;
  });
  readonly statusText = computed(() => {
    const p = this.plan();
    if (!p) return '';
    const perDay = this.minutesLabel();
    switch (p.status) {
      case 'past':
        return 'We hope it went well. Set the date of your next interview to plan for it, or clear the plan.';
      case 'interview-day':
        return 'Good luck today. A short review at most, then rest and trust what you have practiced.';
      case 'eve':
        return 'Tomorrow is the day. Keep today light: a short review, then rest.';
      case 'covered':
        return 'You have worked through everything in this plan. Keep your reviews going until the day.';
      case 'tight': {
        const coverage = this.coverage();
        if (coverage) return coverage.text;
        const n = p.unscheduled.length;
        const fit = p.minutesToFit
          ? ` At ${formatMinutes(p.minutesToFit)} a day, everything would fit.`
          : ` Even at ${formatMinutes(PLAN_MINUTES.at(-1)!)} a day it would not all fit, so work from the top of each list; the most important items come first.`;
        return `${n ? plural(n, 'item') : 'The last item'} will not ${n ? '' : 'quite '}fit before your interview at ${perDay} a day, so the plan starts with what matters most.${fit}`;
      }
      default: {
        const mock = p.units.some((u) => u.kind === 'mock' && !u.doneAt);
        if (!p.finishDate) return 'Everything else is covered. Finish with a mock loop before the interview.';
        const sameYear = p.finishDate.slice(0, 4) === p.today.slice(0, 4);
        const by = dayLabel(
          p.finishDate,
          sameYear
            ? { weekday: 'long', month: 'long', day: 'numeric' }
            : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
          this.locale,
        );
        return mock
          ? `At ${perDay} a day you cover everything new by ${by}, then run a mock loop just before the interview.`
          : `At ${perDay} a day you cover everything by ${by}.`;
      }
    }
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.undoTimer));
  }

  async ionViewWillEnter() {
    this.progress.now.set(new Date());
    await this.bank.load();
  }

  short(date: string): string {
    return dayLabel(date, SHORT_DAY, this.locale);
  }

  /** The coverage line's one-tap fixes, as on Today: more minutes a day, or a later date. */
  async change(change: Partial<StudyPlanInput>) {
    const input = this.input();
    if (!input) return;
    await this.progress.record({ type: 'plan.set', plan: { ...input, ...change } });
    this.announcer.announce(
      change.minutesPerDay
        ? `Plan changed to ${formatMinutes(change.minutesPerDay)} a day.`
        : `Interview date moved to ${this.short(change.interviewDate!)}.`,
    );
    this.focusHeading();
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
    this.endUndo();
    await this.progress.record({ type: 'plan.set', plan });
    this.announcer.announce(first ? 'Plan saved.' : 'Plan updated.');
    this.focusHeading();
  }

  async confirmClear() {
    const alert = await this.alerts.create({
      header: 'Clear your plan?',
      message: 'Your progress stays.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Clear plan', role: 'destructive' },
      ],
    });
    await alert.present();
    // Ionic gives focus back to "Clear plan" as the alert closes, so the heading takes it only after that.
    const { role } = await alert.onDidDismiss();
    if (role === 'destructive') await this.clear();
  }

  async undo() {
    const previous = this.cleared();
    this.endUndo();
    if (!previous || this.input()) return;
    await this.progress.record({ type: 'plan.set', plan: previous });
    this.announcer.announce('Plan restored.');
    this.focusHeading();
  }

  private async clear() {
    const previous = this.input();
    await this.progress.record({ type: 'plan.set', plan: null });
    this.announcer.announce(`Plan cleared. You can undo for ${UNDO_MS / 1000} seconds.`);
    this.cleared.set(previous);
    clearTimeout(this.undoTimer);
    this.undoTimer = setTimeout(() => this.expireUndo(), UNDO_MS);
    this.focusHeading();
  }

  private expireUndo() {
    const held = this.undoRow()?.nativeElement.contains(document.activeElement);
    this.cleared.set(null);
    if (held) refocusAfterRender(this.injector, () => this.heading()?.nativeElement);
  }

  private endUndo() {
    clearTimeout(this.undoTimer);
    this.cleared.set(null);
  }

  /** Each view starts at its heading, which on a small phone the button that changed the view has scrolled away from. */
  private focusHeading() {
    void this.content().scrollToTop(0);
    refocusAfterRender(this.injector, () => this.heading()?.nativeElement, document.body);
  }
}
