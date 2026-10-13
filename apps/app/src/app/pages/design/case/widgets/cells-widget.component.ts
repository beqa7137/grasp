import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  CELL_PRECISIONS,
  CELL_SEARCH,
  EDGE_KM,
  RADIUS_LIMITS,
  cellPlaces,
  cellSearch,
  cellSearchCheckpoint,
  geohashBounds,
  kmText,
  num,
  offsetKm,
  placesText,
  radiusText,
  type CellScope,
  type CellSearchSettings,
  type PlaceMark,
  type WidgetCheckpoint,
} from '@grasp/engine';
import { RovingSelectDirective } from '../../../../core/roving-select.directive';
import { settledAnnouncement } from './settled-announcement';
import { WidgetCheckComponent } from './widget-check.component';

const SCOPES: { scope: CellScope; label: string }[] = [
  { scope: 'own', label: "The user's cell only" },
  { scope: 'neighbours', label: 'The cell and its 8 neighbours' },
];

/** The map shows this many km around what is searched, so its edges are visible. */
const MARGIN = 0.12;
/** Past this many cells across the map, grid lines would blur together, so only the cells read are drawn. */
const MAX_GRID_LINES = 36;
const DOT = 0.45;
const MARK = 0.75;

const disc = (x: number, y: number, r: number) =>
  `M${(x - r).toFixed(2)} ${y.toFixed(2)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A user, a seeded town of places, and the geohash cells a radius search reads: what it finds, misses and reads in vain. */
@Component({
  selector: 'app-cells-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective, WidgetCheckComponent],
  template: `
    <div class="controls" role="radiogroup" aria-label="Geohash precision">
      <span class="muted">Precision</span>
      @for (p of precisions; track p) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="settings().precision === p"
          [class.primary]="settings().precision === p"
          (click)="set({ precision: p })"
        >
          {{ p }}
        </button>
      }
    </div>
    <div class="controls" role="radiogroup" aria-label="Cells the search reads">
      @for (s of scopes; track s.scope) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="settings().scope === s.scope"
          [class.primary]="settings().scope === s.scope"
          (click)="set({ scope: s.scope })"
        >
          {{ s.label }}
        </button>
      }
    </div>
    <label class="slider">
      <span
        >Radius <strong class="mono">{{ radius(settings().radiusKm) }}</strong></span
      >
      <input
        type="range"
        [min]="limits.min"
        [max]="limits.max"
        [step]="limits.step"
        [value]="settings().radiusKm"
        [attr.aria-valuetext]="spokenRadius()"
        (input)="set({ radiusKm: +$any($event.target).value })"
      />
    </label>

    <svg class="map" viewBox="0 0 100 100" role="img" [attr.aria-label]="mapLabel()">
      <path class="grid" [attr.d]="map().grid" />
      @for (c of map().cells; track $index) {
        <rect class="cell" [class.own]="$last" [attr.x]="c.x" [attr.y]="c.y" [attr.width]="c.w" [attr.height]="c.h" />
      }
      <circle class="radius" [attr.cx]="map().user[0]" [attr.cy]="map().user[1]" [attr.r]="map().r" />
      @if (answered()) {
        <path class="dots unread" [attr.d]="map().dots.unread" />
        <path class="dots extra" [attr.d]="map().dots.extra" />
        <path class="dots found" [attr.d]="map().dots.found" />
        <path class="cross" [attr.d]="map().dots.missed" />
      } @else {
        <path class="dots plain" [attr.d]="map().dots.all" />
      }
      <path class="user" [attr.d]="map().userMark" />
    </svg>
    <ul class="legend-list" aria-hidden="true">
      <li><span class="swatch own"></span>The user's cell</li>
      @if (settings().scope === 'neighbours') {
        <li><span class="swatch neighbour"></span>Neighbour (dashed)</li>
      }
      <li><span class="swatch ring"></span>Radius</li>
      <li><span class="swatch user"></span>The user</li>
      @if (answered()) {
        <li><span class="swatch found"></span>Found</li>
        <li><span class="swatch missed"></span>Missed (cross)</li>
        <li><span class="swatch extra"></span>Read, too far (ring)</li>
        <li><span class="swatch unread"></span>Not read (small, faint)</li>
      } @else {
        <li><span class="swatch plain"></span>A place</li>
      }
    </ul>

    <dl class="readouts">
      <div>
        <dt>Cell</dt>
        <dd class="mono">{{ cellSize() }}</dd>
      </div>
      <div>
        <dt>Within the radius</dt>
        <dd class="mono">{{ format(run().within) }}</dd>
      </div>
      @if (answered()) {
        <div>
          <dt>Places read</dt>
          <dd class="mono">{{ format(run().read) }}</dd>
        </div>
        <div>
          <dt>Found</dt>
          <dd class="mono">{{ format(run().found) }}</dd>
        </div>
        <div [class.bad]="run().missed > 0">
          <dt>Missed</dt>
          <dd class="mono">{{ format(run().missed) }}</dd>
        </div>
        <div>
          <dt>Read, too far</dt>
          <dd class="mono">{{ format(run().extra) }}</dd>
        </div>
      }
    </dl>
    @if (!answered()) {
      <p class="muted hidden-note">What the search reads, finds and misses shows once you answer the prediction below.</p>
    }
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
    <p class="muted note">
      {{ placeCount }} seeded places within {{ box }} km of a user at {{ where }}, most around a downtown to the north-east. The user stands
      {{ edge }} west of a line where cells split at every precision here, and one place stands just east of it. A place is read when its
      geohash starts with a cell the search reads, and found when its haversine distance is within the radius.
    </p>

    <app-widget-check [check]="shownCheck()" [chosen]="chosen()" (chosenChange)="answer($event)" />
  `,
  styleUrl: '../../../design-lesson/widget.scss',
  styles: `
    .map {
      max-width: 440px;
      margin: 0 auto 8px;
      overflow: hidden;
      border-radius: var(--g-radius-sm);
      background: var(--g-sunken);
    }
    .grid {
      stroke: var(--g-line-strong);
      stroke-width: 0.25;
    }
    .cell {
      fill: var(--g-accent-soft);
      stroke: var(--g-stroke);
      stroke-width: 0.5;
      stroke-dasharray: 2 1.2;
    }
    .cell.own {
      stroke: var(--g-text);
      stroke-width: 0.9;
      stroke-dasharray: none;
    }
    .radius {
      fill: none;
      stroke: var(--g-text);
      stroke-width: 0.6;
    }
    .dots.plain {
      fill: var(--g-muted);
    }
    .dots.unread {
      fill: var(--g-line-strong);
    }
    .dots.found {
      fill: var(--g-accent);
    }
    .dots.extra {
      fill: none;
      stroke: var(--g-accent);
      stroke-width: 0.6;
    }
    .cross {
      stroke: var(--g-danger-ink);
      stroke-width: 0.45;
    }
    .user {
      fill: var(--g-text);
      stroke: var(--g-sunken);
      stroke-width: 0.4;
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
      width: 12px;
      height: 12px;
      flex: none;
      &.own {
        border: 2px solid var(--g-text);
        background: var(--g-accent-soft);
      }
      &.neighbour {
        border: 1.5px dashed var(--g-stroke);
        background: var(--g-accent-soft);
      }
      &.ring {
        border: 1.5px solid var(--g-text);
        border-radius: 50%;
      }
      &.user {
        background: var(--g-text);
        clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
      }
      &.plain,
      &.unread,
      &.found,
      &.extra {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      &.plain {
        background: var(--g-muted);
      }
      &.unread {
        width: 6px;
        height: 6px;
        background: var(--g-line-strong);
      }
      &.found {
        background: var(--g-accent);
      }
      &.extra {
        border: 2px solid var(--g-accent);
      }
      &.missed {
        width: 10px;
        height: 10px;
        background:
          linear-gradient(45deg, transparent 42%, var(--g-danger-ink) 42% 58%, transparent 58%),
          linear-gradient(-45deg, transparent 42%, var(--g-danger-ink) 42% 58%, transparent 58%);
      }
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
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
export class CellsWidgetComponent {
  readonly precisions = CELL_PRECISIONS;
  readonly scopes = SCOPES;
  readonly limits = RADIUS_LIMITS;
  readonly format = num;
  readonly radius = radiusText;
  readonly placeCount = num(CELL_SEARCH.places);
  readonly box = CELL_SEARCH.boxKm;
  readonly where = `${CELL_SEARCH.user.lat}° N, ${Math.abs(CELL_SEARCH.user.lon).toFixed(2)}° W`;
  readonly edge = kmText(EDGE_KM);
  readonly settings = signal<CellSearchSettings>({ precision: 6, radiusKm: 0.5, scope: 'own' });
  readonly run = computed(() => cellSearch(this.settings()));
  readonly check = computed(() => cellSearchCheckpoint(this.settings(), this.run()));
  /** A new precision or scope asks again; the radius slider only moves the readouts under an answered question. */
  private readonly asked = computed(() => `${this.settings().precision}:${this.settings().scope}`);
  private readonly answers = signal<{ asked: string; chosen: number; check: WidgetCheckpoint } | null>(null);
  private readonly current = computed(() => {
    const a = this.answers();
    return a?.asked === this.asked() ? a : null;
  });
  readonly chosen = computed(() => this.current()?.chosen ?? null);
  readonly answered = computed(() => this.chosen() !== null);
  readonly shownCheck = computed(() => this.current()?.check ?? this.check());
  readonly cellSize = computed(() => `${kmText(this.run().widthKm)} × ${kmText(this.run().heightKm)}`);
  readonly spokenRadius = computed(() => {
    const r = this.settings().radiusKm;
    return r < 1 ? `${num(r * 1000)} metres` : `${Number(r.toFixed(1))} kilometres`;
  });
  readonly mapLabel = computed(() => {
    const run = this.run();
    const s = this.settings();
    const head = `Map of ${run.cells.length === 1 ? "the user's cell" : 'the 9 cells read'} at precision ${s.precision}, with a ${radiusText(s.radiusKm)} circle holding ${placesText(run.within)}`;
    return this.answered() ? `${head}: ${num(run.found)} found, ${num(run.missed)} missed, ${num(run.extra)} read but too far` : head;
  });
  readonly map = computed(() => this.draw());
  readonly announcement = settledAnnouncement(() => this.summary());

  private draw() {
    const s = this.settings();
    const run = this.run();
    const bounds = run.cells.map(geohashBounds);
    const corners = bounds.flatMap((b) => [offsetKm(b.south, b.west), offsetKm(b.north, b.east)]);
    const xs = [...corners.map((c) => c[0]), -s.radiusKm, s.radiusKm];
    const ys = [...corners.map((c) => c[1]), -s.radiusKm, s.radiusKm];
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * (1 + 2 * MARGIN);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const scale = 100 / span;
    const px = (east: number) => (east - cx) * scale + 50;
    const py = (north: number) => 50 - (north - cy) * scale;
    const box = (b: (typeof bounds)[number]): Box => {
      const [west, south] = offsetKm(b.south, b.west);
      const [east, north] = offsetKm(b.north, b.east);
      return { x: px(west), y: py(north), w: (east - west) * scale, h: (north - south) * scale };
    };
    const cells = bounds.map(box);
    const own = cells[0];
    const lines: string[] = [];
    if (100 / own.w <= MAX_GRID_LINES && 100 / own.h <= MAX_GRID_LINES) {
      for (let x = own.x - Math.ceil(own.x / own.w) * own.w; x <= 100; x += own.w) lines.push(`M${x.toFixed(2)} 0V100`);
      for (let y = own.y - Math.ceil(own.y / own.h) * own.h; y <= 100; y += own.h) lines.push(`M0 ${y.toFixed(2)}H100`);
    }
    const dots: Record<PlaceMark | 'all', string[]> = { all: [], found: [], missed: [], extra: [], unread: [] };
    cellPlaces().forEach((p, i) => {
      const [e, n] = offsetKm(p.lat, p.lon);
      const x = px(e);
      const y = py(n);
      if (x < -MARK || x > 100 + MARK || y < -MARK || y > 100 + MARK) return;
      const mark = run.marks[i];
      dots.all.push(disc(x, y, DOT));
      if (mark === 'missed')
        dots.missed.push(
          `M${(x - MARK).toFixed(2)} ${(y - MARK).toFixed(2)}l${2 * MARK} ${2 * MARK}m0 ${-2 * MARK}l${-2 * MARK} ${2 * MARK}`,
        );
      else dots[mark].push(disc(x, y, mark === 'unread' ? DOT : MARK));
    });
    const ux = px(0);
    const uy = py(0);
    const u = 1.8;
    return {
      grid: lines.join(''),
      // The user's cell last, so its solid edge is drawn over its neighbours' dashed ones.
      cells: [...cells.slice(1), own],
      user: [ux, uy],
      r: s.radiusKm * scale,
      userMark: `M${ux} ${uy - u}L${ux + u} ${uy}L${ux} ${uy + u}L${ux - u} ${uy}Z`,
      dots: Object.fromEntries(Object.entries(dots).map(([k, v]) => [k, v.join('')])) as Record<PlaceMark | 'all', string>,
    };
  }

  private summary(): string {
    const s = this.settings();
    const run = this.run();
    const head = `Precision ${s.precision}, ${s.scope === 'own' ? "the user's cell only" : 'the cell and its 8 neighbours'}, ${radiusText(s.radiusKm)}: ${placesText(run.within)} within the radius.`;
    if (!this.answered()) return `${head} Answer the prediction to see what the search reads.`;
    return `${head} It reads ${placesText(run.read)}, finds ${num(run.found)} and misses ${num(run.missed)}.`;
  }

  set(change: Partial<CellSearchSettings>) {
    const s = this.settings();
    if ((Object.keys(change) as (keyof CellSearchSettings)[]).every((k) => change[k] === s[k])) return;
    this.settings.set({ ...s, ...change });
  }

  answer(chosen: number | null) {
    if (chosen !== null) this.answers.set({ asked: this.asked(), chosen, check: this.check() });
  }
}
