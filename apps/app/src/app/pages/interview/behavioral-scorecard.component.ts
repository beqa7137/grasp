import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  ANSWER_FLAWS,
  anotherQuestion,
  dueStories,
  getCompetencySummary,
  isRehearsable,
  type AnswerFlaw,
  type StarDraft,
} from '@grasp/engine';
import { ApiError, ApiService } from '../../core/api.service';
import { ProgressService } from '../../core/progress.service';
import { SignInOptionsComponent } from '../../core/sign-in-options.component';
import { StoryBankService } from '../behavioral/story-bank.service';
import type { InterviewSession } from './interview.types';
import { needsSignIn, startInterview } from './start-interview';

const sameDraft = (a: StarDraft, b: StarDraft) =>
  (Object.keys(a) as (keyof StarDraft)[]).every((part) => a[part].trim() === b[part].trim());

/** What a behavioral scorecard adds: the flaws with their fixes, rehearsal for flagged competencies, and what to do next. */
@Component({
  selector: 'app-behavioral-scorecard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SignInOptionsComponent],
  template: `
    @if (session().scorecard?.flaws; as flaws) {
      @if (flaws.length) {
        <h3>What to fix</h3>
        <ul class="flaws">
          @for (f of flaws; track f.id) {
            <li>
              <p class="flaw">{{ label(f.id) }}</p>
              @if (f.quote) {
                <blockquote>{{ f.quote }}</blockquote>
              }
              <p class="fix"><b>Say it like this:</b> {{ f.fix }}</p>
            </li>
          }
        </ul>
      }
    }
    @if (flagged().length) {
      <h3>Practice next</h3>
      @for (f of flagged(); track f.id) {
        <p class="flagged">
          @if (!f.covering) {
            No story covers {{ f.name }} yet: <a routerLink="/behavioral/stories">write one</a>
          } @else if (!f.due) {
            {{ f.name }} is flagged: nothing to rehearse right now.
          } @else {
            {{ f.name }} is flagged:
            <a routerLink="/behavioral/rehearse"
              >{{ f.due }} {{ f.due === 1 ? 'story that covers it is' : 'stories that cover it are' }} due for rehearsal now</a
            >
          }
        </p>
      }
    }
    <div class="actions">
      @if (keepable()) {
        <button type="button" class="g-btn" [disabled]="kept()" (click)="keep()">
          {{ kept() ? 'In your story bank' : 'Add to story bank' }}
        </button>
      }
      <button type="button" class="g-btn" [disabled]="starting()" (click)="another()">Try another question</button>
      <a class="g-btn" [routerLink]="['/behavioral/question', session().problem.id]">Practice this question</a>
    </div>
    @if (signInOpen()) {
      <h3>Sign in for AI interviews</h3>
      <app-sign-in-options cancelLabel="Not now" (cancelled)="signInOpen.set(false)" (signedIn)="signInOpen.set(false)" />
    }
    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }
    @if (signInOpen() || error()) {
      <a class="scripted" routerLink="/behavioral/mock" [queryParams]="{ question: next() }"
        >Practice it with scripted follow-ups instead</a
      >
    }
  `,
  styles: `
    :host {
      display: block;
      font-size: 0.875rem;
    }
    h3 {
      font-size: 0.9375rem;
      margin: 18px 0 8px;
    }
    .flaws {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 14px;
    }
    .flaw {
      font-weight: 600;
      margin: 0 0 6px;
    }
    blockquote {
      margin: 0 0 6px;
      padding: 4px 0 4px 12px;
      border-left: 3px solid var(--g-warn);
      color: var(--g-muted);
      font-style: italic;
      line-height: 1.5;
    }
    .fix {
      margin: 0;
      line-height: 1.5;
    }
    .flagged {
      font-size: 0.84375rem;
      line-height: 1.5;
      margin: 0 0 8px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    .error {
      color: var(--g-danger-ink);
      margin: 12px 0 0;
    }
    .scripted {
      display: inline-block;
      margin-top: 12px;
    }
  `,
})
export class BehavioralScorecardComponent {
  private readonly bank = inject(StoryBankService);
  private readonly progress = inject(ProgressService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly session = input.required<InterviewSession>();
  /** The answer was started from a story, which the bank already holds. */
  readonly fromStory = input(false);
  readonly kept = signal(false);
  readonly starting = signal(false);
  readonly error = signal<string | null>(null);
  readonly signInOpen = signal(false);
  /** Another question of the competency, so a new attempt does not repeat this one. */
  readonly next = signal('');

  private readonly competencyId = computed(() => this.session().problem.competencyId ?? '');
  private readonly answer = computed(() => this.session().messages.find((m) => m.star)?.star);
  readonly keepable = computed(() => {
    const answer = this.answer();
    return !!answer && !this.fromStory() && (this.kept() || !this.bank.stories().some((s) => sameDraft(s.draft, answer)));
  });
  readonly flagged = computed(() => {
    const now = new Date();
    const behavioral = this.progress.state().behavioral;
    return (this.session().scorecard?.weakCompetencies ?? []).map((id) => {
      const covering = this.bank.tagged(id).filter(isRehearsable);
      return {
        id,
        name: getCompetencySummary(id)?.name ?? id,
        covering: covering.length,
        due: dueStories(covering, now, behavioral).length,
      };
    });
  });

  constructor() {
    void this.bank.load();
  }

  label(id: AnswerFlaw) {
    return ANSWER_FLAWS.find((f) => f.id === id)?.label ?? id;
  }

  async keep() {
    const answer = this.answer();
    if (!answer || this.kept()) return;
    this.kept.set(true);
    await this.bank.saveAnswer(answer, this.competencyId(), this.session().problem.title);
  }

  async another() {
    const session = this.session();
    const next = anotherQuestion(Math.random, session.problem.id);
    this.next.set(next);
    if (session.mode === 'offline') {
      await this.router.navigate(['/behavioral/mock'], { queryParams: { question: next } });
      return;
    }
    this.starting.set(true);
    this.error.set(null);
    this.signInOpen.set(false);
    try {
      await startInterview(this.api, this.router, { track: 'behavioral', problemId: next, mode: 'ai' });
    } catch (error) {
      if (needsSignIn(error)) this.signInOpen.set(true);
      else this.error.set(error instanceof ApiError ? error.message : 'Could not start the interview.');
    } finally {
      this.starting.set(false);
    }
  }
}
