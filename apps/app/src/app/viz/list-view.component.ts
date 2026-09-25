import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Scalar } from '@grasp/engine';

@Component({
  selector: 'g-list-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="label">{{ label() }}</div>
    <div class="items" [class.vertical]="orientation() === 'vertical'">
      @for (item of items(); track $index) {
        <span class="item" [class.hot]="item === highlight()">{{ item }}</span>
      } @empty {
        <span class="empty">empty</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .label {
      font: 600 0.65625rem/1 var(--ion-font-family);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--g-muted);
      margin-bottom: 8px;
    }
    .items {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .items.vertical {
      flex-direction: column-reverse;
      align-items: stretch;
    }
    .item {
      font: 600 0.75rem/1 var(--g-font-mono);
      padding: 7px 9px;
      border-radius: 8px;
      background: var(--g-raised);
      border: 1px solid var(--g-line-strong);
      text-align: center;
      animation: pop 0.25s ease-out;
    }
    .item.hot {
      border-color: var(--g-state-current);
      color: var(--g-state-current);
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
}
