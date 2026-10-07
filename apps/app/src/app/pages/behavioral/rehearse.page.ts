import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { dueStories, formatClock, getCompetencySummary, rehearsalQuestion, storyTitle, whenNext, type Story } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { checkmarkCircle, playOutline, refreshOutline, stopOutline } from 'ionicons/icons';
import { refocusAfterRender } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import { STAR_PARTS } from './star-parts';
import { StoryBankService } from './story-bank.service';
import { BackComponent } from '../../ui/back.component';

const MIN_SECONDS = 90;
const MAX_SECONDS = 180;

@Component({
  selector: 'app-rehearse',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackComponent, RouterLink, IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonIcon],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><app-back href="/behavioral/stories" /></ion-buttons>
        <ion-title>Rehearse</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        @if (current(); as s) {
          <p class="eyebrow">Story {{ index() + 1 }} of {{ queue().length }} · {{ tags(s) }}</p>
          <h1 tabindex="-1" #heading>{{ question()?.prompt }}</h1>
          <p class="with">
            Tell it with <b>{{ title(s) }}</b
            >, out loud, as you would in the room.
          </p>

          <details class="panel outline">
            <summary>Peek at your story</summary>
            <dl>
              @for (o of outline; track o.part) {
                @if (s.draft[o.part].trim()) {
                  <dt>{{ o.label }}</dt>
                  <dd>{{ s.draft[o.part] }}</dd>
                }
              }
            </dl>
          </details>

          <section class="panel timer" aria-labelledby="timer-title">
            <h2 id="timer-title" class="visually-hidden">Timer</h2>
            <p class="time" role="timer" aria-live="off">{{ elapsed() }}</p>
            <p class="muted">Aim for 1:30 to 3:00.</p>
            @if (running()) {
              <button type="button" class="g-btn" (click)="stop()"><ion-icon name="stop-outline" aria-hidden="true" />Stop</button>
            } @else {
              <button type="button" class="g-btn" (click)="start()">
                <ion-icon [name]="seconds() ? 'refresh-outline' : 'play-outline'" aria-hidden="true" />{{
                  seconds() ? 'Start again' : 'Start timer'
                }}
              </button>
            }
            <p class="verdict" role="status">{{ verdict() }}</p>
          </section>

          <div class="grade" role="group" aria-label="How did it go?">
            <button type="button" class="g-btn" (click)="grade(false)">Needs work</button>
            <button type="button" class="g-btn primary" (click)="grade(true)">Told it well</button>
          </div>
          <p class="then muted">Told well, it comes back after a longer gap each time. Needs work brings it back tomorrow.</p>
        } @else if (loaded()) {
          <section class="done">
            <ion-icon name="checkmark-circle" aria-hidden="true" />
            <h1 tabindex="-1" #heading>{{ graded() ? 'All rehearsed' : 'Nothing to rehearse now' }}</h1>
            @if (next(); as n) {
              <p>
                Next up: <b>{{ n.title }}</b
                >, {{ n.when }}.
              </p>
            } @else {
              <p>Tag a story with a competency and write some of it, and it will be ready to rehearse.</p>
            }
            <a class="g-btn" routerLink="/behavioral/stories">Back to your stories</a>
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: `
    h1 {
      font-size: clamp(1.25rem, 4vw, 1.625rem);
      line-height: 1.35;
      margin: 4px 0 10px;
    }
    .with {
      font-size: 0.9375rem;
      margin: 0 0 16px;
    }
    .outline {
      padding: 12px 16px;
      margin-bottom: 16px;
      summary {
        cursor: pointer;
        font-weight: 600;
      }
      dl {
        margin: 12px 0 0;
        display: grid;
        gap: 4px;
        font-size: 0.90625rem;
        line-height: 1.5;
      }
      dt {
        font-weight: 600;
        color: var(--g-accent);
        margin-top: 6px;
      }
      dd {
        margin: 0;
      }
    }
    .timer {
      padding: 16px;
      margin-bottom: 16px;
      display: grid;
      justify-items: start;
      gap: 8px;
      p {
        margin: 0;
      }
      .time {
        font-size: 2.25rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .muted {
        font-size: 0.8125rem;
      }
      .verdict:empty {
        display: none;
      }
      .verdict {
        font-size: 0.90625rem;
        line-height: 1.5;
      }
    }
    .grade {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .then {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
    .done {
      text-align: center;
      padding: 32px 0;
      ion-icon {
        font-size: 44px;
        color: var(--g-found-ink);
      }
      p {
        line-height: 1.5;
        margin: 0 0 18px;
      }
    }
  `,
})
export class RehearsePage {
  private readonly bank = inject(StoryBankService);
  private readonly progress = inject(ProgressService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  readonly outline = STAR_PARTS;
  readonly title = storyTitle;
  readonly loaded = signal(false);
  readonly queue = signal<readonly string[]>([]);
  readonly index = signal(0);
  readonly graded = signal(0);
  readonly seconds = signal(0);
  readonly running = signal(false);
  private timer: ReturnType<typeof setInterval> | undefined;
  private grading = false;

  readonly current = computed(() => {
    const id = this.queue()[this.index()];
    return id === undefined ? undefined : this.bank.get(id);
  });
  readonly question = computed(() => {
    const story = this.current();
    return story ? rehearsalQuestion(story) : undefined;
  });
  readonly elapsed = computed(() => formatClock(this.seconds()));
  readonly verdict = computed(() => {
    const s = this.seconds();
    if (this.running() || !s) return null;
    if (s < MIN_SECONDS) return `${formatClock(s)} is short: interviewers want the Action in detail. Add what you did and why.`;
    if (s > MAX_SECONDS) return `${formatClock(s)} runs long: cut the Situation to two sentences and get to what you did sooner.`;
    return `${formatClock(s)} is a good length.`;
  });
  readonly next = computed(() => {
    const now = new Date();
    const upcoming = this.bank
      .stories()
      .filter((s) => s.rehearsal && s.competencyIds.length)
      .sort((a, b) => a.rehearsal!.due.localeCompare(b.rehearsal!.due))[0];
    return upcoming ? { title: storyTitle(upcoming), when: whenNext(upcoming, now, this.progress.state().behavioral) } : null;
  });

  constructor() {
    addIcons({ checkmarkCircle, playOutline, refreshOutline, stopOutline });
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  async ionViewWillEnter() {
    await this.bank.load();
    this.queue.set(dueStories(this.bank.stories(), new Date(), this.progress.state().behavioral).map((s) => s.id));
    this.index.set(0);
    this.graded.set(0);
    this.reset();
    this.loaded.set(true);
  }

  ionViewWillLeave() {
    this.reset();
  }

  tags(story: Story) {
    return story.competencyIds.map((id) => getCompetencySummary(id)?.name ?? id).join(', ');
  }

  start() {
    this.reset();
    this.running.set(true);
    this.timer = setInterval(() => this.seconds.update((s) => s + 1), 1000);
  }

  stop() {
    clearInterval(this.timer);
    this.running.set(false);
  }

  async grade(toldWell: boolean) {
    const story = this.current();
    if (!story || this.grading) return;
    this.grading = true;
    this.reset();
    this.graded.update((n) => n + 1);
    this.index.update((i) => i + 1);
    refocusAfterRender(this.injector, () => this.heading()?.nativeElement, this.host.nativeElement);
    try {
      await this.bank.rehearse(story.id, toldWell);
    } finally {
      this.grading = false;
    }
  }

  private reset() {
    this.stop();
    this.seconds.set(0);
  }
}
