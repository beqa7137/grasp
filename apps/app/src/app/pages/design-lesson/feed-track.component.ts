import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { valueX, type Track } from './feed-layout';

/**
 * A handle's track drawn inside a widget's SVG: the rail filled up to the knob, each stop with its label (the current one
 * bold), the handle's name, and its snapped value over the knob. The knob itself is a `g-handle` laid over the stage.
 */
@Component({
  selector: 'g[app-feed-track]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'feed-track', '[class.disabled]': 'disabled()' },
  styleUrl: './feed-stage.scss',
  template: `
    @let t = track();
    @if (name()) {
      <svg:text class="cap" [attr.x]="t.label.x" [attr.y]="t.label.y">{{ name() }}</svg:text>
    }
    <svg:line class="rail" [attr.x1]="t.x0" [attr.x2]="t.x1" [attr.y1]="t.y" [attr.y2]="t.y" />
    <svg:line class="fill" [attr.x1]="t.x0" [attr.x2]="knobX()" [attr.y1]="t.y" [attr.y2]="t.y" />
    @for (x of t.positions; track $index; let i = $index, last = $last) {
      @if (i !== index()) {
        <svg:circle class="stop" [attr.cx]="x" [attr.cy]="t.y" r="2.5" />
      }
      <svg:text
        [class]="i === index() ? 'tick on' : 'tick'"
        [attr.x]="i === 0 ? x - 4 : last ? x + 4 : x"
        [attr.y]="t.y + 22"
        [attr.text-anchor]="i === 0 ? 'start' : last ? 'end' : 'middle'"
      >
        {{ stops()[i] }}
      </svg:text>
    }
    <svg:text class="value" text-anchor="middle" [attr.x]="valueX()" [attr.y]="t.y - 15">{{ value() }}</svg:text>
  `,
})
export class FeedTrackComponent {
  readonly track = input.required<Track>();
  readonly stops = input.required<readonly string[]>();
  readonly index = input.required<number>();
  /** The snapped value, over the knob. */
  readonly value = input.required<string>();
  readonly name = input('');
  readonly disabled = input(false);
  readonly knobX = computed(() => this.track().positions[this.index()] ?? this.track().x0);
  readonly valueX = computed(() => valueX(this.track(), this.index(), this.value()));
}
