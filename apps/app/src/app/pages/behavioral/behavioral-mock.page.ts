import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import {
  EMPTY_STAR_DRAFT,
  debriefMock,
  formatClock,
  getCompetencySummary,
  isEmptyDraft,
  newSeed,
  planMock,
  planQuestion,
  seeded,
  type MockAnswer,
  type StarDraft,
  type StarPart,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { alertCircle, arrowForward, checkmarkCircle } from 'ionicons/icons';
import { refocusAfterRender } from '../../core/focus';
import { StarEditorComponent } from './star-editor.component';
import { StoryBankService } from './story-bank.service';

type Turn = { question: number; followUp: number | null };
import { BackComponent } from '../../ui/back.component';

@Component({
  selector: 'app-behavioral-mock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackComponent, RouterLink, IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonIcon, StarEditorComponent],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><app-back href="/behavioral" /></ion-buttons>
        <ion-title>Mock behavioral interview</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        @if (turn(); as t) {
          @let q = plan()[t.question];
          <p class="eyebrow">
            Question {{ t.question + 1 }} of {{ plan().length }}
            @if (t.followUp !== null) {
              · follow-up {{ t.followUp + 1 }} of {{ q.followUps.length }}
            }
          </p>
          <h1 tabindex="-1" #heading>{{ t.followUp === null ? q.question.prompt : q.followUps[t.followUp] }}</h1>
          @if (t.followUp === null) {
            <p class="how muted">Answer as you would say it. No checks until the end, as in the room.</p>
            <app-star-editor [draft]="answers()[t.question].answer" [coached]="false" (edit)="edit($event.part, $event.text)" />
          } @else {
            <label class="follow">
              <span class="visually-hidden">Your answer</span>
              <textarea
                rows="4"
                [value]="answers()[t.question].followUps[t.followUp] ?? ''"
                (input)="answerFollowUp($any($event.target).value)"
                placeholder="Two or three sentences, specific to the story you just told."
              ></textarea>
            </label>
          }
          <button type="button" class="g-btn primary next" [disabled]="!answered()" (click)="advance()">
            {{ last() ? 'Finish and see the debrief' : 'Answer' }}<ion-icon name="arrow-forward" aria-hidden="true" />
          </button>
        } @else if (debrief(); as d) {
          <h1 tabindex="-1" #heading>Debrief</h1>
          <p class="score">{{ d.passing }} of {{ d.total }} checks pass across {{ scope() }}.</p>
          @if (d.focus) {
            <p class="panel focus"><b>Fix first:</b> {{ d.focus }}</p>
          }
          @for (a of d.answers; track a.question.id; let i = $index) {
            <section class="panel answer" [attr.aria-labelledby]="'answer-' + i">
              <p class="eyebrow">{{ name(a.question.competencyId) }} · about {{ clock(a.review.seconds) }} to say</p>
              <h2 [id]="'answer-' + i">{{ a.question.prompt }}</h2>
              <p class="probe"><b>What they check:</b> {{ a.question.probes }}</p>
              <ul class="checks">
                @for (c of a.review.checks; track c.id) {
                  <li [class.ok]="c.ok">
                    <ion-icon [name]="c.ok ? 'checkmark-circle' : 'alert-circle'" [attr.aria-label]="c.ok ? 'Pass' : 'To fix'" role="img" />
                    <span>{{ c.message }}</span>
                  </li>
                }
                @for (f of a.followUps; track f.prompt) {
                  <li [class.ok]="f.ok">
                    <ion-icon [name]="f.ok ? 'checkmark-circle' : 'alert-circle'" [attr.aria-label]="f.ok ? 'Pass' : 'To fix'" role="img" />
                    <span
                      >"{{ f.prompt }}"
                      {{ f.ok ? 'answered with substance.' : 'needs a real answer: two or three specific sentences.' }}</span
                    >
                  </li>
                }
              </ul>
              <div class="actions">
                <a class="g-btn" [routerLink]="['/behavioral/question', a.question.id]">Practice this question</a>
                @if (!empty(i)) {
                  <button type="button" class="g-btn" [disabled]="saved().has(i)" (click)="keep(i)">
                    {{ saved().has(i) ? 'In your story bank' : 'Add to story bank' }}
                  </button>
                }
              </div>
            </section>
          }
          <button type="button" class="g-btn primary" (click)="restart()">New mock interview</button>
        }
      </div>
    </ion-content>
  `,
  styles: `
    h1 {
      font-size: clamp(1.25rem, 4vw, 1.625rem);
      line-height: 1.35;
      margin: 4px 0 10px;
      outline: none;
    }
    .how {
      font-size: 0.875rem;
      margin: 0 0 16px;
    }
    .follow {
      display: block;
      margin: 8px 0 0;
    }
    textarea {
      width: 100%;
      resize: vertical;
      background: var(--g-surface);
      color: var(--g-text);
      border: 1px solid var(--g-stroke);
      border-radius: var(--g-radius-sm);
      padding: 12px;
      font: 0.9375rem/1.5 var(--ion-font-family);
    }
    .next {
      margin-top: 16px;
    }
    .score {
      font-weight: 600;
      margin: 0 0 12px;
    }
    .focus {
      padding: 12px 16px;
      margin: 0 0 16px;
      line-height: 1.5;
    }
    .answer {
      padding: 16px;
      margin-bottom: 16px;
      h2 {
        font-size: 1rem;
        line-height: 1.4;
        margin: 4px 0 8px;
      }
    }
    .probe {
      font-size: 0.875rem;
      line-height: 1.5;
      margin: 0 0 12px;
    }
    .checks {
      list-style: none;
      margin: 0 0 12px;
      padding: 0;
      display: grid;
      gap: 8px;
      li {
        display: flex;
        gap: 8px;
        font-size: 0.875rem;
        line-height: 1.45;
        ion-icon {
          flex: none;
          margin-top: 2px;
          color: var(--g-warn-ink);
        }
        &.ok ion-icon {
          color: var(--g-found-ink);
        }
      }
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class BehavioralMockPage {
  private readonly bank = inject(StoryBankService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly content = viewChild(IonContent);

  /** A question id, or a competency id for one of its questions, to practise alone instead of the three-question mock. */
  readonly question = input<string>();
  private readonly seed = signal(newSeed());
  readonly plan = computed(() => {
    const rand = seeded(this.seed());
    const id = this.question();
    return id ? planQuestion(rand, id) : planMock(rand);
  });
  readonly answers = linkedSignal<MockAnswer[]>(() =>
    this.plan().map(() => ({ answer: { ...EMPTY_STAR_DRAFT } as StarDraft, followUps: [] })),
  );
  readonly scope = computed(() => (this.plan().length === 1 ? 'your answer and its follow-ups' : 'three answers and their follow-ups'));
  readonly step = linkedSignal({ source: this.plan, computation: () => 0 });
  readonly clock = formatClock;
  readonly saved = linkedSignal({ source: this.plan, computation: (): ReadonlySet<number> => new Set() });

  private readonly turns = computed<Turn[]>(() =>
    this.plan().flatMap((q, question) => [{ question, followUp: null }, ...q.followUps.map((_, followUp) => ({ question, followUp }))]),
  );
  readonly turn = computed(() => this.turns()[this.step()]);
  readonly last = computed(() => this.step() === this.turns().length - 1);
  readonly answered = computed(() => {
    const t = this.turn();
    if (!t) return false;
    const answer = this.answers()[t.question];
    return t.followUp === null ? !isEmptyDraft(answer.answer) : !!answer.followUps[t.followUp]?.trim();
  });
  readonly debrief = computed(() => (this.turn() ? null : debriefMock(this.plan(), this.answers())));

  constructor() {
    addIcons({ alertCircle, arrowForward, checkmarkCircle });
  }

  name(competencyId: string) {
    return getCompetencySummary(competencyId)?.name ?? competencyId;
  }

  empty(index: number) {
    return isEmptyDraft(this.answers()[index].answer);
  }

  edit(part: StarPart, text: string) {
    const t = this.turn();
    if (t) this.update(t.question, (a) => ({ ...a, answer: { ...a.answer, [part]: text } }));
  }

  answerFollowUp(text: string) {
    const t = this.turn();
    if (t?.followUp == null) return;
    const index = t.followUp;
    this.update(t.question, (a) => ({ ...a, followUps: Object.assign([...a.followUps], { [index]: text }) }));
  }

  advance() {
    if (!this.answered()) return;
    this.step.update((s) => s + 1);
    this.focusHeading();
  }

  async keep(index: number) {
    const { answer } = this.answers()[index];
    const question = this.plan()[index].question;
    this.saved.update((s) => new Set(s).add(index));
    await this.bank.saveAnswer(answer, question.competencyId, question.prompt);
  }

  restart() {
    this.seed.set(newSeed());
    this.focusHeading();
  }

  private update(question: number, change: (answer: MockAnswer) => MockAnswer) {
    this.answers.update((all) => all.map((a, i) => (i === question ? change(a) : a)));
  }

  private focusHeading() {
    void this.content()?.scrollToTop(0);
    refocusAfterRender(this.injector, () => this.heading()?.nativeElement, this.host.nativeElement);
  }
}
