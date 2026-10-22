import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NODE_SIZE } from '@grasp/engine';
import { glyphId } from './glyphs';
import type { SysNodeView } from './node-view';

/**
 * `g-sys-node` (REDESIGN.md 4.6): a 148 × 64 node with its glyph, name, load and count. Color means state only: a neutral
 * body and meter warming along the heat ramp, a critical outline and "!" when overloaded, hatched with × when down. Its
 * host `<g>` is the canvas's, which places it and makes it a button.
 */
@Component({
  selector: 'g[gSysNode]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-status]': 'view().status', '[attr.data-heat]': 'view().heat', '[class.selected]': 'selected()' },
  template: `
    @let v = view();
    <svg:rect class="focus" x="-5" y="-5" [attr.width]="W + 10" [attr.height]="H + 10" />
    <svg:rect class="body" [attr.width]="W" [attr.height]="H" />
    @if (v.status === 'down') {
      <svg:rect class="hatch" [attr.width]="W" [attr.height]="H" />
    }
    <svg:use class="glyph" [attr.href]="'#' + glyph()" x="10" y="10" width="22" height="22" />
    @if (v.hitRate !== null) {
      <svg:circle class="hit-track" cx="21" cy="21" r="15" />
      <svg:circle
        class="hit"
        cx="21"
        cy="21"
        r="15"
        pathLength="100"
        [attr.stroke-dasharray]="v.hitRate * 100 + ' 100'"
        transform="rotate(-90 21 21)"
      />
    }
    @if (v.lines.length === 1) {
      <svg:text class="name" x="42" [attr.y]="rows().name[0]">{{ v.lines[0] }}</svg:text>
    } @else {
      <svg:text class="name two" x="42" [attr.y]="rows().name[0]">{{ v.lines[0] }}</svg:text>
      <svg:text class="name two" x="42" [attr.y]="rows().name[1]">{{ v.lines[1] }}</svg:text>
    }
    <svg:text class="stat" x="42" [attr.y]="rows().stat">{{ v.stat }}</svg:text>
    @if (v.ms) {
      <svg:text class="ms" [attr.x]="W - 10" [attr.y]="rows().stat" text-anchor="end">{{ v.ms }}</svg:text>
    }
    @if (v.count) {
      <svg:text class="count" x="21" y="49" text-anchor="middle">{{ v.count }}</svg:text>
    }
    @if (v.detail) {
      <svg:text class="detail" x="42" [attr.y]="rows().detail">{{ v.detail }}</svg:text>
    }
    @if (v.extra) {
      <svg:text class="detail" x="42" [attr.y]="rows().extra">{{ v.extra }}</svg:text>
    }
    @if (v.shards.length) {
      @for (s of v.shards; track $index) {
        <svg:rect
          class="shard"
          [attr.data-heat]="s.heat"
          [class.down]="s.down"
          [class.over]="s.over"
          [attr.x]="42 + $index * shardStep()"
          y="53"
          [attr.width]="shardStep() - 2"
          height="5"
        />
      }
    } @else if (v.meter !== null) {
      <svg:rect class="meter-track" x="42" y="54" [attr.width]="METER" height="4" />
      <svg:rect class="meter" x="42" y="54" [attr.width]="v.meter * METER" height="4" />
    }
    @if (v.status === 'overloaded' || v.status === 'down') {
      <svg:circle class="badge" [attr.cx]="W - 2" cy="2" r="9" />
      <svg:text class="badge-mark" [attr.x]="W - 2" y="6.5" text-anchor="middle">{{ v.status === 'down' ? '×' : '!' }}</svg:text>
    }
    @if (port()) {
      <svg:circle class="port" [attr.cx]="W" [attr.cy]="H / 2" r="7" (pointerdown)="portDown.emit($event)" />
    }
  `,
  styleUrl: './sys-node.component.scss',
})
export class SysNodeComponent {
  readonly view = input.required<SysNodeView>();
  readonly selected = input(false);
  /** Whether the node can send traffic on, so it shows the port a link is dragged from. */
  readonly port = input(false);
  readonly portDown = output<PointerEvent>();

  readonly W = NODE_SIZE.w;
  readonly H = NODE_SIZE.h;
  readonly METER = NODE_SIZE.w - 52;
  readonly glyph = computed(() => glyphId(this.view().glyph));
  /** Baselines of the name's lines, the stat, and the client's read share and bot line, as the node's lines need. */
  readonly rows = computed(() => {
    const v = this.view();
    const two = v.lines.length > 1;
    if (!v.detail) return two ? { name: [18, 32], stat: 46, detail: 0, extra: 0 } : { name: [23, 0], stat: 43, detail: 0, extra: 0 };
    if (two) return { name: [17, 30], stat: 44, detail: 57, extra: 0 };
    return v.extra ? { name: [19, 0], stat: 34, detail: 47, extra: 60 } : { name: [22, 0], stat: 40, detail: 55, extra: 0 };
  });
  readonly shardStep = computed(() => this.METER / Math.max(1, this.view().shards.length));
}
