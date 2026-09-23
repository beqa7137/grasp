import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { getPattern } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { codeSlashOutline, gitNetworkOutline, shuffle, sparkles } from 'ionicons/icons';
import { ApiError, ApiService } from '../../core/api.service';
import type { InterviewSession, InterviewTrack, ProblemSummary } from './interview.types';

@Component({
  selector: 'app-interview-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, IonSpinner],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar><ion-title>Interview</ion-title></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page">
        <p class="eyebrow">Mock interviews</p>
        <h1>Say it out loud.</h1>
        <p class="muted lead">
          An interviewer that asks clarifying questions, nudges instead of telling, pushes on trade-offs, and scores you against the rubric real hiring committees use.
        </p>
        @if (mode(); as m) {
          <span class="mode" [class.ai]="m === 'ai'"><ion-icon name="sparkles" />{{ m === 'ai' ? 'AI interviewer' : 'Offline interviewer (set ANTHROPIC_API_KEY for AI)' }}</span>
        }

        @if (error(); as e) {
          <div class="panel error">{{ e }}</div>
        }

        <div class="tracks">
          @for (t of tracks; track t.id) {
            <button class="panel track" [class.on]="track() === t.id" (click)="track.set(t.id)">
              <ion-icon [name]="t.icon" />
              <div>
                <h2>{{ t.title }}</h2>
                <p class="muted">{{ t.blurb }}</p>
              </div>
            </button>
          }
        </div>

        <div class="problems">
          @for (p of visible(); track p.id) {
            <button class="panel card-link problem" [disabled]="!!starting()" (click)="start(p.id)">
              <div>
                <h3>{{ p.title }}</h3>
                <div class="chips">
                  @for (id of p.patternIds; track id) {
                    <span class="chip">{{ patternName(id) }}</span>
                  }
                </div>
              </div>
              @if (starting() === p.id) {
                <ion-spinner name="crescent" />
              } @else {
                <span class="go">Start →</span>
              }
            </button>
          }
          <button class="g-btn surprise" [disabled]="!!starting() || !visible().length" (click)="start()"><ion-icon name="shuffle" />Surprise me</button>
        </div>

        @if (recent().length) {
          <h2 class="recent-title">Recent</h2>
          <div class="recent">
            @for (s of recent(); track s.id) {
              <a class="panel card-link session" [routerLink]="['/interview', s.id]">
                <span>{{ s.problem.title }}</span>
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
    h1 { font-size: clamp(26px, 5vw, 38px); margin: 6px 0 8px; }
    .lead { max-width: 62ch; line-height: 1.5; margin: 0 0 12px; }
    .mode { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--g-muted); padding: 5px 10px; border-radius: 999px; border: 1px solid var(--g-line); }
    .mode.ai { color: var(--g-predict); border-color: rgba(212, 245, 60, 0.4); }
    .error { padding: 12px 14px; margin-top: 14px; border-color: rgba(255, 93, 115, 0.5); color: #ffb3bd; }
    .tracks { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin: 20px 0 14px; }
    .track {
      appearance: none; text-align: left; display: flex; gap: 14px; padding: 16px; color: var(--g-text); cursor: pointer; font: inherit;
      ion-icon { font-size: 26px; color: var(--g-muted); flex: none; }
      h2 { margin: 0 0 4px; font-size: 17px; }
      p { margin: 0; font-size: 13.5px; line-height: 1.45; }
      &.on { border-color: var(--g-accent); background: linear-gradient(180deg, var(--g-accent-soft), transparent); ion-icon { color: var(--g-accent); } }
    }
    .problems { display: flex; flex-direction: column; gap: 8px; }
    .problem {
      appearance: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; color: var(--g-text); font: inherit; text-align: left;
      h3 { margin: 0 0 6px; font-size: 16px; }
      .chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .go { color: var(--g-accent); font-weight: 600; font-size: 13.5px; white-space: nowrap; }
    }
    .surprise { align-self: flex-start; margin-top: 4px; }
    .recent-title { font-size: 18px; margin: 30px 0 10px; }
    .recent { display: flex; flex-direction: column; gap: 6px; }
    .session { display: grid; grid-template-columns: 1fr auto auto; gap: 14px; align-items: center; padding: 12px 14px; font-size: 14px; }
    .verdict { font-weight: 600; text-transform: capitalize; font-size: 13px; color: var(--g-warn); }
    .verdict[data-verdict='hire'], .verdict[data-verdict='strong-hire'] { color: var(--g-found); }
    .verdict[data-verdict='no-hire'] { color: var(--g-danger); }
    @media (max-width: 560px) { .session { grid-template-columns: 1fr auto; .muted:nth-child(2) { display: none; } } }
  `,
})
export class InterviewHomePage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly tracks = [
    { id: 'coding' as const, title: 'Coding', blurb: 'Clarify, find the pattern, analyse, and handle edge cases — in 30 minutes.', icon: 'code-slash-outline' },
    { id: 'system-design' as const, title: 'System design', blurb: 'Requirements, estimates, architecture, deep dives and trade-offs.', icon: 'git-network-outline' },
  ];

  readonly track = signal<InterviewTrack>('coding');
  readonly problems = signal<ProblemSummary[]>([]);
  readonly recent = signal<InterviewSession[]>([]);
  readonly mode = signal<'ai' | 'offline' | null>(null);
  readonly error = signal<string | null>(null);
  readonly starting = signal<string | null>(null);
  readonly visible = computed(() => this.problems().filter((p) => p.track === this.track()));

  constructor() {
    addIcons({ codeSlashOutline, gitNetworkOutline, shuffle, sparkles });
  }

  async ionViewWillEnter() {
    try {
      const [catalog, recent] = await Promise.all([
        this.api.get<{ mode: 'ai' | 'offline'; problems: ProblemSummary[] }>('/interview/problems'),
        this.api.get<InterviewSession[]>('/interview/sessions'),
      ]);
      this.mode.set(catalog.mode);
      this.problems.set(catalog.problems);
      this.recent.set(recent);
      this.error.set(null);
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'Could not load interviews.');
    }
  }

  patternName(id: string) {
    return getPattern(id)?.name ?? id;
  }

  async start(problemId?: string) {
    this.starting.set(problemId ?? 'random');
    try {
      const session = await this.api.post<InterviewSession>('/interview/sessions', { track: this.track(), problemId });
      await this.router.navigate(['/interview', session.id]);
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'Could not start the interview.');
    } finally {
      this.starting.set(null);
    }
  }
}
