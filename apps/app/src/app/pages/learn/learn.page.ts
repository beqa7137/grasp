import { ChangeDetectionStrategy, Component, ElementRef, Injector, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, PopoverController } from '@ionic/angular';
import {
  ALGORITHM_CATALOG,
  CODING_CATALOG,
  PATTERN_CATALOG,
  SCENARIO_CATALOG,
  calendarDaysBetween,
  dayKey,
  getScenarioSummary,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  calendarOutline,
  chatbubblesOutline,
  cloudDoneOutline,
  codeSlashOutline,
  compassOutline,
  ellipsisHorizontal,
  flame,
  flashOutline,
  gitNetworkOutline,
  pulseOutline,
  playCircleOutline,
  saveOutline,
  settingsOutline,
  sparkles,
  syncOutline,
  timeOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { refocusAfterRender } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import { PilotService } from '../../pilot/pilot.service';
import { DiagnosticPromptService } from '../diagnostic/diagnostic-prompt.service';
import { MasteryRingComponent } from '../../ui/mastery-ring.component';
import { LearnMenuComponent, type LearnMenuChoice } from './learn-menu.component';
import { CrossLinkDirective } from '../../ui/cross-link.directive';

@Component({
  selector: 'app-learn',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CrossLinkDirective, RouterLink, IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonIcon, MasteryRingComponent],
  templateUrl: './learn.page.html',
  styleUrl: './learn.page.scss',
})
export class LearnPage {
  private readonly injector = inject(Injector);
  private readonly syncAlert = viewChild<ElementRef<HTMLElement>>('syncAlert');
  private readonly retryButton = viewChild<ElementRef<HTMLButtonElement>>('retryButton');
  private readonly syncStatus = viewChild<ElementRef<HTMLElement>>('syncStatus');
  private readonly sessionResume = viewChild<ElementRef<HTMLAnchorElement>>('sessionResume');
  private readonly more = viewChild.required<ElementRef<HTMLButtonElement>>('more');
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly moved = viewChild<ElementRef<HTMLElement>>('moved');
  private readonly popovers = inject(PopoverController);
  private readonly router = inject(Router);
  private readonly pilot = inject(PilotService);
  readonly progress = inject(ProgressService);
  readonly auth = inject(AuthService);
  readonly diagnosticPrompt = inject(DiagnosticPromptService);
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
  readonly patternCount = PATTERN_CATALOG.length;
  readonly overall = computed(() => {
    const list = this.progress.mastery();
    return list.reduce((s, m) => s + m.mastery, 0) / Math.max(1, list.length);
  });
  readonly nextAlgorithm = computed(() => {
    const preds = this.progress.state().predictions;
    return [...ALGORITHM_CATALOG].sort((a, b) => (preds[a.patternId]?.total ?? 0) - (preds[b.patternId]?.total ?? 0))[0];
  });
  readonly nextProblem = computed(() => CODING_CATALOG.find((p) => !this.progress.state().coding[p.id]?.solvedAt) ?? CODING_CATALOG[0]);
  readonly nextScenario = computed(() => SCENARIO_CATALOG.find((s) => !this.progress.state().missions[s.id]) ?? SCENARIO_CATALOG[0]);
  readonly offerDiagnostic = computed(() => !this.progress.state().diagnosedAt && !this.diagnosticPrompt.dismissed());
  readonly revisit = computed(() => {
    const m = this.progress.dueMissions()[0];
    return m ? { ...m, title: getScenarioSummary(m.scenarioId)!.title } : null;
  });
  readonly interview = computed(() => {
    const plan = this.progress.state().plan;
    if (!plan) return null;
    const now = this.progress.now();
    const days = calendarDaysBetween(dayKey(now, now.getTimezoneOffset()), plan.interviewDate);
    return days < 0 ? 'Date passed' : days === 0 ? 'Interview today' : days === 1 ? 'Interview tomorrow' : `Interview in ${days} days`;
  });
  readonly greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  });

  constructor() {
    addIcons({
      alertCircleOutline,
      calendarOutline,
      settingsOutline,
      codeSlashOutline,
      flame,
      sparkles,
      flashOutline,
      playCircleOutline,
      gitNetworkOutline,
      chatbubblesOutline,
      cloudDoneOutline,
      compassOutline,
      ellipsisHorizontal,
      pulseOutline,
      saveOutline,
      syncOutline,
      timeOutline,
    });
    void this.offerMovedNote();
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
    this.progress.now.set(new Date());
  }

  async openMenu(event: MouseEvent): Promise<void> {
    // A double tap would otherwise stack a second menu that outlives the first one's choice.
    if (this.menuOpen()) return;
    this.menuOpen.set(true);
    const menu = await this.popovers.create({
      component: LearnMenuComponent,
      event,
      htmlAttributes: { role: 'dialog', 'aria-label': 'More options' },
    });
    await menu.present();
    menu.querySelector('button')?.focus();
    const { data } = await menu.onDidDismiss<LearnMenuChoice>();
    this.menuOpen.set(false);
    if (data === 'plan') {
      void this.router.navigateByUrl('/today/plan');
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
