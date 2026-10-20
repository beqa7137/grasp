import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  type ViewContainerRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { SEARCH_KIND_NAMES, didYouMean, groupHits, roundName, searchAll, searchHref, type SearchResult } from '@grasp/engine';
import { uniqueId } from '../core/unique-id';
import { crossState } from '../ui/cross-link.directive';
import { searchIcon } from '../ui/icons';
import { isSearchChord } from './search-keys';
import { searchPageUrl, seeAll } from './search-urls';

/** The palette shows this many results of a kind; "See all" opens the rest on the search page. */
const PER_KIND = 8;

interface Option {
  id: string;
  label: string;
  href: string;
}

interface KindView {
  label: string;
  hits: readonly (SearchResult & { option: Option })[];
  more: Option | null;
}

/**
 * The desktop search palette (REDESIGN.md 2.9): a native modal `<dialog>`, an input that is a combobox over grouped
 * results, and the arrow keys moving the active option. Esc closes it and focus returns to what opened it.
 */
@Component({
  selector: 'app-search-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <dialog #dialog aria-label="Search" tabindex="-1" (close)="closed()" (click)="$event.target === dialog && dialog.close()">
      <div class="field">
        <ion-icon [icon]="searchIcon" aria-hidden="true" />
        <input
          #input
          type="text"
          role="combobox"
          aria-label="Search everything"
          aria-autocomplete="list"
          [attr.aria-expanded]="options().length > 0"
          [attr.aria-controls]="listId"
          [attr.aria-activedescendant]="activeOption()?.id ?? null"
          placeholder="Search problems, patterns, cases, questions…"
          autocomplete="off"
          spellcheck="false"
          enterkeyhint="go"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          (keydown)="key($event)"
        />
        <kbd aria-hidden="true">Esc</kbd>
      </div>
      <div class="results" [id]="listId" role="listbox" aria-label="Results">
        @for (g of view(); track g.round) {
          <p class="round" aria-hidden="true">{{ g.name }}</p>
          @for (k of g.kinds; track k.label) {
            <div role="group" [attr.aria-label]="g.name + ': ' + k.label">
              <p class="kind" aria-hidden="true">{{ k.label }}</p>
              @for (h of k.hits; track h.option.id) {
                <a
                  role="option"
                  class="option"
                  tabindex="-1"
                  [href]="h.option.href"
                  [id]="h.option.id"
                  [attr.aria-selected]="activeOption()?.id === h.option.id"
                  (mousemove)="hover(h.option)"
                  (click)="open(h.option, $event)"
                >
                  <span class="title">{{ h.title }}</span>
                  @if (h.meta) {
                    <span class="meta">{{ h.meta }}</span>
                  }
                </a>
              }
              @if (k.more; as more) {
                <a
                  role="option"
                  class="option more"
                  tabindex="-1"
                  [href]="more.href"
                  [id]="more.id"
                  [attr.aria-selected]="activeOption()?.id === more.id"
                  (mousemove)="hover(more)"
                  (click)="open(more, $event)"
                >
                  {{ more.label }}
                </a>
              }
            </div>
          }
        }
      </div>
      @if (!words()) {
        <p class="note">
          Type to search patterns, problems, visualizers, topics, missions, cases, competencies, questions and mock rounds.
        </p>
      } @else if (!options().length) {
        <p class="note">
          Nothing matches “{{ query().trim() }}”.
          @if (suggestion(); as s) {
            Did you mean <button type="button" class="suggest" (click)="suggest(s)">{{ s }}</button>?
          }
        </p>
      }
      <p class="visually-hidden" role="status">{{ status() }}</p>
    </dialog>
  `,
  styles: `
    @use '../../type' as *;

    dialog {
      width: min(640px, calc(100vw - 2 * var(--g-space-4)));
      max-height: min(70vh, 640px);
      margin: 12vh auto auto;
      padding: 0;
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--g-line-strong);
      border-radius: var(--g-radius-md);
      background: var(--g-raised);
      color: var(--g-text);
      box-shadow: var(--g-shadow-overlay);
      &[open] {
        display: flex;
      }
      &::backdrop {
        background: var(--g-scrim);
      }
    }
    .field {
      display: flex;
      align-items: center;
      gap: var(--g-space-3);
      padding: var(--g-space-3) var(--g-space-4);
      border-bottom: 1px solid var(--g-line);
      ion-icon {
        flex: none;
        color: var(--g-muted);
        font-size: var(--g-text-title-l);
      }
      input {
        flex: 1;
        min-width: 0;
        min-height: 40px;
        border: 0;
        padding: 0;
        background: none;
        color: var(--g-text);
        font: inherit;
        font-size: var(--g-text-body-l);
        outline: none;
      }
      kbd {
        font: inherit;
        font-size: var(--g-text-label);
        color: var(--g-muted);
      }
    }
    .field:focus-within {
      box-shadow: inset 0 -2px 0 var(--g-accent);
    }
    .results {
      overflow-y: auto;
      padding: 0 var(--g-space-2) var(--g-space-2);
      &:empty {
        display: none;
      }
    }
    .round {
      @include label;
      margin: var(--g-space-3) var(--g-space-2) 0;
      color: var(--g-text);
    }
    .kind {
      margin: var(--g-space-2) var(--g-space-2) var(--g-space-1);
      font-size: var(--g-text-label);
      color: var(--g-muted);
    }
    .option {
      color: inherit;
      text-decoration: none;
      display: flex;
      align-items: baseline;
      gap: var(--g-space-3);
      min-height: 40px;
      padding: var(--g-space-2);
      border-radius: var(--g-radius-sm);
      cursor: pointer;
      &[aria-selected='true'] {
        background: var(--g-accent-soft);
        // Muted ink falls under 4.5:1 on the dark theme's tinted row.
        .meta {
          color: var(--g-text);
        }
      }
    }
    .title {
      flex: none;
      max-width: 70%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }
    .meta {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--g-muted);
      font-size: var(--g-text-body-s);
    }
    .more {
      color: var(--g-accent);
      font-size: var(--g-text-body-s);
      font-weight: 500;
    }
    .note {
      margin: 0;
      padding: var(--g-space-4);
      color: var(--g-muted);
      font-size: var(--g-text-body-s);
    }
    .suggest {
      padding: 0;
      border: 0;
      background: none;
      color: var(--g-accent);
      font: inherit;
      font-weight: 600;
      text-decoration: underline;
      cursor: pointer;
    }
  `,
})
export class SearchPaletteComponent {
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private launcher: HTMLElement | null = null;
  /** Called after a result opens, with the launcher, so the page it opened takes focus from there. */
  opened: (launcher: HTMLElement | null) => void = () => undefined;

  readonly searchIcon = searchIcon;
  readonly listId = uniqueId('search-results');
  readonly query = signal('');
  readonly words = computed(() => this.query().trim().length > 0);
  private readonly results = computed(() => searchAll(this.query()));
  readonly suggestion = computed(() => (this.words() && !this.results().length ? didYouMean(this.query()) : null));

  readonly view = computed(() => {
    const q = this.query().trim();
    let n = 0;
    const option = (label: string, href: string): Option => ({ id: `${this.listId}-${n++}`, label, href });
    return groupHits(this.results(), PER_KIND).map((g) => ({
      round: g.round,
      name: roundName(g.round),
      kinds: g.kinds.map((k): KindView => ({
        label: SEARCH_KIND_NAMES[k.kind][1],
        hits: k.hits.map((h) => ({ ...h, option: option(h.title, searchHref(h)) })),
        more: k.total > k.hits.length ? option(seeAll(k.kind, k.total), searchPageUrl(q, k.kind)) : null,
      })),
    }));
  });
  readonly options = computed(() =>
    this.view().flatMap((g) => g.kinds.flatMap((k) => [...k.hits.map((h) => h.option), ...(k.more ? [k.more] : [])])),
  );
  /** The active option's index: the top hit whenever the results change. */
  private readonly active = linkedSignal({ source: this.options, computation: () => 0 });
  readonly activeOption = computed(() => this.options()[this.active()] ?? null);
  readonly status = computed(() => {
    if (!this.words()) return '';
    const n = this.results().length;
    return n ? `${n} ${n === 1 ? 'result' : 'results'}` : 'No results';
  });

  constructor() {
    effect(() => {
      const id = this.activeOption()?.id;
      if (id) untracked(() => this.dialog().nativeElement.querySelector(`#${id}`)?.scrollIntoView({ block: 'nearest' }));
    });
  }

  /**
   * Opens the palette over the page; focus returns to `launcher` when it closes. `typed` is what was typed while it loaded;
   * without it the last query stays, selected, and the top hit is active again.
   */
  show(launcher: HTMLElement | null, typed = ''): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) return;
    this.launcher = launcher;
    if (typed) this.query.set(typed);
    this.active.set(0);
    dialog.showModal();
    const input = this.input().nativeElement;
    input.focus();
    if (!typed) input.select();
  }

  closed(): void {
    const launcher = this.launcher;
    this.launcher = null;
    if (launcher?.isConnected) launcher.focus();
  }

  hover(option: Option): void {
    this.active.set(this.options().indexOf(option));
  }

  key(e: KeyboardEvent): void {
    // An input method composing a word uses these keys itself.
    if (e.isComposing || e.keyCode === 229) return;
    const count = this.options().length;
    if (isSearchChord(e)) {
      e.preventDefault();
      this.dialog().nativeElement.close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (count) this.active.set((this.active() + (e.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = this.activeOption();
      if (option) this.open(option);
    }
  }

  suggest(title: string): void {
    this.query.set(title);
    this.input().nativeElement.focus();
  }

  /**
   * Opens a result. A modified click is the browser's (a new tab). Focus goes to the page it opens rather than staying on the
   * launcher, unless the result is the page already shown.
   */
  open(option: Option, click?: MouseEvent): void {
    if (click && (click.ctrlKey || click.metaKey || click.shiftKey || click.altKey)) return;
    click?.preventDefault();
    const launcher = this.launcher;
    this.launcher = null;
    this.dialog().nativeElement.close();
    void this.router.navigateByUrl(option.href, { state: crossState(this.router, option.href) }).then((done) => {
      if (done) this.opened(launcher);
      else launcher?.focus();
    });
  }
}

/** Opens the palette over the page, focus returning to `launcher` when it closes; `typed` starts its query. */
export type ShowPalette = (launcher: HTMLElement | null, typed?: string) => void;

/** Builds the palette in `host`, once; `opened` runs after a result has opened its page, with the launcher it left. */
export function attachPalette(host: ViewContainerRef, opened: (launcher: HTMLElement | null) => void): ShowPalette {
  const palette = host.createComponent(SearchPaletteComponent).instance;
  palette.opened = opened;
  return (launcher, typed) => palette.show(launcher, typed);
}
