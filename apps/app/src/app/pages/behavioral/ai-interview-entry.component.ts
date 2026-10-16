import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { sparkles } from 'ionicons/icons';
import { currentTarget } from '@grasp/engine';
import { ApiError, ApiService } from '../../core/api.service';
import { ProgressService } from '../../core/progress.service';
import { SignInOptionsComponent } from '../../core/sign-in-options.component';
import { uniqueId } from '../../core/unique-id';
import type { InterviewMode } from '../interview/interview.types';
import { needsSignIn, startInterview } from '../interview/start-interview';

@Component({
  selector: 'app-ai-interview-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, IonSpinner, SignInOptionsComponent],
  template: `
    <section class="panel entry" [attr.aria-labelledby]="titleId">
      <h2 [id]="titleId">Say it to an interviewer</h2>
      <p class="muted">Give your STAR answer, take up to three follow-ups, and get a scorecard with what to fix.</p>
      <button type="button" class="g-btn primary" [disabled]="starting() || signInOpen()" (click)="start('ai')">
        @if (starting()) {
          <ion-spinner name="crescent" />
        } @else {
          <ion-icon name="sparkles" aria-hidden="true" />
        }
        Practice with the AI interviewer
      </button>
      @if (signInOpen()) {
        <h3>Sign in for AI interviews</h3>
        <app-sign-in-options cancelLabel="Not now" (cancelled)="signInOpen.set(false)" (signedIn)="signInOpen.set(false)" />
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      @if (signInOpen() || error()) {
        <button type="button" class="g-btn scripted" [disabled]="starting()" (click)="start('offline')">
          Practice it with scripted follow-ups instead
        </button>
      }
    </section>
  `,
  styles: `
    .entry {
      padding: 16px;
      margin: 0 0 16px;
    }
    h2 {
      font-size: 1rem;
      margin: 0 0 6px;
    }
    h3 {
      font-size: var(--g-text-title-s);
      margin: 16px 0 8px;
    }
    p {
      font-size: 0.875rem;
      line-height: 1.5;
      margin: 0 0 12px;
    }
    .error {
      color: var(--g-danger-ink);
      margin: 12px 0 0;
    }
    .scripted {
      margin-top: 12px;
    }
  `,
})
export class AiInterviewEntryComponent {
  /** A question id, or a competency id for one of its questions. */
  readonly problemId = input.required<string>();
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly progress = inject(ProgressService);
  readonly titleId = uniqueId('ai-entry-title');
  readonly starting = signal(false);
  readonly signInOpen = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    addIcons({ sparkles });
  }

  /** Scripted is the way on when AI is refused: a mock round with a verdict, at the Target's level as AI would be. */
  async start(mode: InterviewMode) {
    if (this.starting()) return;
    this.starting.set(true);
    this.error.set(null);
    this.signInOpen.set(false);
    try {
      const level = currentTarget(this.progress.state()).target.level;
      await startInterview(this.api, this.router, { track: 'behavioral', problemId: this.problemId(), mode, level });
    } catch (error) {
      if (needsSignIn(error)) this.signInOpen.set(true);
      else this.error.set(error instanceof ApiError ? error.message : 'Could not start the interview.');
    } finally {
      this.starting.set(false);
    }
  }
}
