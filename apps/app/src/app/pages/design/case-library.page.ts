import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  computed,
  inject,
  input,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CASE_CATALOG,
  CASE_LEVELS,
  CASE_STATES,
  SD_SHELVES,
  caseQueryParams,
  getCaseBrief,
  getSdTopic,
  isCaseQueryFiltered,
  parseCaseQuery,
  queryCases,
  sdTopicShelf,
  topicUses,
  type CaseFacet,
  type CaseQuery,
  type CaseState,
  type CaseSummary,
} from '@grasp/engine';
import { IonIcon } from '@ionic/angular';
import { refocusAfterRender } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import { ChipComponent } from '../../ui/chip.component';
import { EmptyStateComponent } from '../../ui/empty-state.component';
import { FilterBarComponent } from '../../ui/filter-bar.component';
import { closeIcon } from '../../ui/icons';
import { CaseDraftsService } from './case/case-drafts.service';

const STATE_NAMES: Record<CaseState, string> = { new: 'Not started', started: 'In progress', finished: 'Finished' };
const LEVEL_NAMES: Record<CaseSummary['level'], string> = { core: 'Core', advanced: 'Advanced' };
const SHELF_NAMES = new Map<string, string>(SD_SHELVES.map((s) => [s.id, s.name]));
const topicName = (id: string) => getSdTopic(id)?.name ?? id;
/** Typing writes the URL this long after the last key, as the problem library does (REDESIGN.md 2.5). */
const TYPING_MS = 150;

/**
 * The Cases library (REDESIGN.md 4.5): the 27 case studies filtered by level, status, shelf and topic, plus a search. As in
 * the problem library the URL is the only filter state and is replaced, never pushed. Each row is one link, so its topics
 * are plain text: nested links break keyboard and screen reader use.
 */
@Component({
  selector: 'app-case-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonIcon, ChipComponent, EmptyStateComponent, FilterBarComponent],
  template: `
    <div class="page library">
      <h1>Cases</h1>
      <p class="summary">{{ summary() }}</p>
      @if (lesson(); as t) {
        <p class="lesson">
          <a [routerLink]="['/design/topics', t.id]">Read the {{ t.name }} lesson →</a>
        </p>
      }

      <div class="levels" role="group" aria-label="Level">
        @for (l of levels; track l.id) {
          @let n = result().counts.level[l.id];
          <button
            type="button"
            g-chip
            [attr.aria-pressed]="isOn('level', l.id)"
            [attr.aria-disabled]="dimmed('level', l.id, n)"
            (click)="toggle('level', l.id, n)"
          >
            {{ l.name }} <span class="count">{{ n }}</span>
          </button>
        }
      </div>

      <g-filter-bar class="bar" [results]="resultLine()" [show]="showLabel()" [active]="sheetActive()" (reset)="resetSheet()">
        <form chips class="search" role="search" (submit)="submitSearch($event)">
          <label class="visually-hidden" for="case-search">Search cases</label>
          <input
            #searchField
            id="case-search"
            type="search"
            placeholder="Search cases"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="search"
            [value]="search()"
            (input)="type($any($event.target).value)"
          />
        </form>
        @if (chips().length || filtered()) {
          <div chips #chipRow class="active">
            @for (c of chips(); track c.facet + c.value; let i = $index) {
              <button type="button" g-chip [attr.aria-label]="'Remove ' + c.label" (click)="remove(c.facet, c.value, i)">
                {{ c.label }}<ion-icon [icon]="icons.close" aria-hidden="true" />
              </button>
            }
            <button type="button" class="g-btn ghost clear" (click)="clearAll()">Clear all</button>
          </div>
        }
        <div class="facets">
          <div class="facet" role="group" aria-labelledby="case-status">
            <h3 id="case-status">Status</h3>
            <div class="options">
              @for (s of statuses; track s.id) {
                @let n = result().counts.status[s.id];
                <button
                  type="button"
                  g-chip
                  [attr.aria-pressed]="isOn('status', s.id)"
                  [attr.aria-disabled]="dimmed('status', s.id, n)"
                  (click)="toggle('status', s.id, n)"
                >
                  {{ s.name }} <span class="count">{{ n }}</span>
                </button>
              }
            </div>
          </div>
          <div class="facet" role="group" aria-labelledby="case-shelf">
            <h3 id="case-shelf">Shelf</h3>
            <div class="options">
              @for (s of shelves; track s.id) {
                @let n = result().counts.shelf[s.id];
                <button
                  type="button"
                  g-chip
                  [attr.aria-pressed]="isOn('shelf', s.id)"
                  [attr.aria-disabled]="dimmed('shelf', s.id, n)"
                  (click)="toggle('shelf', s.id, n)"
                >
                  {{ s.name }} <span class="count">{{ n }}</span>
                </button>
              }
            </div>
          </div>
          <div class="facet" role="group" aria-labelledby="case-topic">
            <h3 id="case-topic">Topic</h3>
            @for (s of shelves; track s.id) {
              @if (s.topics.length) {
                <h4>{{ s.name }}</h4>
                <div class="options">
                  @for (t of s.topics; track t.id) {
                    @let n = result().counts.topic[t.id];
                    <button
                      type="button"
                      g-chip
                      [attr.aria-pressed]="isOn('topic', t.id)"
                      [attr.aria-disabled]="dimmed('topic', t.id, n)"
                      (click)="toggle('topic', t.id, n)"
                    >
                      {{ t.name }} <span class="count">{{ n }}</span>
                    </button>
                  }
                </div>
              }
            }
          </div>
        </div>
      </g-filter-bar>

      @if (!result().cases.length) {
        @if (drafts.loaded()) {
          <g-empty-state class="empty" heading="No cases match">
            {{ emptyText() }}
            <button action type="button" class="g-btn" (click)="clearAll()">Clear all</button>
          </g-empty-state>
        }
      } @else {
        <ul class="rows">
          @for (c of result().cases; track c.id) {
            @let finished = progress.state().cases[c.id];
            @let stage = stageOf(c);
            <li>
              <a class="row" [routerLink]="['/design/cases', c.id]" [class.done]="finished && !stage">
                <h2 class="title">{{ c.title }}</h2>
                <span class="brief">{{ brief(c.id) }}</span>
                <span class="meta">{{ levelName(c) }} · {{ topicNames(c) }}</span>
                @if (stage) {
                  <span class="progress">
                    <span class="track" aria-hidden="true"><i [style.width.%]="(100 * (stage - 1)) / c.stages"></i></span>
                    Stage {{ stage }} of {{ c.stages }}
                  </span>
                } @else if (finished) {
                  <span class="finished">Finished</span>
                }
              </a>
              @if (finished && !stage) {
                <div class="case-done">
                  <span
                    >Decisions as recommended: {{ finished.bestChoices }} of {{ finished.decisions }}. Estimates within 2x:
                    {{ finished.closeEstimates }} of {{ finished.estimates }}.</span
                  >
                  @if (drafts.draft(c.id)) {
                    <span class="actions">
                      <a class="g-btn ghost" [routerLink]="['/design/cases', c.id]" [attr.aria-label]="'Review: ' + c.title">Review</a>
                      <button class="g-btn ghost" (click)="restart(c.id)" [attr.aria-label]="'Start over: ' + c.title">Start over</button>
                    </span>
                  }
                </div>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
  styleUrl: './case-library.page.scss',
})
export class CaseLibraryPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  readonly progress = inject(ProgressService);
  readonly drafts = inject(CaseDraftsService);

  readonly icons = { close: closeIcon };
  readonly levels = CASE_LEVELS.map((id) => ({ id, name: LEVEL_NAMES[id] }));
  readonly statuses = CASE_STATES.map((id) => ({ id, name: STATE_NAMES[id] }));
  readonly shelves = SD_SHELVES.map((s) => ({
    id: s.id,
    name: s.name,
    topics: s.topics.filter((id) => topicUses(id).cases.length).map((id) => ({ id, name: topicName(id) })),
  }));

  // The router binds the query parameters: the URL is the only filter state.
  readonly q = input<string>();
  readonly level = input<string>();
  readonly status = input<string>();
  readonly shelf = input<string>();
  readonly topic = input<string>();
  readonly query = computed(
    () => parseCaseQuery({ q: this.q(), level: this.level(), status: this.status(), shelf: this.shelf(), topic: this.topic() }),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );
  readonly filtered = computed(() => isCaseQueryFiltered(this.query()));
  private typing: ReturnType<typeof setTimeout> | undefined;
  readonly search = linkedSignal<string, string>({
    source: () => this.query().q,
    computation: (q, previous) => (this.typing !== undefined && previous ? previous.value : q),
  });

  /** Each case's place in the library, read once per change of progress or drafts. */
  private readonly states = computed(
    () =>
      new Map<string, CaseState>(
        CASE_CATALOG.map((c) => [c.id, this.stageOf(c) ? 'started' : this.progress.state().cases[c.id] ? 'finished' : 'new']),
      ),
  );
  readonly result = computed(() => {
    const states = this.states();
    return queryCases(this.query(), (id) => states.get(id) ?? 'new');
  });
  readonly summary = computed(() => {
    const finished = [...this.states().values()].filter((state) => state === 'finished').length;
    return `${finished} of ${CASE_CATALOG.length} finished`;
  });
  /** One topic chosen, so its lesson is a line away (REDESIGN.md 4.5). */
  readonly lesson = computed(() => {
    const topics = this.query().topic;
    return topics.length === 1 ? { id: topics[0], name: topicName(topics[0]) } : null;
  });
  readonly resultLine = computed(() => {
    const n = this.result().cases.length;
    const noun = n === 1 ? 'case' : 'cases';
    return this.filtered() ? `${n} ${noun} of ${CASE_CATALOG.length}` : `${n} ${noun}`;
  });
  readonly showLabel = computed(() => {
    const n = this.result().cases.length;
    return n ? `Show ${n} ${n === 1 ? 'case' : 'cases'}` : 'No cases match';
  });
  /** Filters set in the sheet; the Level chips and the search sit outside it. */
  readonly sheetActive = computed(() => this.query().status.length + this.query().shelf.length + this.query().topic.length);
  readonly chips = computed(() => {
    const q = this.query();
    return [
      ...q.status.map((v) => ({ facet: 'status' as const, value: v, label: STATE_NAMES[v] })),
      ...q.shelf.map((v) => ({ facet: 'shelf' as const, value: v, label: SHELF_NAMES.get(v) ?? v })),
      ...q.topic.map((v) => ({ facet: 'topic' as const, value: v, label: topicName(v) })),
    ];
  });
  readonly emptyText = computed(() => {
    const { q, ...facets } = this.query();
    const filtered = Object.values(facets).some((values) => values.length);
    const what = q ? `"${q}"${filtered ? ' with these filters' : ''}` : 'these filters';
    return `No case matches ${what}.`;
  });

  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('searchField');
  private readonly chipRow = viewChild<ElementRef<HTMLElement>>('chipRow');

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.typing));
    void this.drafts.load();
  }

  ionViewWillEnter() {
    void this.drafts.load();
  }

  brief(id: string) {
    return getCaseBrief(id)?.summary;
  }

  levelName(c: CaseSummary) {
    return LEVEL_NAMES[c.level];
  }

  /** The case's topics, its shelf order first, so a row reads from the basics out. */
  topicNames(c: CaseSummary) {
    const order = SD_SHELVES.map((s) => s.id as string);
    return [...c.topics]
      .sort((a, b) => order.indexOf(sdTopicShelf(a) ?? '') - order.indexOf(sdTopicShelf(b) ?? ''))
      .map(topicName)
      .join(', ');
  }

  /** The stage a run on this device has open, or null when there is none or it finished the case. */
  stageOf(c: CaseSummary): number | null {
    const draft = this.drafts.draft(c.id);
    if (!draft || (draft.reached >= c.stages && this.progress.state().cases[c.id])) return null;
    return Math.min(draft.reached + 1, c.stages);
  }

  restart(caseId: string) {
    void this.router.navigate(['/design/cases', caseId], { state: { startOver: true } });
  }

  isOn(facet: CaseFacet, value: string): boolean {
    return (this.query()[facet] as readonly string[]).includes(value);
  }

  /** A chip that would leave nothing to show is dimmed and does nothing, unless it is on. */
  dimmed(facet: CaseFacet, value: string, count: number): 'true' | null {
    return count || this.isOn(facet, value) ? null : 'true';
  }

  toggle(facet: CaseFacet, value: string, count?: number): void {
    if (count !== undefined && this.dimmed(facet, value, count)) return;
    const values = this.query()[facet] as readonly string[];
    this.write({ [facet]: values.includes(value) ? values.filter((v) => v !== value) : [...values, value] });
  }

  remove(facet: CaseFacet, value: string, index: number): void {
    this.toggle(facet, value);
    refocusAfterRender(
      this.injector,
      () => {
        const chips = this.chipRow()?.nativeElement.querySelectorAll<HTMLElement>('button') ?? [];
        return chips[Math.min(index, chips.length - 1)] ?? this.searchField()?.nativeElement;
      },
      this.chipRow()?.nativeElement,
    );
  }

  clearAll(): void {
    clearTimeout(this.typing);
    this.typing = undefined;
    this.write({ q: '', level: [], status: [], shelf: [], topic: [] });
    refocusAfterRender(this.injector, () => this.searchField()?.nativeElement, this.chipRow()?.nativeElement);
  }

  resetSheet(): void {
    this.write({ status: [], shelf: [], topic: [] });
  }

  type(text: string): void {
    this.search.set(text);
    clearTimeout(this.typing);
    this.typing = setTimeout(() => {
      this.typing = undefined;
      this.write({ q: text });
    }, TYPING_MS);
  }

  submitSearch(e: Event): void {
    e.preventDefault();
    clearTimeout(this.typing);
    this.typing = undefined;
    this.write({ q: this.search() });
  }

  private write(change: Partial<CaseQuery>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: caseQueryParams({ ...this.query(), ...change }),
      replaceUrl: true,
    });
  }
}
