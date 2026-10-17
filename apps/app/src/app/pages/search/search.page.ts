import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import {
  SEARCH_KINDS,
  SEARCH_KIND_NAMES,
  didYouMean,
  groupHits,
  parseSearchQuery,
  roundName,
  searchAll,
  searchHref,
  searchQueryParams,
  type SearchQuery,
  type SearchRow,
} from '@grasp/engine';
import { LibraryState, type UrlParam } from '../../core/library-state';
import { seeAll } from '../../search/search-urls';
import { BackComponent } from '../../ui/back.component';
import { ChipComponent } from '../../ui/chip.component';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { EmptyStateComponent } from '../../ui/empty-state.component';
import { EntryRowComponent } from '../../ui/entry-row.component';
import { searchIcon } from '../../ui/icons';
import { StoryBankService } from '../behavioral/story-bank.service';

/** Without a kind chosen, each kind shows this many; "See all" chooses it. */
const PER_KIND = 8;

/**
 * Search results (REDESIGN.md 4.10): the palette's grouped list as a page, which is how phones search. Kind chips and "See
 * all" narrow it to kinds, and the learner's stories, searched on this device, are a group of their own. The URL is its only
 * state (`?q=rate&kind=case`), replaced and never pushed.
 */
@Component({
  selector: 'app-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CrossLinkDirective,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    BackComponent,
    ChipComponent,
    EmptyStateComponent,
    EntryRowComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><app-back href="/today" /></ion-buttons>
        <ion-title>Search</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <h1>Search</h1>
        <form class="search" role="search" (submit)="lib.submit($event)">
          <label class="visually-hidden" for="everything-search">Search everything</label>
          <input
            #searchField
            id="everything-search"
            type="search"
            placeholder="Problems, patterns, cases, questions…"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="search"
            [value]="lib.search()"
            (input)="lib.type($any($event.target).value)"
          />
        </form>

        @if (query().q) {
          @if (counts().length) {
            <div class="kinds" role="group" aria-label="Show only">
              @for (c of counts(); track c.kind) {
                <button type="button" g-chip [attr.aria-pressed]="lib.isOn('kind', c.kind)" (click)="lib.toggle('kind', c.kind)">
                  {{ c.name }} <span class="count">{{ c.total }}</span>
                </button>
              }
            </div>
          }
          <p class="line" role="status">{{ resultLine() }}</p>
          @for (g of groups(); track g.round) {
            <section class="round" [attr.aria-labelledby]="'search-round-' + g.round">
              <h2 [id]="'search-round-' + g.round">{{ g.name }}</h2>
              @for (k of g.kinds; track k.kind) {
                <h3>{{ k.name }}</h3>
                <ul class="rows">
                  @for (h of k.hits; track h.id) {
                    <li>
                      <a g-entry-row [heading]="h.title" [meta]="h.meta ? [h.meta] : []" [routerLink]="h.link" crossLink></a>
                    </li>
                  }
                </ul>
                @if (k.total > k.hits.length) {
                  <button type="button" class="g-btn ghost all" (click)="lib.write({ kind: [k.kind] })">{{ k.all }}</button>
                }
              }
            </section>
          } @empty {
            <g-empty-state class="empty" [icon]="searchIcon" [heading]="'Nothing matches “' + query().q + '”'">
              @if (suggestion(); as s) {
                Did you mean {{ s }}?
              } @else {
                Try a pattern, a problem, a system or a competency.
              }
              @if (suggestion(); as s) {
                <button action type="button" class="g-btn" (click)="lib.write({ q: s, kind: [] })">Search for {{ s }}</button>
              }
            </g-empty-state>
          }
        } @else {
          <p class="muted hint">Search patterns, problems, visualizers, topics, missions, cases, competencies, questions, mock rounds and your stories.</p>
        }
      </div>
    </ion-content>
  `,
  styles: `
    @use '../../../search' as *;
    @use '../../../type' as *;

    h1 {
      margin: var(--g-space-1) 0 var(--g-space-3);
      font-size: var(--g-text-display-l);
    }
    .search {
      margin-bottom: var(--g-space-3);
      @include search-field;
    }
    .kinds {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-2);
      margin-bottom: var(--g-space-2);
    }
    .count {
      color: var(--g-muted);
      font-variant-numeric: tabular-nums;
    }
    .line {
      margin: 0 0 var(--g-space-3);
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
    .round + .round {
      margin-top: var(--g-space-6);
    }
    h2 {
      @include title;
      margin: 0 0 var(--g-space-2);
      font-size: var(--g-text-title-l);
    }
    h3 {
      @include label;
      margin: var(--g-space-4) 0 var(--g-space-2);
      color: var(--g-muted);
    }
    .rows {
      display: grid;
      gap: var(--g-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .rows ::ng-deep .title {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }
    .all {
      margin-top: var(--g-space-2);
    }
    .empty {
      margin-top: var(--g-space-6);
    }
    .hint {
      margin: 0;
    }
  `,
})
export class SearchPage {
  private readonly router = inject(Router);
  private readonly bank = inject(StoryBankService);
  readonly searchIcon = searchIcon;

  // The router binds the query parameters: the URL is the only state.
  readonly q = input<UrlParam>();
  readonly kind = input<UrlParam>();
  readonly lib = new LibraryState<SearchQuery>(() => ({ q: this.q(), kind: this.kind() }), {
    parse: parseSearchQuery,
    params: searchQueryParams,
  });
  readonly query = this.lib.query;

  private readonly stories = computed<SearchRow[]>(() => this.bank.stories().map((s) => [s.id, s.title.trim() || 'Untitled story', '']));
  private readonly hits = computed(() => searchAll(this.query().q, this.stories()));
  readonly suggestion = computed(() => (this.hits().length ? null : didYouMean(this.query().q)));

  /** Each kind found, in index order, with its count: the chips. */
  readonly counts = computed(() =>
    SEARCH_KINDS.flatMap((kind) => {
      const total = this.hits().filter((h) => h.kind === kind).length;
      return total ? [{ kind, total, name: SEARCH_KIND_NAMES[kind][1] }] : [];
    }),
  );

  readonly groups = computed(() => {
    const chosen = this.query().kind;
    const shown = chosen.length ? this.hits().filter((h) => chosen.includes(h.kind)) : this.hits();
    return groupHits(shown, chosen.length ? Infinity : PER_KIND).map((g) => ({
      round: g.round,
      name: roundName(g.round),
      kinds: g.kinds.map((k) => ({
        kind: k.kind,
        name: SEARCH_KIND_NAMES[k.kind][1],
        total: k.total,
        all: seeAll(k.kind, k.total),
        hits: k.hits.map((h) => ({ ...h, link: this.router.parseUrl(searchHref(h)) })),
      })),
    }));
  });

  readonly resultLine = computed(() => {
    const n = this.hits().length;
    const chosen = this.query().kind;
    const shown = chosen.length ? this.hits().filter((h) => chosen.includes(h.kind)).length : n;
    const counted = `${n} ${n === 1 ? 'result' : 'results'}`;
    return chosen.length ? `${shown} of ${counted}` : counted;
  });

  private readonly searchField = viewChild.required<ElementRef<HTMLInputElement>>('searchField');

  constructor() {
    void this.bank.load();
  }

  /** Opened to search, so the field takes focus, as the palette's does; a page with results keeps focus where it was. */
  ionViewDidEnter() {
    void this.bank.load();
    if (!this.query().q) this.searchField().nativeElement.focus();
  }
}
