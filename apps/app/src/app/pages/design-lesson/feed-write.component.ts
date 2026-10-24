import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, viewChild } from '@angular/core';
import { FEED_POSTS_PER_AUTHOR, type FeedSettings } from '@grasp/engine';
import { HandleComponent } from '../../viz/kit/handle.component';
import { StageComponent } from '../../viz/kit/stage.component';
import { LINE, PAD, trackBoxes, writeLayout } from './feed-layout';
import { compact, count } from './feed-page-view';
import { FeedTrackComponent } from './feed-track.component';
import { writeFocus, writeView } from './feed-write-view';
import { FocusBoxComponent } from './focus-box.component';

/** The rewrite playhead's stops, in percent done. */
const PLAYHEAD = Array.from({ length: 21 }, (_, i) => i * 5);

/**
 * Data Modeling's write stage (REDESIGN.md 5.2, R41): Ada renames. Normalized, one row changes; denormalized, every one of
 * her posts carries a copy of her name, drawn as 100 cells, and a copy rewrite brings them up to date while pages can
 * still show the old name. After a rename its playhead scrubs the rewrite.
 */
@Component({
  selector: 'app-feed-write',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, HandleComponent, FeedTrackComponent, FocusBoxComponent],
  styleUrls: ['./feed-stage.scss', './feed-write.component.scss'],
  template: `
    <g-stage [height]="layout().height" label="Data modeling: one rename">
      @if (ready()) {
        @let L = layout();
        @let v = view();
        @let b = L.bar;
        <svg
          [attr.viewBox]="'0 0 ' + L.width + ' ' + L.height"
          [attr.width]="L.width"
          [attr.height]="L.height"
          role="img"
          [attr.aria-label]="summary()"
        >
          <text class="label" [attr.x]="pad + 42" y="30">Write · Ada renames</text>
          <text class="head" text-anchor="end" [attr.x]="L.width - pad" [attr.y]="L.headlineY">
            <tspan>{{ v.headline.value }}</tspan>
            <tspan class="unit" [class.bad]="v.headline.bad" dx="4">{{ v.headline.unit }}</tspan>
          </text>
          <g
            app-feed-track
            [track]="L.postsTrack"
            [stops]="postStops"
            [index]="postIndex()"
            [value]="count(settings().postsPerAuthor)"
            name="Ada’s posts"
            [disabled]="locked()"
          />
          @for (text of v.caption; track $index) {
            <text class="cap ink" [attr.x]="pad" [attr.y]="L.caption.y + $index * line">{{ text }}</text>
          }
          @for (c of v.cells; track $index) {
            <rect [class]="'cell ' + c.kind" [attr.x]="c.x" [attr.y]="c.y" [attr.width]="v.cell" [attr.height]="v.cell" />
          }
          @if (v.empty; as e) {
            <rect class="empty-note" [attr.x]="e.x - e.width / 2" [attr.y]="e.y - 17" [attr.width]="e.width" height="24" />
            <text class="cap" text-anchor="middle" [attr.x]="e.x" [attr.y]="e.y">No copies to rewrite</text>
          }
          @for (l of v.legend; track $index) {
            @if (l.kind) {
              <rect [class]="'cell key ' + l.kind" [attr.x]="L.legend.x" [attr.y]="l.y - 9" width="10" height="10" />
              <text [class]="l.small ? 'small' : 'cap ink'" [attr.x]="L.legend.x + 16" [attr.y]="l.y">
                @for (part of l.parts; track $index) {
                  <tspan [class]="part.num ? 'num' : ''">{{ part.text }}</tspan>
                }
              </text>
            }
          }

          <text class="cap ink" [attr.x]="b.x0" [attr.y]="b.labelY">{{ v.barLabel }}</text>
          @if (v.bar.elapsed) {
            <text class="cap" text-anchor="end" [attr.x]="b.x1" [attr.y]="b.labelY">{{ v.bar.elapsed }}</text>
          }
          @switch (v.bar.kind) {
            @case ('none') {
              <rect class="bar none" [attr.x]="b.x0" [attr.y]="b.y" [attr.width]="b.x1 - b.x0" height="12" />
            }
            @case ('rest') {
              <rect class="bar rest" [attr.x]="b.x0" [attr.y]="b.y" [attr.width]="b.x1 - b.x0" height="12" />
            }
            @case ('behind') {
              <rect class="bar behind" [attr.x]="b.x0" [attr.y]="b.y" [attr.width]="b.x1 - b.x0" height="12" />
              <path class="cross" [attr.d]="'M' + (b.x1 - 14) + ' ' + (b.y + 2) + 'l8 8m0 -8l-8 8'" />
            }
            @default {
              <rect class="bar left" [attr.x]="b.x0" [attr.y]="b.y" [attr.width]="b.x1 - b.x0" height="12" />
              <rect class="bar done" [attr.x]="b.x0" [attr.y]="b.y" [attr.width]="(b.x1 - b.x0) * v.bar.done" height="12" />
            }
          }
          @for (parts of v.bar.lines; track $index) {
            <text [class]="v.bar.kind === 'behind' ? 'cap bad' : 'cap'" [attr.x]="b.x0" [attr.y]="b.captionY + $index * (line + 1)">
              @for (part of parts; track $index) {
                <tspan [class]="part.num ? 'num' : ''">{{ part.text }}</tspan>
              }
            </text>
          }
          @for (f of focus(); track f.id) {
            <g app-focus [box]="f" [on]="focusOn().includes(f.id)" />
          }
        </svg>
        <button
          type="button"
          class="play"
          aria-label="Rename Ada"
          [style.left.px]="pad - 6"
          [disabled]="locked() || renameLocked()"
          (click)="renameClick.emit()"
        >
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="16" />
            <path d="M14 11v14l11-7z" />
          </svg>
        </button>
        <g-handle
          label="Ada’s posts"
          knob="dot"
          [values]="posts"
          [positions]="L.postsTrack.positions"
          [cross]="L.postsTrack.y"
          [valuetext]="count(settings().postsPerAuthor) + ' posts by Ada'"
          [disabled]="locked()"
          [value]="settings().postsPerAuthor"
          (valueChange)="postsChange.emit($event)"
        />
        @if (rename() !== null && settings().schema === 1 && v.bar.kind !== 'behind') {
          <g-handle
            label="Copy rewrite"
            [values]="playhead"
            [positions]="playheadPositions()"
            [cross]="b.y + 6"
            [valuetext]="playheadText()"
            [disabled]="locked()"
            [value]="playheadValue()"
            (valueChange)="playheadChange.emit($event / 100)"
          />
        }
      }
    </g-stage>
  `,
})
export class FeedWriteComponent {
  readonly settings = input.required<FeedSettings>();
  readonly rename = input<number | null>(null);
  readonly slowdown = input(1);
  readonly hideStale = input(false);
  readonly showBehind = input(true);
  readonly locked = input(false);
  /** Rename Ada waits while a question hides how a rename ends. */
  readonly renameLocked = input(false);
  readonly focusOn = input<readonly string[]>([]);
  readonly postsChange = output<number>();
  readonly renameClick = output<void>();
  readonly playheadChange = output<number>();

  readonly pad = PAD;
  readonly line = LINE;
  readonly posts: readonly number[] = FEED_POSTS_PER_AUTHOR;
  readonly postStops = FEED_POSTS_PER_AUTHOR.map(compact);
  readonly playhead = PLAYHEAD;
  readonly count = count;

  readonly stage = viewChild.required(StageComponent);
  readonly element = viewChild.required(StageComponent, { read: ElementRef });
  readonly ready = computed(() => this.stage().width() > 0);
  readonly layout = computed(() => writeLayout(Math.max(248, this.stage().width())));
  readonly view = computed(() =>
    writeView(this.layout(), {
      settings: this.settings(),
      rename: this.rename(),
      slowdown: this.slowdown(),
      hideStale: this.hideStale(),
      showBehind: this.showBehind(),
    }),
  );
  readonly postIndex = computed(() => this.posts.indexOf(this.settings().postsPerAuthor));
  readonly playheadValue = computed(() => Math.round(((this.rename() ?? 0) * 100) / 5) * 5);
  readonly playheadPositions = computed(() => {
    const b = this.layout().bar;
    return PLAYHEAD.map((p) => b.x0 + ((b.x1 - b.x0) * p) / 100);
  });
  readonly playheadText = computed(() => {
    const A = this.settings().postsPerAuthor;
    return `copy rewrite ${this.playheadValue()}% done, ${count(this.view().rewritten)} of ${count(A)} copies rewritten`;
  });
  readonly focus = computed(() => {
    const L = this.layout();
    const s = this.settings();
    const track = trackBoxes(L.postsTrack, this.postStops, this.postIndex(), count(s.postsPerAuthor), 'Ada’s posts');
    return writeFocus(L, [...this.view().texts, ...track]);
  });
  readonly summary = computed(() => this.view().summary);
}
