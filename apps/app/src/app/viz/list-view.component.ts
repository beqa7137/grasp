import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Scalar } from '@grasp/engine';
import { uniqueId } from '../core/unique-id';

@Component({
  selector: 'g-list-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="label" [id]="labelId" [attr.aria-hidden]="listed() || null">{{ label() }}</div>
    <div
      class="items"
      [class.vertical]="orientation() === 'vertical'"
      [attr.role]="listed() ? 'list' : null"
      [attr.aria-labelledby]="listed() ? labelId : null"
    >
      @if (more()) {
        <span class="more" role="listitem">+{{ more() }} more</span>
      }
      @for (item of items(); track $index) {
        <span class="item" role="listitem" [class.hot]="item === highlight()">{{ item }}</span>
      } @empty {
        <span class="empty">empty</span>
      }
    </div>
  `,
  styles: `
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
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    /* nowrap keeps one column as wide as the list, so the ellipsis below cuts long items such as calls. */
    .items.vertical {
      flex-direction: column-reverse;
      flex-wrap: nowrap;
      align-items: stretch;
    }
    .item {
      font: 600 0.75rem/1 var(--g-font-mono);
      padding: 7px 9px;
      border-radius: 8px;
      background: var(--g-raised);
      border: 1px solid var(--g-line-strong);
      text-align: center;
      animation: pop var(--g-motion-quick) var(--g-ease-enter);
    }
    .items.vertical .item {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
    @keyframes pop {
      from {
        transform: scale(0.7);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }
  `,
})
export class ListViewComponent {
  readonly label = input.required<string>();
  readonly items = input.required<Scalar[]>();
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly highlight = input<Scalar | undefined>(undefined);
  /** Items left out before the first one shown: below the bottom of a vertical list. */
  readonly more = input(0);

  readonly labelId = uniqueId('g-list');
  /** Only a non-empty list gets list semantics, named by its label, which is then hidden from screen readers so it is not read twice. */
  readonly listed = computed(() => this.items().length > 0 || this.more() > 0);
}
