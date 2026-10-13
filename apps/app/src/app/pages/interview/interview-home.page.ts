import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { COMPETENCY_CATALOG, getPatternSummary } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { codeSlashOutline, gitNetworkOutline, layersOutline, peopleOutline, shuffle, sparkles } from 'ionicons/icons';
import { ApiError, ApiService } from '../../core/api.service';
import { SignInOptionsComponent } from '../../core/sign-in-options.component';
import { MockLoopService } from './mock-loop.service';
import type { AiAccess, InterviewCatalog, InterviewMode, InterviewSession, InterviewTrack, ProblemSummary } from './interview.types';
import { needsSignIn, startInterview } from './start-interview';
import { CrossLinkDirective, crossState } from '../../ui/cross-link.directive';

const AI_NOTE = 'AI follow-ups and AI feedback. Your replies and shared code are sent to the AI service.';
const AI_BEHAVIORAL_NOTE = 'AI follow-ups and AI feedback. Your answers, including any story you start from, are sent to the AI service.';

@Component({
  selector: 'app-interview-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CrossLinkDirective,
    RouterLink,
    DatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonSpinner,
    SignInOptionsComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar><ion-title>Mock</ion-title></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page">
        <p class="eyebrow">Mock interviews</p>
        <h1>Say it out loud.</h1>
        <p class="muted lead">
          Practice explaining your thinking, exploring trade-offs, and reviewing feedback. Start with scripted practice or choose an AI
          interview.
        </p>
        <div class="mode-options" role="group" aria-label="Interviewer">
          <button class="g-btn" [attr.aria-pressed]="mode() === 'offline'" [disabled]="pending()" (click)="chooseMode('offline')">
            Scripted practice
          </button>
          <button
            class="g-btn"
            [attr.aria-pressed]="mode() === 'ai'"
            [disabled]="pending() || accessCheckFailed() || !aiAccess() || aiAccess() === 'unavailable'"
            (click)="chooseMode('ai')"
          >
            <ion-icon name="sparkles" aria-hidden="true" />{{ aiAccess() === 'sign-in-required' ? 'Sign in for AI' : 'AI interview' }}
          </button>
        </div>
        <p class="muted mode-description">
          {{ mode() === 'ai' ? aiNote() : 'Guided prompts and a practice estimate. No AI or sign-in needed.' }}
        </p>
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
        @if (notice(); as message) {
          <p class="muted" role="status">{{ message }}</p>
        }

        @if (error(); as e) {
          <div class="panel error" role="alert">{{ e }}</div>
        }
        @if (accessCheckFailed()) {
          <button class="g-btn" [disabled]="pending()" (click)="checkAccess()">Retry access check</button>
        }

        <div class="tracks">
          @for (t of tracks; track t.id) {
            <button
              class="panel track"
              [class.on]="track() === t.id"
              [attr.aria-pressed]="track() === t.id"
              [disabled]="pending()"
              (click)="track.set(t.id)"
            >
              <ion-icon [name]="t.icon" aria-hidden="true" />
              <span>
                <span class="title">{{ t.title }}</span>
                <span class="muted blurb">{{ t.blurb }}</span>
              </span>
            </button>
          }
        </div>

        <div class="problems">
          @if (track() === 'behavioral') {
            @for (c of competencies; track c.id) {
              <button class="panel card-link problem" [disabled]="pending()" (click)="start(c.id)">
                <span>
                  <span class="title">{{ c.name }}</span>
                  <span class="muted one-liner">{{ c.oneLiner }}</span>
                </span>
                @if (starting() === c.id) {
                  <ion-spinner name="crescent" />
                } @else {
                  <span class="go">Start →</span>
                }
              </button>
            }
          }
          @for (p of visible(); track p.id) {
            <button class="panel card-link problem" [disabled]="pending()" (click)="start(p.id)">
              <span>
                <span class="title">{{ p.title }}</span>
                <span class="chips">
                  @for (id of p.patternIds; track id) {
                    <span class="chip">{{ patternName(id) }}</span>
                  }
                </span>
              </span>
              @if (starting() === p.id) {
                <ion-spinner name="crescent" />
              } @else {
                <span class="go">Start →</span>
              }
            </button>
          }
          <button class="g-btn surprise" [disabled]="pending() || (track() !== 'behavioral' && !visible().length)" (click)="start()">
            <ion-icon name="shuffle" aria-hidden="true" />Surprise me
          </button>
        </div>

        <a class="panel card-link behavioral" routerLink="/mock/loop">
          <ion-icon name="layers-outline" aria-hidden="true" />
          <span>
            <span class="title">Mock loop</span>
            <span class="muted blurb">{{ loopBlurb() }}</span>
          </span>
          <span class="go">{{ loopActive() ? 'Continue →' : 'Open →' }}</span>
        </a>

        <a class="panel card-link behavioral" routerLink="/behavioral" crossLink>
          <ion-icon name="people-outline" aria-hidden="true" />
          <span>
            <span class="title">Guides, story bank and rehearsal</span>
            <span class="muted blurb">{{ behavioralBlurb }}</span>
          </span>
          <span class="go">Open →</span>
        </a>

        @if (recent().length) {
          <h2 class="recent-title">Recent</h2>
          <div class="recent">
            @for (s of recent(); track s.id) {
              <a class="panel card-link session" [routerLink]="['/mock', s.id]">
                <span
                  >{{ s.problem.title
                  }}<small class="recent-mode">{{ s.mode === 'ai' ? 'AI interview' : 'Scripted practice' }}</small></span
                >
                <span class="muted">{{ s.createdAt | date: 'MMM d, h:mm a' }}</span>
                @if (s.scorecard) {
                  <span class="verdict" [attr.data-verdict]="s.scorecard.verdict">{{ s.scorecard.verdict.replace('-', ' ') }}</span>
                } @else {
                  <span class="muted">in progress</span>
                }
              </a>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    @use '../../../type' as *;

    @use '../../../breakpoints' as *;

    h1 {
      font-size: clamp(1.625rem, 5vw, 2.375rem);
      margin: 6px 0 8px;
    }
    .lead {
      max-width: 62ch;
      line-height: 1.5;
      margin: 0 0 12px;
    }
    .mode-options {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .mode-options [aria-pressed='true'] {
      border-color: var(--g-accent);
      background: var(--g-accent-soft);
    }
    .mode-description {
      line-height: 1.5;
      margin: 10px 0;
    }
    .sign-in-panel {
      padding: 16px;
      margin: 14px 0;
    }
    .sign-in-panel h2 {
      margin: 0 0 8px;
      font-size: 1.125rem;
    }
    .sign-in-panel p {
      line-height: 1.5;
      margin: 0 0 12px;
    }
    .recent-mode {
      display: block;
      color: var(--g-muted);
      margin-top: 4px;
    }
    .error {
      padding: 12px 14px;
      margin-top: 14px;
      border-color: rgba(var(--g-danger-rgb), 0.5);
      color: var(--g-danger-ink);
    }
    .behavioral {
      align-items: center;
      margin-top: 14px;
      text-decoration: none;
      > span:nth-of-type(1) {
        flex: 1;
      }
    }
    .tracks {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      margin: 20px 0 14px;
    }
    .title {
      @include title;
      display: block;
      line-height: 1.2;
    }
    .track,
    .behavioral {
      appearance: none;
      text-align: left;
      display: flex;
      gap: 14px;
      padding: 16px;
      color: var(--g-text);
      cursor: pointer;
      font: inherit;
      ion-icon {
        font-size: 26px;
        color: var(--g-muted);
        flex: none;
      }
      > span {
        min-width: 0;
      }
      .title {
        margin: 0 0 4px;
        font-size: 1.0625rem;
      }
      .blurb {
        display: block;
        font-size: 0.84375rem;
        line-height: 1.45;
      }
      &.on {
        border-color: var(--g-accent);
        background: linear-gradient(180deg, var(--g-accent-soft), transparent);
        ion-icon {
          color: var(--g-accent);
        }
      }
    }
    .problems {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .problem {
      appearance: none;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      color: var(--g-text);
      font: inherit;
      text-align: left;
      .title {
        margin: 0 0 6px;
        font-size: 1rem;
      }
      .one-liner {
        display: block;
        font-size: 0.875rem;
        line-height: 1.45;
      }
      .chips {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
    }
    .go {
      color: var(--g-accent);
      font-weight: 600;
      font-size: 0.84375rem;
      white-space: nowrap;
    }
    .surprise {
      align-self: flex-start;
      margin-top: 4px;
    }
    .recent-title {
      @include title;
      font-size: 1.125rem;
      margin: 30px 0 10px;
    }
    .recent {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .session {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 14px;
      align-items: center;
      padding: 12px 14px;
      font-size: 0.875rem;
    }
    .verdict {
      font-weight: 600;
      text-transform: capitalize;
      font-size: 0.8125rem;
      color: var(--g-warn);
    }
    .verdict[data-verdict='hire'],
    .verdict[data-verdict='strong-hire'] {
      color: var(--g-found);
    }
    .verdict[data-verdict='no-hire'] {
      color: var(--g-danger);
    }
    @include phone {
      .session {
        grid-template-columns: 1fr auto;
        .muted:nth-child(2) {
          display: none;
        }
      }
    }
  `,
})
export class InterviewHomePage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly loops = inject(MockLoopService);
  /** A loop with a round left to score; a finished one keeps its debrief, but there is nothing to continue. */
  readonly loopActive = computed(() => {
    const loop = this.loops.loop();
    return !!loop && !loop.completedAt;
  });
  readonly loopBlurb = computed(() => {
    const loop = this.loops.loop();
    if (!loop || loop.completedAt) return 'Coding, system design and behavioral rounds back to back, then one debrief across them.';
    const started = loop.rounds.flatMap((r) => (r.sessionId ? [r.sessionId] : []));
    if (!started.length) return 'Not started yet.';
    const known = new Map(this.recent().map((s) => [s.id, s]));
    if (started.some((id) => !known.has(id))) return 'You have a mock loop in progress. Pick up where you left off.';
    const scored = started.filter((id) => known.get(id)!.scorecard).length;
    const total = loop.rounds.length;
    return `${scored} of ${total} round${total === 1 ? '' : 's'} done. Pick up where you left off.`;
  });

  readonly behavioralBlurb = `Worked answers for ${COMPETENCY_CATALOG.length} competencies, your story bank, rehearsal and the three-question mock.`;
  readonly tracks = [
    {
      id: 'coding' as const,
      title: 'Coding',
      blurb: 'Clarify, find the pattern, analyse, and handle edge cases, all in 30 minutes.',
      icon: 'code-slash-outline',
    },
    {
      id: 'system-design' as const,
      title: 'System design',
      blurb: 'Requirements, estimates, architecture, deep dives and trade-offs.',
      icon: 'git-network-outline',
    },
    {
      id: 'behavioral' as const,
      title: 'Behavioral',
      blurb: 'One question, your STAR answer, then the follow-ups a bar raiser asks.',
      icon: 'people-outline',
    },
  ];
  readonly competencies = COMPETENCY_CATALOG;

  readonly track = signal<InterviewTrack>('coding');
  readonly problems = signal<ProblemSummary[]>([]);
  readonly recent = signal<InterviewSession[]>([]);
  readonly mode = signal<InterviewMode>('offline');
  readonly aiAccess = signal<AiAccess | null>(null);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly starting = signal<string | null>(null);
  readonly signInOpen = signal(false);
  readonly checkingAccess = signal(false);
  readonly accessCheckFailed = signal(false);
  readonly pending = computed(() => !!this.starting() || this.signInOpen() || this.checkingAccess());
  readonly visible = computed(() => (this.track() === 'behavioral' ? [] : this.problems().filter((p) => p.track === this.track())));
  readonly aiNote = computed(() => (this.track() === 'behavioral' ? AI_BEHAVIORAL_NOTE : AI_NOTE));

  constructor() {
    addIcons({ codeSlashOutline, gitNetworkOutline, layersOutline, peopleOutline, shuffle, sparkles });
  }

  async ionViewWillEnter() {
    await Promise.all([this.loops.load().catch(() => null), this.loadInterviews()]);
  }

  patternName(id: string) {
    return getPatternSummary(id)?.name ?? id;
  }

  chooseMode(mode: InterviewMode) {
    if (this.pending()) return;
    this.notice.set(null);
    if (mode === 'ai' && this.accessCheckFailed()) return;
    if (mode === 'ai' && this.aiAccess() !== 'available') {
      if (this.aiAccess() === 'sign-in-required') this.signInOpen.set(true);
      return;
    }
    this.mode.set(mode);
  }

  signedIn() {
    this.signInOpen.set(false);
    return this.checkAccess();
  }

  checkAccess() {
    return this.loadInterviews('Interview access refreshed. Choose AI when you’re ready, or keep practicing with scripted prompts.');
  }

  private async loadInterviews(successNotice: string | null = null) {
    if (this.checkingAccess()) return;
    this.checkingAccess.set(true);
    this.notice.set(null);
    try {
      const [catalog, recent] = await Promise.all([
        this.api.get<InterviewCatalog>('/interview/problems'),
        this.api.get<InterviewSession[]>('/interview/sessions'),
      ]);
      this.aiAccess.set(catalog.aiAccess);
      this.problems.set(catalog.problems);
      this.recent.set(recent);
      this.accessCheckFailed.set(false);
      this.error.set(null);
      this.notice.set(successNotice);
    } catch (error) {
      this.accessCheckFailed.set(true);
      this.handleError(error, 'Could not load interviews. Please try again.');
    } finally {
      this.checkingAccess.set(false);
    }
  }

  async start(problemId?: string) {
    if (this.pending()) return;
    if (this.mode() === 'ai' && (this.accessCheckFailed() || this.aiAccess() !== 'available')) {
      this.chooseMode('ai');
      return;
    }
    if (this.track() === 'behavioral' && this.mode() === 'offline') {
      await this.router.navigate(['/behavioral/drill'], {
        queryParams: problemId ? { question: problemId } : {},
        state: crossState(this.router, '/behavioral/drill'),
      });
      return;
    }
    this.starting.set(problemId ?? 'random');
    try {
      await startInterview(this.api, this.router, { track: this.track(), problemId, mode: this.mode() });
    } catch (e) {
      this.handleError(e, 'Could not start the interview.');
    } finally {
      this.starting.set(null);
    }
  }

  private handleError(error: unknown, fallback: string) {
    this.error.set(error instanceof ApiError ? error.message : fallback);
    if (needsSignIn(error)) {
      this.accessCheckFailed.set(false);
      this.aiAccess.set('sign-in-required');
      this.signInOpen.set(true);
    }
  }
}
