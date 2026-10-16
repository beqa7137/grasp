import { DestroyRef, Injector, computed, inject, linkedSignal, type Signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { UrlParams } from '@grasp/engine';
import { refocusAfterRender, type FocusPlaces } from './focus';

/** Typing writes the URL this long after the last key (REDESIGN.md 2.5). */
const TYPING_MS = 150;

/** A query parameter as the router binds it to an input: a key given more than once is a list. */
export type UrlParam = string | string[];

/** How a library reads its query from the URL and writes it back; `params` gives null for an empty filter. */
export interface LibraryCodec<Q extends { q: string }> {
  parse(params: UrlParams): Q;
  params(query: Q): Readonly<Record<string, string | null>>;
}

/** The facets of a query: every list field. */
export type FacetOf<Q> = { [K in keyof Q]: Q[K] extends readonly string[] ? K : never }[keyof Q];

/**
 * A library's filters with the URL as their only state (REDESIGN.md 2.5), shared by the problem, case and question
 * libraries: the query read from the router's parameters, a search field that writes after typing pauses, and changes
 * that replace the URL, never push it. Create it in a component's injection context.
 */
export class LibraryState<Q extends { q: string }> {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private typing: ReturnType<typeof setTimeout> | undefined;
  readonly query: Signal<Q>;
  /** The field's text: the URL's, except while a typed change waits to be written. */
  readonly search;

  constructor(
    params: () => UrlParams,
    private readonly codec: LibraryCodec<Q>,
  ) {
    this.query = computed(() => codec.parse(params()), { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) });
    this.search = linkedSignal<string, string>({
      source: () => this.query().q,
      computation: (q, previous) => (this.typing !== undefined && previous ? previous.value : q),
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.typing));
  }

  isOn(facet: FacetOf<Q>, value: string): boolean {
    return (this.query()[facet] as readonly string[]).includes(value);
  }

  /** A chip that would leave nothing to show is dimmed and does nothing, unless it is on. */
  dimmed(facet: FacetOf<Q>, value: string, count: number): 'true' | null {
    return count || this.isOn(facet, value) ? null : 'true';
  }

  toggle(facet: FacetOf<Q>, value: string): void {
    const values = this.query()[facet] as readonly string[];
    this.write({ [facet]: values.includes(value) ? values.filter((v) => v !== value) : [...values, value] } as Partial<Q>);
  }

  /** Clears the query to `empty` and gives the search field focus if the control that had it went away. */
  clear(empty: Partial<Q>, field: () => HTMLElement | undefined, within?: FocusPlaces): void {
    this.stopTyping();
    this.write(empty);
    refocusAfterRender(this.injector, field, within);
  }

  type(text: string): void {
    this.search.set(text);
    clearTimeout(this.typing);
    this.typing = setTimeout(() => {
      this.typing = undefined;
      this.write({ q: text } as Partial<Q>);
    }, TYPING_MS);
  }

  submit(e: Event): void {
    e.preventDefault();
    this.stopTyping();
    this.write({ q: this.search() } as Partial<Q>);
  }

  write(change: Partial<Q>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.codec.params({ ...this.query(), ...change }),
      replaceUrl: true,
    });
  }

  private stopTyping(): void {
    clearTimeout(this.typing);
    this.typing = undefined;
  }
}

/** "51 problems of 164" while filtered, else "164 problems". */
export function resultLine(n: number, total: number, filtered: boolean, noun: string, nouns = `${noun}s`): string {
  const counted = `${n} ${n === 1 ? noun : nouns}`;
  return filtered ? `${counted} of ${total}` : counted;
}

/** What an empty result says it looked for: the search, the filters, or both. */
export function matchedWhat(query: { q: string }): string {
  const { q, ...facets } = query;
  const filtered = Object.values(facets).some((values) => (values as readonly string[]).length);
  return q ? `"${q}"${filtered ? ' with these filters' : ''}` : 'these filters';
}
