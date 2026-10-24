import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FEED_PAGES_PER_S, FEED_RENAMES_PER_S, feedAt, type FeedSettings } from '@grasp/engine';
import { DataTableComponent } from '../../viz/kit/data-table.component';
import { HandleComponent } from '../../viz/kit/handle.component';
import { StageComponent } from '../../viz/kit/stage.component';
import { PAD, Y_MAX, rowsY, trafficLayout } from './feed-layout';
import { compact, count, renamesPerS } from './feed-page-view';
import { FeedTrackComponent } from './feed-track.component';
import { LINE_KEY_GAP, behindLines, legendKeys, trafficFocus, trafficSubtitle, trafficTable, trafficView } from './feed-traffic-view';
import { FocusBoxComponent } from './focus-box.component';

/**
 * Data Modeling's traffic stage (REDESIGN.md 5.2, R41): the pages and renames a second as two handles, and which schema
 * wins at them, as rows per post shown against renames per post shown. It has no idle motion. Table swaps the chart for
 * its rows.
 */
@Component({
  selector: 'app-feed-traffic',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, HandleComponent, FeedTrackComponent, FocusBoxComponent, DataTableComponent],
  styleUrls: ['./feed-stage.scss', './feed-traffic.component.scss'],
  template: `
    <g-stage [height]="layout().height" label="Traffic: rows per post shown against renames per post shown">
      @if (ready()) {
        @let L = layout();
        @let P = L.plot;
        @let v = view();
        <svg
          [attr.viewBox]="'0 0 ' + L.width + ' ' + L.height"
          [attr.width]="L.width"
          [attr.height]="L.height"
          role="img"
          [attr.aria-label]="summary()"
        >
          <defs>
            <pattern id="feed-hatch-bad" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect class="hatch-bad-bg" width="7" height="7" />
              <line class="hatch-bad-line" x1="0" y1="0" x2="0" y2="7" />
            </pattern>
          </defs>
          @for (line of L.header; track $index) {
            <text class="label" [attr.x]="pad" [attr.y]="30 + $index * 16">{{ line }}</text>
          }
          <g
            app-feed-track
            [track]="L.pagesTrack"
            [stops]="pageStops"
            [index]="pageIndex()"
            [value]="count(settings().pagesPerSecond)"
            name="Pages a second"
            [disabled]="locked()"
          />
          <g
            app-feed-track
            [track]="L.renamesTrack"
            [stops]="renameStops"
            [index]="renameIndex()"
            [value]="'' + settings().renamesPerSecond"
            name="Renames a second"
            [disabled]="locked()"
          />

          @if (!tableShown()) {
            <text class="cap ink" [attr.x]="pad" [attr.y]="L.titleY">Rows per post shown</text>
            @for (line of subtitle(); track $index) {
              <text class="small" [attr.x]="pad" [attr.y]="L.titleY + 16 + $index * 14">{{ line }}</text>
            }
            @for (g of yTicks; track g) {
              <line class="grid-line" [attr.x1]="P.l" [attr.x2]="P.r" [attr.y1]="y(g)" [attr.y2]="y(g)" />
              <text class="tick" text-anchor="end" [attr.x]="P.l - 8" [attr.y]="y(g) + 4">{{ g }}</text>
            }
            @if (v.behind; as bh) {
              <rect class="behind" [attr.x]="bh.x" [attr.y]="P.t" [attr.width]="P.r - bh.x" [attr.height]="P.b - P.t" />
              <line class="behind-edge" [attr.x1]="bh.x" [attr.x2]="bh.x" [attr.y1]="P.t" [attr.y2]="P.b" />
            }
            <rect class="band-read" [attr.x]="P.l" [attr.y]="v.reads.y" [attr.width]="P.r - P.l" [attr.height]="P.b - v.reads.y" />
            @if (v.writes; as w) {
              <path class="band-write" [attr.d]="w" />
            }
            <line class="axis" [attr.x1]="P.l" [attr.x2]="P.r" [attr.y1]="P.b" [attr.y2]="P.b" />
            @for (t of v.ticks; track t.x) {
              <line class="axis" [attr.x1]="t.x" [attr.x2]="t.x" [attr.y1]="P.b" [attr.y2]="P.b + (t.major ? 5 : 3)" />
              @if (t.label) {
                <text class="tick" [attr.x]="t.x" [attr.y]="P.b + 18" [attr.text-anchor]="t.anchor">{{ t.label }}</text>
              }
            }
            <text class="small" [attr.x]="P.l" [attr.y]="P.b + 34">← read-heavy</text>
            <text class="small" text-anchor="end" [attr.x]="P.r" [attr.y]="P.b + 34">
              {{ L.wide ? 'renames per post shown · write-heavy →' : 'write-heavy →' }}
            </text>

            <path [class]="den() ? 'line other' : 'line selected'" [attr.d]="v.normalized" />
            @if (v.denormalized; as d) {
              <path [class]="den() ? 'line selected dashed' : 'line other dashed'" [attr.d]="d" />
            }
            @if (v.topArrow !== null) {
              <path class="arrow" [attr.d]="'M' + v.topArrow + ' ' + (P.t - 2) + 'l-4 7h8z'" />
            }
            @if (v.breakEven; as be) {
              <line class="even" [attr.x1]="be.x" [attr.x2]="be.x" [attr.y1]="P.t" [attr.y2]="P.b" />
              @if (be.clamped) {
                <path class="chevron" [attr.d]="'M' + (be.x - 3) + ' ' + (P.t + 4) + 'l4 4l-4 4'" />
              } @else {
                <circle class="pt other" [attr.cx]="be.x" [attr.cy]="y(2 + 1 / settings().postsPerAuthor)" r="3.5" />
              }
            }
            @for (n of v.lineNames; track n.text) {
              <text class="small" [attr.x]="P.r + 8" [attr.y]="n.y">{{ n.text }}</text>
            }
            <line class="cursor" [attr.x1]="v.cursor.x" [attr.x2]="v.cursor.x" [attr.y1]="P.t - 4" [attr.y2]="P.b" />
            @if (v.cursor.clamped) {
              <path class="chevron" [attr.d]="'M' + (v.cursor.x + 2) + ' ' + (P.b - 14) + 'l4 4l-4 4'" />
            }
            @for (p of v.points; track p.selected) {
              @if (p.over) {
                <path [class]="p.selected ? 'arrow selected' : 'arrow'" [attr.d]="'M' + p.x + ' ' + (P.t - 2) + 'l-5 8h10z'" />
              } @else {
                <circle [class]="p.selected ? 'pt' : 'pt other'" [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="p.selected ? 5 : 3.5" />
              }
            }
            @for (l of v.labels; track l.selected) {
              <text [attr.x]="l.x" [attr.y]="l.y" [attr.text-anchor]="l.anchor">
                <tspan [class]="l.selected ? 'num strong' : 'num'">{{ l.value }}</tspan>
                <tspan [class]="l.selected ? 'small ink' : 'small'" dx="4">{{ l.name }}</tspan>
              </text>
            }
            @if (v.asking; as a) {
              <text [attr.x]="a.x" [attr.y]="a.y" [attr.text-anchor]="a.anchor">
                <tspan class="small">{{ a.name }}</tspan>
                <tspan class="qmark" dx="4">{{ a.value }}</tspan>
              </text>
            }

            @let k = keys();
            <rect class="band-read" [attr.x]="k.reads.x" [attr.y]="k.reads.y - 9" width="12" height="10" />
            <text class="small" [attr.x]="k.reads.x + 17" [attr.y]="k.reads.y">{{ v.legend.reads }}</text>
            <rect class="band-write" [attr.x]="k.writes.x" [attr.y]="k.writes.y - 9" width="12" height="10" />
            <text class="small" [attr.x]="k.writes.x + 17" [attr.y]="k.writes.y">{{ v.legend.writes }}</text>
            @if (k.lines; as kl) {
              <line class="key-line" [attr.x1]="kl.x" [attr.x2]="kl.x + 16" [attr.y1]="kl.y - 4" [attr.y2]="kl.y - 4" />
              <text class="small" [attr.x]="kl.x + 21" [attr.y]="kl.y">normalized</text>
              <line
                class="key-line dashed"
                [attr.x1]="kl.x + keyGap"
                [attr.x2]="kl.x + keyGap + 16"
                [attr.y1]="kl.y - 4"
                [attr.y2]="kl.y - 4"
              />
              <text class="small" [attr.x]="kl.x + keyGap + 21" [attr.y]="kl.y">denormalized</text>
            }
            @if (v.legend.breakEven; as be) {
              <line
                class="even"
                [attr.x1]="k.breakEven.x + 3"
                [attr.x2]="k.breakEven.x + 3"
                [attr.y1]="k.breakEven.y - 10"
                [attr.y2]="k.breakEven.y + 2"
              />
              <text class="small" [attr.x]="k.breakEven.x + 10" [attr.y]="k.breakEven.y">
                @for (part of be.parts; track $index) {
                  <tspan [class]="part.num ? 'num' : ''">{{ part.text }}</tspan>
                }
              </text>
            }
            @if (v.legend.behind; as bh) {
              <rect class="behind key" [attr.x]="k.behind.x" [attr.y]="k.behind.y - 9" width="12" height="10" />
              @for (line of behindLines(L.wide, bh.limit); track $index) {
                <text class="small bad" [attr.x]="k.behind.x + 17" [attr.y]="k.behind.y + $index * 16">{{ line }}</text>
              }
            }
          }
          @for (f of focus(); track f.id) {
            <g app-focus [box]="f" [on]="focusOn().includes(f.id)" />
          }
        </svg>
        @if (tableShown()) {
          @let t = table();
          <g-data-table
            class="table"
            [style.top.px]="L.titleY - 14"
            [style.left.px]="pad"
            [style.width.px]="L.width - 2 * pad"
            label="Rows per post shown, by renames per post shown"
            [head]="t.head"
            [rows]="t.rows"
            [active]="t.active"
            [height]="L.height - L.titleY + 6"
            [compact]="!L.wide"
          />
        }
        <g-handle
          label="Pages a second"
          knob="dot"
          [values]="pages"
          [positions]="L.pagesTrack.positions"
          [cross]="L.pagesTrack.y"
          [valuetext]="count(settings().pagesPerSecond) + ' pages a second'"
          [disabled]="locked()"
          [value]="settings().pagesPerSecond"
          (valueChange)="pagesChange.emit($event)"
        />
        <g-handle
          label="Renames a second"
          knob="dot"
          [values]="renames"
          [positions]="L.renamesTrack.positions"
          [cross]="L.renamesTrack.y"
          [valuetext]="renamesText(settings().renamesPerSecond)"
          [disabled]="locked()"
          [value]="settings().renamesPerSecond"
          (valueChange)="renamesChange.emit($event)"
        />
        <button
          type="button"
          class="toggle"
          [attr.aria-pressed]="tableShown()"
          [disabled]="tableLocked()"
          (click)="showTable.set(!showTable())"
        >
          <span>Table</span>
        </button>
      }
    </g-stage>
  `,
})
export class FeedTrafficComponent {
  readonly settings = input.required<FeedSettings>();
  readonly hideDenormalized = input(false);
  readonly showBehind = input(false);
  readonly locked = input(false);
  /** Table waits while an experiment asks: its rows would answer the question. */
  readonly tableLocked = input(false);
  readonly focusOn = input<readonly string[]>([]);
  readonly pagesChange = output<number>();
  readonly renamesChange = output<number>();

  readonly pad = PAD;
  readonly pages: readonly number[] = FEED_PAGES_PER_S;
  readonly renames: readonly number[] = FEED_RENAMES_PER_S;
  readonly pageStops = FEED_PAGES_PER_S.map(compact);
  readonly renameStops = FEED_RENAMES_PER_S.map(String);
  readonly yTicks = Array.from({ length: Y_MAX + 1 }, (_, i) => i);
  readonly count = count;
  readonly renamesText = renamesPerS;
  /** The table, unless an open question locks it: its rows would answer. */
  readonly tableShown = computed(() => this.showTable() && !this.tableLocked());
  readonly showTable = signal(false);

  readonly stage = viewChild.required(StageComponent);
  readonly element = viewChild.required(StageComponent, { read: ElementRef });
  readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly ready = computed(() => this.stage().width() > 0);
  readonly layout = computed(() => trafficLayout(Math.max(248, this.stage().width())));
  readonly den = computed(() => this.settings().schema === 1);
  readonly view = computed(() =>
    trafficView(this.layout(), { settings: this.settings(), hideDenormalized: this.hideDenormalized(), showBehind: this.showBehind() }),
  );
  readonly table = computed(() => trafficTable(this.settings(), this.layout().wide));
  readonly keys = computed(() => legendKeys(this.layout(), this.den()));
  readonly keyGap = LINE_KEY_GAP;
  readonly behindLines = behindLines;
  readonly subtitle = computed(() => trafficSubtitle(this.layout().wide));
  readonly pageIndex = computed(() => this.pages.indexOf(this.settings().pagesPerSecond));
  readonly renameIndex = computed(() => this.renames.indexOf(this.settings().renamesPerSecond));
  readonly y = (rows: number) => rowsY(this.layout().plot, rows);
  readonly focus = computed(() => trafficFocus(this.layout()));

  readonly summary = computed(() => {
    const s = this.settings();
    const [norm, den] = [feedAt(s, 'join'), feedAt(s, 'denormalized')];
    const head = `At ${count(s.pagesPerSecond)} pages and ${renamesPerS(s.renamesPerSecond)}, normalized reads and writes ${count(norm.rowsPerSecond)} rows a second`;
    if (this.hideDenormalized()) return `${head}; denormalized is the question.`;
    const behind = this.showBehind() ? `; the copy rewrite falls behind above ${renamesPerS(den.fanoutLimitRenamesPerSecond)}` : '';
    return `${head} and denormalized ${count(den.rowsPerSecond)}. Denormalizing pays below 1 rename per ${count(s.postsPerAuthor)} posts shown${behind}.`;
  });
}
