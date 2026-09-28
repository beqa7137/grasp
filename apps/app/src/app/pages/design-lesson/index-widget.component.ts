import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { invertedIndex, searchIndex, searchTokens } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const DOCS = [
  'Postgres is a relational database',
  'Redis is a fast in-memory database',
  'Kafka is a fast distributed log',
  'Elasticsearch builds an inverted index for fast search',
  'Cassandra is a distributed database built on LSM trees',
];
const MODES = [
  { mode: 'and', label: 'All words (AND)' },
  { mode: 'or', label: 'Any word (OR)' },
] as const;
type Mode = (typeof MODES)[number]['mode'];

/** Five documents behind an inverted index: type a query and see each term's posting list and the ranked matches. */
@Component({
  selector: 'app-index-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <ol class="docs">
      @for (d of docs; track $index) {
        <li [class.hit]="scores().has($index)">
          <span class="mono num">{{ $index + 1 }}</span
          >{{ d }}
        </li>
      }
    </ol>
    <label class="query">
      <span class="muted">Query</span>
      <input type="search" [value]="query()" (input)="query.set($any($event.target).value)" autocomplete="off" spellcheck="false" />
    </label>
    <div class="controls" role="radiogroup" aria-label="Match">
      @for (m of modes; track m.mode) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="mode() === m.mode"
          [class.primary]="mode() === m.mode"
          (click)="mode.set(m.mode)"
        >
          {{ m.label }}
        </button>
      }
    </div>

    <h3 class="sub">Posting lists</h3>
    @if (postings().length) {
      <dl class="postings">
        @for (p of postings(); track p.term) {
          <div>
            <dt class="mono">{{ p.term }}</dt>
            <dd class="mono">{{ p.docs.length ? p.docs.join(', ') : 'no documents' }}</dd>
          </div>
        }
      </dl>
    } @else {
      <p class="muted note">Type a word to look it up.</p>
    }

    <h3 class="sub">Ranked results</h3>
    <ol class="results" aria-live="polite">
      @for (h of hits(); track h.doc) {
        <li>
          <span class="mono num">{{ h.doc + 1 }}</span
          ><span class="text">{{ docs[h.doc] }}</span
          ><span class="mono score">{{ h.score | number: '1.2-2' }}</span>
        </li>
      } @empty {
        <li class="muted none">No document matches.</li>
      }
    </ol>
  `,
  styleUrl: './widget.scss',
  styles: `
    .docs,
    .results {
      list-style: none;
      margin: 0 0 12px;
      padding: 0;
      display: grid;
      gap: 4px;
      font-size: 0.875rem;
    }
    .docs li,
    .results li {
      display: flex;
      gap: 10px;
      align-items: baseline;
      padding: 6px 10px;
      border-radius: var(--g-radius-sm);
      background: var(--g-raised);
    }
    .docs li.hit {
      background: var(--g-accent-soft);
    }
    .num {
      color: var(--g-muted);
      font-size: 0.75rem;
    }
    .results .text {
      flex: 1;
    }
    .score {
      font-weight: 600;
    }
    .results .none {
      background: none;
      padding-left: 0;
    }
    .query {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 10px;
      font-size: 0.875rem;
      input {
        font: 500 1rem var(--g-font-mono);
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--g-line-strong);
        background: var(--g-surface);
        color: var(--g-text);
      }
    }
    .sub {
      margin: 12px 0 6px;
      font-size: 0.9375rem;
    }
    .postings {
      display: grid;
      gap: 4px;
      margin: 0;
      div {
        display: flex;
        gap: 10px;
        font-size: 0.875rem;
      }
      dt {
        min-width: 7em;
        font-weight: 600;
      }
      dd {
        margin: 0;
        color: var(--g-muted);
      }
    }
    .note {
      font-size: 0.8125rem;
      margin: 0;
    }
  `,
})
export class IndexWidgetComponent {
  readonly docs = DOCS;
  readonly modes = MODES;
  readonly query = signal('fast database');
  readonly mode = signal<Mode>('and');
  private readonly index = invertedIndex(DOCS);
  readonly postings = computed(() => {
    const terms = [...new Set(searchTokens(this.query()))];
    return terms.map((term) => ({ term, docs: (this.index.get(term) ?? []).map((d) => d + 1) }));
  });
  readonly hits = computed(() => searchIndex(DOCS, this.query(), this.mode()));
  readonly scores = computed(() => new Set(this.hits().map((h) => h.doc)));
}
