import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { getPattern, itemsForTopic } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { arrowUp, bulbOutline, flagOutline, ribbonOutline } from 'ionicons/icons';
import { ApiError, ApiService } from '../../core/api.service';
import { ProgressService } from '../../core/progress.service';
import type { InterviewMessage, InterviewSession } from './interview.types';

@Component({
  selector: 'app-interview-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonFooter, IonIcon, IonSpinner],
  templateUrl: './interview-session.page.html',
  styleUrl: './interview-session.page.scss',
})
export class InterviewSessionPage {
  readonly id = input.required<string>();
  private readonly api = inject(ApiService);
  private readonly progress = inject(ProgressService);
  private readonly content = viewChild(IonContent);

  readonly session = signal<InterviewSession | null>(null);
  readonly streaming = signal<string | null>(null);
  readonly pendingCandidate = signal<InterviewMessage | null>(null);
  readonly draft = signal('');
  readonly busy = signal(false);
  readonly scoring = signal(false);
  readonly error = signal<string | null>(null);
  private abort: AbortController | null = null;

  readonly messages = computed(() => {
    const list = [...(this.session()?.messages ?? [])];
    const pending = this.pendingCandidate();
    if (pending) list.push(pending);
    return list;
  });
  readonly candidateTurns = computed(() => this.messages().filter((m) => m.role === 'candidate').length);
  readonly active = computed(() => this.session()?.status === 'active');
  readonly scheduledItems = computed(() => (this.session()?.scorecard?.weakPatterns ?? []).reduce((n, p) => n + itemsForTopic(p).length, 0));

  constructor() {
    addIcons({ arrowUp, bulbOutline, flagOutline, ribbonOutline });
    effect(() => {
      const id = this.id();
      void this.load(id);
    });
    effect(() => {
      this.messages();
      this.streaming();
      queueMicrotask(() => void this.content()?.scrollToBottom(200));
    });
    inject(DestroyRef).onDestroy(() => this.abort?.abort());
  }

  private async load(id: string) {
    try {
      this.session.set(await this.api.get<InterviewSession>(`/interview/sessions/${id}`));
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'Could not load the interview.');
    }
  }

  async send(hint = false) {
    const s = this.session();
    const content = this.draft().trim();
    if (!s || this.busy() || (!hint && !content)) return;
    this.busy.set(true);
    this.error.set(null);
    this.pendingCandidate.set({ role: 'candidate', content: hint && !content ? 'Could I get a hint?' : content, at: new Date().toISOString(), hint });
    this.draft.set('');
    this.streaming.set('');
    this.abort = new AbortController();
    try {
      const done = await this.api.stream<{ message: InterviewMessage }>(
        `/interview/sessions/${s.id}/messages`,
        { content, hint },
        { delta: (t) => this.streaming.update((v) => (v ?? '') + t) },
        this.abort.signal,
      );
      const candidate = this.pendingCandidate()!;
      this.session.update((cur) =>
        cur ? { ...cur, hintsUsed: cur.hintsUsed + (hint ? 1 : 0), messages: [...cur.messages, candidate, done.message] } : cur,
      );
    } catch (e) {
      this.draft.set(content);
      this.error.set(e instanceof ApiError ? e.message : 'The interviewer did not respond. Try again.');
    } finally {
      this.pendingCandidate.set(null);
      this.streaming.set(null);
      this.busy.set(false);
    }
  }

  async score() {
    const s = this.session();
    if (!s || this.scoring()) return;
    this.scoring.set(true);
    this.error.set(null);
    try {
      const scored = await this.api.post<InterviewSession>(`/interview/sessions/${s.id}/score`);
      this.session.set(scored);
      if (scored.scorecard) {
        await this.progress.record({
          id: `interview-${scored.id}`,
          at: scored.scoredAt,
          type: 'interview.scored',
          sessionId: scored.id,
          track: scored.track,
          verdict: scored.scorecard.verdict,
          weakPatterns: scored.scorecard.weakPatterns,
        });
      }
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'Scoring failed. Try again.');
    } finally {
      this.scoring.set(false);
    }
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void this.send();
    }
  }

  patternName(id: string) {
    return getPattern(id)?.name ?? id;
  }

  verdictLabel(v: string) {
    return v.replace(/-/g, ' ');
  }
}
