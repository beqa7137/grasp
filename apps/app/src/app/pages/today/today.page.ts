import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  LOCALE_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  type Type,
} from '@angular/core';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, PopoverController } from '@ionic/angular';
import { getScenarioSummary, type Seniority } from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  chevronForward,
  cloudDoneOutline,
  compassOutline,
  ellipsisHorizontal,
  gitNetworkOutline,
  saveOutline,
  settingsOutline,
  syncOutline,
  timeOutline,
} from 'ionicons/icons';
import { AnnouncerService } from '../../core/announcer.service';
import { AuthService } from '../../core/auth.service';
import { refocusAfterRender } from '../../core/focus';
import { FIRST_IDLE } from '../../core/serial-preloading.strategy';
import { ProgressService } from '../../core/progress.service';
import { PilotService } from '../../pilot/pilot.service';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { reviewIcon } from '../../ui/icons';
import { DiagnosticPromptService } from '../diagnostic/diagnostic-prompt.service';
import { LEVELS, LEVEL_NAMES, addDays, loopLine, loopSource } from './loop-line';
import { TodayMenuComponent, type TodayMenuChoice } from './today-menu.component';
import { LOOP_CARD_REST_DAYS, TodayService, dayLabel, SHORT_DAY } from './today.service';

const DAY_MS = 86_400_000;
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

@Component({
  selector: 'app-today',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AnnouncerService],
  imports: [CrossLinkDirective, RouterLink, NgComponentOutlet, IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonIcon],
  templateUrl: './today.page.html',
  styleUrl: './today.page.scss',
})
export class TodayPage {
  readonly reviewIcon = reviewIcon;
  private readonly injector = inject(Injector);
  private readonly locale = inject(LOCALE_ID);
  private readonly syncAlert = viewChild<ElementRef<HTMLElement>>('syncAlert');
  private readonly retryButton = viewChild<ElementRef<HTMLButtonElement>>('retryButton');
  private readonly syncStatus = viewChild<ElementRef<HTMLElement>>('syncStatus');
  private readonly sessionResume = viewChild<ElementRef<HTMLAnchorElement>>('sessionResume');
  private readonly more = viewChild.required<ElementRef<HTMLButtonElement>>('more');
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly moved = viewChild<ElementRef<HTMLElement>>('moved');
  private readonly offer = viewChild<ElementRef<HTMLElement>>('offer');
  private readonly content = viewChild.required(IonContent);
  private readonly popovers = inject(PopoverController);
  private readonly router = inject(Router);
  private readonly pilot = inject(PilotService);
  readonly announcer = inject(AnnouncerService);
  readonly progress = inject(ProgressService);
  readonly auth = inject(AuthService);
  readonly today = inject(TodayService);
  readonly diagnosticPrompt = inject(DiagnosticPromptService);
  readonly levels = LEVELS.map((level) => ({ level, name: LEVEL_NAMES[level] }));
  readonly menuOpen = signal(false);
  /** "Where things moved" (REDESIGN.md 2.13), for learners with progress from before the five sections. */
  readonly movedNote = signal(false);
  private readonly retryNotice = signal<string | null>(null);
  readonly retrying = computed(() => this.retryNotice() !== null);
  readonly showSyncNotice = computed(
    () =>
      !this.auth.signInRequired() &&
      (this.retrying() || this.progress.syncStatus() === 'offline' || this.progress.syncStatus() === 'pending'),
  );
  readonly syncIcon = computed(() => {
    switch (this.progress.syncStatus()) {
      case 'offline':
        return 'alert-circle-outline';
      case 'pending':
        return 'time-outline';
      case 'syncing':
        return 'sync-outline';
      case 'idle':
        return 'save-outline';
      default:
        return 'cloud-done-outline';
    }
  });
  readonly syncNotice = computed(() => {
    const retryNotice = this.retryNotice();
    if (retryNotice !== null) return retryNotice;
    if (this.progress.syncStatus() === 'offline') return 'Sync is unavailable. Your progress is saved on this device.';
    const { future, oversized } = this.progress.pendingSync();
    if (future > 0 && oversized > 0) return 'Some progress has a future date, and some is too large to sync. It is saved on this device.';
    if (future > 0) return 'Some progress has a future date and cannot sync yet. It is saved on this device.';
    if (oversized > 0) return 'Some progress is too large to sync. It is saved on this device.';
    return 'Some progress is waiting to sync. It is saved on this device.';
  });

  readonly day = this.today.day;
  readonly source = computed(() => loopSource(this.progress.state()));
  /** "What is your loop?" (REDESIGN.md 2.13, step 2): only without a Target or a plan, and not while "Not now" holds. */
  readonly firstRun = computed(() => {
    const until = this.today.loopCardHiddenUntil();
    return this.source() === 'assumed' && !(until && until > this.day());
  });
  /**
   * A signed-in device that has not pulled since launch may not hold its account's Target yet; filling the card then would
   * overwrite another device's, so the card waits for the first pull.
   */
  readonly holdLoopCard = computed(() => this.auth.user() !== null && !this.progress.pulled());
  readonly lineParts = computed(() => loopLine(this.progress.state(), this.day(), (date) => dayLabel(date, SHORT_DAY, this.locale)));
  readonly meta = computed(() => {
    const { streak, xp } = this.progress.state();
    return streak.current || xp ? `${streak.current}-day streak · ${xp} XP` : null;
  });
  /**
   * "6 due · 2 new · about 7 min", or "All caught up · 4 due tomorrow" from the forecast. Its due count is the Today tab's
   * badge (REDESIGN.md 2.6); new cards are offered, not due, so neither counts them.
   */
  readonly reviewDetail = computed(() => {
    const session = this.progress.session();
    const due = this.progress.reviewDue();
    if (session.items.length) {
      const parts = [due ? `${due} due` : '', session.newIncluded ? `${session.newIncluded} new` : ''].filter(Boolean);
      return [...parts, `about ${session.estimatedMinutes} min`].join(' · ');
    }
    const next = this.progress.forecast().find((d, i) => i > 0 && d.count > 0);
    if (!next) return 'All caught up';
    const days = Math.round((Date.parse(next.day) - Date.parse(this.day())) / DAY_MS);
    return `All caught up · ${next.count} due ${days === 1 ? 'tomorrow' : WEEKDAY.format(new Date(`${next.day}T00:00:00Z`))}`;
  });
  readonly revisit = computed(() => {
    const m = this.progress.dueMissions()[0];
    return m ? { ...m, title: getScenarioSummary(m.scenarioId)!.title } : null;
  });
  /** The placement (REDESIGN.md 2.13, step 3): once a loop with Coding is saved, until it is taken or set aside. */
  readonly offerPlacement = computed(() => {
    const { target, diagnosedAt } = this.progress.state();
    return Boolean(target && target.rounds.coding > 0) && !diagnosedAt && !this.diagnosticPrompt.dismissed();
  });

  /** The loop card and Up next load after first paint, since they hold the engine's planning code (REDESIGN.md 4.1). */
  readonly loopCard = signal<Type<unknown> | null | 'failed'>(null);
  readonly upNext = signal<Type<unknown> | null | 'failed'>(null);
  /** Readiness, Continue and Weak spots, which load with Up next. */
  readonly aside = signal<Type<unknown> | null | 'failed'>(null);
  private readonly idle = signal(false);

  constructor() {
    addIcons({
      alertCircleOutline,
      chevronForward,
      cloudDoneOutline,
      compassOutline,
      ellipsisHorizontal,
      gitNetworkOutline,
      saveOutline,
      settingsOutline,
      syncOutline,
      timeOutline,
    });
    void this.offerMovedNote();
    // Both wait for the first idle period while Today is shown: on a slow phone a tab tapped right after first paint then
    // loads its own page first, and Today's blocks load when the learner comes back.
    void inject(FIRST_IDLE).then(() => this.idle.set(true));
    effect(() => {
      if (!this.idle() || !this.today.shown()) return;
      untracked(() => {
        if (this.upNext()) return;
        void import('./up-next.component').then(
          (m) => this.upNext.set(m.UpNextComponent),
          () => this.upNext.set('failed'),
        );
        void import('./today-aside.component').then(
          (m) => this.aside.set(m.TodayAsideComponent),
          () => this.aside.set('failed'),
        );
      });
      if ((this.firstRun() || this.today.editing()) && !this.holdLoopCard() && !untracked(this.loopCard))
        void import('./loop-card.component').then(
          (m) => this.loopCard.set(m.LoopCardComponent),
          () => this.loopCard.set('failed'),
        );
    });
    // A tap away before the first idle period leaves Today's blocks for the learner's return.
    const leaving = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart && new URL(event.url, location.origin).pathname !== '/today') {
        this.today.shown.set(false);
      }
    });
    inject(DestroyRef).onDestroy(() => leaving.unsubscribe());
    effect(() => {
      const closed = this.today.closed();
      if (closed?.place !== 'today') return;
      untracked(() => {
        this.announcer.announce(closed.message);
        void this.content().scrollToTop(0);
        refocusAfterRender(this.injector, () => this.heading().nativeElement, document.body);
      });
    });
  }

  private async offerMovedNote(): Promise<void> {
    if (await this.pilot.offerMovedNote(this.progress.recorded())) this.movedNote.set(true);
  }

  dismissMovedNote(): void {
    const note = this.moved()?.nativeElement;
    this.movedNote.set(false);
    refocusAfterRender(this.injector, () => this.heading().nativeElement, note);
  }

  ionViewWillEnter() {
    this.today.shown.set(true);
    this.progress.now.set(new Date());
    this.today.visit.update((n) => n + 1);
  }

  edit(): void {
    this.today.editing.set(true);
  }

  /** The pilot's inline level row (REDESIGN.md 2.1): one tap writes the Target, with the plan's rounds at that level. */
  async chooseLevel(level: Seniority): Promise<void> {
    const plan = this.progress.state().plan;
    if (!plan) return;
    const events = await import('./loop-events').catch(() => null);
    if (!events) return this.announcer.announce("Couldn't save your level. Reload the page and try again.");
    await this.progress.record({ type: 'target.set', target: { level, rounds: events.levelCounts(level, plan.rounds) } });
    this.today.close(`${LEVEL_NAMES[level]} loop saved.`);
  }

  /** "Not now" without the card's own chunk, when it failed to load. */
  notNow(): void {
    void this.today.hideLoopCard(addDays(this.day(), LOOP_CARD_REST_DAYS)).catch(() => undefined);
    this.today.close('Hidden for a week. Set your loop from here whenever you are ready.');
  }

  reload(): void {
    location.reload();
  }

  dismissPlacement(): void {
    const offer = this.offer()?.nativeElement;
    void this.diagnosticPrompt.dismiss();
    refocusAfterRender(this.injector, () => this.heading().nativeElement, offer);
  }

  async openMenu(event: MouseEvent): Promise<void> {
    // A double tap would otherwise stack a second menu that outlives the first one's choice.
    if (this.menuOpen()) return;
    this.menuOpen.set(true);
    const menu = await this.popovers.create({
      component: TodayMenuComponent,
      event,
      htmlAttributes: { role: 'dialog', 'aria-label': 'More options' },
    });
    await menu.present();
    menu.querySelector('button')?.focus();
    const { data } = await menu.onDidDismiss<TodayMenuChoice>();
    this.menuOpen.set(false);
    if (data === 'plan' || data === 'progress') {
      void this.router.navigateByUrl(`/today/${data}`);
    } else if (data === 'feedback') {
      // WebKit leaves a tapped button unfocused, so the dialog would have nothing to give focus back to on close.
      this.more().nativeElement.focus();
      this.pilot.feedbackOpen.set(true);
    }
  }

  async retrySync(): Promise<void> {
    if (this.retrying()) return;
    const alert = this.syncAlert()?.nativeElement;
    this.retryNotice.set(this.syncNotice());
    refocusAfterRender(this.injector, () => this.syncAlert()?.nativeElement, alert);
    try {
      await this.progress.resync();
    } finally {
      this.retryNotice.set(null);
      refocusAfterRender(
        this.injector,
        () =>
          this.auth.signInRequired()
            ? this.sessionResume()?.nativeElement
            : this.progress.syncStatus() === 'offline' || this.progress.syncStatus() === 'pending'
              ? this.retryButton()?.nativeElement
              : this.syncStatus()?.nativeElement,
        alert,
      );
    }
  }
}
