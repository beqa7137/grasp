import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import {
  PATTERN_CATALOG,
  diagnosticItems,
  generateQuestion,
  newSeed,
  placementFromAnswers,
  type DiagnosticAnswer,
  type DiagnosticOutcome,
  type Question,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { arrowForward, compassOutline, timeOutline } from 'ionicons/icons';
import { haptic } from '../../core/haptics';
import { onPageKey } from '../../core/on-page-key';
import { ProgressService } from '../../core/progress.service';
import { ShortcutsService } from '../../core/shortcuts.service';
import { QuestionCardComponent } from '../../review/question-card.component';

type Phase = 'intro' | 'questions' | 'results';

interface Slot {
  itemId: string;
  question: Question;
}
import { BackComponent } from '../../ui/back.component';
import { CrossLinkDirective } from '../../ui/cross-link.directive';

@Component({
  selector: 'app-diagnostic',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CrossLinkDirective,
    BackComponent,
    RouterLink,
    DatePipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    IonIcon,
    QuestionCardComponent,
  ],
  templateUrl: './diagnostic.page.html',
  styleUrl: './diagnostic.page.scss',
})
export class DiagnosticPage {
  readonly progress = inject(ProgressService);
  readonly shortcuts = inject(ShortcutsService);
  readonly questionCount = PATTERN_CATALOG.length;

  readonly slots = signal<Slot[]>([]);
  readonly answers = signal<DiagnosticAnswer[]>([]);
  private shownAt = 0;

  readonly current = computed(() => this.slots()[this.answers().length] ?? null);
  readonly phase = computed<Phase>(() => (!this.slots().length ? 'intro' : this.current() ? 'questions' : 'results'));
  readonly placed = computed(() => {
    const placement = placementFromAnswers(this.answers());
    return {
      weak: PATTERN_CATALOG.filter((p) => placement[p.id] === 'weak'),
      strong: PATTERN_CATALOG.filter((p) => placement[p.id] === 'strong'),
    };
  });

  constructor() {
    addIcons({ arrowForward, compassOutline, timeOutline });
    onPageKey((e) => this.onKey(e), { kind: 'shortcuts' });
  }

  /** Ionic reuses this view on the next visit, and a retake must open on the intro, not the last results. */
  ionViewDidLeave() {
    if (this.phase() !== 'results') return;
    this.slots.set([]);
    this.answers.set([]);
  }

  start() {
    this.slots.set(diagnosticItems(Math.random).map((itemId) => ({ itemId, question: generateQuestion(itemId, newSeed()) })));
    this.shownAt = Date.now();
  }

  choose(choice: number) {
    const slot = this.current();
    if (slot) void this.answer(slot, choice === slot.question.answer ? 'correct' : 'wrong');
  }

  skip() {
    const slot = this.current();
    if (slot) void this.answer(slot, 'skipped');
  }

  private onKey(e: KeyboardEvent) {
    const slot = this.current();
    if (!slot) return;
    const choice = Number(e.key) - 1;
    if (choice >= 0 && choice < slot.question.choices.length) this.choose(choice);
    else if (e.key.toLowerCase() === 's') this.skip();
  }

  private async answer(slot: Slot, outcome: DiagnosticOutcome) {
    const answers = [...this.answers(), { itemId: slot.itemId, outcome, durationMs: Date.now() - this.shownAt }];
    this.answers.set(answers);
    this.shownAt = Date.now();
    void haptic.tap();
    if (answers.length < this.slots().length) return;
    await this.progress.record({ type: 'diagnostic.completed', answers });
  }
}
