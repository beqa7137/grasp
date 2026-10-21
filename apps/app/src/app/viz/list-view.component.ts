import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import type { ListName, Scalar } from '@grasp/engine';
import { uniqueId } from '../core/unique-id';
import { LANDING, enter, flip, land, leave, placeKeyed, type Placed } from './kit/flip';
import { MotionService, type StageStep } from './kit/motion.service';

@Component({
  selector: 'g-list-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="label" [id]="labelId" [attr.aria-hidden]="listed() || null">{{ label() }}</div>
    <div
      #items
      class="items"
      [class.vertical]="orientation() === 'vertical'"
      [style.--room]="room()"
      [attr.role]="listed() ? 'list' : null"
      [attr.aria-labelledby]="listed() ? labelId : null"
    >
      @if (more()) {
        <span class="more" role="listitem">+{{ more() }} more</span>
      }
      @for (item of shown(); track item.key) {
        @if (item.gone) {
          <span class="item trail" aria-hidden="true"
            ><s>{{ item.value }}</s></span
          >
        } @else {
          <span class="item" role="listitem" [attr.data-key]="item.key" [class.hot]="item.value === highlight()" [class.moved]="item.moved"
            ><span class="val">{{ item.value }}</span></span
          >
        }
      } @empty {
        <span class="empty">empty</span>
      }
    </div>
  `,
  styles: [
    LANDING,
    `
      @use '../../type' as *;

      :host {
        display: block;
      }
      .label {
        @include label;
        line-height: 1;
        color: var(--g-muted);
        margin-bottom: 8px;
      }
      .items {
        position: relative;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      /* nowrap keeps one column as wide as the list, so the ellipsis below cuts long items such as calls. */
      /*
       * A stack keeps the room of the run's tallest, its bottom fixed, so a push or pop moves only the top chip (34px a
       * chip). On a short stage (a 320px phone, an iPhone in Safari) that room would push the stack below the fold, so it
       * grows from its top there instead.
       */
      .items.vertical {
        min-height: calc(var(--room) * 34px - 6px);
        flex-direction: column-reverse;
        flex-wrap: nowrap;
        align-items: stretch;
      }
      @container stage (max-height: 359.98px) {
        .items.vertical {
          min-height: 0;
        }
      }
      .item {
        position: relative;
        font: 600 0.75rem/1 var(--g-font-mono);
        padding: 7px 9px;
        border-radius: 8px;
        background: var(--g-raised);
        border: 1px solid var(--g-line-strong);
        text-align: center;
      }
      .items.vertical .item {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* What a step with no motion took out (a dequeued front, a popped top), kept for one frame where it was. */
      .item.trail {
        background: transparent;
        border-style: dashed;
        color: var(--g-faint);
      }
      .item.moved {
        border-style: dashed;
      }
      .item.hot {
        border-color: var(--g-state-current);
        color: var(--g-state-current);
      }
      .more {
        font: 0.75rem/1 var(--g-font-mono);
        color: var(--g-muted);
        padding: 7px 9px;
        text-align: center;
      }
      .empty {
        font: 0.75rem/1 var(--g-font-mono);
        color: var(--g-faint);
        padding: 7px 0;
      }
    `,
  ],
})
export class ListViewComponent {
  readonly label = input.required<string>();
  readonly items = input.required<Scalar[]>();
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly highlight = input<Scalar | undefined>(undefined);
  /** Items left out before the first one shown: below the bottom of a vertical list. */
  readonly more = input(0);
  /** The most items the list holds in its run; a vertical list keeps their room. */
  readonly room = input(0);
  /** Which list of the frame this is, which picks its changes out of `step`. */
  readonly list = input<ListName | null>(null);
  /** Stable item keys (`traceKeys`), so a dequeue takes out the front chip; without them items are keyed by index. */
  readonly keys = input<readonly string[] | null>(null);
  /** The step into this frame, which the list plays (or, when nothing animates, leaves trails for). */
  readonly step = input<StageStep | null>(null);
  private readonly motion = inject(MotionService, { optional: true });
  private readonly itemsEl = viewChild<ElementRef<HTMLElement>>('items');

  readonly labelId = uniqueId('g-list');
  /** Only a non-empty list gets list semantics, named by its label, which is then hidden from screen readers so it is not read twice. */
  readonly listed = computed(() => this.items().length > 0 || this.more() > 0);

  private readonly events = computed(() => {
    const list = this.list();
    return list ? (this.step()?.events.filter((e) => e.view === list) ?? []) : [];
  });
  private readonly still = computed(() => {
    const step = this.step();
    return !!step?.adjacent && step.scale === 0;
  });

  /** The items in order, each with its key; after a step with no motion, what left stays for one frame as a trail. */
  readonly shown = computed(() => {
    const keys = this.keys();
    const moved = new Set(
      this.still() ? this.events().flatMap((e) => (e.kind === 'swap' ? [e.a, e.b] : e.kind === 'shift' ? [e.to] : [])) : [],
    );
    const items = this.items().map((value, i) => ({ key: keys?.[i] ?? String(i), value, gone: false, moved: moved.has(i) }));
    if (!this.still()) return items;
    for (const e of this.events())
      if (e.kind === 'pop')
        items.splice(Math.min(e.at, items.length), 0, { key: `gone:${e.at}`, value: e.value, gone: true, moved: false });
    return items;
  });

  private before: Map<string, Placed> | null = null;

  constructor() {
    effect(() => {
      this.items();
      const step = this.step();
      untracked(() => (this.before = this.animates(step) ? placeKeyed(this.itemsEl()?.nativeElement) : null));
    });
    afterRenderEffect(() => {
      const step = this.step();
      untracked(() => this.play(step));
    });
  }

  private animates(step: StageStep | null): step is StageStep {
    return !!this.motion && !!this.list() && !!step?.adjacent && step.scale > 0;
  }

  /** Plays the step: what left fades out of its place, the rest close up, then new items fade in and written ones land. */
  private play(step: StageStep | null) {
    const before = this.before;
    this.before = null;
    const motion = this.motion;
    const layer = this.itemsEl()?.nativeElement;
    if (!motion || !before || !layer || !this.animates(step)) return;
    const after = placeKeyed(layer);
    const s = step.scale;
    const exit = this.list() === 'stack' ? { x: 0, y: -12 } : { x: -12, y: 0 };
    leave(
      motion,
      before,
      after,
      layer,
      { duration: motion.ms('step', s), delay: motion.at('cause', s), easing: motion.ease('exit') },
      exit,
    );
    flip(motion, before, after, { duration: motion.ms('layout', s), delay: motion.at('change', s), easing: motion.ease('standard') });
    enter(motion, before, after, { duration: motion.ms('quick', s), delay: motion.at('change', s), easing: motion.ease('enter') });
    const landing = {
      duration: motion.ms('land', s),
      delay: motion.at('consequence', s) - motion.ms('quick', s),
      easing: motion.ease('standard'),
    };
    for (const e of this.events()) {
      if (e.kind !== 'write' || typeof e.at !== 'number' || e.from === undefined) continue;
      const chip = layer.querySelector<HTMLElement>(`[data-key="${CSS.escape(String(this.keys()?.[e.at] ?? e.at))}"]`);
      const value = chip?.querySelector<HTMLElement>('.val');
      if (chip && value) land(motion, chip, value, String(e.from), landing);
    }
  }
}
