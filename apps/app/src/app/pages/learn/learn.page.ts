import { ChangeDetectionStrategy, Component, ElementRef, Injector, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import {
  ALGORITHM_CATALOG,
  CODING_CATALOG,
  PATTERN_CATALOG,
  SCENARIO_CATALOG,
  SD_TOPICS,
  getScenarioSummary,
  type Track,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  chatbubblesOutline,
  cloudDoneOutline,
  codeSlashOutline,
  compassOutline,
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
import { DiagnosticPromptService } from '../diagnostic/diagnostic-prompt.service';
import { CodeTextComponent } from '../../viz/code-text.component';
import { MasteryRingComponent } from '../../viz/mastery-ring.component';

const TRACKS: { id: Track; title: string; blurb: string }[] = [
  { id: 'foundations', title: 'Foundations', blurb: 'The four patterns behind a third of all interview questions.' },
  { id: 'core', title: 'Core patterns', blurb: 'Stacks, sweeps and heaps: where O(n²) becomes O(n).' },
  { id: 'graphs', title: 'Graphs & trees', blurb: 'Traversal, ordering, connectivity, shortest paths.' },
  { id: 'advanced', title: 'Advanced', blurb: 'Dynamic programming, tries, greedy proofs, bits.' },
];

@Component({
  selector: 'app-learn',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonIcon, CodeTextComponent, MasteryRingComponent],
  templateUrl: './learn.page.html',
  styleUrl: './learn.page.scss',
})
export class LearnPage {
  private readonly injector = inject(Injector);
  private readonly syncAlert = viewChild<ElementRef<HTMLElement>>('syncAlert');
  private readonly retryButton = viewChild<ElementRef<HTMLButtonElement>>('retryButton');
  private readonly syncStatus = viewChild<ElementRef<HTMLElement>>('syncStatus');
  private readonly sessionResume = viewChild<ElementRef<HTMLAnchorElement>>('sessionResume');
  readonly progress = inject(ProgressService);
  readonly auth = inject(AuthService);
  readonly diagnosticPrompt = inject(DiagnosticPromptService);
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
  readonly tracks = TRACKS.map((t) => ({ ...t, patterns: PATTERN_CATALOG.filter((p) => p.track === t.id) }));

  readonly sdTopics = SD_TOPICS;
  readonly masteryById = computed(() => new Map(this.progress.mastery().map((m) => [m.topic, m])));
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
  readonly greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  });

  constructor() {
    addIcons({
      alertCircleOutline,
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
      pulseOutline,
      saveOutline,
      syncOutline,
      timeOutline,
    });
  }

  ionViewWillEnter() {
    this.progress.now.set(new Date());
  }

  mastery(topic: string) {
    return this.masteryById().get(topic)?.mastery ?? 0;
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
