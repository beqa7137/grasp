import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CODING_CATALOG,
  DIFFICULTIES,
  LEVEL_PROFILES,
  PATTERN_CATALOG,
  PATTERN_TRACKS,
  PROBLEM_STATES,
  SENIORITY_LEVELS,
  byDifficulty,
  currentPattern,
  currentTarget,
  isFiltered,
  libraryQueryParams,
  librarySummary,
  meetsBar,
  parseLibraryQuery,
  problemState,
  queryLibrary,
  type CodingProblemSummary,
  type Difficulty,
  type LibraryQuery,
  type ListFacet,
  type ProblemState,
} from '@grasp/engine';
import { IonIcon } from '@ionic/angular';
import { refocusAfterRender } from '../../core/focus';
import { ProgressService } from '../../core/progress.service';
import { CheckComponent } from '../../ui/check.component';
import { ChipComponent } from '../../ui/chip.component';
import { EmptyStateComponent } from '../../ui/empty-state.component';
import { EntryRowComponent, type EntryStatus } from '../../ui/entry-row.component';
import { FilterBarComponent } from '../../ui/filter-bar.component';
import { closeIcon, doneStateIcon, expandIcon, notStartedStateIcon, timeIcon } from '../../ui/icons';
import { type KeptSegment } from '../hub/segment-memory';
import { LibraryPrefsService, type LibraryView } from './library-prefs.service';

const STATUS: Record<ProblemState, EntryStatus & { name: string }> = {
  unsolved: { name: 'Unsolved', label: 'Unsolved', icon: notStartedStateIcon },
  attempted: { name: 'Attempted', label: 'Attempted', icon: timeIcon },
  solved: { name: 'Solved', label: 'Solved', icon: doneStateIcon, tone: 'success' },
};
const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const PATTERN_NAMES = new Map<string, string>(PATTERN_CATALOG.map((p) => [p.id, p.name]));
/** Typing writes the URL this long after the last key (REDESIGN.md 2.5). */
const TYPING_MS = 150;

/**
 * The Problem library (REDESIGN.md 4.2): the 164 problems grouped by pattern or mixed, filtered by status, difficulty,
 * track, pattern and a search. The URL is the only filter state and is replaced, never pushed, so back leaves the page and
 * a bare `/coding/problems` is always the whole library. Pattern names stay off the Mixed view's rows (2.9's spoiler rule).
 */
@Component({
  selector: 'app-problem-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    IonIcon,
    CheckComponent,
    ChipComponent,
    EmptyStateComponent,
    EntryRowComponent,
    FilterBarComponent,
  ],
  templateUrl: './problem-library.page.html',
  styleUrl: './problem-library.page.scss',
})
export class ProblemLibraryPage implements KeptSegment {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly progress = inject(ProgressService);
  readonly prefs = inject(LibraryPrefsService);

  readonly icons = { close: closeIcon, expand: expandIcon };
  readonly tracks = PATTERN_TRACKS.map((t) => ({ ...t, patterns: PATTERN_CATALOG.filter((p) => p.track === t.id) }));
  readonly statuses = PROBLEM_STATES.map((id) => ({ id, name: STATUS[id].name }));
  readonly difficulties = DIFFICULTIES.map((id) => ({ id, name: DIFFICULTY_NAMES[id] }));
  readonly views: { value: LibraryView; label: string }[] = [
    { value: 'pattern', label: 'By pattern' },
    { value: 'mixed', label: 'Mixed' },
  ];

  // The router binds the query parameters (REDESIGN.md 2.5: the URL is the only filter state).
  readonly q = input<string>();
  readonly status = input<string>();
  readonly difficulty = input<string>();
  readonly track = input<string>();
  readonly pattern = input<string>();
  readonly query = computed(
    () =>
      parseLibraryQuery({
        q: this.q(),
        status: this.status(),
        difficulty: this.difficulty(),
        track: this.track(),
        pattern: this.pattern(),
      }),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );
  readonly filtered = computed(() => isFiltered(this.query()));
  private typing: ReturnType<typeof setTimeout> | undefined;
  /** The field's text: the URL's, except while a typed change waits to be written. */
  readonly search = linkedSignal<string, string>({
    source: () => this.query().q,
    computation: (q, previous) => (this.typing !== undefined && previous ? previous.value : q),
  });

  private readonly coding = computed(() => this.progress.state().coding);
  readonly result = computed(() => queryLibrary(this.query(), this.coding()));
  readonly summary = computed(() => {
    const s = librarySummary(this.coding());
    const parts = DIFFICULTIES.map((d) => `${DIFFICULTY_NAMES[d]} ${s.byDifficulty[d].solved}/${s.byDifficulty[d].total}`);
    return [`${s.solved} of ${s.total} solved`, ...parts].join(' · ');
  });
  readonly resultLine = computed(() => {
    const n = this.result().problems.length;
    const noun = n === 1 ? 'problem' : 'problems';
    return this.filtered() ? `${n} ${noun} of ${this.catalogSize}` : `${n} ${noun}`;
  });
  readonly showLabel = computed(() => {
    const n = this.result().problems.length;
    return n ? `Show ${n} ${n === 1 ? 'problem' : 'problems'}` : 'No problems match';
  });
  /** Filters set in the sheet; the Track chips and the search sit outside it. */
  readonly sheetActive = computed(() => this.query().status.length + this.query().difficulty.length + this.query().pattern.length);
  readonly chips = computed(() => {
    const q = this.query();
    return [
      ...q.status.map((v) => ({ facet: 'status' as const, value: v, label: STATUS[v].name })),
      ...q.difficulty.map((v) => ({ facet: 'difficulty' as const, value: v, label: DIFFICULTY_NAMES[v] })),
      ...q.pattern.map((v) => ({ facet: 'pattern' as const, value: v, label: PATTERN_NAMES.get(v) ?? v })),
    ];
  });

  readonly level = computed(() => {
    const level = currentTarget(this.progress.state()).target.level;
    const bar = LEVEL_PROFILES[level].bar;
    return {
      name: SENIORITY_LEVELS.find((l) => l.level === level)?.label ?? level,
      difficulties: DIFFICULTIES.filter((d) => meetsBar({ difficulty: d }, bar)),
    };
  });
  readonly atLevel = computed(() => {
    const chosen = this.query().difficulty;
    const wanted = this.level().difficulties;
    return chosen.length === wanted.length && wanted.every((d) => chosen.includes(d));
  });
  readonly levelHint = computed(() => {
    const { difficulties, name } = this.level();
    return `${difficulties.map((d) => DIFFICULTY_NAMES[d]).join(' and ')} at ${name}`;
  });

  readonly mixed = computed(() => byDifficulty(this.result().problems));
  /**
   * In the Mixed view without pattern tags, Track and Pattern counts would name a searched problem's pattern ("Binary
   * Search 1"), so they are not shown (REDESIGN.md 2.9's spoiler rule).
   */
  readonly hidePatternCounts = computed(() => this.prefs.view() === 'mixed' && !this.prefs.showTags());
  readonly emptyText = computed(() => {
    const { q, ...facets } = this.query();
    const filtered = Object.values(facets).some((values) => values.length);
    const what = q ? `"${q}"${filtered ? ' with these filters' : ''}` : 'these filters';
    return `Nothing in the library matches ${what}.`;
  });
  readonly tracksOverflow = signal({ start: false, end: false });
  private readonly current = computed(() => currentPattern(this.coding(), this.progress.state().placement));
  /** Groups the learner opened or closed, against where each starts: all open when filtered, else only the current pattern. */
  private readonly toggled = linkedSignal<LibraryQuery, ReadonlySet<string>>({ source: this.query, computation: () => new Set() });

  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('searchField');
  private readonly chipRow = viewChild<ElementRef<HTMLElement>>('chipRow');
  private readonly trackRow = viewChild.required<ElementRef<HTMLElement>>('trackRow');
  readonly catalogSize = CODING_CATALOG.length;

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.typing));
    // On a phone the tracks scroll in one line; a chosen track that starts past its edge is brought into it.
    afterNextRender(() => {
      const row = this.trackRow().nativeElement;
      const chosen = row.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (chosen && chosen.offsetLeft + chosen.offsetWidth > row.clientWidth) row.scrollLeft = chosen.offsetLeft;
      this.measureTracks();
      const resize = new ResizeObserver(() => this.measureTracks());
      resize.observe(row);
      this.destroyRef.onDestroy(() => resize.disconnect());
    });
  }

  /** Which edges of the Track row have chips past them, so those edges fade to say there is more. */
  measureTracks(): void {
    const row = this.trackRow().nativeElement;
    this.tracksOverflow.set({ start: row.scrollLeft > 1, end: row.scrollLeft + row.clientWidth < row.scrollWidth - 1 });
  }

  /** The hub keeps the groups the learner opened or closed while a page is open above it. */
  keepState(): ReadonlySet<string> {
    return this.toggled();
  }

  restoreState(state: unknown): void {
    if (state instanceof Set) this.toggled.set(state);
  }

  isOpen(patternId: string): boolean {
    const startsOpen = this.filtered() || patternId === this.current();
    return this.toggled().has(patternId) ? !startsOpen : startsOpen;
  }

  toggleGroup(patternId: string): void {
    this.toggled.update((set) => {
      const next = new Set(set);
      if (!next.delete(patternId)) next.add(patternId);
      return next;
    });
  }

  rowStatus(p: CodingProblemSummary): EntryStatus {
    return STATUS[problemState(this.coding()[p.id])];
  }

  difficultyRank(p: CodingProblemSummary): number {
    return DIFFICULTIES.indexOf(p.difficulty) + 1;
  }

  difficultyName(p: CodingProblemSummary): string {
    return DIFFICULTY_NAMES[p.difficulty];
  }

  best(p: CodingProblemSummary): string[] {
    const record = this.coding()[p.id];
    return record && !record.solvedAt ? [`best ${record.bestPassed}/${record.total}`] : [];
  }

  /** In a pattern's group, the problem's other patterns: the group already names this one. */
  alsoIn(p: CodingProblemSummary, groupPattern: string): string[] {
    const others = p.patternIds.filter((id) => id !== groupPattern).map((id) => PATTERN_NAMES.get(id) ?? id);
    return others.length ? [`also in ${others.join(', ')}`] : [];
  }

  /** The Mixed view names patterns only after a solve, or when the learner turned the tags on. */
  tags(p: CodingProblemSummary): string[] {
    const shown = this.prefs.showTags() || Boolean(this.coding()[p.id]?.solvedAt);
    return shown ? [p.patternIds.map((id) => PATTERN_NAMES.get(id) ?? id).join(', ')] : [];
  }

  isOn(facet: ListFacet, value: string): boolean {
    return (this.query()[facet] as readonly string[]).includes(value);
  }

  /**
   * A chip that would leave nothing to show is dimmed and does nothing, unless it is on (it stays removable) or its count is
   * hidden by the spoiler rule (dimming would reveal the same thing).
   */
  dimmed(facet: ListFacet, value: string, count: number): 'true' | null {
    if (count || this.isOn(facet, value)) return null;
    return (facet === 'track' || facet === 'pattern') && this.hidePatternCounts() ? null : 'true';
  }

  toggle(facet: ListFacet, value: string, count?: number): void {
    if (count !== undefined && this.dimmed(facet, value, count)) return;
    const values = this.query()[facet] as readonly string[];
    this.write({ [facet]: values.includes(value) ? values.filter((v) => v !== value) : [...values, value] });
  }

  toggleLevel(): void {
    this.write({ difficulty: this.atLevel() ? [] : this.level().difficulties });
  }

  remove(facet: ListFacet, value: string, index: number): void {
    this.toggle(facet, value);
    // The chip goes with its filter; focus moves to the chip that takes its place, or the search field after the last one.
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
    this.write({ q: '', status: [], difficulty: [], track: [], pattern: [] });
    refocusAfterRender(this.injector, () => this.searchField()?.nativeElement, this.chipRow()?.nativeElement);
  }

  resetSheet(): void {
    this.write({ status: [], difficulty: [], pattern: [] });
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

  pickRandom(): void {
    const all = this.result().problems;
    const open = all.filter((p) => !this.coding()[p.id]?.solvedAt);
    const pool = open.length ? open : all;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) void this.router.navigate(['/coding/problems', pick.id]);
  }

  private write(change: Partial<LibraryQuery>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: libraryQueryParams({ ...this.query(), ...change }),
      replaceUrl: true,
    });
  }
}
