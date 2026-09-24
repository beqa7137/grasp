import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { Preferences } from '@capacitor/preferences';
import { LANGUAGES, getPattern, itemsForTopic, type Language } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { arrowUp, bulbOutline, codeSlashOutline, flagOutline, ribbonOutline } from 'ionicons/icons';
import { CodeEditorComponent } from '../../code/code-editor.component';
import { ApiError, ApiService } from '../../core/api.service';
import { refocus } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import type { InterviewMessage, InterviewSession } from './interview.types';

@Component({
  selector: 'app-interview-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonFooter,
    IonIcon,
    IonSpinner,
    CodeEditorComponent,
  ],
  templateUrl: './interview-session.page.html',
  styleUrl: './interview-session.page.scss',
})
export class InterviewSessionPage {
  readonly id = input.required<string>();
  private readonly api = inject(ApiService);
  private readonly progress = inject(ProgressService);
  private readonly content = viewChild(IonContent);
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');
  private readonly injector = inject(Injector);

  readonly session = signal<InterviewSession | null>(null);
  readonly streaming = signal<string | null>(null);
  readonly pendingCandidate = signal<InterviewMessage | null>(null);
  readonly draft = signal('');
  readonly busy = signal(false);
  readonly scoring = signal(false);
  readonly error = signal<string | null>(null);
  /** The interviewer's latest reply, or why it failed, for screen readers: the chat itself is not a live region. */
  readonly announcement = signal('');
  private abort: AbortController | null = null;

  readonly languages = LANGUAGES;
  readonly languageLabels: Record<Language, string> = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript' };
  readonly codeOpen = signal(false);
  readonly codeLanguage = signal<Language>('python');
  readonly code = signal('');
  /** The code as the interviewer last saw it; only changes are sent again. */
  private readonly sharedCode = signal('');
  readonly codeChanged = computed(() => this.code().trim().length > 0 && this.code() !== this.sharedCode());

  readonly messages = computed(() => {
    const list = [...(this.session()?.messages ?? [])];
    const pending = this.pendingCandidate();
    if (pending) list.push(pending);
    return list;
  });
  readonly candidateTurns = computed(() => this.messages().filter((m) => m.role === 'candidate').length);
  readonly active = computed(() => this.session()?.status === 'active');
  readonly scheduledItems = computed(() =>
    (this.session()?.scorecard?.weakPatterns ?? []).reduce((n, p) => n + itemsForTopic(p).length, 0),
  );

  constructor() {
    addIcons({ arrowUp, bulbOutline, flagOutline, ribbonOutline, codeSlashOutline });
    void Preferences.get({ key: 'grasp.code.language' }).then(({ value }) => {
      if (value && (LANGUAGES as string[]).includes(value)) this.codeLanguage.set(value as Language);
    });
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
      const session = await this.api.get<InterviewSession>(`/interview/sessions/${id}`);
      this.session.set(session);
      const lastCode = [...session.messages].reverse().find((m) => m.code)?.code;
      if (lastCode) {
        this.code.set(lastCode.source);
        this.sharedCode.set(lastCode.source);
        this.codeLanguage.set(lastCode.language);
      }
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'Could not load the interview.');
    }
  }

  async send(hint = false) {
    const s = this.session();
    const content = this.draft().trim();
    const code = this.codeChanged() ? { language: this.codeLanguage(), source: this.code() } : undefined;
    if (!s || this.busy() || (!hint && !content && !code)) return;
    this.busy.set(true);
    this.error.set(null);
    this.pendingCandidate.set({
      role: 'candidate',
      content: content || (hint ? 'Could I get a hint?' : 'Here is my code.'),
      at: new Date().toISOString(),
      hint,
      ...(code ? { code } : {}),
    });
    this.draft.set('');
    this.streaming.set('');
    // The Send and Hint buttons are disabled while the interviewer replies, which would drop focus to the page.
    afterNextRender(() => refocus(this.composer()?.nativeElement), { injector: this.injector });
    this.abort = new AbortController();
    try {
      const done = await this.api.stream<{ message: InterviewMessage }>(
        `/interview/sessions/${s.id}/messages`,
        { content, hint, ...(code ? { code } : {}) },
        { delta: (t) => this.streaming.update((v) => (v ?? '') + t) },
        this.abort.signal,
      );
      const candidate = this.pendingCandidate()!;
      if (code) this.sharedCode.set(code.source);
      this.session.update((cur) =>
        cur ? { ...cur, hintsUsed: cur.hintsUsed + (hint ? 1 : 0), messages: [...cur.messages, candidate, done.message] } : cur,
      );
      this.announcement.set(`Interviewer: ${done.message.content}`);
    } catch (e) {
      this.draft.set(content);
      this.error.set(e instanceof ApiError ? e.message : 'The interviewer did not respond. Try again.');
      this.announcement.set(this.error()!);
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

  setCodeLanguage(language: Language) {
    this.codeLanguage.set(language);
  }

  lineCount(source: string) {
    return source.split('\n').filter((l) => l.trim()).length;
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
