import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { IonSpinner } from '@ionic/angular';
import { COMPETENCY_CATALOG, MOCK_PROBLEMS, QUESTIONS_PER_COMPETENCY, TRACK_NAMES, type Seniority } from '@grasp/engine';
import { ApiError, ApiService } from '../../core/api.service';
import { SignInOptionsComponent } from '../../core/sign-in-options.component';
import { uniqueId } from '../../core/unique-id';
import { SegmentedComponent, type SegmentOption } from '../../ui/segmented.component';
import { SheetComponent } from '../../ui/sheet.component';
import type { InterviewCatalog, InterviewMode, InterviewSession, InterviewTrack } from './interview.types';
import { needsSignIn, openInterview } from './start-interview';

const AI_NOTE = 'Your replies and shared code are sent to the AI service.';
const AI_BEHAVIORAL_NOTE = 'Your answers, including any story you start from, are sent to the AI service.';
const MODES: readonly SegmentOption<InterviewMode>[] = [
  { value: 'offline', label: 'Scripted' },
  { value: 'ai', label: 'AI interviewer' },
];

interface Choice {
  id: string;
  title: string;
}

/**
 * Starts one mock round (REDESIGN.md 4.8): the interviewer, the question or a surprise, and for AI this hour's allowance.
 * Every choice is an API session with a verdict, a scripted behavioral round included.
 */
@Component({
  selector: 'app-mock-start-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonSpinner, SegmentedComponent, SheetComponent, SignInOptionsComponent],
  template: `
    <g-sheet [heading]="names[track()] + ' round'" [(open)]="open">
      @if (offline()) {
        <p class="notice" role="status">Mock rounds need a connection. Connect, then try again.</p>
      }
      <p class="eyebrow" [id]="modeId">Interviewer</p>
      <g-segmented [options]="modes" [(value)]="mode" [labelledby]="modeId" [describedby]="modeNoteId" />
      <p class="note" [id]="modeNoteId">
        @if (mode() === 'offline') {
          Scripted follow-ups, scored by rubric checks. No AI and no sign-in.
        } @else if (aiAccess() === 'unavailable') {
          AI rounds aren't available here. Scripted rounds always are.
        } @else if (aiAccess() === 'sign-in-required') {
          Sign in to use the AI interviewer.
        } @else if (aiAccess() === 'available') {
          @if (aiRounds(); as r) {
            <span class="allowance">AI rounds left this hour: {{ r.limit - r.used }} of {{ r.limit }}</span>
            @if (r.used >= r.limit) {
              <span class="allowance">Scripted rounds are always available.</span>
            }
          }
          {{ aiNote() }}
        } @else {
          Checking AI access…
        }
      </p>
      @if (signingIn()) {
        <app-sign-in-options cancelLabel="Not now" (cancelled)="mode.set('offline')" (signedIn)="signedIn.emit()" />
      }

      <fieldset [attr.aria-describedby]="track() === 'behavioral' ? choiceNoteId : null">
        <legend class="eyebrow">{{ track() === 'behavioral' ? 'Competency' : 'Question' }}</legend>
        @if (track() === 'behavioral') {
          <p class="note pick" [id]="choiceNoteId">
            One of its {{ questions }} questions, picked at random, scored at the {{ levelLabel() }} bar from your loop.
          </p>
        }
        @for (c of choices(); track c.id) {
          <label class="choice">
            <input type="radio" [name]="choiceName" [checked]="choice() === c.id" (change)="choice.set(c.id)" />
            <span>{{ c.title }}</span>
          </label>
        }
      </fieldset>
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div actions>
        <button type="button" class="g-btn primary" [disabled]="!ready() || starting()" (click)="start()">
          @if (starting()) {
            <ion-spinner name="crescent" />
          }
          Start round
        </button>
      </div>
    </g-sheet>
  `,
  styles: `
    :host {
      display: contents;
    }
    .notice {
      margin: 0 0 var(--g-space-3);
      padding: var(--g-space-2) var(--g-space-3);
      border-radius: var(--g-radius-sm);
      background: var(--g-warn-soft);
      color: var(--g-text);
    }
    .eyebrow {
      margin: 0 0 var(--g-space-2);
      padding: 0;
    }
    .note {
      margin: var(--g-space-2) 0 var(--g-space-4);
      color: var(--g-muted);
      font-size: var(--g-text-body-s);
      line-height: 1.5;
    }
    .allowance {
      display: block;
      color: var(--g-text);
      font-weight: 600;
    }
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
      display: grid;
      gap: var(--g-space-1);
    }
    .choice {
      display: flex;
      align-items: center;
      gap: var(--g-space-3);
      min-height: 44px;
      padding: var(--g-space-1) var(--g-space-2);
      border-radius: var(--g-radius-sm);
      cursor: pointer;
    }
    .choice:has(input:checked) {
      background: var(--g-accent-soft);
    }
    .choice input {
      flex: none;
      width: 18px;
      height: 18px;
      margin: 0;
      accent-color: var(--g-accent);
    }
    .pick {
      margin: 0 0 var(--g-space-2);
    }
    .error {
      margin: var(--g-space-3) 0 0;
      color: var(--g-danger-ink);
    }
  `,
})
export class MockStartSheetComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly sheet = viewChild(SheetComponent);
  readonly open = model(false);
  readonly track = input.required<InterviewTrack>();
  readonly level = input.required<Seniority>();
  readonly levelLabel = input.required<string>();
  /** Null until the hub has reached the server. */
  readonly catalog = input<InterviewCatalog | null>(null);
  readonly offline = input(false);
  /** Sign-in finished here, or a refusal changed what AI allows: the hub reads access and the allowance again. */
  readonly signedIn = output<void>();
  readonly changed = output<void>();

  readonly names = TRACK_NAMES;
  readonly modes = MODES;
  readonly modeId = uniqueId('mock-mode');
  readonly modeNoteId = uniqueId('mock-mode-note');
  readonly choiceName = uniqueId('mock-choice');
  readonly choiceNoteId = uniqueId('mock-choice-note');
  readonly questions = QUESTIONS_PER_COMPETENCY;
  readonly mode = signal<InterviewMode>('offline');
  /** '' is Surprise me. A new round starts from it. */
  readonly choice = linkedSignal<InterviewTrack, string>({ source: this.track, computation: () => '' });
  readonly starting = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    // An AI refusal says nothing about a scripted round, so it goes once Scripted is chosen.
    effect(() => {
      if (this.mode() === 'offline') untracked(() => this.error.set(null));
    });
  }

  readonly aiAccess = computed(() => this.catalog()?.aiAccess ?? null);
  readonly aiRounds = computed(() => this.catalog()?.aiRounds ?? null);
  readonly aiNote = computed(() => (this.track() === 'behavioral' ? AI_BEHAVIORAL_NOTE : AI_NOTE));
  readonly signingIn = computed(() => this.mode() === 'ai' && this.aiAccess() === 'sign-in-required');
  readonly choices = computed<Choice[]>(() => {
    const track = this.track();
    const listed =
      track === 'behavioral'
        ? COMPETENCY_CATALOG.map((c) => ({ id: c.id, title: c.name }))
        : MOCK_PROBLEMS.filter((p) => p.track === track).map((p) => ({ id: p.id, title: p.title }));
    return [{ id: '', title: 'Surprise me' }, ...listed];
  });
  readonly ready = computed(() => {
    if (this.offline() || !this.catalog()) return false;
    if (this.mode() === 'offline') return true;
    const rounds = this.aiRounds();
    return this.aiAccess() === 'available' && (!rounds || rounds.used < rounds.limit);
  });

  async start() {
    if (!this.ready() || this.starting()) return;
    const track = this.track();
    this.starting.set(true);
    this.error.set(null);
    try {
      const session = await this.api.post<InterviewSession>('/interview/sessions', {
        track,
        ...(this.choice() ? { problemId: this.choice() } : {}),
        mode: this.mode(),
        ...(track === 'behavioral' ? { level: this.level() } : {}),
      });
      // Ionic stops rendering the page it leaves, so the sheet closes now, and hands focus back before the session shows.
      this.open.set(false);
      this.sheet()?.close();
      let opened = false;
      try {
        opened = await openInterview(this.router, session);
      } finally {
        if (!opened) {
          this.error.set('The round started but did not open. Open it from History.');
          this.open.set(true);
          this.changed.emit();
        }
      }
    } catch (e) {
      if (!this.error()) this.error.set(e instanceof ApiError ? e.message : 'Could not start the round. Please try again.');
      if (e instanceof ApiError && (needsSignIn(e) || e.code === 'ai_rounds_used' || e.code === 'ai_unavailable')) this.changed.emit();
    } finally {
      this.starting.set(false);
    }
  }
}
