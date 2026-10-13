import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  model,
  untracked,
  viewChild,
} from '@angular/core';
import { IonIcon, Platform } from '@ionic/angular';
import { type Subscription } from 'rxjs';
import { uniqueId } from '../core/unique-id';
import { closeIcon } from './icons';

const FOCUSABLE = [
  'button:not(:disabled)',
  '[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]',
]
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .join(', ');
/** Ionic's own overlays take Android's back button at this priority, above a page's navigation. */
const OVERLAY_BACK_PRIORITY = 100;

/**
 * A modal sheet (REDESIGN.md 3.2): a bottom sheet on a phone, a centred card wider up. It is a native modal `dialog`, so it
 * sits in the top layer over Ionic's pages and the page behind it is inert. Focus moves to its first control on open,
 * Escape and Android's back button close it, and focus goes back to what opened it, all done here rather than left to
 * each browser's dialog. However the dialog closes (a close watcher, `form method="dialog"`), `open` follows.
 */
@Component({
  selector: 'g-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <dialog
      #dialog
      [attr.aria-labelledby]="titleId"
      (keydown)="onKeydown($event)"
      (cancel)="$event.preventDefault(); open.set(false)"
      (close)="onClosed()"
    >
      <header>
        <h2 [id]="titleId">{{ heading() }}</h2>
        <button type="button" class="close" aria-label="Close" (click)="open.set(false)">
          <ion-icon [icon]="closeIcon" aria-hidden="true" />
        </button>
      </header>
      <div class="body"><ng-content /></div>
      <footer><ng-content select="[actions]" /></footer>
    </dialog>
  `,
  styles: `
    @use '../../breakpoints' as *;

    dialog {
      width: min(560px, calc(100vw - var(--g-space-6)));
      max-height: calc(100dvh - var(--g-space-8));
      padding: 0;
      border: 1px solid var(--g-line-strong);
      border-radius: var(--g-radius-lg);
      background: var(--g-surface);
      color: var(--g-text);
      box-shadow: var(--g-shadow-overlay);
      overflow: auto;
    }
    dialog::backdrop {
      background: var(--g-scrim);
    }
    @include phone {
      dialog {
        width: 100%;
        max-width: none;
        margin: auto 0 0;
        border-radius: var(--g-radius-lg) var(--g-radius-lg) 0 0;
        border-bottom: 0;
        padding-bottom: env(safe-area-inset-bottom);
      }
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--g-space-3);
      padding: var(--g-space-4) var(--g-space-4) var(--g-space-2) var(--g-space-5);
    }
    h2 {
      margin: 0;
      font-size: var(--g-text-title-l);
      line-height: 1.2;
    }
    .close {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: var(--g-radius-pill);
      background: transparent;
      color: var(--g-muted);
      cursor: pointer;
    }
    .close ion-icon {
      width: 22px;
      height: 22px;
    }
    .body {
      padding: 0 var(--g-space-5) var(--g-space-4);
    }
    footer {
      display: flex;
      justify-content: flex-end;
      gap: var(--g-space-2);
      padding: 0 var(--g-space-5) var(--g-space-5);
    }
    footer:empty {
      display: none;
    }
  `,
})
export class SheetComponent {
  readonly heading = input.required<string>();
  readonly open = model(false);
  readonly closeIcon = closeIcon;
  readonly titleId = uniqueId('g-sheet-title');
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly platform = inject(Platform);
  private opener: HTMLElement | null = null;
  private backButton: Subscription | null = null;

  constructor() {
    effect(() => {
      const open = this.open();
      untracked(() => (open ? this.show() : this.dialog().nativeElement.close()));
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.dialog().nativeElement.open) this.onClosed();
    });
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.open.set(false);
    } else if (e.key === 'Tab') {
      this.wrapFocus(e);
    }
  }

  onClosed() {
    this.open.set(false);
    this.backButton?.unsubscribe();
    this.backButton = null;
    this.opener?.focus();
    this.opener = null;
  }

  private show() {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) return;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    this.backButton = this.platform.backButton.subscribeWithPriority(OVERLAY_BACK_PRIORITY, () => this.open.set(false));
    (this.focusables()[0] ?? dialog).focus();
  }

  /** The page behind is inert, but Tab could still leave the dialog for the browser's own chrome. */
  private wrapFocus(e: KeyboardEvent) {
    const items = this.focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.dialog().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.closest('[hidden]') && (el.checkVisibility?.() ?? true),
    );
  }
}
