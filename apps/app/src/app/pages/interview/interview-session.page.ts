import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { Preferences } from '@capacitor/preferences';
import { LANGUAGES, getPatternSummary, itemsForTopic, type Language } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { arrowUp, bulbOutline, codeSlashOutline, flagOutline, ribbonOutline } from 'ionicons/icons';
import { CodeEditorComponent } from '../../code/code-editor.component';
import { LANGUAGE_LABELS, LanguagePickerComponent } from '../../code/language-picker.component';
import { ApiError, ApiService } from '../../core/api.service';
import { AnnouncerService } from '../../core/announcer.service';
import { refocusAfterRender } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import { SignInOptionsComponent } from '../../core/sign-in-options.component';
import type { CodeSnapshot, InterviewMessage, InterviewMode, InterviewSession } from './interview.types';

const SCORING_TIMEOUT_MS = 290_000;

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
    LanguagePickerComponent,
    SignInOptionsComponent,
  ],
  providers: [AnnouncerService],
  templateUrl: './interview-session.page.html',
  styleUrl: './interview-session.page.scss',
})
export class InterviewSessionPage {
  readonly id = input.required<string>();
  private readonly api = inject(ApiService);
  private readonly progress = inject(ProgressService);
  private readonly content = viewChild(IonContent);
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');
  private readonly signInHeading = viewChild<ElementRef<HTMLHeadingElement>>('signInHeading');
  private readonly injector = inject(Injector);
  readonly announcer = inject(AnnouncerService);

  readonly session = signal<InterviewSession | null>(null);
  readonly streaming = signal<string | null>(null);
  readonly pendingCandidate = signal<InterviewMessage | null>(null);
  readonly draft = signal('');
  readonly busy = signal(false);
  readonly scoring = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly changingMode = signal(false);
  readonly checkingAccess = signal(false);
  readonly accessCheckFailed = signal(false);
  readonly signInOpen = signal(false);
  readonly pending = computed(() => this.busy() || this.scoring() || this.changingMode() || this.checkingAccess() || this.signInOpen());
  private abort: AbortController | null = null;

  readonly languageLabels = LANGUAGE_LABELS;
  readonly codeOpen = signal(false);
  readonly codeLanguage = signal<Language>('python');
  readonly code = signal('');
  private readonly sharedCode = signal<CodeSnapshot | null>(null);
  readonly codeChanged = computed(
    () =>
      this.code().trim().length > 0 && (this.code() !== this.sharedCode()?.source || this.codeLanguage() !== this.sharedCode()?.language),
  );

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
      untracked(() => void this.load(id));
    });
    effect(() => {
      this.messages();
      this.streaming();
      if (this.signInOpen()) return;
      queueMicrotask(() => {
        if (!this.signInOpen()) void this.content()?.scrollToBottom();
      });
    });
    inject(DestroyRef).onDestroy(() => this.abort?.abort());
  }

  private async load(id: string) {
    this.checkingAccess.set(true);
    try {
      const session = await this.api.get<InterviewSession>(`/interview/sessions/${id}`);
      this.session.set(session);
      this.accessCheckFailed.set(false);
      this.error.set(null);
      const lastCode = [...session.messages].reverse().find((m) => m.code)?.code;
      if (lastCode) {
        this.code.set(lastCode.source);
        this.sharedCode.set(lastCode);
        this.codeLanguage.set(lastCode.language);
      }
    } catch (e) {
      this.handleError(e, 'Could not load the interview.');
    } finally {
      this.checkingAccess.set(false);
    }
  }

  retryLoad() {
    if (this.pending() || this.session()) return;
    return this.load(this.id());
  }

  async send(hint = false) {
    const s = this.session();
    const draft = this.draft();
    const content = draft.trim();
    const code = this.codeChanged() ? { language: this.codeLanguage(), source: this.code() } : undefined;
    if (!s || !this.active() || this.pending() || (!hint && !content && !code) || !this.canUseInterviewer()) return;
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
    refocusAfterRender(this.injector, () => this.composer()?.nativeElement);
    this.abort = new AbortController();
    try {
      const done = await this.api.stream<{ message: InterviewMessage }>(
        `/interview/sessions/${s.id}/messages`,
        { content, hint, ...(code ? { code } : {}) },
        { delta: (t) => this.streaming.update((v) => (v ?? '') + t) },
        this.abort.signal,
      );
      const candidate = this.pendingCandidate()!;
      if (code) this.sharedCode.set(code);
      this.session.update((cur) =>
        cur ? { ...cur, hintsUsed: cur.hintsUsed + (hint ? 1 : 0), messages: [...cur.messages, candidate, done.message] } : cur,
      );
      // The interviewer's reply, for screen readers: the chat itself is not a live region.
      this.announcer.announce(`Interviewer: ${done.message.content}`);
    } catch (e) {
      this.draft.set(draft);
      this.handleError(e, 'The interviewer did not respond. Try again.');
    } finally {
      this.pendingCandidate.set(null);
      this.streaming.set(null);
      this.busy.set(false);
    }
  }

  async score() {
    const s = this.session();
    if (!s || !this.active() || this.pending() || !this.canUseInterviewer()) return;
    this.scoring.set(true);
    this.error.set(null);
    try {
      const scored = await this.api.post<InterviewSession>(`/interview/sessions/${s.id}/score`, undefined, SCORING_TIMEOUT_MS);
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
      this.handleError(e, 'Scoring failed. Try again.');
    } finally {
      this.scoring.set(false);
    }
  }

  async chooseMode(mode: InterviewMode) {
    const session = this.session();
    if (!session || !this.active() || this.pending()) return;
    if (mode === 'ai' && !this.canUseAi()) return;
    if (session.mode === mode) return;
    this.changingMode.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const changed = await this.api.post<InterviewSession>(`/interview/sessions/${session.id}/mode`, { mode });
      this.session.set(changed);
      this.notice.set(
        `${changed.mode === 'ai' ? 'AI' : 'Scripted practice'} will handle future replies and the final score. Your conversation and draft are unchanged.`,
      );
    } catch (error) {
      this.handleError(error, 'Could not change the interviewer. Please try again.');
    } finally {
      this.changingMode.set(false);
    }
  }

  signedIn() {
    this.signInOpen.set(false);
    return this.checkAccess();
  }

  async checkAccess() {
    if (this.checkingAccess()) return;
    const session = this.session();
    if (!session) return this.load(this.id());
    this.checkingAccess.set(true);
    try {
      this.session.set(await this.api.get<InterviewSession>(`/interview/sessions/${session.id}`));
      this.accessCheckFailed.set(false);
      this.error.set(null);
      this.notice.set('Signed in. Your draft is unchanged. Choose your interviewer and continue when you’re ready.');
    } catch (error) {
      this.accessCheckFailed.set(true);
      this.handleError(error, 'Could not check interview access. Your draft is still here.');
    } finally {
      this.checkingAccess.set(false);
    }
  }

  closeSignIn() {
    this.signInOpen.set(false);
    refocusAfterRender(this.injector, () => this.composer()?.nativeElement);
  }

  private canUseInterviewer() {
    return this.session()?.mode !== 'ai' || this.canUseAi();
  }

  private canUseAi() {
    if (this.accessCheckFailed()) return false;
    const access = this.session()?.aiAccess;
    if (access === 'available') return true;
    if (access === 'sign-in-required') this.openSignIn();
    else this.error.set('AI is unavailable right now. You can switch to scripted practice.');
    return false;
  }

  private openSignIn() {
    this.signInOpen.set(true);
    refocusAfterRender(
      this.injector,
      () => {
        const heading = this.signInHeading()?.nativeElement;
        heading?.scrollIntoView({ block: 'nearest' });
        return heading;
      },
      this.composer()?.nativeElement,
    );
  }

  private handleError(error: unknown, fallback: string) {
    this.error.set(error instanceof ApiError ? error.message : fallback);
    if (!(error instanceof ApiError)) return;
    if (
      error.code === 'ai_sign_in_required' ||
      (error.status === 401 && (error.code === 'token_invalid' || error.code === 'sign_in_required'))
    ) {
      this.accessCheckFailed.set(false);
      this.session.update((session) => (session ? { ...session, aiAccess: 'sign-in-required' } : session));
      this.openSignIn();
    } else if (error.code === 'ai_unavailable') {
      this.session.update((session) => (session ? { ...session, aiAccess: 'unavailable' } : session));
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
    return getPatternSummary(id)?.name ?? id;
  }

  verdictLabel(v: string) {
    return v.replace(/-/g, ' ');
  }
}
