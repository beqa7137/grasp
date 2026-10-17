import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  COMPETENCY_CATALOG,
  QUESTION_COUNT,
  QUESTION_STATUSES,
  EMPTY_QUESTION_QUERY,
  isQuestionQueryFiltered,
  parseQuestionQuery,
  queryQuestions,
  questionQueryParams,
  type QuestionPrompt,
  type QuestionFacet,
  type QuestionQuery,
  type QuestionStatus,
} from '@grasp/engine';
import { LibraryState, matchedWhat, resultLine, type UrlParam } from '../../core/library-state';
import { ChipComponent } from '../../ui/chip.component';
import { EmptyStateComponent } from '../../ui/empty-state.component';
import { EntryRowComponent, type EntryStatus } from '../../ui/entry-row.component';
import { doneStateIcon, notStartedStateIcon } from '../../ui/icons';
import { StarDraftsService } from './star-drafts.service';
import { StoryBankService } from './story-bank.service';

const STATUS_NAMES: Record<QuestionStatus, string> = {
  'not-drafted': 'Not drafted',
  drafted: 'Drafted on this device',
  story: 'Covered by a story',
};
const DRAFTED: EntryStatus = { icon: doneStateIcon, label: 'Drafted on this device', tone: 'success' };
const NOT_DRAFTED: EntryStatus = { icon: notStartedStateIcon, label: 'Not drafted' };

/**
 * The Behavioral hub's Questions (REDESIGN.md 4.8): all 91 prompts under their competencies, filtered by competency and
 * status and searched, with the URL as the only filter state, replaced and never pushed, so a link such as
 * `?competency=conflict&q=disagree` opens the same list.
 */
@Component({
  selector: 'app-question-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChipComponent, EmptyStateComponent, EntryRowComponent],
  template: `
    <div class="page narrow">
      <h1>Questions</h1>
      <p class="summary">
        @if (loaded()) {
          {{ drafts.count() }} of {{ total }} drafted on this device
        }
      </p>
      <p class="drill"><a routerLink="/behavioral/drill">STAR drill: 3 questions with follow-ups, checks at the end, no verdict →</a></p>

      <form class="search" role="search" (submit)="lib.submit($event)">
        <label class="visually-hidden" for="question-search">Search questions</label>
        <input
          #searchField
          id="question-search"
          type="search"
          placeholder="Search questions"
          autocomplete="off"
          spellcheck="false"
          enterkeyhint="search"
          [value]="lib.search()"
          (input)="lib.type($any($event.target).value)"
        />
      </form>
      <div class="facet" role="group" aria-labelledby="question-competency">
        <span class="label" id="question-competency">Competency</span>
        <div class="options">
          @for (c of competencies; track c.id) {
            @let n = result().counts.competency[c.id];
            <button
              type="button"
              g-chip
              [attr.aria-pressed]="lib.isOn('competency', c.id)"
              [attr.aria-disabled]="lib.dimmed('competency', c.id, n)"
              (click)="toggle('competency', c.id, n)"
            >
              {{ c.name }}
              @if (loaded()) {
                <span class="count">{{ n }}</span>
              }
            </button>
          }
        </div>
      </div>
      <div class="facet" role="group" aria-labelledby="question-status">
        <span class="label" id="question-status">Status</span>
        <div class="options">
          @for (s of statuses; track s.id) {
            @let n = result().counts.status[s.id];
            <button
              type="button"
              g-chip
              [attr.aria-pressed]="lib.isOn('status', s.id)"
              [attr.aria-disabled]="lib.dimmed('status', s.id, n)"
              (click)="toggle('status', s.id, n)"
            >
              {{ s.name }}
              @if (loaded()) {
                <span class="count">{{ n }}</span>
              }
            </button>
          }
        </div>
      </div>
      <div class="results">
        <p role="status">{{ resultLine() }}</p>
        @if (filtered()) {
          <button type="button" class="g-btn ghost" (click)="clearAll()">Clear all</button>
        }
      </div>

      @if (!result().total) {
        @if (loaded()) {
          <g-empty-state class="empty" heading="No questions match">
            {{ emptyText() }}
            <button action type="button" class="g-btn" (click)="clearAll()">Clear all</button>
          </g-empty-state>
        }
      } @else {
        @for (g of result().groups; track g.competencyId) {
          <section class="group" [attr.aria-labelledby]="'group-' + g.competencyId">
            <h2 [id]="'group-' + g.competencyId">
              <a [routerLink]="['/behavioral', g.competencyId]">{{ g.name }}</a>
            </h2>
            <ul class="rows">
              @for (q of g.questions; track q.id) {
                <li>
                  <a
                    g-entry-row
                    [heading]="q.prompt"
                    [status]="drafts.isDrafted(q.id) ? drafted : notDrafted"
                    [meta]="covered().has(q.competencyId) ? ['Covered by a story'] : []"
                    [routerLink]="['/behavioral/question', q.id]"
                  ></a>
                </li>
              }
            </ul>
          </section>
        }
      }
    </div>
  `,
  styles: `
    @use '../../../search' as *;
    @use '../../../type' as *;

    h1 {
      margin: var(--g-space-1) 0 var(--g-space-1);
      font-size: var(--g-text-display-l);
    }
    .summary {
      margin: 0 0 var(--g-space-2);
      /* Holds its line while the drafts and stories load, so nothing below moves when the counts arrive. */
      min-height: 1.5em;
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
    .drill {
      margin: 0 0 var(--g-space-4);
      a {
        display: inline-block;
        padding-block: var(--g-space-1);
        font-weight: 600;
      }
    }
    .search {
      margin-bottom: var(--g-space-3);
      @include search-field;
    }
    .facet {
      margin-bottom: var(--g-space-3);
    }
    .label {
      @include label;
      display: block;
      margin-bottom: var(--g-space-1);
      color: var(--g-muted);
    }
    .options {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-2);
    }
    .count {
      color: var(--g-muted);
      font-variant-numeric: tabular-nums;
    }
    .results {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--g-space-2);
      min-height: 44px;
      margin-bottom: var(--g-space-2);
      p {
        margin: 0;
        font-size: var(--g-text-body-s);
        color: var(--g-muted);
      }
    }
    .empty {
      margin-top: var(--g-space-6);
    }
    .group + .group {
      margin-top: var(--g-space-5);
    }
    h2 {
      @include title;
      margin: 0 0 var(--g-space-2);
      font-size: var(--g-text-title-l);
      a {
        display: inline-block;
        padding-block: var(--g-space-1);
        color: inherit;
      }
    }
    .rows {
      display: grid;
      gap: var(--g-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    /* Each prompt keeps to two lines, so the 91 rows stay a list to scan; the row's name is the whole prompt. */
    .rows ::ng-deep .title {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      font-weight: 500;
    }
  `,
})
export class QuestionLibraryPage {
  readonly drafts = inject(StarDraftsService);
  private readonly bank = inject(StoryBankService);

  readonly total = QUESTION_COUNT;
  readonly drafted = DRAFTED;
  readonly notDrafted = NOT_DRAFTED;
  readonly competencies = COMPETENCY_CATALOG;
  readonly statuses = QUESTION_STATUSES.map((id) => ({ id, name: STATUS_NAMES[id] }));

  // The router binds the query parameters: the URL is the only filter state.
  readonly q = input<UrlParam>();
  readonly competency = input<UrlParam>();
  readonly status = input<UrlParam>();
  readonly lib = new LibraryState<QuestionQuery>(() => ({ q: this.q(), competency: this.competency(), status: this.status() }), {
    parse: parseQuestionQuery,
    params: questionQueryParams,
  });
  readonly query = this.lib.query;
  readonly filtered = computed(() => isQuestionQueryFiltered(this.query()));
  /** Statuses read the drafts and the stories, so counts and "No questions match" wait for both. */
  readonly loaded = computed(() => this.drafts.loaded() && this.bank.loaded());

  /** Competencies a story in the bank covers: a story answers its competencies' questions, not one question. */
  readonly covered = computed(
    () =>
      new Set(
        this.bank
          .review()
          .coverage.filter((c) => c.storyIds.length)
          .map((c) => c.competencyId),
      ),
  );
  readonly result = computed(() => {
    const covered = this.covered();
    const statusesOf = (q: QuestionPrompt): QuestionStatus[] => [
      this.drafts.isDrafted(q.id) ? 'drafted' : 'not-drafted',
      ...(covered.has(q.competencyId) ? (['story'] as const) : []),
    ];
    return queryQuestions(this.query(), statusesOf);
  });
  readonly resultLine = computed(() => (this.loaded() ? resultLine(this.result().total, this.total, this.filtered(), 'question') : ''));
  readonly emptyText = computed(() => `No question matches ${matchedWhat(this.query())}.`);

  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('searchField');

  constructor() {
    this.ionViewWillEnter();
  }

  ionViewWillEnter() {
    void this.drafts.load();
    void this.bank.load();
  }

  toggle(facet: QuestionFacet, value: string, count: number): void {
    if (!this.lib.dimmed(facet, value, count)) this.lib.toggle(facet, value);
  }

  clearAll(): void {
    this.lib.clear(EMPTY_QUESTION_QUERY, () => this.searchField()?.nativeElement);
  }
}
