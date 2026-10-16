import { isOnHiddenPage } from '../core/page-keys';
import { pathOf } from '../ui/cross-link.directive';

export interface HardwareBack {
  /** The URL shown now. */
  url: string;
  /** Where a link from another tab opened the shown hub from, if one did. */
  from: string | null;
  goBack(url: string): void;
  goToday(): void;
  /** Leaves the app, as Android's back button does on the first screen. */
  leave(): void;
}

/**
 * Android's back button (REDESIGN.md 2.5): on a page it does what the page's back button does, so it clicks that; on a hub
 * a link from another tab opened it returns there, on another hub it goes to Today, and on Today it leaves the app.
 */
export function hardwareBack(doc: Document, { url, from, goBack, goToday, leave }: HardwareBack): void {
  const back = [...doc.querySelectorAll<HTMLElement>('ion-router-outlet app-back ion-back-button')].find((b) => !isOnHiddenPage(b));
  if (back) back.click();
  else if (from) goBack(from);
  else if (pathOf(url) !== '/today') goToday();
  else leave();
}
