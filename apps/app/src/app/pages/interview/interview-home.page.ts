import {
  ChangeDetectionStrategy,
  Component,
  type ComponentRef,
  DestroyRef,
  Injector,
  LOCALE_ID,
  ViewContainerRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet, formatDate } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import {
  LOOP_ROUND_MINUTES,
  PLAN_ROUND_TRACK,
  SENIORITY_LEVELS,
  PLAN_ROUNDS,
  TRACK_NAMES,
  currentTarget,
  getMockProblem,
  type ProgressState,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { codeSlashOutline, gitNetworkOutline, layersOutline, peopleOutline } from 'ionicons/icons';
import { ApiError, ApiService } from '../../core/api.service';
import { LearnerService } from '../../core/learner.service';
import { ProgressService } from '../../core/progress.service';
import { SearchButtonComponent } from '../../search/search-button.component';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { EmptyStateComponent } from '../../ui/empty-state.component';
import { alertIcon } from '../../ui/icons';
import { PageHeaderComponent } from '../../ui/page-header.component';
import type { InterviewCatalog, InterviewSession, InterviewTrack } from './interview.types';
import {
  historyByRound,
  historyEntry,
  keepScorecards,
  lastScorecards,
  loadKeptScorecards,
  verdictName,
  type HistoryEntry,
} from './mock-history';
import { MockLoopService } from './mock-loop.service';
import type { RoundScores } from './mock-readiness';
import type { MockStartSheetComponent } from './mock-start-sheet.component';

const ROUND_ICONS: Record<InterviewTrack, string> = {
  coding: 'code-slash-outline',
  'system-design': 'git-network-outline',
  behavioral: 'people-outline',
};
const ROUND_HUBS: Record<InterviewTrack, string> = { coding: '/coding', 'system-design': '/design', behavioral: '/behavioral' };

/**
 * The Mock hub (REDESIGN.md 2.8, 4.8): the full loop first, then one card per round in the Target with its readiness and
 * last verdict, each opening the start sheet, then History by round. Without a connection it says so and shows the
 * scorecards this device kept.
 */
@Component({
  selector: 'app-interview-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CrossLinkDirective,
    DatePipe,
    EmptyStateComponent,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonTitle,
    IonToolbar,
    NgTemplateOutlet,
    PageHeaderComponent,
    RouterLink,
    SearchButtonComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-title>Mock interviews</ion-title>
        <ion-buttons slot="end"><app-search-button /></ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <g-page-header heading="Mock interviews">
          <p meta class="summary">
            <span>{{ loopName() }}</span> · <span>{{ scoredLine() }}</span>
          </p>
        </g-page-header>

        @if (offline()) {
          <g-empty-state class="offline" heading="Mock rounds need a connection" [icon]="alertIcon" tone="warn">
            {{
              kept().length ? 'Your last ' + kept().length + ' scorecards are below.' : 'Scorecards you get here will show below next time.'
            }}
            <button action type="button" class="g-btn" [disabled]="loading()" (click)="load()">Try again</button>
          </g-empty-state>
        }
        @if (partFailed()) {
          <p class="part-failed" role="alert">
            Couldn't load all of this page.
            <button type="button" class="g-btn" (click)="reload()">Reload</button>
          </p>
        }
        @if (!offline() && error(); as e) {
          <div class="panel error" role="alert">
            <p>{{ e }}</p>
            <button type="button" class="g-btn" [disabled]="loading()" (click)="load()">Try again</button>
          </div>
        }

        <a class="panel card-link loop" routerLink="/mock/loop">
          <ion-icon name="layers-outline" aria-hidden="true" />
          <span class="body">
            <h2>Full loop</h2>
            <span class="line">One round of each: {{ loopRounds() }}</span>
            <span class="line muted">{{ loopBlurb() }}</span>
          </span>
          <span class="go">{{ loopActive() ? 'Continue →' : 'Open →' }}</span>
        </a>

        <h2 class="section">Single rounds</h2>
        <ul class="rounds">
          @for (r of rounds(); track r.track) {
            <li class="panel round">
              <div class="round-head">
                <ion-icon [name]="r.icon" aria-hidden="true" />
                <h3 [id]="'mock-round-' + r.track">{{ r.name }} round</h3>
                <span class="muted minutes">{{ r.minutes }} min</span>
              </div>
              <p class="facts">
                <span>{{ r.readiness }}</span>
                <span class="muted">{{ r.last }}</span>
              </p>
              <div class="actions">
                <button
                  type="button"
                  class="g-btn primary"
                  [attr.aria-describedby]="'mock-round-' + r.track"
                  [attr.aria-busy]="opening() === r.track"
                  (click)="openSheet(r.track)"
                >
                  @if (opening() === r.track) {
                    <ion-spinner name="crescent" aria-hidden="true" />
                  }
                  Start a round
                </button>
                <a class="prepare" [routerLink]="r.hub" crossLink>Prepare in {{ r.name }} →</a>
              </div>
            </li>
          }
        </ul>

        @if (history().length) {
          <h2 class="section">History</h2>
          @for (g of history(); track g.track) {
            <h3 class="group">{{ g.name }}</h3>
            <ul class="history">
              @for (e of g.entries; track e.id) {
                <li>
                  @if (offline()) {
                    <div class="entry"><ng-container *ngTemplateOutlet="row; context: { $implicit: e }" /></div>
                  } @else {
                    <a class="entry" [routerLink]="['/mock', e.id]"><ng-container *ngTemplateOutlet="row; context: { $implicit: e }" /></a>
                  }
                </li>
              }
            </ul>
          }
        }
        <ng-template #row let-e>
          <span class="title"
            >{{ e.title
            }}<small class="muted">{{ e.mode === 'ai' ? 'AI interviewer' : 'Scripted' }} · {{ e.at | date: 'MMM d' }}</small></span
          >
          @if (e.verdict) {
            <span class="verdict" [attr.data-verdict]="e.verdict">{{ verdict(e.verdict) }}</span>
          } @else {
            <span class="muted">In progress</span>
          }
        </ng-template>
      </div>
      <ng-container #sheetHost />
    </ion-content>
  `,
  styles: `
    @use '../../../type' as *;
    @use '../../../breakpoints' as *;

    .summary {
      margin: 0;
      color: var(--g-muted);
      font-size: var(--g-text-body-s);
      span {
        white-space: nowrap;
      }
    }
    .offline {
      margin: 0 0 var(--g-space-5);
    }
    .part-failed {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--g-space-3);
      margin: 0 0 var(--g-space-4);
      color: var(--g-muted);
    }
    .error {
      padding: var(--g-space-3);
      margin: 0 0 var(--g-space-4);
      border-color: rgba(var(--g-danger-rgb), 0.5);
      color: var(--g-danger-ink);
      p {
        margin: 0 0 var(--g-space-2);
      }
    }
    .loop {
      display: flex;
      align-items: center;
      gap: var(--g-space-3);
      padding: var(--g-space-4);
      color: var(--g-text);
      text-decoration: none;
      ion-icon {
        flex: none;
        width: 26px;
        height: 26px;
        color: var(--g-accent);
      }
      .body {
        flex: 1;
        min-width: 0;
      }
      h2 {
        margin: 0 0 var(--g-space-1);
        font-size: var(--g-text-title-l);
      }
      .line {
        display: block;
        font-size: var(--g-text-body-s);
        line-height: 1.5;
      }
    }
    @include phone {
      .loop ion-icon {
        display: none;
      }
    }
    .go,
    .prepare {
      font-weight: 600;
      font-size: var(--g-text-body-s);
    }
    .go {
      color: var(--g-accent);
      white-space: nowrap;
    }
    .section {
      margin: var(--g-space-6) 0 var(--g-space-3);
      font-size: var(--g-text-title-l);
    }
    .rounds,
    .history {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: var(--g-space-2);
    }
    .round {
      padding: var(--g-space-4);
    }
    .round-head {
      display: flex;
      align-items: center;
      gap: var(--g-space-2);
      ion-icon {
        flex: none;
        width: 22px;
        height: 22px;
        color: var(--g-muted);
      }
      h3 {
        margin: 0;
        font-size: var(--g-text-title-m);
      }
    }
    .minutes {
      margin-left: auto;
      font-size: var(--g-text-body-s);
    }
    .facts {
      display: grid;
      margin: var(--g-space-2) 0 var(--g-space-3);
      font-size: var(--g-text-body-s);
      line-height: 1.5;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--g-space-2) var(--g-space-4);
    }
    .prepare {
      display: inline-block;
      padding-block: var(--g-space-2);
    }
    .group {
      @include title;
      margin: var(--g-space-4) 0 var(--g-space-2);
      font-size: var(--g-text-title-s);
    }
    .entry {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--g-space-3);
      min-height: 44px;
      padding: var(--g-space-2) var(--g-space-3);
      border: 1px solid var(--g-line);
      border-radius: var(--g-radius-md);
      background: var(--g-surface);
      color: var(--g-text);
      text-decoration: none;
      font-size: var(--g-text-body-s);
    }
    .title {
      min-width: 0;
      small {
        display: block;
        margin-top: var(--g-space-1);
        font-size: var(--g-text-body-s);
      }
    }
    .verdict {
      flex: none;
      font-weight: 600;
      color: var(--g-warn-ink);
    }
    .verdict[data-verdict='hire'],
    .verdict[data-verdict='strong-hire'] {
      color: var(--g-success-ink);
    }
    .verdict[data-verdict='no-hire'] {
      color: var(--g-danger-ink);
    }
  `,
})
export class InterviewHomePage {
  private readonly api = inject(ApiService);
  private readonly learner = inject(LearnerService);
  private readonly progress = inject(ProgressService);
  private readonly injector = inject(Injector);
  private readonly loops = inject(MockLoopService);
  private readonly locale = inject(LOCALE_ID);
  readonly alertIcon = alertIcon;

  readonly catalog = signal<InterviewCatalog | null>(null);
  readonly sessions = signal<InterviewSession[]>([]);
  readonly kept = signal<HistoryEntry[]>([]);
  readonly offline = signal(false);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  readonly sheetOpen = signal(false);
  readonly sheetTrack = signal<InterviewTrack>('coding');
  private readonly sheetPick = signal<string | null>(null);
  private readonly sheetHost = viewChild.required('sheetHost', { read: ViewContainerRef });
  private readonly sheet = signal<ComponentRef<MockStartSheetComponent> | null>(null);
  private sheetLoad: Promise<void> | null = null;
  private destroyed = false;
  /** The round whose sheet was asked for before the sheet's code arrived. */
  readonly opening = signal<InterviewTrack | null>(null);
  private readonly sheetFailed = signal(false);
  private readonly readinessFailed = signal(false);
  /** A lazy part failed (offline, or a deploy replaced its chunk); the browser keeps a failed import, so only a reload helps. */
  readonly partFailed = computed(() => this.sheetFailed() || this.readinessFailed());
  private reloadAgain = false;

  private readonly target = computed(() => currentTarget(this.progress.state()));
  private readonly scoresOf = signal<((state: ProgressState, now: Date) => RoundScores) | null>(null);
  private readonly scores = computed(() => this.scoresOf()?.(this.progress.state(), this.progress.now()) ?? null);
  readonly level = computed(() => this.target().target.level);
  readonly levelLabel = computed(() => SENIORITY_LEVELS.find((l) => l.level === this.level())!.label);
  readonly loopName = computed(() => `${this.levelLabel()} loop${this.target().source === 'set' ? '' : ' (assumed)'}`);
  readonly rounds = computed(() => {
    const byTrack = this.progress.state().interviews.byTrack;
    const { rounds } = this.target().target;
    const scores = this.scores();
    return PLAN_ROUNDS.filter((round) => rounds[round] > 0).map((round) => {
      const track = PLAN_ROUND_TRACK[round];
      const last = byTrack[track];
      const score = scores?.[round];
      return {
        track,
        name: TRACK_NAMES[track],
        icon: ROUND_ICONS[track],
        hub: ROUND_HUBS[track],
        minutes: LOOP_ROUND_MINUTES[track],
        readiness: score ? `Readiness ${score.score} · ${score.band}` : this.readinessFailed() ? 'Readiness unavailable' : 'Readiness …',
        last: last ? `Last round: ${verdictName(last.verdict)}, ${formatDate(last.at, 'MMM d', this.locale)}` : 'No rounds yet',
      };
    });
  });
  readonly loopRounds = computed(
    () =>
      `${this.rounds()
        .map((r) => `${r.name} ${r.minutes}`)
        .join(' · ')} min`,
  );
  readonly history = computed(() => historyByRound(this.offline() ? this.kept() : this.sessions().map(historyEntry)));
  readonly scoredLine = computed(() => {
    const total = this.progress.state().interviews.total;
    return total ? `${total} ${total === 1 ? 'round' : 'rounds'} scored` : 'No rounds scored yet';
  });

  /** A loop with a round left to score; a finished one keeps its debrief, but there is nothing to continue. */
  readonly loopActive = computed(() => {
    const loop = this.loops.loop();
    return !!loop && !loop.completedAt;
  });
  readonly loopBlurb = computed(() => {
    const loop = this.loops.loop();
    if (!loop || loop.completedAt) return `Back to back at the ${this.levelLabel()} bar, then one debrief across them.`;
    const started = loop.rounds.flatMap((r) => (r.sessionId ? [r.sessionId] : []));
    if (!started.length) return 'Not started yet.';
    const known = new Map(this.sessions().map((s) => [s.id, s]));
    if (started.some((id) => !known.has(id))) return 'You have a mock loop in progress. Pick up where you left off.';
    const scored = started.filter((id) => known.get(id)!.scorecard).length;
    const total = loop.rounds.length;
    return `${scored} of ${total} round${total === 1 ? '' : 's'} done. Pick up where you left off.`;
  });

  constructor() {
    addIcons({ codeSlashOutline, gitNetworkOutline, layersOutline, peopleOutline });
    afterNextRender(
      () => {
        void this.loadReadiness();
        void this.loadSheet();
      },
      { injector: this.injector },
    );
    effect(() => {
      const sheet = this.sheet();
      if (!sheet) return;
      sheet.setInput('track', this.sheetTrack());
      sheet.setInput('pick', this.sheetPick());
      sheet.setInput('level', this.level());
      sheet.setInput('levelLabel', this.levelLabel());
      sheet.setInput('catalog', this.catalog());
      sheet.setInput('offline', this.offline());
      sheet.setInput('open', this.sheetOpen());
    });
    const route = inject(ActivatedRoute);
    const router = inject(Router);
    // A search result opens one round's sheet (REDESIGN.md 2.9); the parameter goes once read, so back and reload do not reopen it.
    const rounds = route.queryParamMap.subscribe((params) => {
      if (!params.has('round')) return;
      const round = getMockProblem(params.get('round')!);
      void router.navigate([], { relativeTo: route, queryParams: { round: null }, queryParamsHandling: 'merge', replaceUrl: true });
      if (round) this.openSheet(round.track, round.id);
    });
    inject(DestroyRef).onDestroy(() => {
      rounds.unsubscribe();
      this.destroyed = true;
      this.sheet()?.destroy();
    });
  }

  /** Reloads the page; replaced in specs. */
  reload = () => location.reload();

  /** The sheet and its lists load after the hub shows, so the Mock tap waits only for the hub. */
  loadSheet() {
    this.sheetLoad ??= this.importSheet().then(
      ({ MockStartSheetComponent }) => {
        this.sheetFailed.set(false);
        if (this.destroyed || this.sheet()) return;
        const sheet = this.sheetHost().createComponent(MockStartSheetComponent);
        sheet.instance.open.subscribe((open) => this.sheetOpen.set(open));
        sheet.instance.signedIn.subscribe(() => void this.load());
        sheet.instance.changed.subscribe(() => void this.load());
        this.sheet.set(sheet);
      },
      () => {
        this.sheetLoad = null;
        this.sheetOpen.set(false);
        this.sheetFailed.set(true);
      },
    );
    return this.sheetLoad.finally(() => this.opening.set(null));
  }

  async loadReadiness() {
    try {
      const { readinessReader } = await this.importReadiness();
      this.readinessFailed.set(false);
      if (!this.destroyed) this.scoresOf.set(readinessReader(this.injector));
    } catch {
      this.readinessFailed.set(true);
    }
  }

  /** The lazy parts' imports; replaced in specs. */
  importSheet = () => import('./mock-start-sheet.component');
  importReadiness = () => import('./mock-readiness');

  async ionViewWillEnter() {
    await Promise.all([this.loops.load().catch(() => null), this.load()]);
  }

  verdict(v: string) {
    return verdictName(v);
  }

  openSheet(track: InterviewTrack, pick: string | null = null) {
    this.sheetTrack.set(track);
    this.sheetPick.set(pick);
    this.sheetOpen.set(true);
    if (!this.sheet()) this.opening.set(track);
    void this.loadSheet();
  }

  /** A reload asked for while one runs (a sign-in, a refused start) runs once it ends, so it reads the new access. */
  async load(): Promise<void> {
    if (this.loading()) {
      this.reloadAgain = true;
      return;
    }
    this.loading.set(true);
    try {
      await this.read();
    } finally {
      this.loading.set(false);
    }
    if (this.reloadAgain) {
      this.reloadAgain = false;
      return this.load();
    }
  }

  private async read() {
    const learnerId = this.learner.id();
    // A read that outlives its learner (signed out, or erased) must not write the next learner's view or device cache.
    const stale = () => this.destroyed || this.learner.id() !== learnerId;
    try {
      const [catalog, sessions] = await Promise.all([
        this.api.get<InterviewCatalog>('/interview/problems'),
        this.api.get<InterviewSession[]>('/interview/sessions'),
      ]);
      if (stale()) return;
      this.catalog.set(catalog);
      this.sessions.set(sessions);
      this.offline.set(false);
      this.error.set(null);
      await keepScorecards(learnerId, lastScorecards(sessions));
    } catch (e) {
      if (stale()) return;
      const unreachable = e instanceof ApiError && e.status === 0;
      this.offline.set(unreachable);
      if (!unreachable) {
        this.error.set(e instanceof ApiError ? e.message : 'Could not load your mock rounds. Please try again.');
        return;
      }
      const kept = await loadKeptScorecards(learnerId);
      if (!stale()) this.kept.set(kept);
    }
  }
}
