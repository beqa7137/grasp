import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { feedCost, type FeedModel } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const MODELS: { model: FeedModel; label: string }[] = [
  { model: 'n-plus-one', label: 'N+1 queries' },
  { model: 'join', label: 'One join' },
  { model: 'denormalized', label: 'Denormalized' },
];
const POSTS_PER_AUTHOR = [10, 100, 500, 5_000, 100_000];
const PAGES = [10, 100, 1_000, 10_000, 100_000];
const RENAMES = [0.01, 0.1, 1, 10, 100];

/** A feed page showing each post's author: what normalizing or copying the name costs on reads and on renames. */
@Component({
  selector: 'app-feed-model-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Model">
      @for (m of models; track m.model) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="model() === m.model"
          [class.primary]="model() === m.model"
          (click)="model.set(m.model)"
        >
          {{ m.label }}
        </button>
      }
    </div>
    <label class="slider">
      <span
        >Posts per page <strong class="mono">{{ pageSize() }}</strong></span
      >
      <input type="range" min="5" max="100" step="5" [value]="pageSize()" (input)="pageSize.set(+$any($event.target).value)" />
    </label>
    @for (row of rows; track row.label) {
      <div class="controls" role="radiogroup" [attr.aria-label]="row.label">
        <span class="muted">{{ row.label }}</span>
        @for (n of row.options; track n) {
          <button
            class="g-btn"
            role="radio"
            [attr.aria-checked]="row.value() === n"
            [class.primary]="row.value() === n"
            (click)="row.value.set(n)"
          >
            {{ n | number: '1.0-2' }}
          </button>
        }
      </div>
    }

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="cost().queriesPerPage > 1">
        <dt>Queries per page</dt>
        <dd class="mono">{{ cost().queriesPerPage }}</dd>
      </div>
      <div>
        <dt>Database wait per page</dt>
        <dd class="mono">{{ cost().waitMs }} ms</dd>
      </div>
      <div>
        <dt>Rows read per page</dt>
        <dd class="mono">{{ cost().rowsReadPerPage | number }}</dd>
      </div>
      <div [class.bad]="cost().rowsPerRename > 1000">
        <dt>Rows written per rename</dt>
        <dd class="mono">{{ cost().rowsPerRename | number }}</dd>
      </div>
      <div>
        <dt>Rows a second, all told</dt>
        <dd class="mono">{{ cost().rowsPerSecond | number: '1.0-0' }}</dd>
      </div>
      <div [class.bad]="cost().staleAfterRename">
        <dt>After a rename</dt>
        <dd>{{ cost().staleAfterRename ? 'Old name until the fan-out ends' : 'New name at once' }}</dd>
      </div>
    </dl>
    <p class="muted note">Each post on a page is by a different author, and each query is a 1 ms round trip.</p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class FeedModelWidgetComponent {
  readonly models = MODELS;
  readonly model = signal<FeedModel>('n-plus-one');
  readonly pageSize = signal(20);
  readonly postsPerAuthor = signal(500);
  readonly pagesPerSecond = signal(1_000);
  readonly renamesPerSecond = signal(1);
  readonly rows = [
    { label: 'Posts per author', options: POSTS_PER_AUTHOR, value: this.postsPerAuthor },
    { label: 'Pages a second', options: PAGES, value: this.pagesPerSecond },
    { label: 'Renames a second', options: RENAMES, value: this.renamesPerSecond },
  ];
  readonly cost = computed(() =>
    feedCost(this.model(), {
      pageSize: this.pageSize(),
      postsPerAuthor: this.postsPerAuthor(),
      pagesPerSecond: this.pagesPerSecond(),
      renamesPerSecond: this.renamesPerSecond(),
      rttMs: 1,
    }),
  );
}
