import { ChangeDetectionStrategy, Component, ElementRef, Injector, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import {
  LOOP_ROUND_MINUTES,
  PLAN_ROUNDS,
  PLAN_ROUND_TRACK,
  TRACK_NAMES,
  debriefLoop,
  getCompetencySummary,
  newSeed,
  pickLoop,
  seeded,
  type LoopPick,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { checkmarkCircle, ellipseOutline, playCircleOutline, sparkles } from 'ionicons/icons';
import { AnnouncerService } from '../../core/announcer.service';
import { ApiError, ApiService } from '../../core/api.service';
import { refocusAfterRender } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import { SignInOptionsComponent } from '../../core/sign-in-options.component';
import type { AiAccess, InterviewCatalog, InterviewMode, InterviewSession } from './interview.types';
import { LoopDebriefComponent } from './loop-debrief.component';
import { MockLoopService, type MockLoop } from './mock-loop.service';
import { needsSignIn } from './start-interview';

const REASONS: Record<string, string> = {
  'coding:flagged': 'On a pattern an interview flagged.',
  'behavioral:flagged': 'A competency an interview flagged.',
  'behavioral:new': 'A competency no interview has asked about yet.',
};

@Component({
  selector: 'app-mock-loop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AnnouncerService],
  imports: [
    DatePipe,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    IonSpinner,
    SignInOptionsComponent,
    LoopDebriefComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/interview" text="" /></ion-buttons>
        <ion-title>Mock loop</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <p class="visually-hidden" role="status">{{ announcer.message() }}</p>
        @switch (stage()) {
          @case ('loading') {
            <h1 #heading tabindex="-1">Mock loop</h1>
            @if (!error()) {
              <ion-spinner name="crescent" />
            }
          }
          @case ('setup') {
            <p class="eyebrow">Mock loop</p>
            <h1 #heading tabindex="-1">A full interview loop</h1>
            <p class="lead">
              {{ setupTracks().length === 1 ? 'One round' : setupTracks().length + ' rounds' }} back to back, then one debrief across them,
              read the way a hiring committee reads a loop. Questions lean toward what your interviews have flagged.
            </p>
            <ol class="plan">
              @for (t of setupTracks(); track t) {
                <li>
                  <strong>{{ names[t] }}</strong
                  ><span class="muted"> · about {{ minutes[t] }} min</span>
                </li>
              }
            </ol>
            @if (planRounds()) {
              <p class="muted">The rounds of your study plan.</p>
            }
            <p class="muted">Take a short break between rounds if you like. You can stop after any round and pick up from here later.</p>
            <div class="mode-options" role="group" aria-label="Interviewer">
              <button class="g-btn" [attr.aria-pressed]="mode() === 'offline'" [disabled]="pending()" (click)="chooseMode('offline')">
                Scripted practice
              </button>
              <button
                class="g-btn"
                [attr.aria-pressed]="mode() === 'ai'"
                [disabled]="pending() || !aiAccess() || aiAccess() === 'unavailable'"
                (click)="chooseMode('ai')"
              >
                <ion-icon name="sparkles" aria-hidden="true" />{{ aiAccess() === 'sign-in-required' ? 'Sign in for AI' : 'AI interviewer' }}
              </button>
            </div>
            @if (mode() === 'ai') {
              <p class="muted note">
                An AI loop is {{ setupTracks().length === 1 ? 'one AI interview' : setupTracks().length + ' AI interviews in a row' }}:
                every reply and each round's scorecard count toward your hourly AI interview limit, as separate interviews would. Your
                replies, shared code and answers, including any story you start from, are sent to the AI service. The debrief itself makes
                no AI call.
              </p>
            } @else {
              <p class="muted note">Guided prompts and a practice estimate for each round. No AI or sign-in needed.</p>
            }
            @if (aiAccess() === 'unavailable') {
              <p class="muted">AI interviews aren't available on this server. You can use scripted practice.</p>
            }
            @if (signInOpen()) {
              <section class="panel sign-in-panel" aria-label="Sign in for AI interviews">
                <h2>Sign in for AI interviews</h2>
                <p class="muted">Your study progress stays with you. After signing in, choose AI when you're ready.</p>
                <app-sign-in-options cancelLabel="Keep practicing without AI" (cancelled)="signInOpen.set(false)" (signedIn)="signedIn()" />
              </section>
            }
            <button type="button" class="g-btn primary start" [disabled]="pending()" (click)="begin()">
              @if (starting()) {
                <ion-spinner name="crescent" />
              }
              Start the loop
            </button>
          }
          @case ('running') {
            <p class="eyebrow">Mock loop · {{ loop()!.mode === 'ai' ? 'AI interviewer' : 'Scripted practice' }}</p>
            <h1 #heading tabindex="-1">Round {{ next() + 1 }} of {{ rounds().length }}</h1>
            @if (next() > 0) {
              <p class="lead">Round done. Take five minutes away from the screen if you can, as you would between rounds.</p>
            }
            <ol class="rounds">
              @for (r of rounds(); track r.track; let i = $index) {
                <li class="panel round" [class.current]="i === next()">
                  <ion-icon
                    [name]="r.session?.scorecard ? 'checkmark-circle' : i === next() ? 'play-circle-outline' : 'ellipse-outline'"
                    aria-hidden="true"
                  />
                  <span class="text">
                    <strong>{{ names[r.track] }}</strong>
                    @if (r.session; as s) {
                      <span>{{ s.problem.title }}</span>
                    }
                    <span class="muted">{{ status(r, i) }}</span>
                    @if (reason(r); as why) {
                      <span class="muted">{{ why }}</span>
                    }
                  </span>
                  @if (i === next()) {
                    <button type="button" class="g-btn primary" [disabled]="pending()" (click)="startRound(i)">
                      @if (starting()) {
                        <ion-spinner name="crescent" />
                      }
                      {{ r.sessionId ? 'Continue' : 'Start' }} the {{ names[r.track].toLowerCase() }} round
                    </button>
                  }
                </li>
              }
            </ol>
            @if (loop()!.mode === 'ai' && aiRefused()) {
              <button type="button" class="g-btn" [disabled]="pending()" (click)="useScripted()">
                Run the remaining rounds as scripted practice
              </button>
            }
            <div class="end">
              @if (confirmingEnd()) {
                <p id="end-note">End this loop? Rounds you finished keep their scorecards, but there is no debrief.</p>
                <button type="button" class="g-btn" aria-describedby="end-note" (click)="endLoop()">End the loop</button>
                <button type="button" class="g-btn ghost" (click)="confirmingEnd.set(false)">Keep going</button>
              } @else {
                <button type="button" class="g-btn ghost" [disabled]="pending()" (click)="confirmingEnd.set(true)">End this loop</button>
              }
            </div>
          }
          @case ('debrief') {
            <p class="eyebrow">Mock loop · finished {{ loop()!.completedAt | date: 'MMM d, h:mm a' }}</p>
            <h1 #heading tabindex="-1">Loop debrief</h1>
            <app-loop-debrief [debrief]="debrief()!" [sessions]="scoredSessions()" />
            <button type="button" class="g-btn primary again" (click)="newLoop()">Start a new loop</button>
          }
        }
        @if (error(); as e) {
          <p class="error" role="alert">{{ e }}</p>
          @if (stage() === 'loading') {
            <button type="button" class="g-btn" (click)="reload()">Try again</button>
          }
        }
        <p class="muted footnote"><a routerLink="/interview">Single interviews</a> are still on the interview page.</p>
      </div>
    </ion-content>
  `,
  styles: `
    h1 {
      font-size: clamp(1.5rem, 5vw, 2.125rem);
      margin: 6px 0 10px;
      outline: none;
    }
    .lead {
      line-height: 1.55;
      margin: 0 0 14px;
      max-width: 62ch;
    }
    .plan {
      margin: 0 0 12px;
      padding-left: 22px;
      line-height: 1.7;
    }
    p.muted {
      line-height: 1.5;
    }
    .mode-options {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    .mode-options [aria-pressed='true'] {
      border-color: var(--g-accent);
      background: var(--g-accent-soft);
    }
    .note {
      max-width: 62ch;
    }
    .sign-in-panel {
      padding: 16px;
      margin: 14px 0;
      h2 {
        margin: 0 0 8px;
        font-size: 1.125rem;
      }
    }
    .start,
    .again {
      margin-top: 16px;
    }
    .rounds {
      list-style: none;
      margin: 0 0 14px;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .round {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      ion-icon {
        flex: none;
        font-size: 22px;
        color: var(--g-muted);
      }
      &.current {
        border-color: var(--g-accent);
        ion-icon {
          color: var(--g-accent);
        }
      }
    }
    .text {
      display: grid;
      gap: 2px;
      flex: 1;
      min-width: 180px;
      line-height: 1.45;
      .muted {
        font-size: 0.875rem;
      }
    }
    .end {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      p {
        flex-basis: 100%;
        margin: 0;
        line-height: 1.5;
      }
    }
    .error {
      color: var(--g-danger-ink);
    }
    .footnote {
      margin-top: 24px;
      font-size: 0.875rem;
    }
  `,
})
export class MockLoopPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly progress = inject(ProgressService);
  private readonly loops = inject(MockLoopService);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  readonly announcer = inject(AnnouncerService);
  readonly names = TRACK_NAMES;
  readonly minutes = LOOP_ROUND_MINUTES;

  readonly loop = this.loops.loop;
  readonly catalog = signal<InterviewCatalog | null>(null);
  readonly sessions = signal<Record<string, InterviewSession>>({});
  readonly loaded = signal(false);
  readonly choosing = signal(false);
  readonly mode = signal<InterviewMode>('offline');
  readonly starting = signal(false);
  readonly signInOpen = signal(false);
  readonly confirmingEnd = signal(false);
  readonly aiRefused = signal(false);
  readonly error = signal<string | null>(null);
  readonly pending = computed(() => this.starting() || this.signInOpen());
  readonly aiAccess = computed<AiAccess | null>(() => this.catalog()?.aiAccess ?? null);

  readonly planRounds = computed(() => this.progress.state().plan?.rounds ?? null);
  readonly setupTracks = computed(() => (this.planRounds() ?? PLAN_ROUNDS).map((r) => PLAN_ROUND_TRACK[r]));
  readonly rounds = computed(() =>
    (this.loop()?.rounds ?? []).map((r) => ({ ...r, session: r.sessionId ? this.sessions()[r.sessionId] : undefined })),
  );
  readonly next = computed(() => this.rounds().findIndex((r) => !r.session?.scorecard));
  readonly scoredSessions = computed(() => this.rounds().flatMap((r) => (r.session?.scorecard ? [r.session] : [])));
  readonly stage = computed(() => {
    if (!this.loaded()) return 'loading';
    if (!this.loop() || this.choosing()) return 'setup';
    return this.next() < 0 ? 'debrief' : 'running';
  });
  readonly debrief = computed(() => {
    if (this.stage() !== 'debrief') return null;
    return debriefLoop(
      this.scoredSessions().map((s) => ({
        track: s.track,
        sessionId: s.id,
        problemId: s.problem.id,
        patternIds: s.problem.patternIds,
        competencyId: s.problem.competencyId,
        mode: s.scorecard!.mode,
        verdict: s.scorecard!.verdict,
        dimensions: s.scorecard!.dimensions,
        weakPatterns: s.scorecard!.weakPatterns,
      })),
    );
  });

  constructor() {
    addIcons({ checkmarkCircle, ellipseOutline, playCircleOutline, sparkles });
  }

  ionViewWillEnter() {
    return this.reload();
  }

  async reload() {
    this.error.set(null);
    try {
      const [catalog, loop] = await Promise.all([this.api.get<InterviewCatalog>('/interview/problems'), this.loops.load()]);
      this.catalog.set(catalog);
      if (loop) await this.loadSessions(loop);
      this.loaded.set(true);
      await this.recordCompletion();
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'Could not load the mock loop. Check your connection and try again.');
    }
  }

  /** A round whose session is gone (erased, or another learner's) starts again rather than blocking the loop. */
  private async loadSessions(loop: MockLoop) {
    const ids = loop.rounds.flatMap((r) => (r.sessionId ? [r.sessionId] : []));
    const found = await Promise.all(
      ids.map((id) =>
        this.api.get<InterviewSession>(`/interview/sessions/${id}`).catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        }),
      ),
    );
    this.sessions.set(Object.fromEntries(found.flatMap((s) => (s ? [[s.id, s]] : []))));
    if (found.includes(null)) {
      await this.loops.update((l) => ({
        ...l,
        rounds: l.rounds.map((r) => (r.sessionId && !this.sessions()[r.sessionId] ? { ...r, sessionId: null } : r)),
      }));
    }
  }

  private async recordCompletion() {
    const loop = this.loop();
    const debrief = this.debrief();
    if (!loop || !debrief || loop.completedAt) return;
    const at = new Date().toISOString();
    await this.loops.update((l) => ({ ...l, completedAt: at }));
    await this.progress.record({
      id: `mock-${loop.id}`,
      at,
      type: 'mock.completed',
      loopId: loop.id,
      verdict: debrief.verdict,
      rounds: this.scoredSessions().map((s) => ({ track: s.track, sessionId: s.id, verdict: s.scorecard!.verdict, at: s.scoredAt! })),
    });
    this.announcer.announce('Every round is scored. Your loop debrief is ready.');
  }

  chooseMode(mode: InterviewMode) {
    if (this.pending()) return;
    if (mode === 'ai' && this.aiAccess() === 'sign-in-required') {
      this.signInOpen.set(true);
      return;
    }
    if (mode === 'ai' && this.aiAccess() !== 'available') return;
    this.mode.set(mode);
  }

  async signedIn() {
    this.signInOpen.set(false);
    await this.reload();
    if (this.aiAccess() === 'available') this.mode.set('ai');
  }

  async begin() {
    const catalog = this.catalog();
    if (!catalog || this.pending()) return;
    const picks: LoopPick[] = pickLoop(catalog.problems, this.progress.state(), seeded(newSeed()), this.planRounds() ?? PLAN_ROUNDS);
    await this.loops.start(this.mode(), picks);
    this.sessions.set({});
    this.choosing.set(false);
    this.aiRefused.set(false);
    await this.startRound(0);
  }

  async startRound(index: number) {
    const loop = this.loop();
    const round = loop?.rounds[index];
    if (!loop || !round || this.pending()) return;
    if (round.sessionId) {
      await this.router.navigate(['/interview', round.sessionId]);
      return;
    }
    this.starting.set(true);
    this.error.set(null);
    try {
      const session = await this.api.post<InterviewSession>('/interview/sessions', {
        track: round.track,
        problemId: round.problemId,
        mode: loop.mode,
      });
      this.sessions.update((all) => ({ ...all, [session.id]: session }));
      await this.loops.update((l) => ({ ...l, rounds: l.rounds.map((r, i) => (i === index ? { ...r, sessionId: session.id } : r)) }));
      await this.router.navigate(['/interview', session.id]);
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'Could not start the round. Please try again.');
      this.aiRefused.set(needsSignIn(e) || (e instanceof ApiError && e.code === 'ai_unavailable'));
      this.focusHeading();
    } finally {
      this.starting.set(false);
    }
  }

  async useScripted() {
    await this.loops.update((l) => ({ ...l, mode: 'offline' }));
    this.aiRefused.set(false);
    this.error.set(null);
    this.announcer.announce('The remaining rounds use scripted practice.');
  }

  async endLoop() {
    this.confirmingEnd.set(false);
    await this.loops.discard();
    this.sessions.set({});
    this.announcer.announce('Loop ended.');
    this.focusHeading();
  }

  newLoop() {
    this.choosing.set(true);
    this.focusHeading();
  }

  status(round: { session?: InterviewSession; sessionId: string | null }, index: number) {
    const card = round.session?.scorecard;
    if (card) return `Scored: ${card.verdict.replace(/-/g, ' ')}`;
    if (round.sessionId) return 'In progress';
    return index === this.next() ? `Up next, about ${this.minutes[this.rounds()[index].track]} min` : 'Later';
  }

  reason(pick: LoopPick) {
    const why = REASONS[`${pick.track}:${pick.reason}`];
    if (!why || pick.track !== 'behavioral') return why ?? null;
    return `${getCompetencySummary(pick.problemId)?.name ?? ''}. ${why}`;
  }

  private focusHeading() {
    refocusAfterRender(this.injector, () => this.heading()?.nativeElement, document.body);
  }
}
