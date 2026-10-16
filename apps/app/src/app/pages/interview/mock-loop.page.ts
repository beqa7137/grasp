import { formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  LOCALE_ID,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import {
  LOOP_ROUND_MINUTES,
  PLAN_ROUNDS,
  PLAN_ROUND_TRACK,
  SENIORITY_LEVELS,
  TRACK_NAMES,
  currentTarget,
  debriefLoop,
  getCompetencySummary,
  hasInterviewFlags,
  newSeed,
  pickLoop,
  seeded,
  type InterviewTrack,
  type LoopPick,
  type Seniority,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { checkmarkCircle, ellipseOutline, playCircleOutline, sparkles } from 'ionicons/icons';
import { AnnouncerService } from '../../core/announcer.service';
import { ApiError, ApiService } from '../../core/api.service';
import { refocusAfterRender } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import { RovingSelectDirective } from '../../core/roving-select.directive';
import { SignInOptionsComponent } from '../../core/sign-in-options.component';
import type { AiAccess, InterviewCatalog, InterviewMode, InterviewSession } from './interview.types';
import { LoopDebriefComponent } from './loop-debrief.component';
import { MockLoopService, loopCard } from './mock-loop.service';
import { needsSignIn } from './start-interview';
import { BackComponent } from '../../ui/back.component';
import { CrossLinkDirective } from '../../ui/cross-link.directive';

const REASONS: Record<string, string> = {
  'coding:flagged': 'On a pattern an interview flagged.',
  'behavioral:flagged': 'A competency an interview flagged.',
  'behavioral:new': 'A competency no interview has asked about yet.',
};
/** A round scored this recently is the one just finished, so the page suggests a break rather than welcoming back. */
const BREAK_WINDOW_MS = 30 * 60_000;
const ROUND_DETAIL: Record<InterviewTrack, string> = {
  coding: `about ${LOOP_ROUND_MINUTES.coding} min`,
  'system-design': `about ${LOOP_ROUND_MINUTES['system-design']} min`,
  behavioral: `about ${LOOP_ROUND_MINUTES.behavioral} min, one question with follow-ups`,
};

type Stage = 'loading' | 'setup' | 'running' | 'debrief';

@Component({
  selector: 'app-mock-loop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AnnouncerService],
  imports: [
    CrossLinkDirective,
    BackComponent,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    IonIcon,
    IonSpinner,
    RovingSelectDirective,
    SignInOptionsComponent,
    LoopDebriefComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><app-back href="/mock" /></ion-buttons>
        <ion-title>Mock loop</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <p class="visually-hidden" role="status">{{ announcer.message() }}</p>
        <p class="eyebrow">{{ eyebrow() }}</p>
        <h1 #heading tabindex="-1">{{ title() }}</h1>
        @if (error(); as e) {
          <p class="error" role="alert">{{ e }}</p>
          @if (stage() === 'loading') {
            <button type="button" class="g-btn" (click)="reload()">Try again</button>
          }
        }
        @if (missingNote(); as note) {
          <p class="muted">{{ note }}</p>
        }
        @switch (stage()) {
          @case ('loading') {
            @if (!error()) {
              <ion-spinner name="crescent" />
            }
          }
          @case ('setup') {
            <p class="lead">
              {{ setupTracks().length === 1 ? 'One round' : setupTracks().length + ' rounds' }} back to back, then one debrief across them:
              a practice read of the whole loop, not a hiring prediction. Real onsites often have more and longer rounds; this runs one of
              each.
              @if (flagged()) {
                Questions lean toward what your interviews have flagged.
              }
            </p>
            <ol class="plan">
              @for (t of setupTracks(); track t) {
                <li>
                  <strong>{{ names[t] }}</strong
                  ><span class="muted"> · {{ details[t] }}</span>
                </li>
              }
            </ol>
            @if (target().source !== 'assumed') {
              <p class="muted">These are the rounds in your loop. <a routerLink="/today" crossLink>Change your loop on Today</a>.</p>
            }
            <p class="muted">Take a short break between rounds if you like. You can stop after any round and pick up from here later.</p>
            @if (setupTracks().includes('behavioral')) {
              <p class="muted label" id="level-label">Behavioral round, scored at the bar for</p>
              <div class="mode-options" role="radiogroup" aria-labelledby="level-label">
                @for (l of levels; track l.level) {
                  <button
                    type="button"
                    class="g-btn"
                    role="radio"
                    [attr.aria-checked]="level() === l.level"
                    [class.primary]="level() === l.level"
                    (click)="level.set(l.level)"
                  >
                    {{ l.label }}
                  </button>
                }
              </div>
            }
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
                An AI loop is {{ setupTracks().length === 1 ? 'one AI interview' : setupTracks().length + ' AI interviews in a row' }}. It
                costs you nothing, but each round takes one of your AI rounds for the hour, the same ones single rounds use. If a round
                finds none left, switch the remaining rounds to scripted or start it after the hour turns. Your replies, shared code and
                answers, including any story you start from, are sent to the AI service. The debrief itself makes no AI call.
              </p>
              @if (aiRoundsShort(); as short) {
                <p class="note" role="status">
                  You have {{ short.left }} AI {{ short.left === 1 ? 'round' : 'rounds' }} left this hour and this loop has
                  {{ short.needed }}. The rest can switch to scripted when you reach them.
                </p>
              }
            } @else {
              <p class="muted note">
                Scripted follow-ups for each round, scored by rubric checks. No AI or sign-in needed. Replies and scorecards still count
                toward the hourly interview allowance.
              </p>
            }
            @if (aiAccess() === 'unavailable') {
              <p class="muted">AI is unavailable right now. Scripted practice is still available.</p>
            }
            @if (signInOpen()) {
              <section class="panel sign-in-panel" aria-labelledby="sign-in-title">
                <h2 id="sign-in-title">Sign in for AI interviews</h2>
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
            <p class="lead">{{ breakNote() }}</p>
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
            @if (signInAgain()) {
              <section class="panel sign-in-panel" aria-labelledby="sign-in-again-title">
                <h2 id="sign-in-again-title">Sign in again to keep your AI loop</h2>
                <app-sign-in-options
                  cancelLabel="Switch the remaining rounds to scripted practice"
                  (cancelled)="useScripted()"
                  (signedIn)="signedInAgain()"
                />
              </section>
            } @else if (aiRefused()) {
              <button type="button" class="g-btn" [disabled]="pending()" (click)="useScripted()">
                Switch the remaining rounds to scripted practice
              </button>
            }
            <div class="end">
              @if (confirmingEnd()) {
                <p id="end-note">End this loop? Rounds you finished keep their scorecards, but this loop gets no debrief.</p>
                <button #confirmEnd type="button" class="g-btn" aria-describedby="end-note" (click)="endLoop()">Yes, end it</button>
                <button type="button" class="g-btn ghost" (click)="keepGoing()">Keep going</button>
              } @else {
                <button #endButton type="button" class="g-btn ghost" [disabled]="pending()" (click)="askToEnd()">End this loop</button>
              }
            </div>
          }
          @case ('debrief') {
            <app-loop-debrief [debrief]="debrief()!" [sessions]="scoredSessions()" />
            <button type="button" class="g-btn primary again" (click)="newLoop()">Start a new loop</button>
          }
        }
        <p class="muted footnote">Want just one round? <a routerLink="/mock">Start a single round on the Mock page</a>.</p>
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
    .label {
      margin: 16px 0 0;
    }
    .mode-options {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
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
  private readonly locale = inject(LOCALE_ID);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly endButton = viewChild<ElementRef<HTMLElement>>('endButton');
  private readonly confirmEnd = viewChild<ElementRef<HTMLElement>>('confirmEnd');
  readonly announcer = inject(AnnouncerService);
  readonly names = TRACK_NAMES;
  readonly details = ROUND_DETAIL;
  readonly levels = SENIORITY_LEVELS;

  readonly loop = this.loops.loop;
  readonly catalog = signal<InterviewCatalog | null>(null);
  readonly sessions = signal<Record<string, InterviewSession>>({});
  /** Problems the learner has had in recent interviews, which the loop avoids repeating. */
  private readonly seen = signal<ReadonlySet<string>>(new Set());
  readonly loaded = signal(false);
  readonly choosing = signal(false);
  readonly mode = signal<InterviewMode>('offline');
  /** The Target's level until the learner picks another here, which stays this loop's and never writes the Target. */
  readonly level = linkedSignal<Seniority>(() => this.targetLevel());
  readonly starting = signal(false);
  readonly signInOpen = signal(false);
  readonly signInAgain = signal(false);
  readonly confirmingEnd = signal(false);
  readonly aiRefused = signal(false);
  readonly error = signal<string | null>(null);
  readonly missingNote = signal<string | null>(null);
  readonly pending = computed(() => this.starting() || this.signInOpen() || this.signInAgain());
  readonly aiAccess = computed<AiAccess | null>(() => this.catalog()?.aiAccess ?? null);
  /** This hour's AI rounds, when fewer are left than the loop has rounds. */
  readonly aiRoundsShort = computed(() => {
    const rounds = this.catalog()?.aiRounds;
    const needed = this.setupTracks().length;
    return rounds && rounds.limit - rounds.used < needed ? { left: Math.max(0, rounds.limit - rounds.used), needed } : null;
  });
  readonly flagged = computed(() => hasInterviewFlags(this.progress.state()));
  private loading: Promise<void> | null = null;

  readonly target = computed(() => currentTarget(this.progress.state()));
  /** A string, so a record that leaves the level as it was does not reset the one picked here. */
  private readonly targetLevel = computed(() => this.target().target.level);
  private readonly loopRounds = computed(() => PLAN_ROUNDS.filter((r) => this.target().target.rounds[r] > 0));
  readonly setupTracks = computed(() => this.loopRounds().map((r) => PLAN_ROUND_TRACK[r]));
  readonly rounds = computed(() =>
    (this.loop()?.rounds ?? []).map((r) => ({ ...r, session: r.sessionId ? this.sessions()[r.sessionId] : undefined })),
  );
  readonly next = computed(() => this.rounds().findIndex((r) => !r.session?.scorecard));
  readonly scoredSessions = computed(() => this.rounds().flatMap((r) => (r.session?.scorecard ? [r.session] : [])));
  readonly stage = computed<Stage>(() => {
    if (!this.loaded()) return 'loading';
    if (!this.loop()?.rounds.length || this.choosing()) return 'setup';
    return this.next() < 0 ? 'debrief' : 'running';
  });
  readonly debrief = computed(() => (this.stage() === 'debrief' ? debriefLoop(this.scoredSessions().map(loopCard)) : null));
  readonly title = computed(() => {
    switch (this.stage()) {
      case 'setup':
        return 'A mock interview loop';
      case 'running':
        return `Round ${this.next() + 1} of ${this.rounds().length}`;
      case 'debrief':
        return 'Loop debrief';
      default:
        return 'Mock loop';
    }
  });
  readonly eyebrow = computed(() => {
    const loop = this.loop();
    if (!loop) return 'Mock loop';
    const date = (at: string) => formatDate(at, 'MMM d, h:mm a', this.locale);
    if (this.stage() === 'running') {
      return `Mock loop · ${loop.mode === 'ai' ? 'AI interviewer' : 'Scripted practice'} · started ${date(loop.createdAt)}`;
    }
    return this.stage() === 'debrief' && loop.completedAt ? `Mock loop · finished ${date(loop.completedAt)}` : 'Mock loop';
  });
  readonly breakNote = computed(() => {
    const index = this.next();
    const previous = this.rounds()[index - 1]?.session?.scoredAt;
    if (previous && Date.now() - Date.parse(previous) < BREAK_WINDOW_MS) {
      return 'Round done. Take five minutes away from the screen if you can, as you would between rounds.';
    }
    const track = this.rounds()[index]?.track;
    return index > 0 && track ? `Welcome back. Your ${this.names[track].toLowerCase()} round is next.` : '';
  });

  constructor() {
    addIcons({ checkmarkCircle, ellipseOutline, playCircleOutline, sparkles });
  }

  ionViewWillEnter() {
    this.loading = this.reload();
    return this.loading;
  }

  async ionViewDidEnter() {
    await this.loading;
    this.focusHeading();
    const round = this.rounds()[this.next()];
    if (this.stage() === 'running' && round) {
      this.announcer.announce(`Round ${this.next() + 1} of ${this.rounds().length}: ${this.names[round.track]}`);
    }
  }

  async reload() {
    this.error.set(null);
    try {
      const [catalog, recent, snapshot] = await Promise.all([
        this.api.get<InterviewCatalog>('/interview/problems'),
        this.api.get<InterviewSession[]>('/interview/sessions').catch(() => []),
        this.loops.refresh(),
      ]);
      this.catalog.set(catalog);
      this.seen.set(new Set(recent.map((s) => s.problem.id)));
      this.sessions.set(snapshot.sessions);
      this.loaded.set(true);
      const gone = snapshot.missing.map((t) => `We couldn't find your ${this.names[t].toLowerCase()} round, so it starts again.`).join(' ');
      this.missingNote.set(gone || null);
      if (gone) this.announcer.announce(gone);
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'Could not load the mock loop. Check your connection and try again.');
    }
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

  async signedInAgain() {
    this.signInAgain.set(false);
    this.aiRefused.set(false);
    this.error.set(null);
    await this.reload();
    this.focusHeading();
  }

  async begin() {
    const catalog = this.catalog();
    if (!catalog || this.pending()) return;
    this.starting.set(true);
    this.error.set(null);
    try {
      const picks: LoopPick[] = pickLoop(catalog.problems, this.progress.state(), seeded(newSeed()), this.loopRounds(), this.seen());
      if (!picks.length) {
        this.error.set('No interview questions are available for these rounds right now. Please try again later.');
        return;
      }
      await this.loops.start(this.mode(), this.level(), picks);
      this.sessions.set({});
      this.missingNote.set(null);
      this.choosing.set(false);
      this.aiRefused.set(false);
      await this.openRound(0);
    } finally {
      this.starting.set(false);
    }
  }

  async startRound(index: number) {
    if (this.pending()) return;
    this.starting.set(true);
    try {
      await this.openRound(index);
    } finally {
      this.starting.set(false);
    }
  }

  private async openRound(index: number) {
    const loop = this.loop();
    const round = loop?.rounds[index];
    if (!loop || !round) return;
    if (round.sessionId) {
      await this.router.navigate(['/mock', round.sessionId]);
      return;
    }
    this.error.set(null);
    try {
      const session = await this.api.post<InterviewSession>('/interview/sessions', {
        track: round.track,
        problemId: round.problemId,
        mode: loop.mode,
        ...(round.track === 'behavioral' ? { level: loop.level } : {}),
      });
      this.sessions.update((all) => ({ ...all, [session.id]: session }));
      await this.loops.update((l) => ({ ...l, rounds: l.rounds.map((r, i) => (i === index ? { ...r, sessionId: session.id } : r)) }));
      await this.router.navigate(['/mock', session.id]);
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'Could not start the round. Please try again.');
      this.signInAgain.set(needsSignIn(e));
      this.aiRefused.set(e instanceof ApiError && (e.code === 'ai_unavailable' || e.code === 'ai_rounds_used'));
      this.focusHeading();
    }
  }

  async useScripted() {
    await this.loops.update((l) => ({ ...l, mode: 'offline' }));
    this.signInAgain.set(false);
    this.aiRefused.set(false);
    this.error.set(null);
    this.announcer.announce('The remaining rounds use scripted practice.');
    this.focusHeading();
  }

  askToEnd() {
    this.confirmingEnd.set(true);
    refocusAfterRender(this.injector, () => this.confirmEnd()?.nativeElement, document.body);
  }

  keepGoing() {
    this.confirmingEnd.set(false);
    refocusAfterRender(this.injector, () => this.endButton()?.nativeElement, document.body);
  }

  async endLoop() {
    this.confirmingEnd.set(false);
    await this.loops.discard();
    this.sessions.set({});
    this.missingNote.set(null);
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
    return index === this.next() ? `Up next, ${this.details[this.rounds()[index].track]}` : 'Later';
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
