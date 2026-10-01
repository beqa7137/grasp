import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  CAPACITY_LIMITS,
  DENSITIES,
  DENSITY_TEXT,
  QUADTREE,
  bytesText,
  num,
  quadPlaces,
  quadtree,
  quadtreeCheckpoint,
  quadtreeQueries,
  type Density,
  type QuadtreeSettings,
  type WidgetCheckpoint,
} from '@grasp/engine';
import { RovingSelectDirective } from '../../../../core/roving-select.directive';
import { settledAnnouncement } from './settled-announcement';
import { WidgetCheckComponent } from './widget-check.component';

const LABELS: Record<Density, string> = { even: 'Even', city: 'One city', cities: 'Three cities' };
const DOT = 0.32;

/** A quadtree over 10,000 seeded places: leaf capacity and density pattern against depth, nodes, memory and query work. */
@Component({
  selector: 'app-quadtree-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective, WidgetCheckComponent],
  template: `
    <div class="controls" role="radiogroup" aria-label="Where the places are">
      @for (d of densities; track d) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="settings().density === d"
          [class.primary]="settings().density === d"
          (click)="set({ density: d })"
        >
          {{ labels[d] }}
        </button>
      }
    </div>
    <label class="slider">
      <span
        >Most places a leaf holds <strong class="mono">{{ format(settings().capacity) }}</strong></span
      >
      <input
        type="range"
        [min]="limits.min"
        [max]="limits.max"
        [step]="limits.step"
        [value]="settings().capacity"
        [attr.aria-valuetext]="format(settings().capacity) + ' places a leaf'"
        (input)="set({ capacity: +$any($event.target).value })"
      />
    </label>

    <svg class="map" viewBox="0 0 100 100" role="img" [attr.aria-label]="mapLabel()">
      <path class="places" [class.dim]="answered()" [attr.d]="places()" />
      @if (answered()) {
        <path class="leaves" [attr.d]="leaves()" />
      }
    </svg>
    <ul class="legend-list" aria-hidden="true">
      <li><span class="swatch place"></span>A place</li>
      @if (answered()) {
        <li><span class="swatch leaf"></span>A leaf: at most {{ format(settings().capacity) }} places</li>
      }
    </ul>

    @if (answered()) {
      <dl class="readouts">
        <div>
          <dt>Deepest leaf</dt>
          <dd class="mono">{{ run().depth }} levels</dd>
        </div>
        <div>
          <dt>Nodes</dt>
          <dd class="mono">{{ format(run().nodes) }}</dd>
        </div>
        <div>
          <dt>Places checked a query</dt>
          <dd class="mono">{{ format(cost().examined) }}</dd>
        </div>
        <div>
          <dt>Nodes walked a query</dt>
          <dd class="mono">{{ format(cost().visited) }}</dd>
        </div>
        <div>
          <dt>Build steps</dt>
          <dd class="mono">{{ format(run().buildSteps) }}</dd>
        </div>
        <div>
          <dt>Memory</dt>
          <dd class="mono">{{ bytes(run().memoryBytes) }}</dd>
        </div>
        <div [class.bad]="run().scaledBytes > 2 * baseline">
          <dt>Memory at {{ scaled }}</dt>
          <dd class="mono">{{ bytes(run().scaledBytes) }}</dd>
        </div>
      </dl>
    } @else {
      <p class="muted hidden-note">
        The tree's leaves, depth, nodes, memory and the work of a query show once you answer the prediction below.
      </p>
    }
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
    <p class="muted note">
      {{ placeCount }} seeded places on a {{ region }} km square. A leaf holding more than the limit splits into four. Each query asks for
      the nearest {{ nearest }} from one of {{ queries }} spots where places are, opening the closest node first. Memory counts
      {{ entryBytes }} bytes a place and {{ nodeBytes }} bytes a node; at {{ scaled }} the same pattern has {{ factor }} times as many of
      each.
    </p>

    <app-widget-check [check]="shownCheck()" [chosen]="chosen()" (chosenChange)="answer($event)" />
  `,
  styleUrl: '../../../design-lesson/widget.scss',
  styles: `
    .map {
      max-width: 440px;
      margin: 0 auto 8px;
      border-radius: var(--g-radius-sm);
      background: var(--g-raised);
    }
    .places {
      fill: var(--g-accent);
    }
    /* Faded under the leaves, so the smallest squares still show where places are dense. */
    .places.dim {
      opacity: 0.4;
    }
    .leaves {
      fill: none;
      stroke: var(--g-text);
      stroke-width: 0.25;
    }
    .legend-list {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 4px 14px;
      margin: 0 0 12px;
      padding: 0;
      font-size: 0.8125rem;
    }
    .legend-list li {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .swatch {
      display: inline-block;
      flex: none;
      &.place {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--g-accent);
      }
      &.leaf {
        width: 12px;
        height: 12px;
        border: 1.5px solid var(--g-text);
      }
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    }
    .hidden-note {
      font-size: 0.8125rem;
      margin: 8px 0 0;
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 16px;
      line-height: 1.5;
    }
  `,
})
export class QuadtreeWidgetComponent {
  readonly densities = DENSITIES;
  readonly labels = LABELS;
  readonly limits = CAPACITY_LIMITS;
  readonly format = num;
  readonly bytes = bytesText;
  readonly placeCount = num(QUADTREE.places);
  readonly region = QUADTREE.regionKm;
  readonly nearest = QUADTREE.nearest;
  readonly queries = QUADTREE.queries;
  readonly entryBytes = QUADTREE.entryBytes;
  readonly nodeBytes = QUADTREE.nodeBytes;
  readonly scaled = `${num(QUADTREE.scaleTo / 1e6)} million`;
  readonly factor = num(QUADTREE.scaleTo / QUADTREE.places);
  /** The entries alone at full scale: a tree that doubles it is mostly nodes. */
  readonly baseline = QUADTREE.scaleTo * QUADTREE.entryBytes;
  readonly settings = signal<QuadtreeSettings>({ capacity: 100, density: 'city' });
  readonly run = computed(() => quadtree(this.settings()));
  /** Running the queries is the slow part, so it happens only for the readouts shown after an answer. */
  readonly cost = computed(() => quadtreeQueries(this.settings()));
  readonly check = computed(() => quadtreeCheckpoint(this.settings(), this.run()));
  /** A new pattern asks again; the capacity slider only moves the readouts under an answered question. */
  private readonly asked = computed(() => this.settings().density);
  private readonly answers = signal<{ asked: string; chosen: number; check: WidgetCheckpoint } | null>(null);
  private readonly current = computed(() => {
    const a = this.answers();
    return a?.asked === this.asked() ? a : null;
  });
  readonly chosen = computed(() => this.current()?.chosen ?? null);
  readonly answered = computed(() => this.chosen() !== null);
  readonly shownCheck = computed(() => this.current()?.check ?? this.check());
  readonly places = computed(() =>
    quadPlaces(this.settings().density)
      .map(([x, y]) => `M${(x - DOT / 2).toFixed(2)} ${(100 - y - DOT / 2).toFixed(2)}h${DOT}v${DOT}h${-DOT}z`)
      .join(''),
  );
  readonly leaves = computed(() =>
    this.run()
      .leaves.map((l) => `M${l.x} ${100 - l.y - l.size}h${l.size}v${l.size}h${-l.size}z`)
      .join(''),
  );
  readonly mapLabel = computed(() => {
    const s = this.settings();
    const places = `${this.placeCount} places ${DENSITY_TEXT[s.density]}`;
    if (!this.answered()) return `Map of ${places}; the tree shows once you answer`;
    const run = this.run();
    return `Quadtree leaves over ${places}, at most ${num(s.capacity)} a leaf: ${run.depth} levels deep, ${num(run.nodes)} nodes`;
  });
  readonly announcement = settledAnnouncement(() => this.summary());

  private summary(): string {
    const s = this.settings();
    const head = `${this.placeCount} places ${DENSITY_TEXT[s.density]}, at most ${num(s.capacity)} a leaf.`;
    if (!this.answered()) return `${head} Answer the prediction to see the tree.`;
    const run = this.run();
    return `${head} ${run.depth} levels deep, ${num(run.nodes)} nodes; a query checks ${num(this.cost().examined)} places.`;
  }

  set(change: Partial<QuadtreeSettings>) {
    const s = this.settings();
    if ((Object.keys(change) as (keyof QuadtreeSettings)[]).every((k) => change[k] === s[k])) return;
    this.settings.set({ ...s, ...change });
  }

  answer(chosen: number | null) {
    if (chosen !== null) this.answers.set({ asked: this.asked(), chosen, check: this.check() });
  }
}
